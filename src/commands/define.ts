import type { Command, OptionSpecs } from '../types/command.js';

// Identity helper: infers the option specs so that run() receives typed values
export function defineCommand<const TOptions extends OptionSpecs>(
  command: Command<TOptions>,
): Command<TOptions> {
  return command;
}
