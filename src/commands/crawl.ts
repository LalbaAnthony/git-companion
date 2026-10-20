import { readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { AlreadyReportedError, UsageError } from '../errors.js';
import type { CommandContext, ProcessRunner } from '../types/command.js';
import { Cli } from '../utils/cli.js';
import { isDirectory } from '../utils/fs.js';
import { Repo } from '../utils/repo.js';
import { defineCommand } from './define.js';

const commandName = 'crawl';

interface FolderToCrawl {
  readonly path: string;
  // 0: only the direct children of the folder are checked
  readonly maxDepth: number;
}

type PushReason = 'uncommitted' | 'unpushed' | 'no-upstream';

interface RepoToPush {
  readonly repo: Repo;
  readonly reason: PushReason;
}

type Outcome = 'synced' | 'skipped' | 'failed';

const pushReasonMessages: Record<PushReason, string> = {
  uncommitted: 'has uncommitted changes.',
  unpushed: 'has unpushed commits.',
  'no-upstream': 'has no upstream branch.',
};

// A leading ~ is expanded because PowerShell passes it as is to native programs
function expandHome(value: string, homeDir: string): string {
  if (value === '~') {
    return homeDir;
  }
  if (value.startsWith('~/') || value.startsWith('~\\')) {
    return path.join(homeDir, value.slice(2));
  }
  return value;
}

function resolvePath(value: string, context: CommandContext): string {
  return path.resolve(context.cwd, expandHome(value, context.homeDir));
}

function parseRepoPath(value: string, context: CommandContext): string {
  if (value === '') {
    throw new UsageError("option '--repo' requires a non-empty path", commandName);
  }
  return resolvePath(value, context);
}

// <depth>:<path>, split on the first colon only, so 2:C:\Users stays valid
function parseFolder(value: string, context: CommandContext): FolderToCrawl {
  const match = /^(\d+):(.+)$/s.exec(value);
  const depth = match?.[1];
  const folderPath = match?.[2];
  if (depth === undefined || folderPath === undefined) {
    throw new UsageError(
      `option '--folder' expects <depth>:<path>, got '${value}'`,
      commandName,
    );
  }
  return { path: resolvePath(folderPath, context), maxDepth: Number(depth) };
}

function compareCaseInsensitive(left: string, right: string): number {
  const a = left.toLowerCase();
  const b = right.toLowerCase();
  return a < b ? -1 : a > b ? 1 : 0;
}

async function crawlChildren(
  folderPath: string,
  maxDepth: number,
  currentDepth: number,
  runner: ProcessRunner,
): Promise<Repo[]> {
  const repos: Repo[] = [];

  let entries: string[];
  try {
    entries = await readdir(folderPath);
  } catch {
    // Missing or unreadable directory (permissions, broken mount...): skipped
    return repos;
  }

  // NTFS returns entries sorted while ext4/btrfs return them in arbitrary
  // order. Sort case-insensitively to get the same order on every platform.
  for (const entry of entries.sort(compareCaseInsensitive)) {
    // Never explore the internals of a repository
    if (entry === '.git') {
      continue;
    }
    const entryPath = path.join(folderPath, entry);
    const repo = new Repo(entryPath, runner);
    if (await repo.isRepo()) {
      // A repository stops the descent
      repos.push(repo);
    } else if (currentDepth < maxDepth && (await isDirectory(entryPath))) {
      repos.push(
        ...(await crawlChildren(entryPath, maxDepth, currentDepth + 1, runner)),
      );
    }
  }
  return repos;
}

// Unlike its children, the folder itself is explored even when it is a repository
async function crawlFolder(
  folder: FolderToCrawl,
  runner: ProcessRunner,
): Promise<Repo[]> {
  const root = new Repo(folder.path, runner);
  const repos = (await root.isRepo()) ? [root] : [];
  repos.push(...(await crawlChildren(folder.path, folder.maxDepth, 0, runner)));
  return repos;
}

async function canonicalPath(target: string): Promise<string> {
  try {
    // Resolves symbolic links, and the letter case on Windows
    return await realpath(target);
  } catch {
    return path.resolve(target);
  }
}

// Keeps the first occurrence of every repository, in discovery order
async function deduplicate(repos: readonly Repo[]): Promise<Repo[]> {
  const seen = new Set<string>();
  const unique: Repo[] = [];
  for (const repo of repos) {
    const key = await canonicalPath(repo.path);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(repo);
    }
  }
  return unique;
}

async function pushReason(repo: Repo): Promise<PushReason | undefined> {
  if (await repo.hasUncommittedChanges()) {
    return 'uncommitted';
  }
  if (!(await repo.hasUpstream())) {
    return 'no-upstream';
  }
  if (await repo.hasUnpushedCommits()) {
    return 'unpushed';
  }
  return undefined;
}

// Pulls only when the repository does not need a push; resolves with the exit
// code of git pull, or undefined when nothing was pulled
async function pullUnlessPushNeeded(repo: Repo): Promise<number | undefined> {
  if ((await pushReason(repo)) !== undefined) {
    return undefined;
  }
  return repo.pull();
}

function names(repos: readonly Repo[]): string {
  return repos.map((repo) => repo.name).join(', ');
}

function reportFailure(cli: Cli, step: string, repo: Repo): Outcome {
  cli.print(`${step} failed in ${repo.name}.`, 'error');
  return 'failed';
}

async function pushRepo(
  { repo, reason }: RepoToPush,
  defaultMessage: string,
  cli: Cli,
  context: CommandContext,
): Promise<Outcome> {
  if (!(await repo.exists())) {
    cli.print(`${repo.path} does not exist. Skipping.`, 'warning');
    return 'skipped';
  }

  cli.print('\n');
  cli.print(`${repo.path} ${pushReasonMessages[reason]}`, 'info');

  const branch = await repo.currentBranch();
  cli.print(`Branch: ${branch}`, 'info');

  // Kept from the original script: the repository still needs a push, so in
  // practice nothing is pulled here
  const pullExitCode = await pullUnlessPushNeeded(repo);
  if (pullExitCode !== undefined && pullExitCode !== 0) {
    return reportFailure(cli, 'git pull', repo);
  }

  // Informational only: a failure is shown by git itself and does not stop the repository
  await repo.status();
  await repo.diffShortstat();

  if (branch === '') {
    cli.print(`Detached HEAD in ${repo.name}.`, 'error');
    return 'failed';
  }

  if (reason === 'uncommitted') {
    if (!context.interactive) {
      cli.print(
        `Cannot ask for a commit message in ${repo.name}: stdin is not a terminal.`,
        'error',
      );
      return 'failed';
    }

    const answer = await cli.questionText(
      "Enter the commit message (enter 'skip' to skip)",
    );
    if (answer === 'skip') {
      cli.print(`Skipping ${repo.name}.`, 'warning');
      return 'skipped';
    }

    if ((await repo.add()) !== 0) {
      return reportFailure(cli, 'git add', repo);
    }
    if ((await repo.commit(answer === '' ? defaultMessage : answer)) !== 0) {
      return reportFailure(cli, 'git commit', repo);
    }
  }

  const pushExitCode = (await repo.hasUpstream())
    ? await repo.push()
    : await repo.pushSetUpstream(branch);
  if (pushExitCode !== 0) {
    return reportFailure(cli, 'git push', repo);
  }

  cli.print(
    reason === 'uncommitted'
      ? `${repo.name} committed and pushed.`
      : `${repo.name} pushed.`,
    'success',
  );
  return 'synced';
}

async function pullRepo(repo: Repo, cli: Cli): Promise<Outcome> {
  if (!(await repo.exists())) {
    cli.print(`${repo.path} does not exist. Skipping.`, 'warning');
    return 'skipped';
  }

  cli.print('\n');
  cli.print(`Pulling ${repo.path}...`, 'white');

  const exitCode = await pullUnlessPushNeeded(repo);
  if (exitCode === undefined) {
    return 'skipped';
  }
  return exitCode === 0 ? 'synced' : reportFailure(cli, 'git pull', repo);
}

export const crawl = defineCommand({
  name: commandName,
  summary:
    'Commit and push the repositories that need it, pull the others',
  options: {
    repo: {
      type: 'string',
      short: 'r',
      multiple: true,
      valueName: 'path',
      description: 'Repository to sync',
    },
    folder: {
      type: 'string',
      short: 'f',
      multiple: true,
      valueName: 'depth:path',
      description:
        'Folder searched for repositories, <depth> levels below its direct children',
    },
    'default-message': {
      type: 'string',
      short: 'm',
      valueName: 'message',
      default: 'feat: various updates',
      description: 'Commit message used when the answer is left empty',
    },
  },

  async run(options, context) {
    const repoPaths = options.repo.map((value) => parseRepoPath(value, context));
    const folders = options.folder.map((value) => parseFolder(value, context));
    if (repoPaths.length === 0 && folders.length === 0) {
      throw new UsageError(
        "at least one '--repo' or '--folder' is required",
        commandName,
      );
    }
    const defaultMessage = options['default-message'];
    if (defaultMessage === '') {
      throw new UsageError(
        "option '--default-message' requires a non-empty message",
        commandName,
      );
    }

    const cli = new Cli(context);
    cli.print('Crawling folders and scanning repos...', 'white');

    const found: Repo[] = [];
    for (const repoPath of repoPaths) {
      const repo = new Repo(repoPath, context.runner);
      if (await repo.isRepo()) {
        found.push(repo);
      }
    }
    for (const folder of folders) {
      found.push(...(await crawlFolder(folder, context.runner)));
    }

    const skipped: Repo[] = [];
    const toPush: RepoToPush[] = [];
    const toPull: Repo[] = [];

    for (const repo of await deduplicate(found)) {
      if (!(await repo.shouldSync())) {
        skipped.push(repo);
        continue;
      }
      const reason = await pushReason(repo);
      if (reason === undefined) {
        toPull.push(repo);
      } else {
        toPush.push({ repo, reason });
      }
    }

    cli.print(
      `\n${String(skipped.length)} repo(s) skipped : ${names(skipped)}`,
      skipped.length > 0 ? 'warning' : 'success',
    );
    cli.print(
      `\n${String(toPush.length)} repo(s) to push : ${names(toPush.map((entry) => entry.repo))}`,
      toPush.length > 0 ? 'warning' : 'success',
    );
    cli.print(
      `\n${String(toPull.length)} repo(s) to pull.`,
      toPull.length > 0 ? 'success' : 'info',
    );

    const failed: Repo[] = [];
    for (const entry of toPush) {
      if ((await pushRepo(entry, defaultMessage, cli, context)) === 'failed') {
        failed.push(entry.repo);
      }
    }
    for (const repo of toPull) {
      if ((await pullRepo(repo, cli)) === 'failed') {
        failed.push(repo);
      }
    }

    if (failed.length === 0) {
      cli.print('\n\nAll repos have been successfully synced.\n', 'success');
      return;
    }
    cli.print(
      `\n\n${String(failed.length)} repo(s) failed : ${names(failed)}\n`,
      'error',
    );
    throw new AlreadyReportedError();
  },

  onInterrupt(context) {
    new Cli(context).print('\n\nInterrupted. Aborting sync.\n', 'warning');
  },
});
