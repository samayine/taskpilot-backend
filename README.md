<div align="center">

# TaskPilot — Backend

Multi-tenant workflow API for company-wide task, project, chat, and meeting coordination.

[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4-010101?logo=socket.io&logoColor=white)](https://socket.io)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

</div>

---

## Overview

TaskPilot is a multi-tenant company workflow platform. The backend exposes a typed REST API and a real-time Socket.IO gateway powering tasks, projects, documents, meetings, chat, and notifications, with a 5-role hierarchy enforced end-to-end.

**Roles**: `CEO` → `ASSISTANT` → `DEPARTMENT_HEAD` → `TEAM_LEAD` → `EMPLOYEE`

## Highlights

- Strict multi-tenancy — every entity scoped by `companyId`, enforced in guards and Prisma.
- State-machine task lifecycle (`PENDING → IN_PROGRESS → SUBMITTED → REVIEW → COMPLETED/REJECTED`) with full audit trail.
- Scope-aware meetings with RSVP and notification fan-out (company / role / department / team).
- Real-time chat namespace — typing indicators, reactions, mentions, mute, attachments.
- Uniform response envelope (`{ success, data }`), Swagger docs, throttling, validation, JWT auth.

## Screenshots

> Drop images into [`res/screenshots/`](res/screenshots/) using the names below.

| API docs | ER diagram | WebSocket activity |
|---|---|---|
| ![Swagger](res/screenshots/backend-swagger.png) | ![Schema](res/screenshots/backend-schema.png) | ![Sockets](res/screenshots/backend-sockets.png) |

## Tech Stack

| Layer | Tech |
|---|---|
| Framework | NestJS 11, TypeScript 5 |
| Data | Prisma 7, PostgreSQL |
| Realtime | Socket.IO via `@nestjs/websockets` |
| Auth | JWT (`passport-jwt`), bcrypt |
| Email | Nodemailer (SMTP) |
| Docs | Swagger / OpenAPI |
| Container | Docker (multi-stage) |
| Tests | Jest |

## Quick Start

**Prerequisites:** Node 22, PostgreSQL 14+, npm 10.

```bash
git clone https://github.com/samayine/taskpilot-backend.git
cd taskpilot-backend
npm install
cp .env.example .env          # fill in DATABASE_URL, JWT_SECRET, SMTP_*
npx prisma migrate deploy
npm run start:dev
```

Server: `http://localhost:3000` · API: `/api/v1` · Docs: `/api/docs`

### Docker

```bash
docker compose up --build
```

### Scripts

| Script | Purpose |
|---|---|
| `npm run start:dev` | Hot-reload development |
| `npm run build` | Compile to `dist/` |
| `npm run start:prod` | Run compiled build |
| `npm run lint` | ESLint + autofix |
| `npm test` | Unit tests |
| `npm run test:e2e` | End-to-end tests |
| `npx prisma migrate deploy` | Apply migrations |
| `npx prisma studio` | Open DB explorer |

## Project Structure

```
src/
  modules/           # auth, users, tasks, projects, chat, meetings, …
  common/            # guards, interceptors, decorators, pipes
  prisma/            # PrismaService
  main.ts
prisma/
  schema.prisma
  migrations/
```

## Releases, Packages & Deployment

- **Releases** — Tagged on GitHub. See the [Releases page](https://github.com/samayine/taskpilot-backend/releases) for changelogs.
- **Container image** — Published to GitHub Container Registry as `ghcr.io/samayine/taskpilot-backend`. Pin to a tag in production; avoid `latest`.
- **Deployment** — Any Node 22 host (Render, Railway, Fly.io, Docker on VPS). Required environment matches `.env.example`. Run `prisma migrate deploy` as part of every release.
- **CI/CD** — GitHub Actions runs lint, type-check, tests, and image build on each pull request.

## Community Standards

- [Code of Conduct](CODE_OF_CONDUCT.md) — Contributor Covenant v2.1.
- [Contributing Guide](CONTRIBUTING.md) — branch naming, Conventional Commits, PR checklist.
- [Security Policy](SECURITY.md) — please report vulnerabilities privately rather than opening a public issue.
- Issue & PR templates live under `.github/`.

## License

MIT © TaskPilot contributors.
