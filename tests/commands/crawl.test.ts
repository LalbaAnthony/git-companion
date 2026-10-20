import { input } from '@inquirer/prompts';
import { mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { commands } from '../../src/commands/index.js';
import { main } from '../../src/main.js';
import type { CommandContext } from '../../src/types/command.js';
import { createContext } from '../fixtures/commands.js';
import {
  createRepo,
  createSandbox,
  git,
  lastRemoteSubject,
  pushFromElsewhere,
} from '../fixtures/git.js';
import type { Sandbox } from '../fixtures/git.js';

vi.mock('@inquirer/prompts', () => ({
  input: vi.fn(),
  select: vi.fn(),
  confirm: vi.fn(),
}));

const commitQuestion = "Enter the commit message (enter 'skip' to skip)";

let sandbox: Sandbox;

beforeEach(async () => {
  // restoreMocks does not reset the calls of module mocks
  vi.clearAllMocks();
  sandbox = await createSandbox();
});

afterEach(async () => {
  await sandbox.cleanup();
});

async function crawl(
  args: string[],
  overrides: Partial<Pick<CommandContext, 'interactive' | 'colors'>> = {},
) {
  const context = createContext({
    cwd: sandbox.workspace,
    homeDir: sandbox.root,
    ...overrides,
  });
  const exitCode = await main({
    argv: ['crawl', ...args],
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

function inWorkspace(...segments: string[]): string {
  return path.join(sandbox.workspace, ...segments);
}

function summary(skipped: string, toPush: string, toPull: number): string {
  return [
    'Crawling folders and scanning repos...',
    '',
    skipped,
    '',
    toPush,
    '',
    `${String(toPull)} repo(s) to pull.`,
    '',
  ].join('\n');
}

async function commitAndPush(repoPath: string, file: string, content: string) {
  await writeFile(path.join(repoPath, file), content);
  await git(repoPath, 'add', '.');
  await git(repoPath, 'commit', '-m', `add ${file}`);
  await git(repoPath, 'push');
}

describe('crawl: arguments', () => {
  it('requires at least one --repo or --folder', async () => {
    const result = await crawl([]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain(
      "git-companion: at least one '--repo' or '--folder' is required\nUsage:\n  git-companion crawl [options]",
    );
  });

  it.each([
    [['--folder', 'projects'], "option '--folder' expects <depth>:<path>, got 'projects'"],
    [['--folder', 'x:projects'], "option '--folder' expects <depth>:<path>, got 'x:projects'"],
    [['--folder', '1:'], "option '--folder' expects <depth>:<path>, got '1:'"],
    [['--repo='], "option '--repo' requires a non-empty path"],
    [['--repo', 'a', '--default-message='], "option '--default-message' requires a non-empty message"],
  ])('rejects %j', async (args, message) => {
    const result = await crawl(args);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain(`git-companion: ${message}\n`);
    expect(result.stdout).toBe('');
  });

  it('documents its options', async () => {
    const result = await crawl(['--help']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('  -r, --repo <path>');
    expect(result.stdout).toContain('  -f, --folder <depth:path>');
    expect(result.stdout).toContain(
      '  -m, --default-message <message>   Commit message used when the answer is left empty (default: feat: various updates)',
    );
  });
});

describe('crawl: discovery', { timeout: 60_000 }, () => {
  it('checks the direct children of a folder at depth 0, sorted case-insensitively', async () => {
    await createRepo(sandbox, 'Beta');
    await createRepo(sandbox, 'alpha');
    await createRepo(sandbox, 'group/inner');
    await writeFile(inWorkspace('notes.txt'), 'not a repo\n');

    const result = await crawl(['--folder', '0:.']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      summary('0 repo(s) skipped : ', '0 repo(s) to push : ', 2),
    );
    const alpha = result.stdout.indexOf(`\n\n\nPulling ${inWorkspace('alpha')}...\n`);
    const beta = result.stdout.indexOf(`\n\n\nPulling ${inWorkspace('Beta')}...\n`);
    expect(alpha).toBeGreaterThan(0);
    expect(beta).toBeGreaterThan(alpha);
    expect(result.stdout).not.toContain('inner');
    expect(result.stdout.endsWith('\n\nAll repos have been successfully synced.\n\n')).toBe(true);
  });

  it.each([
    [1, 2],
    [2, 3],
  ])('descends %i level(s) below the direct children', async (depth, found) => {
    await createRepo(sandbox, 'a');
    await createRepo(sandbox, 'group/inner');
    await createRepo(sandbox, 'group/deep/x');

    const result = await crawl(['--folder', `${String(depth)}:${sandbox.workspace}`]);

    expect(result.stdout).toContain(`\n${String(found)} repo(s) to pull.\n`);
  });

  it('does not descend into a repository found among the children', async () => {
    const outer = await createRepo(sandbox, 'outer');
    await commitAndPush(outer.path, '.gitignore', 'nested/\n');
    await createRepo(sandbox, 'outer/nested');

    const result = await crawl(['--folder', '3:.']);

    expect(result.stdout).toContain('\n1 repo(s) to pull.\n');
    expect(result.stdout).not.toContain('nested');
  });

  it('includes the crawled folder itself when it is a repository, and still explores it', async () => {
    const parent = await createRepo(sandbox, 'parent');
    await commitAndPush(parent.path, '.gitignore', 'child/\n');
    await createRepo(sandbox, 'parent/child');
    // Would be detected if the crawl explored .git
    await mkdir(inWorkspace('parent', '.git', 'fake', '.git'), { recursive: true });

    const result = await crawl(['--folder', '1:parent']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('\n2 repo(s) to pull.\n');
    const parentIndex = result.stdout.indexOf(`Pulling ${inWorkspace('parent')}...`);
    const childIndex = result.stdout.indexOf(
      `Pulling ${inWorkspace('parent', 'child')}...`,
    );
    expect(parentIndex).toBeGreaterThan(0);
    expect(childIndex).toBeGreaterThan(parentIndex);
    expect(result.stdout).not.toContain('fake');
  });

  it('skips the repositories that contain .nogitautomation', async () => {
    await createRepo(sandbox, 'kept');
    const optOut = await createRepo(sandbox, 'opt-out');
    await writeFile(path.join(optOut.path, '.nogitautomation'), '');

    const result = await crawl(['--folder', '0:.']);

    expect(result.stdout).toContain(
      summary('1 repo(s) skipped : opt-out', '0 repo(s) to push : ', 1),
    );
    expect(result.stdout).not.toContain(`Pulling ${optOut.path}`);
  });

  it('checks the --repo paths, expands ~ and ignores what is not a repository', async () => {
    await createRepo(sandbox, 'a');
    await createRepo(sandbox, 'b');
    await mkdir(inWorkspace('plain'));

    const result = await crawl([
      '--repo',
      'a',
      '-r',
      'plain',
      '-r',
      'missing',
      '-r',
      '~/workspace/b',
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('\n2 repo(s) to pull.\n');
    expect(result.stdout).toContain(`Pulling ${inWorkspace('a')}...`);
    expect(result.stdout).toContain(`Pulling ${inWorkspace('b')}...`);
  });

  it('ignores a folder that does not exist', async () => {
    const result = await crawl(['--folder', '0:missing']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(
      `${summary('0 repo(s) skipped : ', '0 repo(s) to push : ', 0)}\n\nAll repos have been successfully synced.\n\n`,
    );
  });

  it('processes a repository found several times only once', async () => {
    await createRepo(sandbox, 'a');

    const result = await crawl(['--repo', 'a', '--folder', '0:.', '--folder', '0:.']);

    expect(result.stdout).toContain('\n1 repo(s) to pull.\n');
  });

  it('recognizes a repository reached through a symbolic link', async () => {
    await createRepo(sandbox, 'a');
    const link = path.join(sandbox.root, 'link-to-a');
    // A junction needs no privilege on Windows; the type is ignored elsewhere
    await symlink(inWorkspace('a'), link, 'junction');

    const result = await crawl(['--folder', '0:.', '--repo', link]);

    expect(result.stdout).toContain('\n1 repo(s) to pull.\n');
    // The first occurrence wins: --repo is scanned before --folder
    expect(result.stdout).toContain(`Pulling ${link}...`);
  });

  it.runIf(process.platform === 'win32')(
    'recognizes a repository written with another letter case',
    async () => {
      await createRepo(sandbox, 'a');

      const result = await crawl(['--folder', '0:.', '--repo', 'A']);

      expect(result.stdout).toContain('\n1 repo(s) to pull.\n');
    },
  );
});

describe('crawl: pull', { timeout: 60_000 }, () => {
  it('pulls the commits pushed elsewhere', async () => {
    const a = await createRepo(sandbox, 'a');
    await pushFromElsewhere(sandbox, a.remote ?? '', 'remote.txt');

    const result = await crawl(['--folder', '0:.']);

    expect(result.exitCode).toBe(0);
    expect(existsSync(path.join(a.path, 'remote.txt'))).toBe(true);
  });

  it('reports a failing pull and exits with 1', async () => {
    const a = await createRepo(sandbox, 'a');
    await createRepo(sandbox, 'b');
    await rm(a.remote ?? '', { recursive: true, force: true });

    const result = await crawl(['--folder', '0:.']);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('git pull failed in a.\n');
    expect(result.stdout).toContain(`Pulling ${inWorkspace('b')}...`);
    expect(result.stdout.endsWith('\n\n1 repo(s) failed : a\n\n')).toBe(true);
    expect(result.stderr).not.toContain('git-companion:');
  });
});

describe('crawl: push', { timeout: 60_000 }, () => {
  it('commits the changes with the answer and pushes them', async () => {
    const a = await createRepo(sandbox, 'a');
    await writeFile(path.join(a.path, 'change.txt'), 'change\n');
    vi.mocked(input).mockResolvedValueOnce('feat: my change');

    const result = await crawl(['--folder', '0:.'], { interactive: true });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      summary('0 repo(s) skipped : ', '1 repo(s) to push : a', 0),
    );
    expect(result.stdout).toContain(
      `\n\n\n${a.path} has uncommitted changes.\nBranch: main\n`,
    );
    expect(result.stdout).toContain('a committed and pushed.\n');
    expect(input).toHaveBeenCalledExactlyOnceWith(
      { message: commitQuestion },
      expect.anything(),
    );
    expect(await lastRemoteSubject(a.remote ?? '')).toBe('feat: my change');
    expect(await git(a.path, 'status', '--porcelain')).toBe('');
  });

  it.each([
    [[], 'feat: various updates'],
    [['-m', 'chore: sync'], 'chore: sync'],
  ])('uses the default message for an empty answer (%j)', async (args, expected) => {
    const a = await createRepo(sandbox, 'a');
    await writeFile(path.join(a.path, 'change.txt'), 'change\n');
    vi.mocked(input).mockResolvedValueOnce('');

    const result = await crawl(['--folder', '0:.', ...args], { interactive: true });

    expect(result.exitCode).toBe(0);
    expect(await lastRemoteSubject(a.remote ?? '')).toBe(expected);
  });

  it('leaves the repository untouched when the answer is skip', async () => {
    const a = await createRepo(sandbox, 'a');
    await writeFile(path.join(a.path, 'change.txt'), 'change\n');
    vi.mocked(input).mockResolvedValueOnce('skip');

    const result = await crawl(['--folder', '0:.'], { interactive: true });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Skipping a.\n');
    expect(result.stdout).toContain('\n\nAll repos have been successfully synced.\n');
    expect(await lastRemoteSubject(a.remote ?? '')).toBe('initial');
    expect(await git(a.path, 'status', '--porcelain')).toBe('?? change.txt');
  });

  it('fails the repository when no question can be asked, and keeps going', async () => {
    const a = await createRepo(sandbox, 'a');
    await writeFile(path.join(a.path, 'change.txt'), 'change\n');
    await createRepo(sandbox, 'b');

    const result = await crawl(['--folder', '0:.'], { interactive: false });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain(
      'Cannot ask for a commit message in a: stdin is not a terminal.\n',
    );
    expect(input).not.toHaveBeenCalled();
    const failure = result.stdout.indexOf('Cannot ask');
    expect(result.stdout.indexOf(`Pulling ${inWorkspace('b')}...`)).toBeGreaterThan(failure);
    expect(result.stdout.endsWith('\n\n1 repo(s) failed : a\n\n')).toBe(true);
  });

  it('pushes unpushed commits without asking', async () => {
    const a = await createRepo(sandbox, 'a');
    await writeFile(path.join(a.path, 'local.txt'), 'local\n');
    await git(a.path, 'add', '.');
    await git(a.path, 'commit', '-m', 'local commit');

    const result = await crawl(['--folder', '0:.'], { interactive: true });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(`${a.path} has unpushed commits.\nBranch: main\n`);
    expect(result.stdout).toContain('a pushed.\n');
    expect(input).not.toHaveBeenCalled();
    expect(await lastRemoteSubject(a.remote ?? '')).toBe('local commit');
  });

  it('publishes a clean branch that has no upstream', async () => {
    const a = await createRepo(sandbox, 'a');
    await git(a.path, 'switch', '-c', 'feature');

    const result = await crawl(['--folder', '0:.']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(`${a.path} has no upstream branch.\nBranch: feature\n`);
    expect(result.stdout).toContain('a pushed.\n');
    expect(await lastRemoteSubject(a.remote ?? '', 'feature')).toBe('initial');
    expect(await git(a.path, 'rev-parse', '--abbrev-ref', '@{u}')).toBe('origin/feature');
  });

  it('commits then publishes a dirty branch that has no upstream', async () => {
    const a = await createRepo(sandbox, 'a');
    await git(a.path, 'switch', '-c', 'feature');
    await writeFile(path.join(a.path, 'change.txt'), 'change\n');
    vi.mocked(input).mockResolvedValueOnce('feat: on feature');

    const result = await crawl(['--folder', '0:.'], { interactive: true });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(`${a.path} has uncommitted changes.\nBranch: feature\n`);
    expect(await lastRemoteSubject(a.remote ?? '', 'feature')).toBe('feat: on feature');
  });

  it('fails a detached HEAD without asking anything', async () => {
    const a = await createRepo(sandbox, 'a');
    await git(a.path, 'checkout', '--detach');
    await writeFile(path.join(a.path, 'change.txt'), 'change\n');

    const result = await crawl(['--folder', '0:.'], { interactive: true });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('Branch: \n');
    expect(result.stdout).toContain('Detached HEAD in a.\n');
    expect(input).not.toHaveBeenCalled();
    expect(result.stdout.endsWith('\n\n1 repo(s) failed : a\n\n')).toBe(true);
  });

  it('fails the push of a repository without origin', async () => {
    await createRepo(sandbox, 'local', { remote: false });

    const result = await crawl(['--folder', '0:.']);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain(`${inWorkspace('local')} has no upstream branch.\n`);
    expect(result.stdout).toContain('git push failed in local.\n');
    expect(result.stdout.endsWith('\n\n1 repo(s) failed : local\n\n')).toBe(true);
  });
});

describe('crawl: interruption and output', { timeout: 60_000 }, () => {
  it('aborts with 130 when the question is interrupted', async () => {
    const a = await createRepo(sandbox, 'a');
    await writeFile(path.join(a.path, 'change.txt'), 'change\n');
    const interruption = new Error('User force closed the prompt with SIGINT');
    interruption.name = 'ExitPromptError';
    vi.mocked(input).mockRejectedValueOnce(interruption);

    const result = await crawl(['--folder', '0:.'], { interactive: true });

    expect(result.exitCode).toBe(130);
    expect(result.stdout.endsWith('\n\nInterrupted. Aborting sync.\n\n')).toBe(true);
    expect(result.stderr).toBe('');
    expect(await lastRemoteSubject(a.remote ?? '')).toBe('initial');
  });

  it('styles the messages when colors are enabled', async () => {
    const result = await crawl(['--folder', '0:missing'], { colors: true });

    expect(result.stdout).toBe(
      [
        '\u001b[97mCrawling folders and scanning repos...\u001b[0m\n',
        '\u001b[92m\n0 repo(s) skipped : \u001b[0m\n',
        '\u001b[92m\n0 repo(s) to push : \u001b[0m\n',
        '\u001b[96m\n0 repo(s) to pull.\u001b[0m\n',
        '\u001b[92m\n\nAll repos have been successfully synced.\n\u001b[0m\n',
      ].join(''),
    );
  });
});
