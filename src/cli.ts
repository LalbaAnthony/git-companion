#!/usr/bin/env node
import { homedir } from 'node:os';
import { commands } from './commands/index.js';
import { InterruptedError } from './errors.js';
import { main } from './main.js';
import { shouldUseColors } from './utils/cli.js';
import { createProcessRunner } from './utils/process.js';

const interruption = new AbortController();
// Ctrl+C outside of a question (a question reports it itself): abort the
// running function, which ends with exit code 130
process.on('SIGINT', () => {
  interruption.abort(new InterruptedError());
});

const exitCode = await main({
  argv: process.argv.slice(2),
  registry: commands,
  context: {
    cwd: process.cwd(),
    homeDir: homedir(),
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
    interactive: process.stdin.isTTY,
    colors: shouldUseColors(process.stdout.isTTY, process.env),
    signal: interruption.signal,
    runner: createProcessRunner({ signal: interruption.signal }),
  },
  debug: process.env.DEBUG === '1',
});

if (interruption.signal.aborted) {
  // The function may still have work in flight (main() stops waiting for it
  // on Ctrl+C): end the process now instead of letting it continue
  process.exit(exitCode);
}
process.exitCode = exitCode;
