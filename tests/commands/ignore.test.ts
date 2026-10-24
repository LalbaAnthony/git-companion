import { appendFile, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import type * as fsPromises from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { commands } from '../../src/commands/index.js';
import { main } from '../../src/main.js';
import type { CommandContext } from '../../src/types/command.js';
import { styles } from '../../src/utils/cli.js';
import { createContext } from '../fixtures/commands.js';
import { createRepo, createSandbox, git } from '../fixtures/git.js';
import type { Sandbox } from '../fixtures/git.js';

// appendFile keeps its real implementation unless a test replaces it
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof fsPromises>();
  return { ...actual, appendFile: vi.fn(actual.appendFile) };
});

let sandbox: Sandbox;

beforeEach(async () => {
  // restoreMocks does not reset the calls of module mocks
  vi.clearAllMocks();
  sandbox = await createSandbox();
});

afterEach(async () => {
  await sandbox.cleanup();
});

async function ignore(
  args: string[],
  overrides: Partial<Pick<CommandContext, 'cwd' | 'colors'>> = {},
) {
  const context = createContext({
    cwd: sandbox.workspace,
    homeDir: sandbox.root,
    ...overrides,
  });
  const exitCode = await main({
    argv: ['ignore', ...args],
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

// The workspace is not a repository: the file goes there
function workspaceFile(): string {
  return path.join(sandbox.workspace, '.gitignore');
}

function systemError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code });
}

describe('ignore: arguments', () => {
  it('requires at least one --pattern', async () => {
    const result = await ignore([]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain(
      "git-companion: at least one '--pattern' is required\nUsage:\n  git-companion ignore [options]",
    );
  });

  it.each([
    [['--pattern='], "option '--pattern' requires a non-empty pattern"],
    [['-p', 'a\nb'], "option '--pattern' expects a single line"],
    [['-p', 'a\rb'], "option '--pattern' expects a single line"],
    [['-p', 'dist/', '-p', 'x\r\n'], "option '--pattern' expects a single line"],
  ])('rejects %j before writing anything', async (args, message) => {
    const result = await ignore(args);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain(`git-companion: ${message}\n`);
    expect(result.stdout).toBe('');
    expect(existsSync(workspaceFile())).toBe(false);
  });

  it('documents its options', async () => {
    const result = await ignore(['--help']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      '  -p, --pattern <pattern>   Line to add to the .gitignore (repeatable)',
    );
  });
});

describe('ignore: target file', { timeout: 30_000 }, () => {
  it('creates the .gitignore at the root of the repository from a subdirectory', async () => {
    const repo = await createRepo(sandbox, 'repo', { remote: false });
    const deep = path.join(repo.path, 'src', 'deep');
    await mkdir(deep, { recursive: true });
    const file = path.join(await realpath(repo.path), '.gitignore');

    const result = await ignore(['-p', 'node_modules/'], { cwd: deep });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(
      `Created ${file}\nAdded 'node_modules/' to ${file}\n`,
    );
    expect(await readFile(file, 'utf8')).toBe('node_modules/\n');
    expect(existsSync(path.join(deep, '.gitignore'))).toBe(false);
  });

  it('uses the root of a linked worktree', async () => {
    const repo = await createRepo(sandbox, 'repo', { remote: false });
    const worktree = path.join(sandbox.workspace, 'worktree');
    await git(repo.path, 'worktree', 'add', '-b', 'other', worktree);
    const file = path.join(await realpath(worktree), '.gitignore');

    const result = await ignore(['-p', 'dist/'], { cwd: worktree });

    expect(result.exitCode).toBe(0);
    expect(await readFile(file, 'utf8')).toBe('dist/\n');
    expect(existsSync(path.join(repo.path, '.gitignore'))).toBe(false);
  });

  it('uses the current directory outside of a repository', async () => {
    const result = await ignore(['-p', 'dist/']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(
      `Created ${workspaceFile()}\nAdded 'dist/' to ${workspaceFile()}\n`,
    );
    expect(await readFile(workspaceFile(), 'utf8')).toBe('dist/\n');
  });

  it('fails when git cannot be run', async () => {
    vi.stubEnv('PATH', '');

    const result = await ignore(['-p', 'dist/']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe(
      "git-companion: cannot run 'git': not found in PATH\n",
    );
    expect(existsSync(workspaceFile())).toBe(false);
  });
});

describe('ignore: content', () => {
  it('appends to an existing file without creating it', async () => {
    await writeFile(workspaceFile(), 'dist/\n');

    const result = await ignore(['-p', 'node_modules/']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(`Added 'node_modules/' to ${workspaceFile()}\n`);
    expect(await readFile(workspaceFile(), 'utf8')).toBe('dist/\nnode_modules/\n');
  });

  it('terminates an unterminated last line first', async () => {
    await writeFile(workspaceFile(), 'dist/');

    await ignore(['-p', 'node_modules/']);

    expect(await readFile(workspaceFile(), 'utf8')).toBe('dist/\nnode_modules/\n');
  });

  it('appends with LF to a CRLF file', async () => {
    await writeFile(workspaceFile(), 'dist/\r\ncoverage/');

    await ignore(['-p', 'node_modules/']);

    expect(await readFile(workspaceFile(), 'utf8')).toBe(
      'dist/\r\ncoverage/\nnode_modules/\n',
    );
  });

  it('finds a pattern already present in a CRLF file', async () => {
    await writeFile(workspaceFile(), 'node_modules/\r\ndist/\r\n');

    const result = await ignore(['-p', 'dist/']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(`'dist/' is already in ${workspaceFile()}\n`);
    expect(await readFile(workspaceFile(), 'utf8')).toBe('node_modules/\r\ndist/\r\n');
  });

  it('compares whole lines literally', async () => {
    await writeFile(workspaceFile(), 'node_modules/\nx.log\n# *.log\n *.tmp\n');

    await ignore(['-p', 'node_modules', '-p', '*.log', '-p', '*.tmp']);

    expect(await readFile(workspaceFile(), 'utf8')).toBe(
      'node_modules/\nx.log\n# *.log\n *.tmp\nnode_modules\n*.log\n*.tmp\n',
    );
  });

  it('processes the patterns in order, a repeated one included', async () => {
    await writeFile(workspaceFile(), 'b\n');

    const result = await ignore(['-p', 'a', '-p', 'b', '--pattern=a']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(
      [
        `Added 'a' to ${workspaceFile()}`,
        `'b' is already in ${workspaceFile()}`,
        `'a' is already in ${workspaceFile()}`,
        '',
      ].join('\n'),
    );
    expect(await readFile(workspaceFile(), 'utf8')).toBe('b\na\n');
  });

  it('styles every message after its outcome', async () => {
    const result = await ignore(['-p', 'a', '-p', 'a'], { colors: true });

    expect(result.stdout).toBe(
      [
        `${styles.info}Created ${workspaceFile()}\u001b[0m`,
        `${styles.success}Added 'a' to ${workspaceFile()}\u001b[0m`,
        `${styles.warning}'a' is already in ${workspaceFile()}\u001b[0m`,
        '',
      ].join('\n'),
    );
  });
});

describe('ignore: failures', () => {
  it('stops when the file cannot be created', async () => {
    vi.mocked(appendFile).mockRejectedValueOnce(systemError('EACCES'));

    const result = await ignore(['-p', 'a', '-p', 'b']);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe(`Failed to create ${workspaceFile()} (EACCES)\n`);
    expect(result.stderr).toBe('');
    expect(appendFile).toHaveBeenCalledOnce();
  });

  it('goes on with the next patterns after a write failure', async () => {
    await writeFile(workspaceFile(), '');
    vi.mocked(appendFile).mockRejectedValueOnce(systemError('EACCES'));

    const result = await ignore(['-p', 'a', '-p', 'b']);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe(
      `Failed to write ${workspaceFile()} (EACCES)\nAdded 'b' to ${workspaceFile()}\n`,
    );
    expect(result.stderr).toBe('');
    expect(await readFile(workspaceFile(), 'utf8')).toBe('b\n');
  });

  it('reports a .gitignore that is a directory once per pattern', async () => {
    await mkdir(workspaceFile());

    const result = await ignore(['-p', 'a', '-p', 'b']);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe(
      `Failed to write ${workspaceFile()} (EISDIR)\n`.repeat(2),
    );
    expect(result.stderr).toBe('');
  });

  it('treats an error that is not a file system error as unexpected', async () => {
    vi.mocked(appendFile).mockRejectedValueOnce(new Error('boom'));

    const result = await ignore(['-p', 'a']);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('git-companion: unexpected error\n');
  });
});
