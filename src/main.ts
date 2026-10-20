import {
  AlreadyReportedError,
  GCError,
  InterruptedError,
  UsageError,
} from './errors.js';
import { formatCommandUsage, formatGeneralUsage } from './help.js';
import { parseCliArguments } from './index.js';
import type { Command, CommandContext } from './types/command.js';
import { readPackageVersion } from './version.js';

const successExitCode = 0;
const unexpectedFailureExitCode = 1;

export interface MainOptions {
  readonly argv: readonly string[];
  readonly registry: readonly Command[];
  readonly context: CommandContext;
  // Print the stack trace of a failure on stderr
  readonly debug: boolean;
}

function writeLine(stream: NodeJS.WritableStream, text: string): void {
  stream.write(`${text}\n`);
}

function usageFor(error: UsageError, registry: readonly Command[]): string {
  const command = registry.find(
    (candidate) => candidate.name === error.commandName,
  );
  return command === undefined
    ? formatGeneralUsage(registry)
    : formatCommandUsage(command);
}

// Settles with the task, or rejects as soon as the user interrupts it, even
// when the task itself does not watch the signal
async function untilInterrupted(
  task: Promise<void>,
  signal: AbortSignal,
): Promise<void> {
  let onAbort: (() => void) | undefined;
  const interrupted = new Promise<never>((_resolve, reject) => {
    onAbort = () => {
      reject(new InterruptedError());
    };
    if (signal.aborted) {
      onAbort();
    } else {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });

  try {
    await Promise.race([task, interrupted]);
  } finally {
    if (onAbort !== undefined) {
      signal.removeEventListener('abort', onAbort);
    }
  }
}

// Returns the process exit code; never throws
export async function main(options: MainOptions): Promise<number> {
  const { argv, registry, context, debug } = options;
  let running: Command | undefined;

  try {
    const args = parseCliArguments(argv, registry);

    switch (args.kind) {
      case 'help':
        writeLine(
          context.stdout,
          args.command === undefined
            ? formatGeneralUsage(registry)
            : formatCommandUsage(args.command),
        );
        return successExitCode;
      case 'version':
        writeLine(context.stdout, readPackageVersion());
        return successExitCode;
      case 'run':
        running = args.command;
        await untilInterrupted(
          args.command.run(args.options, context),
          context.signal,
        );
        return successExitCode;
    }
  } catch (error) {
    if (error instanceof InterruptedError) {
      if (running?.onInterrupt === undefined) {
        writeLine(context.stderr, 'Interrupted.');
      } else {
        running.onInterrupt(context);
      }
      return error.exitCode;
    }

    if (error instanceof AlreadyReportedError) {
      return error.exitCode;
    }

    const isKnownFailure = error instanceof GCError;

    writeLine(
      context.stderr,
      `git-companion: ${isKnownFailure ? error.message : 'unexpected error'}`,
    );

    if (error instanceof UsageError) {
      writeLine(context.stderr, usageFor(error, registry));
    }

    if (debug && error instanceof Error && error.stack !== undefined) {
      writeLine(context.stderr, error.stack);
    }

    return isKnownFailure ? error.exitCode : unexpectedFailureExitCode;
  }
}
