# Usage

```sh
npx @lalba-anthony/git-companion <function> [options]
npx @lalba-anthony/git-companion <function> --help
npx @lalba-anthony/git-companion --help
npx @lalba-anthony/git-companion --version
```

Running the CLI without any argument prints the general help, like `--help`.

## Functions

No function is registered yet.

## Argument rules

The function name must be the first argument. Everything after it belongs to that function.

Each function declares its own options. A function accepts only named options (`--name value`, `--name=value`, `-n value`, grouped boolean shorts such as `-qr value`); positional arguments, including `--`, are rejected. An option declared by another function is rejected like any unknown option: `unknown option '--x' for '<function>'`.

A string option needs a value. A value that starts with `-` must be passed inline (`--name=-x`), otherwise it is reported as missing. When an option is repeated, the last value wins.

## Global flags

| Flag              | Effect                                       |
| ----------------- | -------------------------------------------- |
| `-h`, `--help`    | Print the general usage block and exit.      |
| `-v`, `--version` | Print the package version and exit.          |

Global flags are only accepted without a function: `git-companion -h crawl` is a usage error. When both are given, `--help` wins.

After a function, `-h` and `--help` print the usage block of that function. `-v` and `--version` are not valid after a function, and no function can declare `help`, `version`, `-h` or `-v`.

## Exit codes

| Code | Meaning                                                                   |
| ---- | ------------------------------------------------------------------------- |
| `0`  | Success.                                                                  |
| `1`  | Failure: the function failed, or an unexpected error occurred.            |
| `2`  | Usage error: unknown function, unknown option, missing or invalid value.  |

A usage error prints the message followed by the relevant usage block (the function's own block when the error concerns a function) on stderr.

## Environment variables

| Variable | Effect                                                      |
| -------- | ----------------------------------------------------------- |
| `DEBUG`  | Set to `1` to print the stack trace of a failure on stderr. |
