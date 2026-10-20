import { describe, expect, it } from 'vitest';
import { UsageError } from '../src/errors.js';
import { parseCliArguments } from '../src/index.js';
import { createAlpha, createBeta } from './fixtures/commands.js';

const alpha = createAlpha();
const beta = createBeta();
const registry = [alpha, beta];

function parse(argv: string[]) {
  return parseCliArguments(argv, registry);
}

function usageErrorOf(argv: string[]): UsageError {
  try {
    parse(argv);
  } catch (error) {
    if (error instanceof UsageError) {
      return error;
    }
    throw error;
  }
  throw new Error(`expected a UsageError for ${JSON.stringify(argv)}`);
}

describe('parseCliArguments: global arguments', () => {
  it('requests the general help when no argument is given', () => {
    expect(parse([])).toEqual({ kind: 'help', command: undefined });
  });

  it.each([['-h'], ['--help']])('requests the general help for %s', (flag) => {
    expect(parse([flag])).toEqual({ kind: 'help', command: undefined });
  });

  it.each([['-v'], ['--version']])('requests the version for %s', (flag) => {
    expect(parse([flag])).toEqual({ kind: 'version' });
  });

  it('gives --help precedence over --version', () => {
    expect(parse(['-v', '-h'])).toEqual({ kind: 'help', command: undefined });
    expect(parse(['-hv'])).toEqual({ kind: 'help', command: undefined });
  });

  it.each([
    [['-h', 'alpha'], "unexpected argument 'alpha' (global options must be used alone)"],
    [['-v', 'alpha'], "unexpected argument 'alpha' (global options must be used alone)"],
    [['--help', 'unknown'], "unexpected argument 'unknown' (global options must be used alone)"],
    [['--quiet'], "unknown option '--quiet'"],
    [['-q', 'alpha'], "unknown option '-q'"],
    [['--help=yes'], "option '--help' does not take a value"],
    [['--'], "unexpected argument '--'"],
    [['-'], "unexpected argument '-' (global options must be used alone)"],
  ])('rejects %j', (argv, message) => {
    const error = usageErrorOf(argv);
    expect(error.message).toBe(message);
    expect(error.commandName).toBeUndefined();
    expect(error.exitCode).toBe(2);
  });

  it('rejects an unknown function', () => {
    const error = usageErrorOf(['nope']);
    expect(error.message).toBe("unknown function 'nope'");
    expect(error.commandName).toBeUndefined();
  });

  it('rejects any function when the registry is empty', () => {
    expect(() => parseCliArguments(['alpha'], [])).toThrow(
      "unknown function 'alpha'",
    );
  });
});

describe('parseCliArguments: function arguments', () => {
  it('applies defaults when no option is given', () => {
    expect(parse(['alpha'])).toEqual({
      kind: 'run',
      command: alpha,
      options: { root: undefined, depth: '3', quiet: false },
    });
  });

  it('reads long, short, inline and grouped options', () => {
    expect(parse(['alpha', '--root', 'a', '--depth=5', '-q'])).toMatchObject({
      options: { root: 'a', depth: '5', quiet: true },
    });
    expect(parse(['alpha', '-qr', 'b'])).toMatchObject({
      options: { root: 'b', depth: '3', quiet: true },
    });
    expect(parse(['alpha', '-r', 'c'])).toMatchObject({
      options: { root: 'c' },
    });
  });

  it('keeps the last value of a repeated option', () => {
    expect(parse(['alpha', '--root', 'a', '--root', 'b'])).toMatchObject({
      options: { root: 'b' },
    });
  });

  it('accepts a value starting with a dash when it is inline', () => {
    expect(parse(['alpha', '--root=-x'])).toMatchObject({
      options: { root: '-x' },
    });
  });

  it('only exposes the options of the selected function', () => {
    expect(parse(['beta-long-name', '--force'])).toEqual({
      kind: 'run',
      command: beta,
      options: { force: true },
    });
  });

  it.each([['-h'], ['--help']])('requests the function help for %s', (flag) => {
    expect(parse(['alpha', flag])).toEqual({ kind: 'help', command: alpha });
  });

  it('gives --help precedence over the other options', () => {
    expect(parse(['alpha', '--root', 'a', '--help'])).toEqual({
      kind: 'help',
      command: alpha,
    });
  });

  it.each([
    [['beta-long-name', '--root', 'a'], "unknown option '--root' for 'beta-long-name'"],
    [['beta-long-name', '-q'], "unknown option '-q' for 'beta-long-name'"],
    [['alpha', '--force'], "unknown option '--force' for 'alpha'"],
    [['alpha', '-v'], "unknown option '-v' for 'alpha'"],
    [['alpha', '--version'], "unknown option '--version' for 'alpha'"],
    [['alpha', '--constructor'], "unknown option '--constructor' for 'alpha'"],
    [['alpha', 'extra'], "unexpected argument 'extra' for 'alpha'"],
    [['alpha', 'beta-long-name'], "unexpected argument 'beta-long-name' for 'alpha'"],
    [['alpha', '--'], "unexpected argument '--' for 'alpha'"],
    [['alpha', '--', 'x'], "unexpected argument '--' for 'alpha'"],
    [['alpha', '--root'], "option '--root' requires a value"],
    [
      ['alpha', '--root', '-q'],
      "option '--root' requires a value (use '--root=-q' for a value starting with '-')",
    ],
    [['alpha', '--quiet=yes'], "option '--quiet' does not take a value"],
    [['alpha', '--help=yes'], "option '--help' does not take a value"],
  ])('rejects %j', (argv, message) => {
    const error = usageErrorOf(argv);
    expect(error.message).toBe(message);
    expect(error.commandName).toBe(argv[0]);
    expect(error.exitCode).toBe(2);
  });
});
