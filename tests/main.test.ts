import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  AlreadyReportedError,
  CommandError,
  InterruptedError,
  UsageError,
} from '../src/errors.js';
import { formatCommandUsage, formatGeneralUsage } from '../src/help.js';
import { main } from '../src/main.js';
import type { Command } from '../src/types/command.js';
import { createAlpha, createBeta, createContext } from './fixtures/commands.js';

const manifest = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string };

function setup(
  options: {
    run?: Command['run'];
    onInterrupt?: Command['onInterrupt'];
    debug?: boolean;
    signal?: AbortSignal;
  } = {},
) {
  const alpha = {
    ...createAlpha(options.run),
    ...(options.onInterrupt === undefined
      ? {}
      : { onInterrupt: options.onInterrupt }),
  };
  const registry = [alpha, createBeta()];
  const context = createContext(
    options.signal === undefined ? {} : { signal: options.signal },
  );
  const { stdout, stderr } = context;

  return {
    alpha,
    registry,
    stdout,
    stderr,
    context,
    exec: (argv: string[]) =>
      main({ argv, registry, context, debug: options.debug ?? false }),
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
    const { exec, context } = setup({ run });

    expect(await exec(['alpha', '-q', '-t', 'a', '--tag=b'])).toBe(0);
    expect(run).toHaveBeenCalledExactlyOnceWith(
      { root: undefined, depth: '3', quiet: true, tag: ['a', 'b'] },
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
    const { exec, alpha, stderr } = setup({ run });

    expect(await exec(['alpha', '--depth', 'x'])).toBe(2);
    expect(stderr.text()).toBe(
      `git-companion: option '--depth' must be an integer\n${formatCommandUsage(alpha)}\n`,
    );
  });

  it('reports a command failure without usage', async () => {
    const run = vi.fn(() =>
      Promise.reject(new CommandError('not a git repository')),
    );
    const { exec, stderr } = setup({ run });

    expect(await exec(['alpha'])).toBe(1);
    expect(stderr.text()).toBe('git-companion: not a git repository\n');
  });

  it('exits with 1 and prints nothing for a failure the function already reported', async () => {
    const run = vi.fn(() => Promise.reject(new AlreadyReportedError()));
    const { exec, stdout, stderr } = setup({ run });

    expect(await exec(['alpha'])).toBe(1);
    expect(stdout.text()).toBe('');
    expect(stderr.text()).toBe('');
  });

  it('hides the message of an unexpected error', async () => {
    const run = vi.fn(() => Promise.reject(new TypeError('internal detail')));
    const { exec, stderr } = setup({ run });

    expect(await exec(['alpha'])).toBe(1);
    expect(stderr.text()).toBe('git-companion: unexpected error\n');
  });

  it('prints the stack trace in debug mode', async () => {
    const run = vi.fn(() => Promise.reject(new TypeError('internal detail')));
    const { exec, stderr } = setup({ run, debug: true });

    expect(await exec(['alpha'])).toBe(1);
    expect(stderr.text()).toMatch(
      /^git-companion: unexpected error\nTypeError: internal detail\n\s+at /,
    );
  });
});

describe('main: interruption', () => {
  it('exits with 130 and prints the default message', async () => {
    const run = vi.fn(() => Promise.reject(new InterruptedError()));
    const { exec, stdout, stderr } = setup({ run });

    expect(await exec(['alpha'])).toBe(130);
    expect(stdout.text()).toBe('');
    expect(stderr.text()).toBe('Interrupted.\n');
  });

  it('lets the function print its own message', async () => {
    const run = vi.fn(() => Promise.reject(new InterruptedError()));
    const onInterrupt = vi.fn((context: Parameters<Command['run']>[1]) => {
      context.stdout.write('custom\n');
    });
    const { exec, context, stdout, stderr } = setup({ run, onInterrupt });

    expect(await exec(['alpha'])).toBe(130);
    expect(onInterrupt).toHaveBeenCalledExactlyOnceWith(context);
    expect(stdout.text()).toBe('custom\n');
    expect(stderr.text()).toBe('');
  });

  it('stops waiting for a function that ignores the signal', async () => {
    const controller = new AbortController();
    const run = vi.fn(() => {
      controller.abort();
      // Never settles: only the signal can end main()
      return new Promise<void>(() => undefined);
    });
    const { exec, stderr } = setup({ run, signal: controller.signal });

    expect(await exec(['alpha'])).toBe(130);
    expect(stderr.text()).toBe('Interrupted.\n');
  });
});
