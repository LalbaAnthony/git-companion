import type { ParseArgsOptionsConfig, parseArgs } from 'node:util';
import type {
  Command,
  CommandContext,
  OptionSpecs,
  OptionValues,
} from './command.js';

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

// The parseArgs() configuration of src/index.ts. strict: false so that every
// problem goes through UsageError with a uniform message, instead of the raw
// ERR_PARSE_ARGS_* text
export interface TokenizeConfig {
  readonly args: readonly string[];
  readonly options: ParseArgsOptionsConfig;
  readonly allowPositionals: true;
  readonly strict: false;
  readonly tokens: true;
}

// @types/node does not export the token types of parseArgs(): they are taken
// from its result for that configuration
export type Token = ReturnType<typeof parseArgs<TokenizeConfig>>['tokens'][number];

export type OptionToken = Extract<Token, { kind: 'option' }>;

export interface MainOptions {
  readonly argv: readonly string[];
  readonly registry: readonly Command[];
  readonly context: CommandContext;
  // Print the stack trace of a failure on stderr
  readonly debug: boolean;
}
