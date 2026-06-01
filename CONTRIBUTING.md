# Contributing to TaskPilot

Thanks for your interest — TaskPilot is built and maintained in the open. This document covers how to propose changes.

## Getting Started

1. Fork the relevant repo (`taskpilot-backend` or `taskpilot-frontend`).
2. Follow the **Quick Start** in that repo's README.
3. Create a branch from `main`.

## Branch Naming

```
<type>/<short-kebab-description>
```

Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`.

Examples: `feat/meeting-rsvp`, `fix/task-state-transition`, `docs/readme-screenshots`.

## Commit Style

We use [Conventional Commits](https://www.conventionalcommits.org):

```
feat(meetings): add scope-aware RSVP
fix(chat): clear composer after send
docs(readme): add deployment section
```

Keep messages short and in the imperative mood. One logical change per commit.

## Pull Requests

Before opening a PR:

- [ ] `npm run lint` passes
- [ ] `npm run build` (backend & frontend) succeeds
- [ ] Tests added/updated for behavioral changes (backend)
- [ ] Screenshots attached for UI changes (frontend)
- [ ] Migration files included if Prisma schema changed
- [ ] No secrets, `.env`, or credentials committed

PR description should explain **what** changed and **why**. Link any related issue.

## Code Style

- TypeScript everywhere. No `any` without justification.
- Prefer explicit names over comments.
- Keep modules small and cohesive; mirror existing structure.
- Follow ESLint/Prettier output — do not hand-format.

## Reporting Bugs

Open an issue with:

- Repro steps (and a minimal sample if possible)
- Expected vs. actual behavior
- Environment (Node version, OS, browser if frontend)
- Logs or screenshots

For security issues, see [SECURITY.md](SECURITY.md) — please do **not** open a public issue.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
