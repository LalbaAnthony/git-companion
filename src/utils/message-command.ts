import { UsageError } from '../errors.js';
import type { CommandContext } from '../types/command.js';
import type { Cli } from './cli.js';

// --message-command, shared by every function that commits, so that it
// behaves the same everywhere

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

// Runs the message command in the repository. Resolves with its trimmed
// output, or undefined when it exits with an error or prints nothing: the
// question is then asked without a suggestion. The repository name, when
// given, ends up in the warning.
export async function suggestMessage(
  messageCommand: string,
  repoPath: string,
  cli: Cli,
  context: CommandContext,
  repoName?: string,
): Promise<string | undefined> {
  cli.print('Generating the commit message...', 'info');
  const result = await context.runner.captureShell(messageCommand, repoPath);
  const message = result.stdout.replace(/\r\n/g, '\n').trim();
  if (result.exitCode !== 0 || message === '') {
    const location = repoName === undefined ? '' : ` in ${repoName}`;
    cli.print(`message command failed${location}.`, 'warning');
    return undefined;
  }
  return message;
}
