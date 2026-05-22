# 🚀 TaskPilot — Backend API

> Enterprise-grade workflow management system with hierarchical RBAC, department-based organization, cross-department projects, real-time chat, document management, and full audit trail.

---

## 🏗️ Architecture

```
NestJS 11  →  Prisma 7 ORM  →  PostgreSQL (Neon.tech)
     ↓              ↓
  JWT Auth     WebSocket (Socket.io)
     ↓              ↓
  RBAC Guards   Real-time Notifications + Chat
     ↓
  5-Role Hierarchy (CEO → ASSISTANT → DEPARTMENT_HEAD → TEAM_LEAD → EMPLOYEE)
```

### Key Design Decisions

- **Multi-tenancy** — Every entity is scoped by `companyId` from the JWT. Zero cross-company data leakage.
- **Hierarchical RBAC** — 5-role system with `DEPARTMENT_HEAD` bridging executives and teams. Role-specific data visibility at every layer.
- **Department-first organization** — Teams belong to departments. Department heads manage their teams and view cross-team metrics.
- **Cross-department projects** — Projects span multiple departments with per-department task tagging and dashboard breakdowns.
- **Strict task lifecycle** — Tasks follow a state machine (`PENDING → IN_PROGRESS → SUBMITTED → REVIEW → COMPLETED/REJECTED`). Invalid transitions return clear errors.
- **Real-time chat** — WebSocket-based messaging on the `/chat` namespace with channel membership and REST fallback.
- **Document visibility controls** — Three levels: `ALL`, `DEPARTMENT_ONLY`, `SPECIFIC` with granular access rules for users, teams, and departments.
- **Audit trail** — Every task mutation is recorded in `TaskHistory`. System-wide actions are tracked in `ActivityLog`.
- **Consistent API contract** — All success responses return `{ success: true, data: ... }` via a global `TransformInterceptor`. All errors return `{ success: false, statusCode, message, error, timestamp }`.
- **Auto-provisioning** — ASSISTANT can create users without passwords; a temporary password is auto-generated with `mustChangePassword` flag in the JWT.

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

# 4. Sync database schema
npx prisma db push

# 5. Generate Prisma client
npx prisma generate

# 6. Start dev server
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

## 👥 Role-Based Access Control

| Role | Capabilities |
|---|---|
| **CEO** | Full system access. Create departments, projects, users. View all dashboards and audit logs. Assign department heads. |
| **ASSISTANT** | Create/manage users (auto-gen passwords), block/unblock users, list employees. HR-like administration. |
| **DEPARTMENT_HEAD** | Manage teams within their department. View department-wide tasks. Create tasks, review submissions, access project dashboards. |
| **TEAM_LEAD** | Create & assign tasks, review submissions (approve/reject), view team tasks, manage team members, comment on tasks. |
| **EMPLOYEE** | View assigned tasks, update task status, submit work for review, comment on tasks, access chat channels. |

---

## 📋 API Endpoints

### Auth (Public)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/auth/register-company` | Register company + CEO account |
| `POST` | `/auth/login` | Login → JWT token (rate limited: 5/min) |
| `POST` | `/auth/forgot-password` | Request a password reset email (rate limited: 3/15min) |
| `POST` | `/auth/reset-password` | Reset password using a one-time token (rate limited: 5/15min) |

### Users (CEO / ASSISTANT)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/users/assistant` | Create an ASSISTANT account (CEO) |
| `POST` | `/users` | Create user (DEPARTMENT_HEAD, EMPLOYEE). Password auto-generated if omitted. |
| `GET` | `/users` | List all company users (paginated, filterable by role/blocked/search) |
| `GET` | `/users/assignable` | List users assignable to teams (CEO: all, Dept Head: their dept) |
| `PATCH` | `/users/:id` | Admin-update fullName or role (CEO can change role; ASSISTANT cannot) |
| `DELETE` | `/users/:id` | Delete a user (blocked if they lead teams, head depts, or have tasks) |
| `PATCH` | `/users/:id/block` | Block a user |
| `PATCH` | `/users/:id/unblock` | Unblock a user |

### Self-Service (All Roles)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/users/profile` | View own profile |
| `PATCH` | `/users/profile` | Update name or password (clears `mustChangePassword`) |

### Departments (CEO / DEPARTMENT_HEAD)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/departments` | Create a department (CEO) |
| `GET` | `/departments` | List departments (CEO: all, Dept Head: own) |
| `GET` | `/departments/:id` | Department detail with teams |
| `PATCH` | `/departments/:id` | Update department (CEO) |
| `PATCH` | `/departments/:id/head` | Assign/change department head (CEO) |
| `POST` | `/departments/:id/teams` | Create team within department (Dept Head) |
| `GET` | `/departments/:id/employees` | List department employees across all teams |

### Projects (CEO / DEPARTMENT_HEAD / TEAM_LEAD)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/projects` | Create cross-department project (CEO) |
| `GET` | `/projects` | List projects (role-scoped visibility) |
| `GET` | `/projects/:id` | Project detail with department breakdown |
| `PATCH` | `/projects/:id` | Update project status/details (CEO) |
| `POST` | `/projects/:id/departments/:deptId` | Link department to project (CEO) |
| `DELETE` | `/projects/:id/departments/:deptId` | Unlink department from project (CEO) |
| `GET` | `/projects/:id/tasks` | Project tasks (dept heads see only their dept's tasks) |
| `GET` | `/projects/:id/dashboard` | Per-department progress dashboard |

### Teams (CEO / DEPARTMENT_HEAD / TEAM_LEAD)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/teams` | Create a team |
| `GET` | `/teams` | List teams (filterable by `departmentId`) |
| `GET` | `/teams/:id` | Get team details + members |
| `POST` | `/teams/:id/members` | Add member to team |
| `DELETE` | `/teams/:id/members/:userId` | Remove member |

### Tasks
| Method | Endpoint | Role | Description |
|---|---|---|---|
| `POST` | `/tasks` | CEO, Dept Head, Team Lead | Create and assign a task (optional `projectId` links to a project) |
| `GET` | `/tasks/team` | Team Lead | View tasks across teams they lead (paginated, filterable) |
| `GET` | `/tasks/department` | CEO, Dept Head | View all tasks across department teams (paginated, filterable) |
| `GET` | `/tasks/my` | Employee | View assigned tasks (paginated, filterable) |
| `PATCH` | `/tasks/reorder` | CEO, Dept Head, Team Lead | Persist manual card order within a board column |
| `PATCH` | `/tasks/:id` | CEO, Dept Head, Team Lead | Edit task fields or reassign to another employee |
| `PATCH` | `/tasks/:id/status` | Employee | Update task status (strict lifecycle transitions only) |
| `PATCH` | `/tasks/:id/review` | CEO, Dept Head, Team Lead | Move to REVIEW, then APPROVE or REJECT |
| `PATCH` | `/tasks/:id/cancel` | CEO, Dept Head, Team Lead | Cancel a task (terminal — cannot cancel COMPLETED) |
| `POST` | `/tasks/:id/reopen` | CEO, Dept Head, Team Lead | Reopen a COMPLETED or CANCELLED task to IN_PROGRESS |
| `DELETE` | `/tasks/:id` | CEO, Dept Head, Team Lead | Permanently delete a task |
| `GET` | `/tasks/:id` | All | View single task (role-scoped visibility) |
| `GET` | `/tasks/:id/history` | CEO, Dept Head, Team Lead | Full audit trail (company-scoped) |
| `POST` | `/tasks/:id/watch` | All | Follow a task (receive watcher notifications) |
| `DELETE` | `/tasks/:id/watch` | All | Stop following a task |
| `GET` | `/tasks/:id/watchers` | All | List all watchers for a task |

### Subtasks
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/tasks/:taskId/subtasks` | List checklist items for a task |
| `POST` | `/tasks/:taskId/subtasks` | Add a subtask (auto-positioned) |
| `PATCH` | `/tasks/:taskId/subtasks/:id` | Update subtask title or mark done/undone |
| `DELETE` | `/tasks/:taskId/subtasks/:id` | Remove a subtask |

### Chat (All Roles)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/chat/channels` | Create a chat channel (CEO, Dept Head, Team Lead) |
| `GET` | `/chat/channels` | List channels the user belongs to |
| `GET` | `/chat/channels/:id/messages` | Get channel messages (paginated) |
| `POST` | `/chat/channels/:id/messages` | Send a message (REST fallback) |
| `POST` | `/chat/channels/:id/members` | Add a member to the channel |

### Documents (All Roles)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/documents` | Register a document (metadata + cloud URL) |
| `GET` | `/documents` | List documents (visibility-filtered) |
| `GET` | `/documents/:id` | Get document (access-checked) |
| `PATCH` | `/documents/:id/visibility` | Change visibility (owner/CEO) |
| `POST` | `/documents/:id/access` | Grant access to user/team/department |

### Task Collaboration
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/tasks/:taskId/comments` | Add a comment |
| `GET` | `/tasks/:taskId/comments` | List comments (paginated, newest first) |

### Company Dashboard (CEO)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/company` | View company profile |
| `PATCH` | `/company` | Update company details |
| `GET` | `/company/dashboard` | Stats: users, teams, departments, projects, tasks |
| `GET` | `/activity-logs` | System-wide activity logs (paginated) |

### Notifications
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/notifications` | Get notifications (paginated) |
| `GET` | `/notifications/unread-count` | Unread count |
| `PATCH` | `/notifications/:id/read` | Mark as read |
| `PATCH` | `/notifications/read-all` | Mark all as read |

> All endpoints are prefixed with `/api/v1`

### Task Filtering

Task list endpoints support the following query parameters:

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

## 🔔 Real-Time Systems

### Notifications (`/notifications` namespace)

```javascript
import { io } from "socket.io-client";

const socket = io("http://localhost:8000/notifications", {
  auth: { token: "Bearer <jwt_token>" }
});

socket.on("notification", (data) => {
  console.log("New notification:", data);
});
```

### Chat (`/chat` namespace)

```javascript
const chatSocket = io("http://localhost:8000/chat", {
  auth: { token: "Bearer <jwt_token>" }
});

// Join a channel
chatSocket.emit("joinChannel", { channelId: "<channel-id>" });

// Listen for messages
chatSocket.on("newMessage", (message) => {
  console.log("New message:", message);
});

// Send a message
chatSocket.emit("sendMessage", {
  channelId: "<channel-id>",
  content: "Hello team!"
});
```

**Channel Types:** `PROJECT`, `DEPARTMENT`, `DIRECT`, `ANNOUNCEMENT`

---

## 📄 Document Visibility

| Level | Behavior |
|---|---|
| `ALL` | Everyone in the project/company can see the document |
| `DEPARTMENT_ONLY` | Only users in the uploader's department can see it |
| `SPECIFIC` | Only users/teams/departments with explicit `DocumentAccessRule` entries can see it |

---

## 🔒 Security

| Feature | Implementation |
|---|---|
| Password hashing | bcrypt (10 salt rounds) |
| Auto-provisioning | ASSISTANT creates users → temp password + `mustChangePassword` flag |
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
├── app.module.ts                 # Root module (13 feature modules)
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
    ├── departments/              # Department CRUD + head assignment + team creation
    ├── projects/                 # Cross-department projects + dashboards
    ├── teams/                    # Team management + members (FK-linked to departments)
    ├── tasks/                    # Task lifecycle state machine + department-scoped views
    ├── chat/                     # WebSocket chat gateway + channels + messages
    ├── documents/                # Document management + visibility controls + access rules
    ├── comments/                 # Task collaboration comments
    ├── notifications/            # WebSocket + REST notifications
    ├── task-history/             # Internal audit trail
    ├── activity-log/             # System-wide event tracking
    └── company/                  # CEO dashboard + company profile
```

---

## 📊 Database Schema

```
Company    1──→ N  User
Company    1──→ N  Team
Company    1──→ N  Department
Company    1──→ N  Project
Company    1──→ N  ChatChannel
Company    1──→ N  Document

Department 1──→ 1  User (head)
Department 1──→ N  Team
Department N←──→N  Project (via ProjectDepartment)

Team       1──→ N  Task
Team       1──→ N  TeamMember
Team       N──→ 1  Department (optional FK)

Project    1──→ N  Task
Project    1──→ N  ChatChannel
Project    1──→ N  Document

User       1──→ N  Task (as creator)
User       1──→ N  Task (as assignee)
User       1──→ N  ChatMessage (as sender)
User       1──→ N  Document (as uploader)
User       N←──→N  ChatChannel (via ChatChannelMember)

Task       1──→ N  TaskHistory
Task       1──→ N  Comment
Task       1──→ N  Notification

Document   1──→ N  DocumentAccessRule
Document   N←──→N  ChatMessage (via DocumentShare)
```

### Enums

| Enum | Values |
|---|---|
| `Role` | `CEO`, `ASSISTANT`, `DEPARTMENT_HEAD`, `TEAM_LEAD`, `EMPLOYEE` |
| `TaskStatus` | `PENDING`, `IN_PROGRESS`, `SUBMITTED`, `REVIEW`, `COMPLETED`, `REJECTED` |
| `Priority` | `LOW`, `MEDIUM`, `HIGH`, `URGENT` |
| `ProjectStatus` | `ACTIVE`, `ON_HOLD`, `COMPLETED`, `ARCHIVED` |
| `ChannelType` | `PROJECT`, `DEPARTMENT`, `DIRECT`, `ANNOUNCEMENT` |
| `DocumentVisibility` | `ALL`, `DEPARTMENT_ONLY`, `SPECIFIC` |

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
