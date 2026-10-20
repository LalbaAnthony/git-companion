import { describe, expect, it } from 'vitest';
import { commands } from '../../src/commands/index.js';

// Invariants every registered function must respect; they cannot be expressed
// in the Command type, so they are enforced here
describe('command registry', () => {
  it('has unique function names', () => {
    const names = commands.map((command) => command.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('uses kebab-case function names', () => {
    for (const command of commands) {
      expect(command.name).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);
    }
  });

  it('does not declare the reserved options', () => {
    for (const command of commands) {
      const names = Object.keys(command.options);
      const shorts = Object.values(command.options).map((spec) => spec.short);

      expect(names).not.toContain('help');
      expect(names).not.toContain('version');
      expect(shorts).not.toContain('h');
      expect(shorts).not.toContain('v');
    }
  });

  it('uses kebab-case option names and unique single-character shorts', () => {
    for (const command of commands) {
      const shorts = Object.values(command.options)
        .map((spec) => spec.short)
        .filter((short) => short !== undefined);

      for (const name of Object.keys(command.options)) {
        expect(name).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);
      }
      for (const short of shorts) {
        expect(short).toMatch(/^[a-zA-Z]$/);
      }
      expect(new Set(shorts).size).toBe(shorts.length);
    }
  });
});
