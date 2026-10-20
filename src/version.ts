import { createRequire } from 'node:module';

const requireFromModule = createRequire(import.meta.url);

export function readVersion(manifest: unknown): string {
  if (
    typeof manifest === 'object' &&
    manifest !== null &&
    'version' in manifest &&
    typeof manifest.version === 'string'
  ) {
    return manifest.version;
  }
  throw new Error('package.json has no string "version" field');
}

// Read on demand rather than at import time, so a broken manifest is reported
// through the CLI error handler instead of crashing the module graph
export function readPackageVersion(): string {
  return readVersion(requireFromModule('../package.json') as unknown);
}
