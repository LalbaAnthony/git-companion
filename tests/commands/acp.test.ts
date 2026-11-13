import { input } from '@inquirer/prompts';
import { mkdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { commands } from '../../src/commands/index.js';
import { main } from '../../src/main.js';
import type { CommandContext } from '../../src/types/command.js';
import { createContext, writeNodeCommand } from '../fixtures/commands.js';
import { createRepo, createSandbox, git, lastRemoteSubject } from '../fixtures/git.js';
import type { RepoFixture, Sandbox } from '../fixtures/git.js';
import { answerInTurn, anyValidate } from '../fixtures/prompts.js';

vi.mock('@inquirer/prompts', () => ({
  input: vi.fn(),
  select: vi.fn(),
  confirm: vi.fn(),
}));

const question = 'Commit message';

let sandbox: Sandbox;

beforeEach(async () => {
  // restoreMocks does not reset the calls of module mocks
  vi.clearAllMocks();
  sandbox = await createSandbox();
});

afterEach(async () => {
  await sandbox.cleanup();
});

async function acp(
  args: string[],
  cwd: string,
  overrides: Partial<Pick<CommandContext, 'interactive' | 'colors'>> = {},
) {
  const context = createContext({ cwd, homeDir: sandbox.root, ...overrides });
  const exitCode = await main({
    argv: ['acp', ...args],
    registry: commands,
    context,
    debug: false,
  });
  return {
    exitCode,
    stdout: context.stdout.text(),
    stderr: context.stderr.text(),
  };
}

async function dirtyRepo(relativePath = 'a'): Promise<RepoFixture> {
  const repo = await createRepo(sandbox, relativePath);
  await writeFile(path.join(repo.path, 'change.txt'), 'change\n');
  return repo;
}

// Outside of the repositories, so that it is never committed
function messageCommand(script: string): Promise<string> {
  return writeNodeCommand(sandbox.root, script);
}

// Behaves like Enter pressed on an empty input: the default answer, if any
function acceptSuggestion(): void {
  vi.mocked(input).mockImplementation((config) =>
    Promise.resolve(config.default ?? ''),
  );
}

async function expectUntouched(repo: RepoFixture): Promise<void> {
  expect(await git(repo.path, 'status', '--porcelain')).toBe('?? change.txt');
  expect(await lastRemoteSubject(repo.remote ?? '')).toBe('initial');
}

describe('acp: arguments', () => {
  it.each([
    [['--message='], "option '--message' requires a non-empty message"],
    [['-m', ' \t '], "option '--message' requires a non-empty message"],
    [['-n', '-m', ' \t '], "option '--message' requires a non-empty message"],
    [
      ['-m', 'wip: x'],
      "option '--message' is not a Conventional Commits message: unknown type 'wip'",
    ],
    [
      ['-m', '  Feat: x  ', '-c', 'cmd'],
      "option '--message' is not a Conventional Commits message: type must be lowercase",
    ],
    [['--message-command='], "option '--message-command' requires a non-empty command"],
    [
      ['-m', 'feat: x', '-c', 'cmd'],
      "options '--message' and '--message-command' cannot be used together",
    ],
  ])('rejects %j before touching anything', async (args, message) => {
    const result = await acp(args, sandbox.workspace);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain(
      `git-companion: ${message}\nUsage:\n  git-companion acp [options]`,
    );
    expect(result.stdout).toBe('');
  });

  it('documents its options', async () => {
    const result = await acp(['--help'], sandbox.workspace);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      '  -m, --message <message>           Commit message; without it, the message is asked\n',
    );
    expect(result.stdout).toContain(
      '  -c, --message-command <command>   Shell command whose output is suggested as the commit message\n',
    );
    expect(result.stdout).toContain(
      '  -n, --no-conventional             Accept commit messages that do not follow Conventional Commits\n',
    );
  });
});

describe('acp: checks', { timeout: 60_000 }, () => {
  it('fails outside of a repository', async () => {
    const result = await acp(['-m', 'feat: x'], sandbox.workspace);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('Not a git repository.\n');
    expect(result.stderr).toBe('');
  });

  it('fails below the root of the repository', async () => {
    const a = await dirtyRepo();
    const sub = path.join(a.path, 'sub');
    await mkdir(sub);

    const result = await acp(['-m', 'feat: x'], sub);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe(`Not at repo root (${await realpath(a.path)}). Aborting.\n`);
    await expectUntouched(a);
  });

  it.runIf(process.platform === 'win32')(
    'accepts the root written with another letter case',
    async () => {
      const a = await dirtyRepo();

      // Lowercase drive letter included, as in a VS Code terminal
      const result = await acp(['-m', 'feat: x'], a.path.toLowerCase());

      expect(result.exitCode).toBe(0);
      expect(await lastRemoteSubject(a.remote ?? '')).toBe('feat: x');
    },
  );

  it('stops with 0 when there is nothing to commit, without asking or running the command', async () => {
    const a = await createRepo(sandbox, 'a');
    const command = await messageCommand("process.stdout.write('feat: suggested');");

    const result = await acp(['-c', command], a.path, { interactive: true });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('Nothing to commit.\n');
    expect(input).not.toHaveBeenCalled();
  });

  it('fails a detached HEAD without asking anything', async () => {
    const a = await createRepo(sandbox, 'a');
    await git(a.path, 'checkout', '--detach');
    await writeFile(path.join(a.path, 'change.txt'), 'change\n');

    const result = await acp([], a.path, { interactive: true });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('Detached HEAD. Aborting.\n');
    expect(input).not.toHaveBeenCalled();
  });
});

describe('acp: message', { timeout: 60_000 }, () => {
  it('commits and pushes with the trimmed --message, without a terminal', async () => {
    const a = await dirtyRepo();

    const result = await acp(['-m', '  feat: given\n\nbody\n'], a.path);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.endsWith('Committed and pushed.\n')).toBe(true);
    expect(input).not.toHaveBeenCalled();
    expect(await git(a.path, 'log', '-1', '--format=%B')).toBe('feat: given\n\nbody');
    expect(await lastRemoteSubject(a.remote ?? '')).toBe('feat: given');
    expect(await git(a.path, 'status', '--porcelain')).toBe('');
  });

  it('asks for the message and commits the trimmed answer', async () => {
    const a = await dirtyRepo();
    vi.mocked(input).mockResolvedValueOnce('  feat: typed  ');

    const result = await acp([], a.path, { interactive: true });

    expect(result.exitCode).toBe(0);
    expect(input).toHaveBeenCalledExactlyOnceWith(
      { message: question, validate: anyValidate },
      expect.anything(),
    );
    expect(await lastRemoteSubject(a.remote ?? '')).toBe('feat: typed');
  });

  it('keeps the question open until the answer follows Conventional Commits', async () => {
    const a = await dirtyRepo();
    const errors = answerInTurn('', ' \t ', 'Feat: typed', '  feat: typed  ');

    const result = await acp([], a.path, { interactive: true });

    expect(result.exitCode).toBe(0);
    expect(errors).toEqual([
      'Commit message required.',
      'Commit message required.',
      'Not a Conventional Commits message: type must be lowercase',
    ]);
    expect(await lastRemoteSubject(a.remote ?? '')).toBe('feat: typed');
  });

  it('commits any --message with --no-conventional', async () => {
    const a = await dirtyRepo();

    const result = await acp(['-n', '-m', ' Anything goes. '], a.path);

    expect(result.exitCode).toBe(0);
    expect(await lastRemoteSubject(a.remote ?? '')).toBe('Anything goes.');
  });

  it('commits any answer with --no-conventional', async () => {
    const a = await dirtyRepo();
    vi.mocked(input).mockResolvedValueOnce('Anything goes.');

    const result = await acp(['--no-conventional'], a.path, { interactive: true });

    expect(result.exitCode).toBe(0);
    expect(input).toHaveBeenCalledExactlyOnceWith({ message: question }, expect.anything());
    expect(await lastRemoteSubject(a.remote ?? '')).toBe('Anything goes.');
  });

  it('aborts on a blank answer with --no-conventional', async () => {
    const a = await dirtyRepo();
    vi.mocked(input).mockResolvedValueOnce(' \t ');

    const result = await acp(['-n'], a.path, { interactive: true });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('Commit message required. Aborting.\n');
    await expectUntouched(a);
  });

  it.each([[[]], [['-c', 'unused']]])(
    'fails without a terminal and without --message (%j)',
    async (args) => {
      const a = await dirtyRepo();

      const result = await acp(args, a.path, { interactive: false });

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe(
        'Cannot ask for a commit message: stdin is not a terminal.\n',
      );
      await expectUntouched(a);
    },
  );
});

describe('acp: message command', { timeout: 60_000 }, () => {
  it('suggests the output of the command, run at the root, as the default answer', async () => {
    const a = await dirtyRepo();
    const command = await messageCommand(
      [
        "import path from 'node:path';",
        "process.stderr.write('thinking\\n');",
        "process.stdout.write('\\r\\n  feat: update ' + path.basename(process.cwd()) + '\\r\\n\\r\\nbody\\r\\n');",
      ].join('\n'),
    );
    acceptSuggestion();

    const result = await acp(['--message-command', command], a.path, {
      interactive: true,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.startsWith('Generating the commit message...\n')).toBe(true);
    expect(input).toHaveBeenCalledExactlyOnceWith(
      { message: question, default: 'feat: update a\n\nbody', validate: anyValidate },
      expect.anything(),
    );
    expect(result.stderr).toContain('thinking\n');
    expect(await git(a.path, 'log', '-1', '--format=%B')).toBe('feat: update a\n\nbody');
  });

  it('commits the answer typed instead of the suggestion', async () => {
    const a = await dirtyRepo();
    const command = await messageCommand("process.stdout.write('feat: suggested');");
    vi.mocked(input).mockResolvedValueOnce('fix: typed');

    const result = await acp(['-c', command], a.path, { interactive: true });

    expect(result.exitCode).toBe(0);
    expect(await lastRemoteSubject(a.remote ?? '')).toBe('fix: typed');
  });

  it('aborts when the suggestion is discarded and nothing is typed, with --no-conventional', async () => {
    const a = await dirtyRepo();
    const command = await messageCommand("process.stdout.write('feat: suggested');");
    vi.mocked(input).mockResolvedValueOnce('');

    const result = await acp(['-n', '-c', command], a.path, { interactive: true });

    expect(result.exitCode).toBe(1);
    expect(result.stdout.endsWith('Commit message required. Aborting.\n')).toBe(true);
    await expectUntouched(a);
  });

  it('suggests any output with --no-conventional', async () => {
    const a = await dirtyRepo();
    const command = await messageCommand("process.stdout.write('Anything goes.');");
    acceptSuggestion();

    const result = await acp(['-n', '-c', command], a.path, { interactive: true });

    expect(result.exitCode).toBe(0);
    expect(input).toHaveBeenCalledExactlyOnceWith(
      { message: question, default: 'Anything goes.' },
      expect.anything(),
    );
    expect(await lastRemoteSubject(a.remote ?? '')).toBe('Anything goes.');
  });

  it.each([
    ['exits with an error', "process.stdout.write('feat: partial'); process.exit(1);"],
    ['prints nothing', ''],
    [
      'prints a message that does not follow Conventional Commits',
      "process.stdout.write('wip: suggested');",
    ],
  ])('asks without a suggestion when the command %s', async (_case, script) => {
    const a = await dirtyRepo();
    const command = await messageCommand(script);
    vi.mocked(input).mockResolvedValueOnce('feat: typed');

    const result = await acp(['-c', command], a.path, { interactive: true });

    expect(result.exitCode).toBe(0);
    expect(
      result.stdout.startsWith('Generating the commit message...\nmessage command failed.\n'),
    ).toBe(true);
    expect(input).toHaveBeenCalledExactlyOnceWith(
      { message: question, validate: anyValidate },
      expect.anything(),
    );
    expect(await lastRemoteSubject(a.remote ?? '')).toBe('feat: typed');
  });
});

describe('acp: push', { timeout: 60_000 }, () => {
  it('publishes a branch that has no upstream', async () => {
    const a = await createRepo(sandbox, 'a');
    await git(a.path, 'switch', '-c', 'feature');
    await writeFile(path.join(a.path, 'change.txt'), 'change\n');

    const result = await acp(['-m', 'feat: on feature'], a.path);

    expect(result.exitCode).toBe(0);
    expect(await lastRemoteSubject(a.remote ?? '', 'feature')).toBe('feat: on feature');
    expect(await git(a.path, 'rev-parse', '--abbrev-ref', '@{u}')).toBe('origin/feature');
  });

  it('reports a failing push after the commit', async () => {
    const a = await createRepo(sandbox, 'local', { remote: false });
    await writeFile(path.join(a.path, 'change.txt'), 'change\n');

    const result = await acp(['-m', 'feat: local'], a.path);

    expect(result.exitCode).toBe(1);
    expect(result.stdout.endsWith('git push failed.\n')).toBe(true);
    expect(await git(a.path, 'log', '-1', '--format=%s')).toBe('feat: local');
  });
});

describe('acp: interruption and output', { timeout: 60_000 }, () => {
  it('exits with 130 and the generic message when the question is interrupted', async () => {
    const a = await dirtyRepo();
    const interruption = new Error('User force closed the prompt with SIGINT');
    interruption.name = 'ExitPromptError';
    vi.mocked(input).mockRejectedValueOnce(interruption);

    const result = await acp([], a.path, { interactive: true });

    expect(result.exitCode).toBe(130);
    expect(result.stderr).toBe('Interrupted.\n');
    await expectUntouched(a);
  });

  it('styles the messages when colors are enabled', async () => {
    const a = await createRepo(sandbox, 'a');

    const result = await acp([], a.path, { colors: true });

    expect(result.stdout).toBe('\u001b[93mNothing to commit.\u001b[0m\n');
  });
});
