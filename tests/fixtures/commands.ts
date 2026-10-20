import { vi } from 'vitest';
import { defineCommand } from '../../src/commands/define.js';
import type { Command, OutputStream } from '../../src/types/command.js';

export function createAlpha(run: Command['run'] = vi.fn(() => Promise.resolve())) {
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
    },
    run,
  });
}

export function createBeta(run: Command['run'] = vi.fn(() => Promise.resolve())) {
  return defineCommand({
    name: 'beta-long-name',
    summary: 'Second fake function',
    options: {
      force: { type: 'boolean', description: 'Skip checks' },
    },
    run,
  });
}

export interface CapturedStream extends OutputStream {
  readonly text: () => string;
}

export function captureStream(): CapturedStream {
  const chunks: string[] = [];
  return {
    write(text: string) {
      chunks.push(text);
      return true;
    },
    text: () => chunks.join(''),
  };
}
