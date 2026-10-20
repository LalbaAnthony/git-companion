import { PassThrough, Writable } from 'node:stream';
import { vi } from 'vitest';
import { defineCommand } from '../../src/commands/define.js';
import type { Command, CommandContext } from '../../src/types/command.js';
import { createProcessRunner } from '../../src/utils/process.js';

export function createAlpha(
  run: Command['run'] = vi.fn(() => Promise.resolve()),
) {
  return defineCommand({
    name: 'alpha',
    summary: 'First fake function',
    options: {
      root: {
        type: 'string',
        short: 'r',
        valueName: 'path',
        description: 'Root directory',
      },
      depth: {
        type: 'string',
        valueName: 'n',
        description: 'Maximum depth',
        default: '3',
      },
      quiet: { type: 'boolean', short: 'q', description: 'Less output' },
      tag: {
        type: 'string',
        short: 't',
        multiple: true,
        valueName: 'name',
        description: 'Tag to apply',
      },
    },
    run,
  });
}

export function createBeta(
  run: Command['run'] = vi.fn(() => Promise.resolve()),
) {
  return defineCommand({
    name: 'beta-long-name',
    summary: 'Second fake function',
    options: {
      force: { type: 'boolean', description: 'Skip checks' },
    },
    run,
  });
}

export type CapturedStream = Writable & { readonly text: () => string };

export function captureStream(): CapturedStream {
  const chunks: Buffer[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(chunk);
      callback();
    },
  });
  return Object.assign(stream, {
    text: () => Buffer.concat(chunks).toString('utf8'),
  });
}

export interface TestContext extends CommandContext {
  readonly stdout: CapturedStream;
  readonly stderr: CapturedStream;
}

// Child process output is forwarded to the captured streams instead of the terminal
export function createContext(
  overrides: Partial<Omit<CommandContext, 'stdout' | 'stderr' | 'runner'>> = {},
): TestContext {
  const stdout = captureStream();
  const stderr = captureStream();
  const signal = overrides.signal ?? new AbortController().signal;

  return {
    cwd: process.cwd(),
    homeDir: process.cwd(),
    stdin: new PassThrough(),
    interactive: false,
    colors: false,
    ...overrides,
    signal,
    stdout,
    stderr,
    runner: createProcessRunner({ signal, output: { stdout, stderr } }),
  };
}
