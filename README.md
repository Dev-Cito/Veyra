# Veyra

A multi-workspace Kanban app: workspaces with roles, boards, drag-and-drop cards, email invitations and due-date reminders.

This is a portfolio project, the sixth in a series. I built it to work through specific backend architecture problems, not as a commercial product.

## What it does

Alice creates a workspace and invites Bob as a member. Bob gets an email, opens the link and joins with the role Alice chose. They split the work into boards and columns, add cards, assign them, and reorder them by drag and drop, with the mouse or the keyboard. When a card's due date is less than 24 hours away, each assignee gets one email reminder.

The hard part is that roles are not global. Alice owns her workspace and can be a plain member of Bob's. Every request has to answer "who is this user *in this workspace*?", and no resource from another workspace may leak through. That makes this an architecture exercise rather than a CRUD app.

The interface is in French. The API answers in English, and the frontend maps each error to its own French wording (`frontend/lib/error-messages.ts`); the code and this document are in English.

## Stack

| Part | Choice | Why, where it is not obvious |
| --- | --- | --- |
| API | NestJS 12, TypeScript | |
| Database | PostgreSQL 16 | `FOR UPDATE SKIP LOCKED` for the reminder cron, a partial unique index (one pending invitation per email and workspace), `row_number()` to reindex positions in one statement |
| ORM | TypeORM 1.1 | `synchronize` is off: every schema change is an explicit, reviewed migration |
| Auth | JWT in an `HttpOnly` cookie, bcrypt | The token is never readable by page scripts |
| Email | Nodemailer, `@nestjs/schedule` | Hourly reminder cron; the app runs with email disabled |
| Rate limiting | `@nestjs/throttler` | Per-route limits on login, register, invitation and reminder endpoints only |
| Frontend | Next.js 16 (App Router), React 19, Tailwind 4 | |
| Data fetching | TanStack Query 5 | The session cookie belongs to the API's domain, so the Next server cannot send it: every call runs in the browser, and data is cached there |
| Drag and drop | dnd-kit | Pointer and keyboard sensors, screen-reader announcements |
| Tests | Vitest, Supertest, Bruno | |

## The engineering problems

### Role per relation, not per user

**Problem.** The same user has different rights in different workspaces.
**Solution.** The role lives on `WorkspaceMember`, the join table between `User` and `Workspace`. `User` has no role field. A guard (`WorkspaceGuard`) loads the caller's active membership for the workspace in the URL and checks `@WorkspaceRoles(...)` against it.
**Why the naive version fails.** A `role` column on `User` is one role for every workspace: owning one would mean owning them all.

### IDOR: the guard is not enough

**Problem.** `PATCH /workspaces/:workspaceId/tasks/:taskId` passes the guard as soon as the caller belongs to `workspaceId`. Nothing yet says that `taskId` belongs to that workspace.
**Solution.** Every service resolves its target through `WorkspaceScope` (`backend/src/scope`). It walks the chain task → list → board → workspace in one SQL query with inner joins, filtered on the workspace id.
**Why 404 and not 403.** A 403 would confirm that a guessed UUID exists in another workspace. Out-of-scope resources are indistinguishable from missing ones. (The guard itself answers 403 to a non-member: there, revealing that a workspace exists is accepted.)

### Ordering by floating positions

**Problem.** Reordering cards must not rewrite the whole column on every drag.
**Solution.** Each card has a `double precision` position. A move writes one row: the midpoint between its two neighbours. When two neighbours get closer than `1e-6`, the column is renumbered in a single `UPDATE … row_number() OVER (ORDER BY position)` statement, and the response says `reindexed: true`.
**The client never sends a position.** It names the cards it was dropped between (`previousTaskId`, `nextTaskId`), and the server reads their real positions under a lock. A stale or malicious client cannot write an out-of-order value; a body containing `position` is rejected.

### Deadlock between crossed moves

**Problem.** Moving a card from column A to B locks both columns. If another request moves a card from B to A at the same time and locks in its own direction, each transaction holds one lock and waits for the other.
**Solution.** Both column rows are locked in a single `SELECT … ORDER BY id FOR UPDATE`, ascending UUID, whatever the direction of the move (`lockRowsInOrder` in `backend/src/common/position.ts`).
**Why the naive version fails.** Locking source then target gave `deadlock detected` in the concurrency test, 3 runs out of 3.

### A reminder cron that can run on several instances

**Problem.** If two instances run the hourly job at once, nobody may get the same reminder twice.
**Solution.** Each batch is claimed with `FOR UPDATE OF t SKIP LOCKED`: an instance skips rows another one holds instead of waiting for them. Tasks are marked `reminderSent = true` and committed *before* any email is sent.
**Why mark before sending.** A sent email cannot be rolled back. If the mark comes after the send, another run can pick the same task in between and send it again. Marking first means a failed send loses the reminder instead. Losing one reminder beats sending two.

### Invitation tokens

**Problem.** An invitation link is a bearer secret, and a link can be forwarded or intercepted.
**Solution.** The database stores only the SHA-256 of the token. The token travels in request bodies (`POST /invitations/preview`, `POST /invitations/accept`) and in the email link's URL fragment (`/invite#token=…`), which browsers never send to a server. It never appears in a path or a query string, so it reaches no access log.
**Identity check.** Accepting requires the signed-in account's email to match the invited email. The token proves that someone received the message, not who they are.

## Tests, and why they are worth something

| Suite | Count |
| --- | --- |
| Backend unit (`pnpm test`) | 25 |
| Backend end-to-end, real PostgreSQL (`pnpm test:e2e`) | 147 |
| Frontend unit (`pnpm test`) | 44 |
| Bruno requests (`backend/tests-api`) | 108 |

The access checks and concurrency guarantees above were verified by mutation: write the test, remove the mechanism it covers, confirm that the test fails, then restore it. A security test that has never failed proves nothing. Three examples:

- Removing the workspace filter from `taskOrFail` makes the isolation test fail: the task of another workspace answers 200 instead of 404.
- Removing the email check on acceptance makes `i) 403 for an account whose email differs` fail: the intruder joins the workspace.
- Marking tasks *after* sending makes `k) two simultaneous runs` fail: 100 reminders go out twice.

Mutation also showed where a test proves less than it seems. Without `SKIP LOCKED`, the two-run test still passes: in `READ COMMITTED` the second run waits, then re-checks the row and skips it. So a separate test locks a task from another connection and asserts that the run skips it instead of waiting.

The Bruno collection in `backend/tests-api` is versioned with the code. It runs against a local API with `bru run --env local --disable-cookies -r`, and documents each check (isolation 403, IDOR 404, token theft 403) next to the request.

## Quick start

Requirements: Docker, Node.js 22.13 or later (developed on Node 25), pnpm.

```bash
git clone https://github.com/Dev-Cito/Veyra.git
cd Veyra
docker compose up -d                 # PostgreSQL 16 on localhost:5433

cd backend
pnpm install
cp .env.example .env
echo "JWT_SECRET=$(openssl rand -hex 32)" >> .env
pnpm migration:run
pnpm start:dev                       # API on http://localhost:3001
```

In a second terminal:

```bash
cd Veyra/frontend
pnpm install
cp .env.example .env.local
pnpm dev                             # app on http://localhost:3000
```

Open http://localhost:3000 and create an account.

**Port 5433, not 5432.** The container maps PostgreSQL to 5433, so it does not collide with another local Postgres. `DATABASE_URL` in `.env.example` already points there.

The only variable without a default is `JWT_SECRET`, set above. With `MAIL_ENABLED=false` (the default), emails are logged instead of sent. To see them, run [Mailpit](https://mailpit.axllent.org/), which is not part of `docker-compose.yml`:

```bash
docker run -d --name mailpit -p 1025:1025 -p 8025:8025 axllent/mailpit
```

Then set `MAIL_ENABLED=true`, `SMTP_HOST=localhost` and `SMTP_PORT=1025` in `backend/.env`, restart the API, and open http://localhost:8025. The full list of variables is in [backend/README.md](backend/README.md).

Tests: `pnpm test` and `pnpm test:e2e` in `backend/` (the e2e suite creates its own `veyra_test` database), `pnpm test` in `frontend/`.

## Repository layout

```
.
├── docker-compose.yml       PostgreSQL 16 for local development
├── backend/                 NestJS API
│   ├── src/                 one folder per domain (auth, workspaces, boards, lists,
│   │                        tasks, invitations, notifications), plus scope/ (IDOR
│   │                        checks), common/ (positions, validation) and database/
│   │                        (data source, migrations)
│   ├── test/                end-to-end tests against a real database
│   └── tests-api/           Bruno collection
└── frontend/                Next.js app
    ├── app/                 routes: sign-in, invitation, workspaces, members, board
    ├── components/          board/ (Kanban), app/ (shell), ui/ (primitives)
    ├── hooks/               TanStack Query hooks, one file per resource
    └── lib/                 API client, error copy, neighbour computation
```

## Project status

| Phase | Scope | State |
| --- | --- | --- |
| 1 | Auth, workspaces, role per workspace | Done |
| 2 | Boards, columns, cards, assignees, IDOR checks | Done |
| 3 | Persistent ordering with floating positions | Done |
| 4 | Invitations by token | Done |
| 5 | Email and due-date reminder cron | Done |
| 6 | API integration collection (Bruno) | Done |
| 7 | Frontend: shell, auth, workspaces, members, invitations | Done |
| 8 | Kanban board with drag and drop | Done |

Not built yet:

- Deployment: nothing is online, so there is no demo link.
- An LLM feature and the evaluation pipeline to measure it.
- Comments and labels: the entities do not exist.
- Account deletion: the schema handles it (`ON DELETE SET NULL` on authorship), but no endpoint exposes it.
- Touch drag and drop: on small screens, cards move through a "move to…" menu.

Known limitations of what is built are listed in [backend/README.md](backend/README.md#limitations-connues).

## Links

- [backend/README.md](backend/README.md): environment variables, commands, known limitations
- [backend/tests-api](backend/tests-api): Bruno collection
- [frontend/README.md](frontend/README.md): data flow and the board's design
