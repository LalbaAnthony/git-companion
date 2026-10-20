import { createRequire } from 'node:module';

const fallbackVersion = '0.0.0-development';

function readVersion(manifest: unknown): string {
  if (
    typeof manifest === 'object' &&
    manifest !== null &&
    'version' in manifest &&
    typeof manifest.version === 'string'
  ) {
    return manifest.version;
  }
  return fallbackVersion;
}

const requireFromModule = createRequire(import.meta.url);

export const packageVersion = readVersion(
  requireFromModule('../package.json') as unknown,
);
