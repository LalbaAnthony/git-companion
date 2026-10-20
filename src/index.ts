import { parseArgs } from 'node:util';
import type { ParseArgsOptionsConfig } from 'node:util';
import { UsageError } from './errors.js';
import type { CliArguments } from './types/cli.js';
import type { Command, OptionSpec, OptionSpecs, OptionValues } from './types/command.js';

// Only accepted on their own: git-companion -h | -v
const globalOptions: ParseArgsOptionsConfig = {
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
};

// Added to every function: git-companion <function> -h
const commandHelpOptions: ParseArgsOptionsConfig = {
  help: { type: 'boolean', short: 'h' },
};

function tokenize(args: readonly string[], options: ParseArgsOptionsConfig) {
  // strict: false so that every problem goes through UsageError with a uniform
  // message, instead of the raw ERR_PARSE_ARGS_* text
  return parseArgs({
    args,
    options,
    allowPositionals: true,
    strict: false,
    tokens: true,
  });
}

type Token = ReturnType<typeof tokenize>['tokens'][number];
type OptionToken = Extract<Token, { kind: 'option' }>;

function parseGlobalArguments(argv: readonly string[]): CliArguments {
  let help = false;
  let version = false;

  for (const token of tokenize(argv, globalOptions).tokens) {
    if (token.kind === 'option-terminator') {
      throw new UsageError("unexpected argument '--'");
    }
    if (token.kind === 'positional') {
      throw new UsageError(
        `unexpected argument '${token.value}' (global options must be used alone)`,
      );
    }
    if (token.name !== 'help' && token.name !== 'version') {
      throw new UsageError(`unknown option '${token.rawName}'`);
    }
    if (token.value !== undefined) {
      throw new UsageError(`option '${token.rawName}' does not take a value`);
    }
    if (token.name === 'help') {
      help = true;
    } else {
      version = true;
    }
  }

  // --help wins when both are given
  if (help) {
    return { kind: 'help', command: undefined };
  }
  if (version) {
    return { kind: 'version' };
  }
  // argv[0] starts with '-', so the loop above either set a flag or threw
  throw new Error('global arguments produced no option');
}

function toParseArgsOptions(options: OptionSpecs): ParseArgsOptionsConfig {
  const config: ParseArgsOptionsConfig = {};
  for (const [name, spec] of Object.entries(options)) {
    config[name] =
      spec.short === undefined
        ? { type: spec.type }
        : { type: spec.type, short: spec.short };
  }
  return config;
}

function assertOptionValue(
  command: Command,
  spec: OptionSpec,
  token: OptionToken,
): void {
  if (spec.type === 'boolean') {
    if (token.value !== undefined) {
      throw new UsageError(
        `option '${token.rawName}' does not take a value`,
        command.name,
      );
    }
    return;
  }

  if (token.value === undefined) {
    throw new UsageError(
      `option '${token.rawName}' requires a value`,
      command.name,
    );
  }
  // Same rule as parseArgs strict mode: in '--root -q' the user most likely
  // forgot the value, while '--root=-q' is explicit
  if (!token.inlineValue && token.value.startsWith('-')) {
    throw new UsageError(
      `option '${token.rawName}' requires a value (use '--${token.name}=${token.value}' for a value starting with '-')`,
      command.name,
    );
  }
}

function parseCommandArguments(
  command: Command,
  args: readonly string[],
): CliArguments {
  const parsed = tokenize(args, {
    ...toParseArgsOptions(command.options),
    ...commandHelpOptions,
  });
  let help = false;

  for (const token of parsed.tokens) {
    if (token.kind === 'option-terminator') {
      throw new UsageError(
        `unexpected argument '--' for '${command.name}'`,
        command.name,
      );
    }
    if (token.kind === 'positional') {
      throw new UsageError(
        `unexpected argument '${token.value}' for '${command.name}'`,
        command.name,
      );
    }
    if (token.name === 'help') {
      if (token.value !== undefined) {
        throw new UsageError(
          `option '${token.rawName}' does not take a value`,
          command.name,
        );
      }
      help = true;
      continue;
    }
    // hasOwn: an option named after an Object.prototype key (--constructor)
    // must be reported as unknown
    const spec = Object.hasOwn(command.options, token.name)
      ? command.options[token.name]
      : undefined;
    if (spec === undefined) {
      throw new UsageError(
        `unknown option '${token.rawName}' for '${command.name}'`,
        command.name,
      );
    }
    assertOptionValue(command, spec, token);
  }

  if (help) {
    return { kind: 'help', command };
  }

  const options: Record<string, string | boolean | undefined> = {};
  for (const [name, spec] of Object.entries(command.options)) {
    const value = parsed.values[name];
    options[name] =
      spec.type === 'boolean'
        ? value === true
        : typeof value === 'string'
          ? value
          : spec.default;
  }

  return {
    kind: 'run',
    command,
    options: options satisfies OptionValues<OptionSpecs>,
  };
}

export function parseCliArguments(
  argv: readonly string[],
  registry: readonly Command[],
): CliArguments {
  const [first, ...rest] = argv;

  if (first === undefined) {
    return { kind: 'help', command: undefined };
  }

  if (first.startsWith('-')) {
    return parseGlobalArguments(argv);
  }

  const command = registry.find((candidate) => candidate.name === first);
  if (command === undefined) {
    throw new UsageError(`unknown function '${first}'`);
  }

  return parseCommandArguments(command, rest);
}
