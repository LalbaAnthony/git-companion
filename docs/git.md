# Git usage

### Branching

We use a Git workflow based on two main branches:

| Branch    | Purpose                                                             |
| --------- | ------------------------------------------------------------------- |
| `main`    | Production-ready code. All hotfixes and critical patches land here. |
| `develop` | A development branch for ongoing work.                              |

For non-main branches, use prefixes to clarify the purpose:

| Prefix  | When to use                 | Example             |
| ------- | --------------------------- | ------------------- |
| `feat/` | New feature                 | `feat/user-auth`    |
| `fix/`  | Bug fix                     | `fix/login-error`   |
| `ref/`  | Code refactoring or cleanup | `ref/api-endpoints` |
| `docs/` | Documentation changes       | `docs/setup-guide`  |
| `test/` | Adding or updating tests    | `test/auth-module`  |

### Commits

- Conventional Commits (https://www.conventionalcommits.org/)
  - `feat: add user authentication`
  - `fix: correct product price calculation`
  - `chore: update dependencies`

### Workflows

In any case, make sure you're up to date with the remote repo before starting any work using `git fetch`/`git pull`.

Update `main` using `develop`:
```sh
git fetch

# Keep main up to date with develop
git checkout develop
git pull --rebase
git pull origin main 
git push

git checkout main
git pull --rebase
git pull origin develop
git push

# Switch back to develop for the next work
git checkout develop

# Repeat
```
