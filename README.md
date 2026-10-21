# Git Companion

[![npm](https://img.shields.io/npm/v/@lalba-anthony/git-companion.svg)](https://www.npmjs.com/package/@lalba-anthony/git-companion)

A companion tool for managing Git repositories efficiently.

## Usage

```sh
npx @lalba-anthony/git-companion <function> [options]
npx @lalba-anthony/git-companion <function> --help
```

Global flags, accepted only without a function: `-h, --help`, `-v, --version`.

| Function | Purpose                                                                        |
| -------- | ------------------------------------------------------------------------------ |
| `crawl`  | Find Git repositories, commit and push the ones that need it, pull the others. |

```sh
npx @lalba-anthony/git-companion crawl -r ~/.claude -f 0:~/projects -f 2:~/Desktop/Projets
```

Requires Node.js 24 or later and `git` in the `PATH`.

## Documentation

- [Usage](docs/usage.md) -- running from a clone, functions, argument rules, flags, exit codes, environment variables
- [Architecture](docs/architecture.md) -- module graph, adding a function, design decisions
- [Git](docs/git.md) -- how to use Git with this project
- [Release](docs/release.md) -- how publication is automated

## License

MIT
