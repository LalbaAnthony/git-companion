# Architecture

The package is a CLI only: `package.json` exposes a `bin` and no `exports`, so nothing in `src/` is a public API.

## Modules

```
src/cli.ts                 entry point (bin): wires process I/O into main()
src/main.ts                main(): parse, dispatch, map errors to exit codes; never throws
src/index.ts               parseCliArguments(): argv + registry -> CliArguments
src/help.ts                general and per-function usage blocks
src/errors.ts              GCError, UsageError (exit 2), CommandError (exit 1)
src/version.ts             reads the version from package.json on demand
src/commands/index.ts      the registry: every function exposed by the CLI
src/commands/define.ts     defineCommand(): typed declaration of a function
src/commands/<name>.ts     one file per function
src/types/command.ts       Command, option specs, CommandContext
src/types/cli.ts           CliArguments
```

```
cli.ts -> main.ts -> index.ts -> errors.ts
                  -> help.ts
                  -> version.ts
cli.ts -> commands/index.ts -> commands/<name>.ts -> commands/define.ts
```

In code, a function of the CLI is called a command, because `function` is a reserved word. User-facing text says function.

## Flow

1. `cli.ts` calls `main()` with `process.argv.slice(2)`, the registry, a `CommandContext` (`cwd`, `stdout`, `stderr`) and the `DEBUG` flag, and sets `process.exitCode` from its result.
2. `parseCliArguments()` returns one of `help` (general or for a function), `version`, or `run` with the command and its typed option values. Every argument problem is thrown as a `UsageError`.
3. `main()` prints the help or the version, or awaits `command.run(options, context)`.
4. Errors are caught in `main()`: a `GCError` prints its message and uses its exit code, a `UsageError` also prints the usage block of the function it names (or the general one), anything else prints `unexpected error` and exits with 1. `DEBUG=1` adds the stack trace.

## Adding a function

1. Create `src/commands/<name>.ts`:

```ts
import { CommandError } from '../errors.js';
import { defineCommand } from './define.js';

export const example = defineCommand({
  name: 'example',
  summary: 'One line shown in the general help',
  options: {
    root: { type: 'string', short: 'r', valueName: 'path', description: 'Root directory' },
    depth: { type: 'string', valueName: 'n', description: 'Maximum depth', default: '3' },
    quiet: { type: 'boolean', short: 'q', description: 'Less output' },
  },
  async run(options, context) {
    // options: { root: string | undefined; depth: string; quiet: boolean }
  },
});
```

2. Add it to the array in `src/commands/index.ts`.
3. Add its tests under `tests/`, and its entry in the Functions section of [usage.md](usage.md).

`tests/commands.test.ts` checks every registered function: unique kebab-case names, no reserved option (`help`, `version`, `-h`, `-v`), kebab-case option names, unique single-character shorts.

Option values are strings or booleans, as `node:util` `parseArgs` produces them. Converting and validating a value (an integer, a path that must exist) belongs to the command: it throws `new UsageError(message, '<name>')` for a bad value, so the function usage is printed, and `CommandError` for a failure at run time.

Output goes through `context.stdout` and `context.stderr`, never `process.stdout`, and paths are resolved against `context.cwd`, so that a command can be tested by calling `main()` with captured streams.

## Design decisions

- Static registry. Functions are listed explicitly in `src/commands/index.ts` instead of being discovered on disk: names stay typed, the help is generated from the registry, and nothing depends on the layout of `dist/`.
- Named options only. A function takes no positional argument, so the order of its arguments never matters and a stray word is always an error.
- Strict separation of global and function arguments. Global flags are only valid on their own, and a function only sees its own options plus `--help`. An option borrowed from another function is an unknown option.
- Own validation on top of `parseArgs`. `parseArgs` runs with `strict: false` and `tokens: true`; `src/index.ts` walks the tokens and reports every problem as a `UsageError` with a uniform message, instead of the raw `ERR_PARSE_ARGS_*` text.
- `main()` is separate from `cli.ts`, so the whole dispatch, including exit codes and output streams, is tested without spawning a process.
- `readPackageVersion()` throws when `package.json` has no string `version`: a broken manifest is a packaging bug, not something to hide behind a placeholder.
