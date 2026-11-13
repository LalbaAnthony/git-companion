import { input } from '@inquirer/prompts';
import { expect, vi } from 'vitest';

// Matches the validate function of a question config. expect.any() is typed
// any, which no-unsafe-assignment rejects inside an object literal.
export const anyValidate: unknown = expect.any(Function);

// For a test file that mocks @inquirer/prompts. Behaves like inquirer for the
// next text question: each answer is validated in turn, and the question
// stays open until one is accepted. Returns the errors shown, filled as the
// question runs.
export function answerInTurn(...answers: string[]): string[] {
  const errors: string[] = [];
  vi.mocked(input).mockImplementationOnce(async (config) => {
    for (const answer of answers) {
      const result =
        config.validate === undefined ? true : await config.validate(answer);
      if (result === true) {
        return answer;
      }
      errors.push(result === false ? 'invalid' : result);
    }
    throw new Error(`no answer accepted among ${JSON.stringify(answers)}`);
  });
  return errors;
}
