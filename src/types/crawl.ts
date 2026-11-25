import type { Repo } from '../utils/repo.js';

export interface FolderToCrawl {
  readonly path: string;
  // 0: only the direct children of the folder are checked
  readonly maxDepth: number;
}

export type PushReason = 'uncommitted' | 'unpushed' | 'no-upstream';

export interface RepoToPush {
  readonly repo: Repo;
  readonly reason: PushReason;
}

export type Outcome = 'synced' | 'skipped' | 'failed';

export interface CommitSettings {
  readonly defaultMessage: string;
  // Command line printing a suggested commit message; undefined without --message-command
  readonly messageCommand: string | undefined;
  // The message command whose output is committed without question; undefined
  // without --yes
  readonly acceptedCommand: string | undefined;
  // Commit messages must follow Conventional Commits; false with --no-conventional
  readonly conventional: boolean;
}
