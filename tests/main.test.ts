import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { CommandError, UsageError } from '../src/errors.js';
import { formatCommandUsage, formatGeneralUsage } from '../src/help.js';
import { main } from '../src/main.js';
import type { Command } from '../src/types/command.js';
import { captureStream, createAlpha, createBeta } from './fixtures/commands.js';

const manifest = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string };

function setup(run?: Command['run'], debug = false) {
  const alpha = createAlpha(run);
  const registry = [alpha, createBeta()];
  const stdout = captureStream();
  const stderr = captureStream();
  const context = { cwd: '/work', stdout, stderr };

  return {
    alpha,
    registry,
    stdout,
    stderr,
    context,
    exec: (argv: string[]) => main({ argv, registry, context, debug }),
  };
}

describe('main', () => {
  it('prints the general help on stdout when no argument is given', async () => {
    const { exec, registry, stdout, stderr } = setup();

    expect(await exec([])).toBe(0);
    expect(stdout.text()).toBe(`${formatGeneralUsage(registry)}\n`);
    expect(stderr.text()).toBe('');
  });

  it('prints the help of a function', async () => {
    const { exec, alpha, stdout } = setup();

    expect(await exec(['alpha', '--help'])).toBe(0);
    expect(stdout.text()).toBe(`${formatCommandUsage(alpha)}\n`);
  });

  it('prints the package version', async () => {
    const { exec, stdout } = setup();

    expect(await exec(['--version'])).toBe(0);
    expect(stdout.text()).toBe(`${manifest.version}\n`);
  });

  it('runs the function with its options and the context', async () => {
    const run = vi.fn(() => Promise.resolve());
    const { exec, context } = setup(run);

    expect(await exec(['alpha', '-q'])).toBe(0);
    expect(run).toHaveBeenCalledExactlyOnceWith(
      { root: undefined, depth: '3', quiet: true },
      context,
    );
  });

  it('reports a usage error with the general usage', async () => {
    const { exec, registry, stdout, stderr } = setup();

    expect(await exec(['nope'])).toBe(2);
    expect(stdout.text()).toBe('');
    expect(stderr.text()).toBe(
      `git-companion: unknown function 'nope'\n${formatGeneralUsage(registry)}\n`,
    );
  });

  it('reports a usage error of a function with that function usage', async () => {
    const { exec, alpha, stderr } = setup();

    expect(await exec(['alpha', '--force'])).toBe(2);
    expect(stderr.text()).toBe(
      `git-companion: unknown option '--force' for 'alpha'\n${formatCommandUsage(alpha)}\n`,
    );
  });

  it('reports a usage error thrown by a function', async () => {
    const run = vi.fn(() =>
      Promise.reject(
        new UsageError("option '--depth' must be an integer", 'alpha'),
      ),
    );
    const { exec, alpha, stderr } = setup(run);

    expect(await exec(['alpha', '--depth', 'x'])).toBe(2);
    expect(stderr.text()).toBe(
      `git-companion: option '--depth' must be an integer\n${formatCommandUsage(alpha)}\n`,
    );
  });

  it('reports a command failure without usage', async () => {
    const run = vi.fn(() =>
      Promise.reject(new CommandError('not a git repository')),
    );
    const { exec, stderr } = setup(run);

    expect(await exec(['alpha'])).toBe(1);
    expect(stderr.text()).toBe('git-companion: not a git repository\n');
  });

  it('hides the message of an unexpected error', async () => {
    const run = vi.fn(() => Promise.reject(new TypeError('internal detail')));
    const { exec, stderr } = setup(run);

    expect(await exec(['alpha'])).toBe(1);
    expect(stderr.text()).toBe('git-companion: unexpected error\n');
  });

  it('prints the stack trace in debug mode', async () => {
    const run = vi.fn(() => Promise.reject(new TypeError('internal detail')));
    const { exec, stderr } = setup(run, true);

    expect(await exec(['alpha'])).toBe(1);
    expect(stderr.text()).toMatch(
      /^git-companion: unexpected error\nTypeError: internal detail\n\s+at /,
    );
  });
});
