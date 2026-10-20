import { describe, expect, it } from 'vitest';
import { formatCommandUsage, formatGeneralUsage } from '../src/help.js';
import { createAlpha, createBeta } from './fixtures/commands.js';

describe('formatGeneralUsage', () => {
  it('lists every function with aligned summaries', () => {
    expect(formatGeneralUsage([createAlpha(), createBeta()])).toBe(
      [
        'Usage:',
        '  git-companion <function> [options]',
        '  git-companion -h | --help',
        '  git-companion -v | --version',
        '',
        'Functions:',
        '  alpha            First fake function',
        '  beta-long-name   Second fake function',
        '',
        'Options:',
        '  -h, --help      Show this help and exit',
        '  -v, --version   Show the version and exit',
        '',
        "Run 'git-companion <function> --help' to list the options of a function.",
      ].join('\n'),
    );
  });

  it('states that no function is registered', () => {
    expect(formatGeneralUsage([])).toContain('Functions:\n  (none)\n');
  });
});

describe('formatCommandUsage', () => {
  it('lists the options with their value, default, repeatability and the help flag', () => {
    expect(formatCommandUsage(createAlpha())).toBe(
      [
        'Usage:',
        '  git-companion alpha [options]',
        '',
        'First fake function',
        '',
        'Options:',
        '  -r, --root <path>   Root directory',
        '      --depth <n>     Maximum depth (default: 3)',
        '  -q, --quiet         Less output',
        '  -t, --tag <name>    Tag to apply (repeatable)',
        '  -h, --help          Show this help and exit',
      ].join('\n'),
    );
  });
});
