import { UsageError } from '../errors.js';
import type { BooleanOptionSpec } from '../types/command.js';

// Conventional Commits check, shared by every function that commits, so that
// it behaves the same everywhere. The rules are the blocking rules of
// @commitlint/config-conventional, plus the blank line before the body, which
// the specification requires.

// --no-conventional, declared as is by every function that commits
export const noConventionalOption = {
  type: 'boolean',
  short: 'n',
  description: 'Accept commit messages that do not follow Conventional Commits',
} as const satisfies BooleanOptionSpec;

export const commitTypes: readonly string[] = [
  'build',
  'chore',
  'ci',
  'docs',
  'feat',
  'fix',
  'perf',
  'refactor',
  'revert',
  'style',
  'test',
];

const maxLength = 100;

// Header pattern of conventional-changelog-conventionalcommits, the parser of
// commitlint: an empty type or scope matches, the rules below reject the type
const headerPattern = /^(\w*)(?:\((.*)\))?!?: (.*)$/;

// commitlint only checks the case of a description that starts with a letter
const startsWithLetter = /^[\p{Ll}\p{Lu}\p{Lt}]/iu;

// commitlint lets a line that contains a URL exceed the length limit
const containsUrl = /\bhttps?:\/\/\S+/;

// The subject-case rule of config-conventional refuses the sentence, start,
// pascal and upper cases. All of them leave the first letter unchanged by
// toUpperCase(), which is the sentence case test, so that test covers them.
function startsWithUppercase(description: string): boolean {
  const text = description.trimStart();
  const first = text.charAt(0);
  return startsWithLetter.test(text) && first.toUpperCase() === first;
}

// An ellipsis is not a full stop, as in commitlint
function endsWithFullStop(description: string): boolean {
  return description.endsWith('.') && !description.endsWith('...');
}

// The reason why the message does not follow Conventional Commits, or
// undefined when it does. Only the first failing rule is reported.
// The scope and the footers are not checked.
export function conventionalCommitViolation(message: string): string | undefined {
  const [header = '', ...bodyLines] = message.split(/\r?\n/);

  const match = headerPattern.exec(header);
  if (match === null) {
    return "header must be '<type>[(<scope>)][!]: <description>'";
  }
  if (header !== header.trimEnd()) {
    return 'header must not end with whitespace';
  }
  const type = match[1] ?? '';
  const description = match[3] ?? '';
  if (type === '') {
    return 'type must not be empty';
  }
  if (type !== type.toLowerCase()) {
    return 'type must be lowercase';
  }
  if (!commitTypes.includes(type)) {
    return `unknown type '${type}'`;
  }
  if (startsWithUppercase(description)) {
    return 'description must not start with an uppercase letter';
  }
  if (endsWithFullStop(description)) {
    return "description must not end with '.'";
  }
  if (header.length > maxLength) {
    return `header must not be longer than ${String(maxLength)} characters`;
  }
  if (bodyLines.length > 0 && bodyLines[0] !== '') {
    return 'blank line required after the header';
  }
  if (bodyLines.some((line) => line.length > maxLength && !containsUrl.test(line))) {
    return `body lines must not be longer than ${String(maxLength)} characters`;
  }
  return undefined;
}

// For an option whose value is a commit message, once it is trimmed
export function checkMessageOption(
  message: string,
  optionName: string,
  commandName: string,
): void {
  const reason = conventionalCommitViolation(message);
  if (reason !== undefined) {
    throw new UsageError(
      `option '--${optionName}' is not a Conventional Commits message: ${reason}`,
      commandName,
    );
  }
}

// Validation of the answer to a commit message question, which is trimmed
// before use: the error shown under the question, which stays open, or
// undefined when the answer is accepted. A blank answer is always refused.
export function commitAnswerError(
  answer: string,
  conventional: boolean,
): string | undefined {
  const message = answer.trim();
  if (message === '') {
    return 'Commit message required.';
  }
  if (!conventional) {
    return undefined;
  }
  const reason = conventionalCommitViolation(message);
  return reason === undefined
    ? undefined
    : `Not a Conventional Commits message: ${reason}`;
}
