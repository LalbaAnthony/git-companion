import { UsageError } from '../errors.js';
import type { BooleanOptionSpec, CommandContext } from '../types/command.js';
import type { Cli } from './cli.js';
import { conventionalCommitViolation } from './conventional-commit.js';

// --message-command and --yes, shared by every function that commits, so that
// they behave the same everywhere

// --yes, declared as is by every function that commits
export const yesOption = {
  type: 'boolean',
  short: 'y',
  description: 'Commit the output of the message command without asking',
} as const satisfies BooleanOptionSpec;

export function parseMessageCommand(
  value: string | undefined,
  commandName: string,
): string | undefined {
  if (value === '') {
    throw new UsageError(
      "option '--message-command' requires a non-empty command",
      commandName,
    );
  }
  return value;
}

// With --yes, the message command is the only source of the message: its
// output is committed without question, so without a terminal too, and its
// failure has no fallback. Resolves with the command whose output is
// committed as is, or undefined without --yes.
export function acceptedMessageCommand(
  yes: boolean,
  messageCommand: string | undefined,
  commandName: string,
): string | undefined {
  if (!yes) {
    return undefined;
  }
  if (messageCommand === undefined) {
    throw new UsageError(
      "option '--yes' requires '--message-command'",
      commandName,
    );
  }
  return messageCommand;
}

// Runs the message command in the repository. Resolves with its trimmed
// output, or undefined when it exits with an error, prints nothing, or, when
// conventional is set, prints a message that does not follow Conventional
// Commits. The failure is a warning when the caller falls back on something
// else, and an error when the output is required (--yes): the caller then
// fails. The repository name, when given, ends up in the message.
export async function suggestMessage(
  messageCommand: string,
  repoPath: string,
  conventional: boolean,
  required: boolean,
  cli: Cli,
  context: CommandContext,
  repoName?: string,
): Promise<string | undefined> {
  cli.print('Generating the commit message...', 'info');
  const result = await context.runner.captureShell(messageCommand, repoPath);
  const message = result.stdout.replace(/\r\n/g, '\n').trim();
  if (
    result.exitCode !== 0 ||
    message === '' ||
    (conventional && conventionalCommitViolation(message) !== undefined)
  ) {
    const location = repoName === undefined ? '' : ` in ${repoName}`;
    cli.print(`message command failed${location}.`, required ? 'error' : 'warning');
    return undefined;
  }
  return message;
}
