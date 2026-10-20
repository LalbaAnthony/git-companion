# Usage

```sh
npx @lalba-anthony/git-companion <function>
```

## Flags

| Flag              | Effect                              |
| ----------------- | ----------------------------------- |
| `-h`, `--help`    | Print the usage block and exit.     |
| `-v`, `--version` | Print the package version and exit. |

## Exit codes

| Code | Meaning                      |
| ---- | ---------------------------- |
| `0`  | Success. No errors occurred. |
| `1`  | Error: usage, ...            |
| `2`  | Bad arguments.               |


## Environment variables

| Variable | Effect                                                      |
| -------- | ----------------------------------------------------------- |
| `DEBUG`  | Set to `1` to print the stack trace of a failure on stderr. |


