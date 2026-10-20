# Architecture

The package is a CLI only: `package.json` exposes a `bin` and no `exports`, so nothing in `src/` is a public API. Its only runtime dependency is `@inquirer/prompts`, for the interactive questions.

## Modules

```
src/cli.ts                 entry point (bin): builds the CommandContext from the process, wires Ctrl+C
src/main.ts                main(): parse, dispatch, map errors to exit codes; never throws
src/index.ts               parseCliArguments(): argv + registry -> CliArguments
src/help.ts                general and per-function usage blocks
src/errors.ts              GCError and its subclasses, with their exit codes
src/version.ts             reads the version from package.json on demand
src/commands/index.ts      the registry: every function exposed by the CLI
src/commands/define.ts     defineCommand(): typed declaration of a function
src/commands/<name>.ts     one file per function (crawl.ts)
src/utils/cli.ts           Cli: styled output and questions; shouldUseColors()
src/utils/process.ts       createProcessRunner(): runs external programs (git)
src/utils/repo.ts          Repo: a Git working copy driven through the git executable
src/utils/fs.ts            pathExists(), isDirectory(), isFile()
src/types/command.ts       Command, option specs, CommandContext, ProcessRunner
src/types/cli.ts           CliArguments
```

```
cli.ts -> main.ts -> index.ts -> errors.ts
                  -> help.ts
                  -> version.ts
cli.ts -> utils/process.ts, utils/cli.ts (shouldUseColors)
cli.ts -> commands/index.ts -> commands/<name>.ts -> commands/define.ts
                                                  -> utils/cli.ts, utils/repo.ts -> utils/fs.ts
```

In code, a function of the CLI is called a command, because `function` is a reserved word. User-facing text says function.

## Flow

1. `cli.ts` builds the `CommandContext` (see below), installs a `SIGINT` listener that aborts the context signal with an `InterruptedError`, and calls `main()` with `process.argv.slice(2)`, the registry and the `DEBUG` flag.
2. `parseCliArguments()` returns one of `help` (general or for a function), `version`, or `run` with the command and its typed option values. Every argument problem is thrown as a `UsageError`.
3. `main()` prints the help or the version, or awaits `command.run(options, context)`, racing it against the context signal.
4. Errors are caught in `main()`:
   - `InterruptedError` (130): the function's `onInterrupt(context)` prints its message, or `Interrupted.` goes to stderr.
   - `AlreadyReportedError` (1): the function already printed the failure; nothing else is printed.
   - Any other `GCError`: its message, plus the usage block for a `UsageError` (2) or nothing for a `CommandError` (1).
   - Anything else: `unexpected error`, exit code 1. `DEBUG=1` adds the stack trace.
5. `cli.ts` sets `process.exitCode`. After an interruption it calls `process.exit()` instead, so that work a function still has in flight cannot go on.

## CommandContext

| Field         | Content                                                                                                     |
| ------------- | ----------------------------------------------------------------------------------------------------------- |
| `cwd`         | Directory the paths given on the command line are resolved against.                                        |
| `homeDir`     | Target of a leading `~`.                                                                                    |
| `stdin`       | Input of the questions.                                                                                     |
| `stdout`      | Output of the function and of the questions.                                                               |
| `stderr`      | Errors printed by `main()`.                                                                                 |
| `interactive` | stdin is a terminal: questions can be asked.                                                                |
| `colors`      | ANSI styles are written to stdout: `FORCE_COLOR`, then `NO_COLOR` and `TERM=dumb`, then whether stdout is a terminal. |
| `signal`      | Aborted with an `InterruptedError` on Ctrl+C.                                                               |
| `runner`      | `ProcessRunner`: `capture()` collects the output of a command, `run()` lets it reach the user.             |

In the CLI, `runner.run()` inherits the terminal, so that git keeps its colors, its progress output and its credential prompts. Tests build the runner with an `output` option instead, which forwards the child output to captured streams.

## Interruption

Ctrl+C reaches the CLI in three ways, all ending with exit code 130:

- During a question, the terminal is in raw mode: `@inquirer/prompts` rejects with `ExitPromptError`, which `Cli` turns into an `InterruptedError`.
- During a child process, the terminal delivers `SIGINT` to the child too. A child that dies from it (signal `SIGINT`, or exit status `0xC000013A` on Windows) makes the runner reject with an `InterruptedError`.
- Anywhere else, the `SIGINT` listener aborts the context signal: the runner kills the running child and refuses to start a new one, a pending question is aborted, and `main()` stops waiting for the function.

## Adding a function

1. Create `src/commands/<name>.ts`:

```ts
import { defineCommand } from './define.js';

export const example = defineCommand({
  name: 'example',
  summary: 'One line shown in the general help',
  options: {
    root: { type: 'string', short: 'r', valueName: 'path', description: 'Root directory' },
    depth: { type: 'string', valueName: 'n', description: 'Maximum depth', default: '3' },
    tag: { type: 'string', short: 't', multiple: true, valueName: 'name', description: 'Tag to apply' },
    quiet: { type: 'boolean', short: 'q', description: 'Less output' },
  },
  async run(options, context) {
    // options: { root: string | undefined; depth: string; tag: readonly string[]; quiet: boolean }
  },
  onInterrupt(context) {
    // Optional: message printed on Ctrl+C instead of 'Interrupted.'
  },
});
```

2. Add it to the array in `src/commands/index.ts`.
3. Add its tests under `tests/commands/`, and its entry in the Functions section of [usage.md](usage.md).

`tests/commands/registry.test.ts` checks every registered function: unique kebab-case names, no reserved option (`help`, `version`, `-h`, `-v`), kebab-case option names, unique single-character shorts.

Option values are strings, string arrays (`multiple: true`) or booleans, as `node:util` `parseArgs` produces them. Converting and validating a value (an integer, a path that must exist) belongs to the command: it throws `new UsageError(message, '<name>')` for a bad value, so the function usage is printed, `CommandError` for a failure at run time, and `AlreadyReportedError` when it has printed the failure itself.

A command writes through `new Cli(context)` (or `context.stdout`), runs programs through `context.runner` (or `new Repo(path, context.runner)`), and resolves paths against `context.cwd`. It never touches `process`, so it is tested by calling `main()` with the context built by `tests/fixtures/commands.ts`.

## Design decisions

- Static registry. Functions are listed explicitly in `src/commands/index.ts` instead of being discovered on disk: names stay typed, the help is generated from the registry, and nothing depends on the layout of `dist/`.
- Named options only. A function takes no positional argument, so the order of its arguments never matters and a stray word is always an error. A list is passed by repeating an option declared `multiple: true`.
- Strict separation of global and function arguments. Global flags are only valid on their own, and a function only sees its own options plus `--help`. An option borrowed from another function is an unknown option.
- Own validation on top of `parseArgs`. `parseArgs` runs with `strict: false` and `tokens: true`; `src/index.ts` walks the tokens and reports every problem as a `UsageError` with a uniform message, instead of the raw `ERR_PARSE_ARGS_*` text.
- `main()` is separate from `cli.ts`, so the whole dispatch, including exit codes, output streams and interruptions, is tested without spawning the CLI.
- `readPackageVersion()` throws when `package.json` has no string `version`: a broken manifest is a packaging bug, not something to hide behind a placeholder.
- Prompt errors are recognized by name (`ExitPromptError`, `AbortPromptError`): their classes live in `@inquirer/core`, which is not a direct dependency.
