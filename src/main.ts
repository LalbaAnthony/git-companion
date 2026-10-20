import { GCError, UsageError } from './errors.js';
import { formatCommandUsage, formatGeneralUsage } from './help.js';
import { parseCliArguments } from './index.js';
import type { Command, CommandContext, OutputStream } from './types/command.js';
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

function writeLine(stream: OutputStream, text: string): void {
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

async function run(
  argv: readonly string[],
  registry: readonly Command[],
  context: CommandContext,
): Promise<void> {
  const args = parseCliArguments(argv, registry);

  switch (args.kind) {
    case 'help':
      writeLine(
        context.stdout,
        args.command === undefined
          ? formatGeneralUsage(registry)
          : formatCommandUsage(args.command),
      );
      return;
    case 'version':
      writeLine(context.stdout, readPackageVersion());
      return;
    case 'run':
      await args.command.run(args.options, context);
      return;
  }
}

// Returns the process exit code; never throws
export async function main(options: MainOptions): Promise<number> {
  const { argv, registry, context, debug } = options;

  try {
    await run(argv, registry, context);
    return successExitCode;
  } catch (error) {
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
