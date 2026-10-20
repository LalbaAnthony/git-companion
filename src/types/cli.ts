import type { Command, OptionSpecs, OptionValues } from './command.js';

export type CliArguments =
  | {
      readonly kind: 'help';
      // undefined requests the general help
      readonly command: Command | undefined;
    }
  | { readonly kind: 'version' }
  | {
      readonly kind: 'run';
      readonly command: Command;
      readonly options: OptionValues<OptionSpecs>;
    };
