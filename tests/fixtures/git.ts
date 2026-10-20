import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { vi } from 'vitest';

const execFileAsync = promisify(execFile);

export async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd });
  return stdout.trim();
}

export interface Sandbox {
  readonly root: string;
  // Folder that holds the working copies to crawl
  readonly workspace: string;
  readonly cleanup: () => Promise<void>;
}

// Temporary directory with a private git configuration, so that the user's
// settings (signing, hooks, credential helpers...) never leak into a test
export async function createSandbox(): Promise<Sandbox> {
  const root = await mkdtemp(path.join(tmpdir(), 'git-companion-'));
  const workspace = path.join(root, 'workspace');
  await mkdir(workspace);

  const configPath = path.join(root, 'gitconfig');
  await writeFile(
    configPath,
    [
      '[user]',
      '\tname = Test',
      '\temail = test@example.com',
      '[init]',
      '\tdefaultBranch = main',
      '[commit]',
      '\tgpgsign = false',
      '[pull]',
      '\trebase = false',
      '',
    ].join('\n'),
  );
  vi.stubEnv('GIT_CONFIG_GLOBAL', configPath);
  vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1');
  vi.stubEnv('GIT_TERMINAL_PROMPT', '0');

  return {
    root,
    workspace,
    cleanup: () =>
      rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }),
  };
}

export interface RepoFixture {
  readonly path: string;
  // Bare repository used as origin; undefined for a local-only repository
  readonly remote: string | undefined;
}

// A working copy with one commit, pushed to its own bare origin unless
// remote is false
export async function createRepo(
  sandbox: Sandbox,
  relativePath: string,
  options: { readonly remote?: boolean } = {},
): Promise<RepoFixture> {
  const repoPath = path.join(sandbox.workspace, relativePath);
  await mkdir(repoPath, { recursive: true });
  await git(repoPath, 'init');
  await writeFile(path.join(repoPath, 'README.md'), '# fixture\n');
  await git(repoPath, 'add', '.');
  await git(repoPath, 'commit', '-m', 'initial');

  if (options.remote === false) {
    return { path: repoPath, remote: undefined };
  }

  const remote = path.join(
    sandbox.root,
    'remotes',
    `${relativePath.replaceAll(/[\\/]/g, '_')}.git`,
  );
  await mkdir(remote, { recursive: true });
  await git(remote, 'init', '--bare');
  await git(repoPath, 'remote', 'add', 'origin', remote);
  await git(repoPath, 'push', '-u', 'origin', 'main');
  return { path: repoPath, remote };
}

// Commits a file on the remote from another clone, so that the repo is behind
export async function pushFromElsewhere(
  sandbox: Sandbox,
  remote: string,
  fileName: string,
): Promise<void> {
  const clone = await mkdtemp(path.join(sandbox.root, 'elsewhere-'));
  await git(sandbox.root, 'clone', remote, clone);
  await writeFile(path.join(clone, fileName), 'from elsewhere\n');
  await git(clone, 'add', '.');
  await git(clone, 'commit', '-m', `add ${fileName}`);
  await git(clone, 'push');
}

export function lastRemoteSubject(remote: string, ref = 'main'): Promise<string> {
  return git(remote, 'log', '-1', '--format=%s', ref);
}
