import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { CommandError, InterruptedError } from '../errors.js';
import type { CapturedProcess, ProcessRunner } from '../types/command.js';

// Exit status of a Windows console process stopped by Ctrl+C (STATUS_CONTROL_C_EXIT)
const windowsCtrlCExitCode = 0xc000013a;

export interface ProcessRunnerOptions {
  // Aborting it kills the running child and rejects with the abort reason
  readonly signal: AbortSignal;
  // Receives the output of run(); without it, run() inherits the terminal so
  // that git keeps its colors, progress and credential prompts
  readonly output?: {
    readonly stdout: NodeJS.WritableStream;
    readonly stderr: NodeJS.WritableStream;
  };
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new InterruptedError({ cause: signal.reason });
}

function waitForExit(
  child: ChildProcess,
  command: string,
  signal: AbortSignal,
): Promise<number> {
  return new Promise((resolve, reject) => {
    child.once('error', (error: NodeJS.ErrnoException) => {
      if (signal.aborted) {
        reject(abortReason(signal));
      } else if (error.code === 'ENOENT') {
        reject(
          new CommandError(`cannot run '${command}': not found in PATH`, {
            cause: error,
          }),
        );
      } else {
        reject(error);
      }
    });
    child.once('close', (code, killSignal) => {
      // The terminal sends Ctrl+C to the child as well: report it as an
      // interruption, not as a failure of the command
      if (killSignal === 'SIGINT' || code === windowsCtrlCExitCode) {
        reject(new InterruptedError());
      } else {
        resolve(code ?? 1);
      }
    });
  });
}

export function createProcessRunner(
  options: ProcessRunnerOptions,
): ProcessRunner {
  const { signal, output } = options;

  return {
    async capture(command, args, cwd): Promise<CapturedProcess> {
      if (signal.aborted) {
        throw abortReason(signal);
      }
      const child = spawn(command, args, {
        cwd,
        signal,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
      child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));

      const exitCode = await waitForExit(child, command, signal);
      return {
        exitCode,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      };
    },

    async run(command, args, cwd): Promise<number> {
      if (signal.aborted) {
        throw abortReason(signal);
      }
      if (output === undefined) {
        return waitForExit(
          spawn(command, args, { cwd, signal, stdio: 'inherit' }),
          command,
          signal,
        );
      }
      const child = spawn(command, args, {
        cwd,
        signal,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
      child.stdout.pipe(output.stdout, { end: false });
      child.stderr.pipe(output.stderr, { end: false });
      return waitForExit(child, command, signal);
    },
  };
}
