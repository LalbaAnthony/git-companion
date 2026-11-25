export interface Sandbox {
  readonly root: string;
  // Folder that holds the working copies to crawl
  readonly workspace: string;
  readonly cleanup: () => Promise<void>;
}

export interface RepoFixture {
  readonly path: string;
  // Bare repository used as origin; undefined for a local-only repository
  readonly remote: string | undefined;
}
