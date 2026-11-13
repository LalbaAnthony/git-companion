import { describe, expect, it } from 'vitest';
import { UsageError } from '../../src/errors.js';
import {
  checkMessageOption,
  commitAnswerError,
  commitTypes,
  conventionalCommitViolation,
} from '../../src/utils/conventional-commit.js';

const headerFormat = "header must be '<type>[(<scope>)][!]: <description>'";
const longUrl = `see https://example.com/${'a'.repeat(100)}`;

describe('conventionalCommitViolation', () => {
  it.each([
    ['feat: add the login page'],
    ['fix(parser): handle an empty input'],
    ['feat!: drop node 18'],
    ['feat(api)!: drop v1'],
    // The scope is not checked, as with the parser of commitlint
    ['feat(): empty scope'],
    ['feat(a (b)): nested parentheses'],
    // commitlint only checks the case of a description that starts with a letter
    ['refactor: `Eslint` configuration'],
    ['docs: 2FA setup'],
    ['feat: élan'],
    ['chore: wait for it...'],
    ['feat:  two spaces'],
    [`feat: ${'a'.repeat(94)}`],
    ['feat: subject\n\nbody\n\nBREAKING CHANGE: the footers are not checked'],
    ['feat: subject\r\n\r\nbody'],
    [`feat: subject\n\n${'a'.repeat(100)}`],
    [`feat: subject\n\n${longUrl}`],
  ])('accepts %j', (message) => {
    expect(conventionalCommitViolation(message)).toBeUndefined();
  });

  it.each(commitTypes.map((type) => [type]))('accepts the type %s', (type) => {
    expect(conventionalCommitViolation(`${type}: subject`)).toBeUndefined();
  });

  it.each([
    ['', headerFormat],
    ['add the login page', headerFormat],
    ['feat:subject', headerFormat],
    ['feat : subject', headerFormat],
    ['feat(scope: subject', headerFormat],
    ['feat-x: subject', headerFormat],
    ['BREAKING CHANGE: subject', headerFormat],
    ['feat: subject \n\nbody', 'header must not end with whitespace'],
    [': subject', 'type must not be empty'],
    ['(scope): subject', 'type must not be empty'],
    ['Feat: subject', 'type must be lowercase'],
    ['FIX: subject', 'type must be lowercase'],
    ['wip: subject', "unknown type 'wip'"],
    ['feature: subject', "unknown type 'feature'"],
    ['feat: Add the login page', 'description must not start with an uppercase letter'],
    ['feat: API rework', 'description must not start with an uppercase letter'],
    ['feat: Élan', 'description must not start with an uppercase letter'],
    ['feat: add the login page.', "description must not end with '.'"],
    ['feat: ..', "description must not end with '.'"],
    [`feat: ${'a'.repeat(95)}`, 'header must not be longer than 100 characters'],
    ['feat: subject\nbody', 'blank line required after the header'],
    [`feat: subject\n\n${'a'.repeat(101)}`, 'body lines must not be longer than 100 characters'],
    [`feat: subject\n\n${'a'.repeat(101)}\n${longUrl}`, 'body lines must not be longer than 100 characters'],
    // Only the first failing rule is reported
    ['Feat: Add the login page.', 'type must be lowercase'],
  ])('refuses %j: %s', (message, reason) => {
    expect(conventionalCommitViolation(message)).toBe(reason);
  });
});

describe('checkMessageOption', () => {
  it('accepts a Conventional Commits message', () => {
    expect(() => {
      checkMessageOption('feat: subject', 'message', 'acp');
    }).not.toThrow();
  });

  it('throws a usage error of the function with the reason', () => {
    let error: unknown;
    try {
      checkMessageOption('wip: subject', 'default-message', 'crawl');
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(UsageError);
    expect(error).toMatchObject({
      message:
        "option '--default-message' is not a Conventional Commits message: unknown type 'wip'",
      commandName: 'crawl',
    });
  });
});

describe('commitAnswerError', () => {
  it.each([[true], [false]])('refuses a blank answer (conventional: %s)', (conventional) => {
    expect(commitAnswerError('', conventional)).toBe('Commit message required.');
    expect(commitAnswerError(' \t ', conventional)).toBe('Commit message required.');
  });

  it('checks the trimmed answer', () => {
    expect(commitAnswerError('  feat: subject  ', true)).toBeUndefined();
    expect(commitAnswerError(' wip: subject ', true)).toBe(
      "Not a Conventional Commits message: unknown type 'wip'",
    );
  });

  it('accepts any answer that is not blank without the check', () => {
    expect(commitAnswerError('Anything goes.', false)).toBeUndefined();
  });
});
