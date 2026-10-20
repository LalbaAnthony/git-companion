import { confirm, input, select } from '@inquirer/prompts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandError, InterruptedError } from '../../src/errors.js';
import { Cli, shouldUseColors } from '../../src/utils/cli.js';
import { createContext } from '../fixtures/commands.js';

vi.mock('@inquirer/prompts', () => ({
  input: vi.fn(),
  select: vi.fn(),
  confirm: vi.fn(),
}));

// restoreMocks does not reset the calls of module mocks
beforeEach(() => {
  vi.clearAllMocks();
});

function namedError(name: string): Error {
  const error = new Error('prompt closed');
  error.name = name;
  return error;
}

describe('Cli.print', () => {
  it('prints plain text without colors', () => {
    const context = createContext();
    new Cli(context).print('hello', 'warning');
    expect(context.stdout.text()).toBe('hello\n');
  });

  it('wraps the text in the style and the reset code with colors', () => {
    const context = createContext({ colors: true });
    const cli = new Cli(context);
    cli.print('a');
    cli.print('b', 'error');
    expect(context.stdout.text()).toBe(
      '\u001b[97ma\u001b[0m\n\u001b[91mb\u001b[0m\n',
    );
  });

  it('keeps the newlines of the message inside the style', () => {
    const context = createContext({ colors: true });
    new Cli(context).print('\n');
    expect(context.stdout.text()).toBe('\u001b[97m\n\u001b[0m\n');
  });
});

describe('Cli.clear', () => {
  it('moves the cursor home and clears the screen', () => {
    const context = createContext();
    new Cli(context).clear();
    expect(context.stdout.text()).toBe('\u001b[H\u001b[J\n');
  });
});

describe('Cli questions', () => {
  it('asks a text question with the context streams and signal', async () => {
    const context = createContext({ interactive: true, colors: true });
    vi.mocked(input).mockResolvedValueOnce('answer');

    await expect(new Cli(context).questionText('Name?', 'info')).resolves.toBe(
      'answer',
    );
    expect(input).toHaveBeenCalledExactlyOnceWith(
      { message: '\u001b[96mName?\u001b[0m' },
      { input: context.stdin, output: context.stdout, signal: context.signal },
    );
  });

  it('asks to pick one of the choices', async () => {
    const context = createContext({ interactive: true });
    vi.mocked(select).mockResolvedValueOnce('b');

    await expect(
      new Cli(context).questionList('Pick', ['a', 'b']),
    ).resolves.toBe('b');
    expect(select).toHaveBeenCalledExactlyOnceWith(
      { message: 'Pick', choices: ['a', 'b'] },
      { input: context.stdin, output: context.stdout, signal: context.signal },
    );
  });

  it('asks a yes/no question that defaults to no', async () => {
    const context = createContext({ interactive: true });
    vi.mocked(confirm).mockResolvedValueOnce(true);

    await expect(new Cli(context).questionConfirm('Sure?')).resolves.toBe(true);
    expect(confirm).toHaveBeenCalledExactlyOnceWith(
      { message: 'Sure?', default: false },
      { input: context.stdin, output: context.stdout, signal: context.signal },
    );
  });

  it('refuses to ask when stdin is not a terminal', async () => {
    const context = createContext({ interactive: false });

    await expect(new Cli(context).questionText('Name?')).rejects.toThrow(
      new CommandError('cannot ask a question: stdin is not a terminal'),
    );
    expect(input).not.toHaveBeenCalled();
  });

  it.each([['ExitPromptError'], ['AbortPromptError']])(
    'turns %s into an interruption',
    async (name) => {
      const context = createContext({ interactive: true });
      vi.mocked(input).mockRejectedValueOnce(namedError(name));

      await expect(new Cli(context).questionText('Name?')).rejects.toThrow(
        InterruptedError,
      );
    },
  );

  it('propagates any other prompt error', async () => {
    const context = createContext({ interactive: true });
    const error = namedError('HookError');
    vi.mocked(input).mockRejectedValueOnce(error);

    await expect(new Cli(context).questionText('Name?')).rejects.toBe(error);
  });
});

describe('shouldUseColors', () => {
  it.each([
    [true, {}, true],
    [false, {}, false],
    [undefined, {}, false],
    [true, { NO_COLOR: '1' }, false],
    [true, { NO_COLOR: '' }, false],
    [true, { TERM: 'dumb' }, false],
    [false, { FORCE_COLOR: '1' }, true],
    [false, { FORCE_COLOR: '' }, true],
    [true, { FORCE_COLOR: '0' }, false],
    [true, { FORCE_COLOR: 'false' }, false],
    [false, { FORCE_COLOR: '1', NO_COLOR: '1' }, true],
  ])('isTTY=%s env=%j -> %s', (isTTY, env, expected) => {
    expect(shouldUseColors(isTTY, env)).toBe(expected);
  });
});
