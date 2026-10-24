import { appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { AlreadyReportedError, UsageError } from '../errors.js';
import { Cli } from '../utils/cli.js';
import { pathExists } from '../utils/fs.js';
import { Repo } from '../utils/repo.js';
import { defineCommand } from './define.js';

const commandName = 'ignore';

function parsePattern(value: string): string {
  if (value === '') {
    throw new UsageError(
      "option '--pattern' requires a non-empty pattern",
      commandName,
    );
  }
  // A line break would add several lines at once
  if (/[\r\n]/.test(value)) {
    throw new UsageError("option '--pattern' expects a single line", commandName);
  }
  return value;
}

// Code of a file system error (EACCES, EISDIR...); any other error is unexpected
function systemErrorCode(error: unknown): string {
  if (error instanceof Error && 'code' in error && typeof error.code === 'string') {
    return error.code;
  }
  throw error;
}

// Resolves with false when the pattern is already a line of the file
async function appendPattern(file: string, pattern: string): Promise<boolean> {
  const content = await readFile(file, 'utf8');
  // CRs are dropped so that a CRLF file still matches
  if (content.replaceAll('\r', '').split('\n').includes(pattern)) {
    return false;
  }
  // Never glue the pattern onto an unterminated last line. LF only, even in a
  // CRLF file.
  const separator = content === '' || content.endsWith('\n') ? '' : '\n';
  await appendFile(file, `${separator}${pattern}\n`);
  return true;
}

export const ignore = defineCommand({
  name: commandName,
  summary: 'Add patterns to the .gitignore at the root of the current repository',
  options: {
    pattern: {
      type: 'string',
      short: 'p',
      multiple: true,
      valueName: 'pattern',
      description: 'Line to add to the .gitignore',
    },
  },

  async run(options, context) {
    const patterns = options.pattern.map(parsePattern);
    if (patterns.length === 0) {
      throw new UsageError("at least one '--pattern' is required", commandName);
    }

    const cli = new Cli(context);
    // Outside of a working tree, the file goes to the current directory
    const root =
      (await new Repo(context.cwd, context.runner).topLevel()) ?? context.cwd;
    const file = path.join(root, '.gitignore');

    if (!(await pathExists(file))) {
      try {
        await appendFile(file, '');
      } catch (error) {
        cli.print(`Failed to create ${file} (${systemErrorCode(error)})`, 'error');
        throw new AlreadyReportedError();
      }
      cli.print(`Created ${file}`, 'info');
    }

    // A failing pattern does not stop the next ones
    let failed = false;
    for (const pattern of patterns) {
      let added: boolean;
      try {
        added = await appendPattern(file, pattern);
      } catch (error) {
        cli.print(`Failed to write ${file} (${systemErrorCode(error)})`, 'error');
        failed = true;
        continue;
      }
      if (added) {
        cli.print(`Added '${pattern}' to ${file}`, 'success');
      } else {
        cli.print(`'${pattern}' is already in ${file}`, 'warning');
      }
    }

    if (failed) {
      throw new AlreadyReportedError();
    }
  },
});
