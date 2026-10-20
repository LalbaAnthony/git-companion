#!/usr/bin/env node
import { GCError, UsageError } from './errors.js';
import { parseCliArguments } from './index.js';
import { packageVersion } from './version.js';

const usage = `Usage:
  git-companion <function>

Options:
  -h, --help      Show this help and exit
  -v, --version   Show the version and exit

Example:
  git-companion crawl`;

const unexpectedFailureExitCode = 1;

function writeLine(stream: NodeJS.WriteStream, text: string): void {
  stream.write(`${text}\n`);
}

async function run(argv: readonly string[]): Promise<void> {
  const args = parseCliArguments(argv);

  if (args.help) {
    writeLine(process.stdout, usage);
    return;
  }

  if (args.version) {
    writeLine(process.stdout, packageVersion);
    return;
  }

  // ...

  writeLine(process.stdout, 'Done');
}

try {
  await run(process.argv.slice(2));
} catch (error) {
  const isKnownFailure = error instanceof GCError;

  writeLine(
    process.stderr,
    `git-companion: ${isKnownFailure ? error.message : 'unexpected error'}`,
  );

  if (error instanceof UsageError) {
    writeLine(process.stderr, usage);
  }

  if (
    process.env.DEBUG === '1' &&
    error instanceof Error &&
    error.stack !== undefined
  ) {
    writeLine(process.stderr, error.stack);
  }

  process.exitCode = isKnownFailure
    ? error.exitCode
    : unexpectedFailureExitCode;
}
