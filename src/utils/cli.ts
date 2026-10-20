import { confirm, input, select } from '@inquirer/prompts';
import { CommandError, InterruptedError } from '../errors.js';
import type { CommandContext } from '../types/command.js';

const reset = '\u001b[0m';
const clearScreen = '\u001b[H\u001b[J';

export const styles = {
  header: '\u001b[95m',
  white: '\u001b[97m',
  info: '\u001b[96m',
  success: '\u001b[92m',
  warning: '\u001b[93m',
  error: '\u001b[91m',
  bold: '\u001b[1m',
  underline: '\u001b[4m',
} as const;

export type Style = keyof typeof styles;

interface PromptContext {
  readonly input: NodeJS.ReadableStream;
  readonly output: NodeJS.WritableStream;
  readonly signal: AbortSignal;
}

// Errors thrown by @inquirer/prompts on Ctrl+C and on an aborted signal. They
// are matched by name because they live in @inquirer/core, which is not a
// direct dependency.
const promptInterruptionNames = new Set(['ExitPromptError', 'AbortPromptError']);

// Same precedence as Node.js: FORCE_COLOR, then NO_COLOR and TERM=dumb, then
// whether the stream is a terminal
export function shouldUseColors(
  isTTY: boolean | undefined,
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  const forceColor = env.FORCE_COLOR;
  if (forceColor !== undefined) {
    return forceColor !== '0' && forceColor !== 'false';
  }
  if (env.NO_COLOR !== undefined || env.TERM === 'dumb') {
    return false;
  }
  return isTTY === true;
}

// Terminal helpers shared by every function: styled output and questions
export class Cli {
  readonly #context: CommandContext;

  constructor(context: CommandContext) {
    this.#context = context;
  }

  clear(): void {
    this.#context.stdout.write(`${clearScreen}\n`);
  }

  print(message: string, style: Style = 'white'): void {
    this.#context.stdout.write(`${this.#style(message, style)}\n`);
  }

  questionText(message: string, style: Style = 'white'): Promise<string> {
    return this.#prompt((context) =>
      input({ message: this.#style(message, style) }, context),
    );
  }

  questionList(
    message: string,
    choices: readonly string[],
    style: Style = 'white',
  ): Promise<string> {
    return this.#prompt((context) =>
      select({ message: this.#style(message, style), choices }, context),
    );
  }

  questionConfirm(message: string, style: Style = 'white'): Promise<boolean> {
    // No by default, like inquirer.Confirm in Python
    return this.#prompt((context) =>
      confirm(
        { message: this.#style(message, style), default: false },
        context,
      ),
    );
  }

  #style(message: string, style: Style): string {
    return this.#context.colors ? `${styles[style]}${message}${reset}` : message;
  }

  async #prompt<T>(ask: (context: PromptContext) => Promise<T>): Promise<T> {
    if (!this.#context.interactive) {
      throw new CommandError('cannot ask a question: stdin is not a terminal');
    }
    try {
      return await ask({
        input: this.#context.stdin,
        output: this.#context.stdout,
        signal: this.#context.signal,
      });
    } catch (error) {
      if (error instanceof Error && promptInterruptionNames.has(error.name)) {
        throw new InterruptedError({ cause: error });
      }
      throw error;
    }
  }
}
