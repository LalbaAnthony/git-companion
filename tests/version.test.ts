import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readPackageVersion, readVersion } from '../src/version.js';

describe('readVersion', () => {
  it('returns the version of a manifest', () => {
    expect(readVersion({ version: '1.2.3' })).toBe('1.2.3');
  });

  it.each([[null], ['1.2.3'], [{}], [{ version: 1 }]])(
    'throws for the invalid manifest %j',
    (manifest) => {
      expect(() => readVersion(manifest)).toThrow(
        'package.json has no string "version" field',
      );
    },
  );
});

describe('readPackageVersion', () => {
  it('reads the version of the package manifest', () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { version: string };

    expect(readPackageVersion()).toBe(manifest.version);
  });
});
