# Usage

```sh
npx @lalba-anthony/git-companion <function> [options]
npx @lalba-anthony/git-companion <function> --help
npx @lalba-anthony/git-companion --help
npx @lalba-anthony/git-companion --version
```

Running the CLI without any argument prints the general help, like `--help`. Node.js 24 or later and `git` in the `PATH` are required.

## From a clone

The CLI also runs from a clone of the repository, without `npx`. It still needs the dependencies that `npx` would download: TypeScript (a development dependency) for the build, and `@inquirer/prompts`, which is loaded on every run, `--help` included.

```sh
npm ci                                  # downloads the dependencies of package-lock.json
npm run build                           # compiles src/ into dist/
node dist/cli.js <function> [options]
```

`node dist/cli.js` replaces `npx @lalba-anthony/git-companion` in every example of this page. Once the install and the build are done, no network access is needed. `--version` prints `1.0.0`, the placeholder version kept in the repository: the published version is only set at release time.

Without network access:

- `npm ci --offline` installs from the npm cache only, and fails with `ENOTCACHED` when a package is missing from it. The cache has them when this project, or another one using the same versions, was installed on the machine before.
- Otherwise, run `npm ci` and `npm run build` on a machine with network access, then copy the folder, `dist/` and `node_modules/` included. The runtime dependencies are plain JavaScript, so the copy runs on any OS. The development dependencies include platform-specific binaries: building or testing on another OS needs a new `npm ci`.

To call it as `git-companion` from any directory:

- `npm link`, run in the clone after the install, adds a global `git-companion` command that points to the clone, so a new `npm run build` is picked up without linking again. `npm unlink -g @lalba-anthony/git-companion` removes it.
- Or define a shell function, for instance in the PowerShell profile: `function git-companion { node C:\path\to\git-companion\dist\cli.js @args }`.

## Functions

| Function | Purpose                                                                                  |
| -------- | ---------------------------------------------------------------------------------------- |
| `crawl`  | Find Git repositories, commit and push the ones that need it, pull the others.           |
| `ignore` | Add patterns to the `.gitignore` of the current repository.                              |

### crawl

```sh
npx @lalba-anthony/git-companion crawl -r ~/.claude -f 0:~/projects -f 2:~/Desktop/Projets
```

| Option                            | Effect                                                                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `-r`, `--repo <path>`             | Repository to sync. Repeatable. A path that is not a repository is ignored.                                                                |
| `-f`, `--folder <depth:path>`     | Folder searched for repositories. Repeatable. The depth prefix is required: `0` checks the direct children only, `N` goes `N` levels below. |
| `-m`, `--default-message <msg>`   | Commit message used when the answer is left empty. Default: `feat: various updates`.                                                       |

At least one `--repo` or `--folder` is required. Paths are resolved against the current directory, and a leading `~` is expanded to the home directory (PowerShell does not do it for native programs). The depth is split on the first colon only, so `2:C:\Users\me\Projets` is valid.

Discovery:

- A repository is a directory that contains a `.git` directory. Worktrees and submodules, whose `.git` is a file, are not detected.
- `--repo` paths are checked first, in order, then every `--folder`.
- The folder given to `--folder` is itself added when it is a repository, and its children are still explored.
- Among the children, entries are sorted case-insensitively. A repository found among them stops the descent; any other directory is explored while the depth allows it. `.git` directories are never explored. A missing or unreadable folder is skipped silently.
- A repository found several times (through `--repo` and `--folder`, overlapping folders, a symbolic link, another letter case on Windows) is processed once, at its first occurrence.

Classification:

| Category | Condition                                                                                                         |
| -------- | ----------------------------------------------------------------------------------------------------------------- |
| skipped  | A `.nogitautomation` file exists at the root of the repository.                                                   |
| to push  | Uncommitted changes (or `git status` fails), no upstream branch (including a detached HEAD), or commits ahead of the upstream as of the last fetch. |
| to pull  | Everything else.                                                                                                  |

Each repository to push, in discovery order:

1. The reason (`has uncommitted changes.`, `has unpushed commits.` or `has no upstream branch.`) and the branch are printed, then `git status -sb` and `git diff --shortstat origin/<branch>`. These two are informational: their failures do not stop the repository.
2. A detached HEAD is reported as a failure.
3. With uncommitted changes, the commit message is asked. `skip` leaves the repository untouched; an empty answer uses `--default-message`. Then `git add .` and `git commit -m <message>`. When stdin is not a terminal, the repository is reported as a failure instead.
4. `git push`, or `git push -u origin <branch>` when the branch has no upstream. A repository without an `origin` remote therefore fails on every run until it gets a `.nogitautomation` file.

Each repository to pull then runs `git pull`, unless it needed a push in the meantime.

A failing `git pull`, `git add`, `git commit` or `git push` prints `<step> failed in <name>.` and moves on to the next repository. The run ends with `All repos have been successfully synced.` and exit code 0, or with `<N> repo(s) failed : <names>` and exit code 1. Ctrl+C prints `Interrupted. Aborting sync.` and exits with 130.

### ignore

```sh
npx @lalba-anthony/git-companion ignore -p node_modules/ -p "*.log"
```

| Option                      | Effect                                                                                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `-p`, `--pattern <pattern>` | Line to add to the `.gitignore`. Repeatable, at least one is required. An empty value or a value containing a line break is a usage error, and nothing is written. |

The file is the `.gitignore` at the root of the working tree that contains the current directory, as given by `git rev-parse --show-toplevel`: a linked worktree or a submodule uses its own root. Outside of a working tree, the `.gitignore` of the current directory is used.

1. A missing file is created first, and `Created <file>` is printed. When it cannot be created, `Failed to create <file> (<code>)` is printed, `<code>` being the system error code (`EACCES`...), and the function stops with exit code 1.
2. Each pattern, in command-line order, is compared with every line of the file: literally, as a whole line, carriage returns ignored so that a CRLF file matches too. A pattern found prints `'<pattern>' is already in <file>` and changes nothing. A pattern repeated on the command line is found on its second occurrence.
3. Otherwise the pattern is appended, followed by an LF, even in a CRLF file. An unterminated last line is terminated with an LF first. `Added '<pattern>' to <file>` is printed.
4. A pattern that cannot be read or written prints `Failed to write <file> (<code>)`, and the next patterns are still processed.

The function ends with exit code 0 when every pattern was added or already present, 1 otherwise. Patterns are written as given: leading and trailing spaces are kept and count in the comparison. Paths are printed in the native form of the platform.

## Argument rules

The function name must be the first argument. Everything after it belongs to that function.

Each function declares its own options. A function accepts only named options (`--name value`, `--name=value`, `-n value`, grouped boolean shorts such as `-qr value`); positional arguments, including `--`, are rejected. An option declared by another function is rejected like any unknown option: `unknown option '--x' for '<function>'`.

A string option needs a value. A value that starts with `-` must be passed inline (`--name=-x`), otherwise it is reported as missing. When an option is repeated, the last value wins, except for the options marked as repeatable in the help, which keep every value in order.

## Global flags

| Flag              | Effect                                       |
| ----------------- | -------------------------------------------- |
| `-h`, `--help`    | Print the general usage block and exit.      |
| `-v`, `--version` | Print the package version and exit.          |

Global flags are only accepted without a function: `git-companion -h crawl` is a usage error. When both are given, `--help` wins.

After a function, `-h` and `--help` print the usage block of that function. `-v` and `--version` are not valid after a function, and no function can declare `help`, `version`, `-h` or `-v`.

## Exit codes

| Code  | Meaning                                                                   |
| ----- | ------------------------------------------------------------------------- |
| `0`   | Success.                                                                  |
| `1`   | Failure: the function failed, or an unexpected error occurred.            |
| `2`   | Usage error: unknown function, unknown option, missing or invalid value.  |
| `130` | Interrupted by the user (Ctrl+C), in every function.                      |

A usage error prints the message followed by the relevant usage block (the function's own block when the error concerns a function) on stderr. An interruption prints the function's own message, or `Interrupted.` on stderr.

## Environment variables

| Variable      | Effect                                                                            |
| ------------- | --------------------------------------------------------------------------------- |
| `DEBUG`       | Set to `1` to print the stack trace of a failure on stderr.                       |
| `NO_COLOR`    | Disables the colors. Colors are otherwise used only when stdout is a terminal.    |
| `FORCE_COLOR` | Enables the colors even when stdout is not a terminal (`0` or `false` disables). |
