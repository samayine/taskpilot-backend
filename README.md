# 🚀 TaskPilot — Backend API

> Company-level workflow management system with role-based access control, task lifecycle management, real-time notifications, and full audit trail.

---

## 🏗️ Architecture

```
NestJS 11  →  Prisma 7 ORM  →  PostgreSQL (Neon.tech)
     ↓              ↓
  JWT Auth     WebSocket (Socket.io)
     ↓              ↓
  RBAC Guards   Real-time Notifications
```

### Key Design Decisions

- **Multi-tenancy** — Every user, team, and task is scoped by `companyId` from the JWT. Zero cross-company data leakage.
- **Strict task lifecycle** — Tasks follow a state machine (`PENDING → IN_PROGRESS → SUBMITTED → REVIEW → COMPLETED/REJECTED`). Invalid transitions return clear errors.
- **Audit trail** — Every task mutation is recorded in `TaskHistory`. System-wide actions are tracked in `ActivityLog`.
- **Consistent API contract** — All success responses return `{ success: true, data: ... }` via a global `TransformInterceptor`. All errors return `{ success: false, statusCode, message, error, timestamp }`.
- **Filtering & Search** — Task list endpoints support filtering by `status`, `priority`, and free-text `search` on task titles.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Framework | NestJS 11 |
| Language | TypeScript 5 |
| ORM | Prisma 7 |
| Database | PostgreSQL (Neon.tech) |
| Auth | JWT (passport-jwt) |
| Real-time | Socket.io + @nestjs/websockets |
| API Docs | Swagger (`@nestjs/swagger`) |
| Rate Limiting | @nestjs/throttler |
| Validation | class-validator + class-transformer |
| Containerization | Docker (multi-stage build) |
| Testing | Jest + @nestjs/testing |

---

## ⚡ Quick Start

### Option 1: Local Development

```bash
# 1. Clone
git clone https://github.com/samayine/taskpilot-backend.git
cd taskpilot-backend

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your DATABASE_URL, JWT_SECRET, etc.

# 4. Run migrations
npx prisma migrate dev

# 5. Start dev server
npm run start:dev
```

### Option 2: Docker

```bash
# 1. Clone & configure
git clone https://github.com/samayine/taskpilot-backend.git
cd taskpilot-backend
cp .env.example .env
# Edit .env with your DATABASE_URL, JWT_SECRET, etc.

# 2. Build & start
docker compose up -d

# 3. View logs
docker compose logs -f

# 4. Stop
docker compose down
```

The API will be available at `http://localhost:8000/api/v1`
Swagger docs at `http://localhost:8000/api/docs`

---

## 🐳 Docker

The project uses a **multi-stage Docker build** optimized for production:

| Stage | Purpose |
|---|---|
| `deps` | Install dependencies with `npm ci` |
| `build` | Generate Prisma client, compile TypeScript, prune dev deps |
| `production` | Alpine-based runtime (~149MB), non-root user |

```bash
# Build image
docker compose build

# Run container
docker compose up -d

# Health check
curl http://localhost:8000/api/v1/health
```

---

## 👥 Role-Based Access Control

| Role | Capabilities |
|---|---|
| **CEO** | Create users, manage teams, view dashboard, block/unblock users, view audit logs |
| **Team Lead** | Create & assign tasks, review submissions (approve/reject), view team tasks, comment on tasks |
| **Employee** | View assigned tasks, update task status, submit work for review, comment on tasks |

---

## 📋 API Endpoints

### Auth (Public)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/auth/register-company` | Register company + CEO account |
| `POST` | `/auth/login` | Login → JWT token (rate limited: 5/min) |

### CEO Only
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/users` | Create TEAM_LEAD or EMPLOYEE |
| `GET` | `/users` | List all company users (paginated) |
| `PATCH` | `/users/:id/block` | Block a user |
| `PATCH` | `/users/:id/unblock` | Unblock a user |
| `POST` | `/teams` | Create a team |
| `GET` | `/teams` | List all company teams (paginated) |
| `GET` | `/teams/:id` | Get team details + members |
| `POST` | `/teams/:id/members` | Add member to team |
| `DELETE` | `/teams/:id/members/:userId` | Remove member |
| `GET` | `/company` | View company profile |
| `PATCH` | `/company` | Update company details |
| `GET` | `/company/dashboard` | Aggregated company statistics |
| `GET` | `/activity-logs` | System-wide activity logs (paginated) |

### Team Lead
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/tasks` | Create and assign a task |
| `GET` | `/tasks/team` | View all team tasks (paginated, filterable) |
| `PATCH` | `/tasks/:id/review` | Approve or reject a task |

### Employee
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/tasks/my` | View assigned tasks (paginated, filterable) |
| `PATCH` | `/tasks/:id/status` | Update task status (strict lifecycle) |

### Self-Service (All Roles)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/users/profile` | View own profile |
| `PATCH` | `/users/profile` | Update name or password |

### Task Collaboration
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/tasks/:taskId/comments` | Add a comment (assignee/creator only) |
| `GET` | `/tasks/:taskId/comments` | List comments (paginated) |

### Shared
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/tasks/:id` | View single task (ownership-scoped) |
| `GET` | `/tasks/:id/history` | Audit trail (CEO + Team Lead) |
| `GET` | `/notifications` | Get notifications (paginated) |
| `GET` | `/notifications/unread-count` | Unread count |
| `PATCH` | `/notifications/:id/read` | Mark as read |
| `PATCH` | `/notifications/read-all` | Mark all as read |

> All endpoints are prefixed with `/api/v1`

### Task Filtering

Task list endpoints (`GET /tasks/team` and `GET /tasks/my`) support the following query parameters:

| Parameter | Type | Example | Description |
|---|---|---|---|
| `status` | `TaskStatus` | `?status=PENDING` | Filter by task status |
| `priority` | `Priority` | `?priority=HIGH` | Filter by priority level |
| `search` | `string` | `?search=login` | Case-insensitive title search |
| `page` | `number` | `?page=1` | Page number (default: 1) |
| `limit` | `number` | `?limit=20` | Items per page (default: 20, max: 100) |

---

## 📋 Task Lifecycle

```
PENDING → IN_PROGRESS → SUBMITTED → REVIEW → COMPLETED
                                       ↓
                                    REJECTED → IN_PROGRESS (rework)
```

Each transition triggers:
- ✅ Status validation (state machine)
- 🔔 Real-time WebSocket notification to the relevant user
- 📝 TaskHistory audit record
- 📊 ActivityLog entry

---

## 🔔 Real-Time Notifications

Connect via WebSocket with JWT authentication:

```javascript
import { io } from "socket.io-client";

const socket = io("http://localhost:8000/notifications", {
  auth: { token: "Bearer <jwt_token>" }
});

socket.on("notification", (data) => {
  console.log("New notification:", data);
});
```

---

## 🔒 Security

| Feature | Implementation |
|---|---|
| Password hashing | bcrypt (10 salt rounds) |
| JWT expiry | 24 hours |
| CORS | Configurable via `CORS_ORIGIN` env |
| Rate limiting | 60 req/min global, 5 req/min on login |
| Input validation | Whitelist-based, strips unknown fields |
| Company isolation | `companyId` from JWT, never from client |
| Role enforcement | Two-guard pattern (JwtAuthGuard → RolesGuard) |
| Docker | Non-root user in production container |

---

## 📁 Project Structure

```
src/
├── main.ts                       # Bootstrap, CORS, Swagger, global pipes/filters/interceptors
├── app.module.ts                 # Root module
├── common/
│   ├── decorators/               # @Roles() decorator
│   ├── guards/                   # RolesGuard (RBAC)
│   ├── filters/                  # Global exception filter
│   ├── interceptors/             # Logging + Transform interceptors
│   ├── dto/                      # Shared DTOs (PaginationDto)
│   └── helpers/                  # Pagination helpers
├── prisma/                       # PrismaService (global)
└── modules/
    ├── auth/                     # Login, registration, JWT strategy
    ├── users/                    # User CRUD + block/unblock + self-service profile
    ├── teams/                    # Team management + members
    ├── tasks/                    # Task lifecycle state machine + filtering
    ├── comments/                 # Task collaboration comments
    ├── notifications/            # WebSocket + REST notifications
    ├── task-history/             # Internal audit trail
    ├── activity-log/             # System-wide event tracking
    └── company/                  # CEO dashboard + company profile
```

---

## 📊 Database Schema

```
Company  1──→ N  User
Company  1──→ N  Team
Team     1──→ N  Task
Team     1──→ N  TeamMember
User     1──→ N  Task (as creator)
User     1──→ N  Task (as assignee)
Task     1──→ N  TaskHistory
Task     1──→ N  Comment
Task     1──→ N  Notification
User     1──→ N  Comment (as author)
Company  1──→ N  ActivityLog
```

---

## 🧪 Testing

```bash
# Run all unit tests
npm run test

# Run tests with coverage
npm run test:cov

# Run tests in watch mode
npm run test:watch
```

---

## 🧪 Environment Variables

```env
DATABASE_URL="postgresql://..."
PORT=8000
JWT_SECRET="your-secret-key"
CORS_ORIGIN="*"                  # Production: "https://your-frontend.com"
```

---

## 📜 License

This project is part of a final-year academic project.
