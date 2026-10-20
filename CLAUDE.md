# CLAUDE.md

## Project

`@lalba-anthony/git-companion` is an npm CLI that exposes several functions to play with Git. It is invoked as `npx @lalba-anthony/git-companion <function> [options]`. It is a CLI only: `package.json` has a `bin` and no `exports`, and nothing in `src/` is a public API.

The repository was bootstrapped from an older package by the same author. Leftovers from it were removed on 2026-10-20; anything else that looks foreign to a Git CLI is probably another leftover and must be flagged to the user (or removed).

The file layout and overall structure are intentional and must be kept. Extend it, do not reorganize it.

## Status

- The registry (`src/commands/index.ts`) is empty: the CLI infrastructure is done, no function is implemented yet.
- First function to implement: `crawl`, a port of an existing Python implementation that the user will provide.
- The number of functions will grow, and every function has its own, different options.

## Commands

```sh
npm run lint        # eslint, type-aware on src/ and tests/
npm run lint:fix
npm run typecheck   # tsc with tsconfig.json: src/ + tests/, noEmit
npm test            # vitest run, tests/**/*.test.ts
npm run test:watch
npm run build       # tsc -p tsconfig.build.json: src/ -> dist/
npm run dev         # build in watch mode
```

CI (`.github/workflows/tests.inc.yml`) runs lint, typecheck, test, build on Node 22, in that order. Run the same sequence before declaring a change done.

## Environment

- Windows 11, PowerShell is the primary shell, Git Bash is available.
- Local Node is 24.x, CI is Node 22 and `engines` is `>=22`: do not use Node APIs newer than 22.
- Inline `node -e "..."` and `rm -rf` commands are denied by the permission settings. Write probe scripts to a file in the scratchpad and run them with `node <file>`.

## Layout

```
src/cli.ts                 bin entry: wires process I/O into main(), sets process.exitCode
src/main.ts                main(): parse, dispatch, map errors to exit codes; never throws
src/index.ts               parseCliArguments(argv, registry) -> CliArguments
src/help.ts                general and per-function usage blocks
src/errors.ts              GCError, UsageError (exit 2), CommandError (exit 1)
src/version.ts             readPackageVersion(), reads ../package.json on demand
src/commands/index.ts      the registry: readonly Command[]
src/commands/define.ts     defineCommand(): typed declaration of a function
src/commands/<name>.ts     one file per function
src/types/command.ts       Command, OptionSpec(s), OptionValues, CommandContext, OutputStream
src/types/cli.ts           CliArguments (help | version | run)
tests/fixtures/commands.ts fake commands (alpha, beta-long-name) and captureStream()
```

`docs/architecture.md` has the full module graph and the design decisions, `docs/usage.md` the user-facing contract, `docs/release.md` the release pipeline, `docs/git.md` the branching model.

In code a function of the CLI is called a command, because `function` is a reserved word. User-facing text (help, docs, error messages) says function.

## CLI contract

These rules were decided by the user. Do not change them without asking.

- The function name is the first argument. With no argument at all, the general help is printed on stdout with exit code 0.
- Functions take named options only (`--name value`, `--name=value`, `-n value`, grouped boolean shorts). Positional arguments and `--` are rejected.
- Option values are strings or booleans (from `node:util` `parseArgs`). A string option needs a value; a value starting with `-` must be inline (`--name=-x`). The last occurrence of a repeated option wins.
- `-h/--help` and `-v/--version` are global flags accepted only on their own. A global flag combined with a function (`-h crawl`) is a usage error. When both are given, `--help` wins.
- After a function, `-h/--help` prints that function's usage. `-v/--version` after a function is an unknown option.
- No function may declare `help`, `version`, `-h` or `-v` (enforced by `tests/commands.test.ts`).
- An option belonging to another function is reported with the generic message `unknown option '--x' for '<function>'`, without naming its owner.
- Exit codes: 0 success, 1 failure (`CommandError` or unexpected error, printed as `unexpected error`), 2 usage error (message, then the usage block of the function it concerns, or the general one). `DEBUG=1` adds the stack trace on stderr.
- `package.json` keeps the version `1.0.0` on disk; semantic-release overwrites it at release time. `readPackageVersion()` throws when the manifest has no string `version`: there is no fallback value.

## Adding a function

1. Create `src/commands/<name>.ts` exporting `defineCommand({ name, summary, options, run })`. The option specs are inferred, so `run(options, context)` receives typed values: boolean, `string` when a `default` is set, `string | undefined` otherwise. String options require a `valueName` for the help.
2. Append it to the array in `src/commands/index.ts`.
3. Add tests under `tests/`, and the function to the Functions section of `docs/usage.md` (and to the README if relevant).

Rules for a command:

- Write output through `context.stdout` / `context.stderr` and resolve paths against `context.cwd`. Never touch `process.*` directly, so the command is testable through `main()` with captured streams.
- Convert and validate option values inside the command. Throw `new UsageError(message, '<name>')` for a bad value (exit 2, function usage printed) and `CommandError` for a runtime failure (exit 1). Anything else surfaces as `unexpected error`.
- Names (functions and options) are kebab-case; shorts are a single letter, unique within the function.

## Code conventions

- ESM, TypeScript strict with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `erasableSyntaxOnly` (no enums, namespaces or parameter properties). Relative imports use the `.js` extension.
- Type-only imports are separate `import type` statements. Exported functions in `src/` have explicit return types.
- ESLint runs `strictTypeChecked` + `stylisticTypeChecked` on `src/` and `tests/`. In tests, mock async functions with `() => Promise.resolve()` / `() => Promise.reject(error)` rather than `async` arrows without `await` or empty bodies.
- Two tsconfigs: `tsconfig.json` (src + tests, `noEmit`, used by typecheck, the IDE and ESLint) and `tsconfig.build.json` (extends it, `rootDir: src`, `outDir: dist`, source maps). Compiler options live in `tsconfig.json`; only emit options go in the build config.
- Tests use vitest with explicit imports from `vitest`. Test the dispatch through `main()` with fake registries from `tests/fixtures/commands.ts`; do not spawn the built CLI.
- Comments are sparse and explain why, not what.
- No runtime dependency so far. Adding one is a decision for the user.

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
- When an implementation decision is uncertain, ask before going on, and keep asking until no doubt remains.
