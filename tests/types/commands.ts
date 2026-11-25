import type { Writable } from 'node:stream';
import type { CommandContext } from '../../src/types/command.js';

export type CapturedStream = Writable & { readonly text: () => string };

export interface TestContext extends CommandContext {
  readonly stdout: CapturedStream;
  readonly stderr: CapturedStream;
}
