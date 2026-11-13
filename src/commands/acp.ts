import { AlreadyReportedError, UsageError } from '../errors.js';
import type { CommandContext } from '../types/command.js';
import { Cli } from '../utils/cli.js';
import {
  checkMessageOption,
  commitAnswerError,
  noConventionalOption,
} from '../utils/conventional-commit.js';
import { canonicalPath } from '../utils/fs.js';
import { parseMessageCommand, suggestMessage } from '../utils/message-command.js';
import { Repo } from '../utils/repo.js';
import { defineCommand } from './define.js';

const commandName = 'acp';

// A blank message counts as missing: git would reject it, but only after
// git add has run
function parseMessage(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const message = value.trim();
  if (message === '') {
    throw new UsageError(
      "option '--message' requires a non-empty message",
      commandName,
    );
  }
  return message;
}

function fail(cli: Cli, message: string): never {
  cli.print(message, 'error');
  throw new AlreadyReportedError();
}

async function askMessage(
  root: string,
  messageCommand: string | undefined,
  conventional: boolean,
  cli: Cli,
  context: CommandContext,
): Promise<string> {
  // Without a terminal, the message command is not run either: its output
  // could not be confirmed
  if (!context.interactive) {
    fail(cli, 'Cannot ask for a commit message: stdin is not a terminal.');
  }

  const suggestion =
    messageCommand === undefined
      ? undefined
      : await suggestMessage(messageCommand, root, conventional, cli, context);
  // With the check, a blank answer keeps the question open; without it, it
  // aborts below
  const answer = (
    await cli.questionText('Commit message', 'white', {
      default: suggestion,
      validate: conventional
        ? (value) => commitAnswerError(value, true)
        : undefined,
    })
  ).trim();
  if (answer === '') {
    fail(cli, 'Commit message required. Aborting.');
  }
  return answer;
}

export const acp = defineCommand({
  name: commandName,
  summary: 'Add, commit and push every change of the current repository',
  options: {
    message: {
      type: 'string',
      short: 'm',
      valueName: 'message',
      description: 'Commit message; without it, the message is asked',
    },
    'message-command': {
      type: 'string',
      short: 'c',
      valueName: 'command',
      description:
        'Shell command whose output is suggested as the commit message',
    },
    'no-conventional': noConventionalOption,
  },

  async run(options, context) {
    const conventional = !options['no-conventional'];
    const message = parseMessage(options.message);
    if (message !== undefined && conventional) {
      checkMessageOption(message, 'message', commandName);
    }
    const messageCommand = parseMessageCommand(
      options['message-command'],
      commandName,
    );
    if (message !== undefined && messageCommand !== undefined) {
      throw new UsageError(
        "options '--message' and '--message-command' cannot be used together",
        commandName,
      );
    }

    const cli = new Cli(context);
    const root = await new Repo(context.cwd, context.runner).topLevel();
    if (root === undefined) {
      fail(cli, 'Not a git repository.');
    }
    // git add . would only cover the current folder
    if ((await canonicalPath(context.cwd)) !== (await canonicalPath(root))) {
      fail(cli, `Not at repo root (${root}). Aborting.`);
    }

    const repo = new Repo(root, context.runner);
    // A failing git status counts as changes, as in crawl
    if (!(await repo.hasUncommittedChanges())) {
      cli.print('Nothing to commit.', 'warning');
      return;
    }
    const branch = await repo.currentBranch();
    if (branch === '') {
      fail(cli, 'Detached HEAD. Aborting.');
    }

    const commitMessage =
      message ??
      (await askMessage(root, messageCommand, conventional, cli, context));

    if ((await repo.add()) !== 0) {
      fail(cli, 'git add failed.');
    }
    if ((await repo.commit(commitMessage)) !== 0) {
      fail(cli, 'git commit failed.');
    }
    const pushExitCode = (await repo.hasUpstream())
      ? await repo.push()
      : await repo.pushSetUpstream(branch);
    if (pushExitCode !== 0) {
      fail(cli, 'git push failed.');
    }

    cli.print('Committed and pushed.', 'success');
  },
});
