# CLAUDE.md

## Project

`@lalba-anthony/git-companion` is an npm CLI that exposes several functions to play with Git. It is invoked as `npx @lalba-anthony/git-companion <function> [options]`. It is a CLI only: `package.json` has a `bin` and no `exports`, and nothing in `src/` is a public API.

The repository was bootstrapped from an older package by the same author. Leftovers from it were removed on 2026-10-20; anything else that looks foreign to a Git CLI is probably another leftover and must be flagged to the user (or removed).

The file layout and overall structure are intentional and must be kept. Extend it, do not reorganize it.

## Status

- One function is implemented: `crawl` (see [crawl decisions](#crawl-decisions)).
- The number of functions will grow, and every function has its own, different options.

## Commands

```sh
npm run lint        # eslint, type-aware on src/ and tests/
npm run lint:fix
npm run typecheck   # tsc with tsconfig.json: src/ + tests/, noEmit
npm test            # vitest run, tests/**/*.test.ts (~25 s: crawl tests drive real git repositories)
npm run test:watch
npm run build       # tsc -p tsconfig.build.json: src/ -> dist/
npm run dev         # build in watch mode
```

CI (`.github/workflows/tests.inc.yml`) runs lint, typecheck, test, build on Node 22 (Ubuntu), in that order. Run the same sequence before declaring a change done.

## Environment

- Windows 11, PowerShell is the primary shell, Git Bash is available.
- Local Node is 24.x, CI is Node 22. `engines` is `^22.13.0 || >=23.5.0`, the range of `@inquirer/prompts`: do not use Node APIs newer than 22.13.
- Inline `node -e "..."` and `rm -rf` commands are denied by the permission settings. Write probe scripts to a file in the scratchpad and run them with `node <file>` or `bash <file>`.
- The Bash tool environment sets `FORCE_COLOR=1`, so the CLI prints colors even through a pipe there. Use `env -u FORCE_COLOR` to see the plain output.

## Layout

```
src/cli.ts                    bin entry: builds the CommandContext, SIGINT -> abort, sets the exit code
src/main.ts                   main(): parse, dispatch, map errors to exit codes; never throws
src/index.ts                  parseCliArguments(argv, registry) -> CliArguments
src/help.ts                   general and per-function usage blocks
src/errors.ts                 GCError, UsageError (2), CommandError (1), AlreadyReportedError (1), InterruptedError (130)
src/version.ts                readPackageVersion(), reads ../package.json on demand
src/commands/index.ts         the registry: readonly Command[]
src/commands/define.ts        defineCommand(): typed declaration of a function
src/commands/crawl.ts         the crawl function
src/utils/cli.ts              Cli (print, clear, questionText/List/Confirm) and shouldUseColors()
src/utils/process.ts          createProcessRunner(): capture() / run() of external programs
src/utils/repo.ts             Repo: git operations on a working copy
src/utils/fs.ts               pathExists(), isDirectory(), isFile() (follow symlinks, false on error)
src/types/command.ts          Command, option specs, OptionValues, CommandContext, ProcessRunner
src/types/cli.ts              CliArguments (help | version | run)
tests/fixtures/commands.ts    fake commands (alpha, beta-long-name), captureStream(), createContext()
tests/fixtures/git.ts         sandbox with an isolated git config, repo/remote factories
tests/commands/               crawl and registry tests
tests/utils/                  Cli and process runner tests
```

`docs/architecture.md` has the full module graph, the context, the interruption mechanics and the design decisions; `docs/usage.md` the user-facing contract, including the full crawl behavior; `docs/release.md` the release pipeline; `docs/git.md` the branching model.

In code a function of the CLI is called a command, because `function` is a reserved word. User-facing text (help, docs, error messages) says function.

## CLI contract

These rules were decided by the user. Do not change them without asking.

- The function name is the first argument. With no argument at all, the general help is printed on stdout with exit code 0.
- Functions take named options only (`--name value`, `--name=value`, `-n value`, grouped boolean shorts). Positional arguments and `--` are rejected. Lists are passed by repeating an option declared `multiple: true`.
- Option values are strings, string arrays (repeatable options) or booleans (from `node:util` `parseArgs`). A string option needs a value; a value starting with `-` must be inline (`--name=-x`). For a non-repeatable option, the last occurrence wins.
- `-h/--help` and `-v/--version` are global flags accepted only on their own. A global flag combined with a function (`-h crawl`) is a usage error. When both are given, `--help` wins.
- After a function, `-h/--help` prints that function's usage. `-v/--version` after a function is an unknown option.
- No function may declare `help`, `version`, `-h` or `-v` (enforced by `tests/commands/registry.test.ts`).
- An option belonging to another function is reported with the generic message `unknown option '--x' for '<function>'`, without naming its owner.
- Exit codes: 0 success, 1 failure (`CommandError`, `AlreadyReportedError`, or unexpected error printed as `unexpected error`), 2 usage error (message, then the usage block of the function it concerns, or the general one), 130 interrupted by the user in every function (the function's `onInterrupt()` message, or `Interrupted.` on stderr). `DEBUG=1` adds the stack trace on stderr.
- Colors: `FORCE_COLOR`, then `NO_COLOR` / `TERM=dumb`, then stdout is a TTY.
- `package.json` keeps the version `1.0.0` on disk; semantic-release overwrites it at release time. `readPackageVersion()` throws when the manifest has no string `version`: there is no fallback value.

## Adding a function

1. Create `src/commands/<name>.ts` exporting `defineCommand({ name, summary, options, run, onInterrupt? })`. The option specs are inferred, so `run(options, context)` receives typed values: boolean, `readonly string[]` for `multiple: true`, `string` when a `default` is set, `string | undefined` otherwise. String options require a `valueName` for the help.
2. Append it to the array in `src/commands/index.ts`.
3. Add tests under `tests/commands/`, and the function to the Functions section of `docs/usage.md` (and to the README if relevant).

Rules for a command:

- Print through `new Cli(context)`, run programs through `context.runner` (or `new Repo(path, context.runner)`), resolve paths against `context.cwd` and `~` against `context.homeDir`. Never touch `process.*` directly, so the command is testable through `main()` with `createContext()`.
- Check `context.interactive` before asking a question: `Cli` throws a `CommandError` when stdin is not a terminal.
- Convert and validate option values inside the command. Throw `new UsageError(message, '<name>')` for a bad value (exit 2, function usage printed), `CommandError` for a runtime failure (exit 1), `AlreadyReportedError` when the command printed the failure itself (exit 1, nothing more printed). Anything else surfaces as `unexpected error`.
- Names (functions and options) are kebab-case; shorts are a single letter, unique within the function.

## Code conventions

- ESM, TypeScript strict with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `erasableSyntaxOnly` (no enums, namespaces or parameter properties; `#private` fields are fine). Relative imports use the `.js` extension.
- Type-only imports are separate `import type` statements. Exported functions in `src/` have explicit return types.
- ESLint runs `strictTypeChecked` + `stylisticTypeChecked` on `src/` and `tests/`. In tests, mock async functions with `() => Promise.resolve()` / `() => Promise.reject(error)` rather than `async` arrows without `await` or empty bodies. Static-only classes are rejected (`no-extraneous-class`): use instances or plain functions.
- Two tsconfigs: `tsconfig.json` (src + tests, `noEmit`, used by typecheck, the IDE and ESLint) and `tsconfig.build.json` (extends it, `rootDir: src`, `outDir: dist`, source maps). Compiler options live in `tsconfig.json`; only emit options go in the build config.
- Tests use vitest with explicit imports from `vitest`. Test the dispatch through `main()` with `createContext()`; do not spawn the built CLI. A file that mocks a module (`vi.mock('@inquirer/prompts')`) calls `vi.clearAllMocks()` in `beforeEach`: `restoreMocks` does not reset their calls.
- Tests that need git use `createSandbox()` from `tests/fixtures/git.ts`: it stubs `GIT_CONFIG_GLOBAL`, `GIT_CONFIG_NOSYSTEM` and `GIT_TERMINAL_PROMPT` so that the user's git settings never apply (`unstubEnvs` is on in `vitest.config.ts`).
- Comments are sparse and explain why, not what.
- Single runtime dependency: `@inquirer/prompts` (chosen by the user). Adding another one is a decision for the user.

## crawl decisions

Every point below was decided by the user, including the ones that look odd; they are essential to the user's way of working. Do not change any of them without asking. `docs/usage.md` describes the resulting behavior in full.

- Options: `-r/--repo <path>` and `-f/--folder <depth:path>` are repeatable and have no default; at least one of them is required. The depth prefix of `--folder` is mandatory, and a single depth per folder replaces any recursive flag (0 = direct children only). `-m/--default-message` defaults to `feat: various updates`.
- `Cli` (`src/utils/cli.ts`) is the terminal utility of the whole repository, not of crawl only, with `print`, `clear`, `questionText`, `questionList` and `questionConfirm` (which defaults to no).
- Discovery: only a `.git` directory counts (worktrees and submodules are ignored); the crawled folder itself is added when it is a repository and its children are still explored; children are sorted case-insensitively; a repository among the children stops the descent; `.git` directories are never explored; a missing or unreadable folder, and a `--repo` path that is not a repository, are ignored silently; repositories are deduplicated by real path, first occurrence wins.
- Classification: a `.nogitautomation` file opts a repository out; a failing `git status` counts as dirty; a clean repository ahead of its upstream, or without upstream (detached HEAD included), goes to the push list.
- Push loop: the guarded pull call that never pulls in practice is intentional; a detached HEAD fails without a question; without a terminal, a repository needing a commit message fails; `skip` leaves the repository untouched and an empty answer uses the default message; a clean repository is pushed without a question; a branch without upstream is pushed with `git push -u origin <branch>`, so a repository without `origin` fails on every run.
- Failures of pull/add/commit/push are reported as `<step> failed in <name>.` and the run goes on; it ends with `<N> repo(s) failed : <names>` and exit code 1. `git status -sb` and `git diff --shortstat` are informational only.
- Output: the exact messages and blank lines are part of the contract, including the space before the colons. Ctrl+C prints `Interrupted. Aborting sync.` and exits with 130. Colors follow the terminal, and a leading `~` is expanded.

## Git and release

- `main` is production, `develop` is the working branch (created on 2026-10-20). Branch prefixes: `feat/`, `fix/`, `ref/`, `docs/`, `test/`. Commits follow Conventional Commits.
- A push to `main` runs `release.flow.yml`: semantic-release publishes to npm when a releasing commit (`feat`, `fix`, `perf`, breaking change) is present. Never push to `main` without explicit approval.
- Pushes and pull requests on `develop` run `ci.flow.yml` (verification only).
- `package-lock.json` must be committed: CI uses `npm ci` and the npm cache of `actions/setup-node`.
- Do not commit or push unless the user asks.

## Known open points

- `npm audit` reports a high-severity `braces` advisory through the semantic-release devDependencies. No patched version exists and nothing published is affected; accepted as is.
- Source maps in `dist/` reference `src/*.ts`, which is not published (`files` only lists `dist`). Undecided: `inlineSources`, or drop `sourceMap`.

## Working with the user

- The user writes in French: answer in French. Code, comments and docs are in English.
- When an implementation decision is uncertain, ask before going on, and keep asking until no doubt remains. For ports of the user's scripts, never assume an intention: ask.
