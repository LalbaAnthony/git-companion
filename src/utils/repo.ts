import path from 'node:path';
import type { ProcessRunner } from '../types/command.js';
import { isDirectory, isFile, pathExists } from './fs.js';

// A Git working copy, driven through the git executable. Actions return the
// exit code of git; their output goes straight to the user.
export class Repo {
  readonly path: string;
  readonly name: string;
  readonly #runner: ProcessRunner;

  constructor(repoPath: string, runner: ProcessRunner) {
    this.path = repoPath;
    this.name = path.basename(repoPath);
    this.#runner = runner;
  }

  exists(): Promise<boolean> {
    return pathExists(this.path);
  }

  // Only a .git directory counts: worktrees and submodules, whose .git is a
  // file, are not detected
  isRepo(): Promise<boolean> {
    return isDirectory(path.join(this.path, '.git'));
  }

  // A .nogitautomation file at the root opts the repository out
  async shouldSync(): Promise<boolean> {
    return !(await isFile(path.join(this.path, '.nogitautomation')));
  }

  // Empty on a detached HEAD
  async currentBranch(): Promise<string> {
    const result = await this.#capture(['branch', '--show-current']);
    return result.stdout.trim();
  }

  async hasUncommittedChanges(): Promise<boolean> {
    // Porcelain output is stable and locale-independent. A failing git status
    // counts as dirty.
    const result = await this.#capture(['status', '--porcelain']);
    return result.exitCode !== 0 || result.stdout.trim() !== '';
  }

  // False on a detached HEAD or a branch that tracks nothing
  async hasUpstream(): Promise<boolean> {
    const result = await this.#capture([
      'rev-parse',
      '--abbrev-ref',
      '--symbolic-full-name',
      '@{u}',
    ]);
    return result.exitCode === 0;
  }

  // Compared with the remote-tracking branch as of the last fetch. A failing
  // git rev-list counts as unpushed, like a failing status counts as dirty.
  async hasUnpushedCommits(): Promise<boolean> {
    const result = await this.#capture(['rev-list', '--count', '@{u}..HEAD']);
    return result.exitCode !== 0 || Number(result.stdout.trim()) > 0;
  }

  pull(): Promise<number> {
    return this.#run(['pull']);
  }

  status(): Promise<number> {
    return this.#run(['status', '-sb']);
  }

  async diffShortstat(): Promise<number> {
    const result = await this.#capture(['rev-parse', '--abbrev-ref', 'HEAD']);
    const branch = result.stdout.trim();
    return this.#run(['diff', '--shortstat', `origin/${branch}`]);
  }

  add(): Promise<number> {
    return this.#run(['add', '.']);
  }

  commit(message: string): Promise<number> {
    return this.#run(['commit', '-m', message]);
  }

  push(): Promise<number> {
    return this.#run(['push']);
  }

  // Publishes a branch that has no upstream yet and makes origin/<branch> its upstream
  pushSetUpstream(branch: string): Promise<number> {
    return this.#run(['push', '-u', 'origin', branch]);
  }

  #capture(args: readonly string[]) {
    return this.#runner.capture('git', args, this.path);
  }

  #run(args: readonly string[]): Promise<number> {
    return this.#runner.run('git', args, this.path);
  }
}
