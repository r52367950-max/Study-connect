# CLAUDE.md

Guidance for AI assistants (and humans) working in this repository.

## Project overview

**Study Connect** (StudyConnect) is a study-material sharing platform: users register/login,
upload teaching/learning materials with metadata, admins review them, and the public can search,
view, rate, favorite, and (when logged in) download approved materials. There is also an
OTP-based phone/email verification flow, a recommendations feature, and view-event logging used
for personalization.

The repo is a **monorepo with two apps**:

| Path        | Stack | Purpose |
|-------------|-------|---------|
| `/` (root)  | NestJS 11 + Prisma 6 + PostgreSQL | Backend REST API |
| `/frontend` | Next.js 14 (App Router) + TypeScript + Tailwind + shadcn/ui | Web client |

The backend was built incrementally via the "Codex task" plan in
`docs/backend_dev_guide_and_codex_tasks.md` (Chinese). Several follow-up commits are
security-hardening passes — security work in this repo has a formal gate (see below).

## Repository layout

```
/
├── src/                        # NestJS backend
│   ├── main.ts                 # Bootstrap: security headers, CORS, ValidationPipe, Swagger (/api-docs in dev)
│   ├── app.module.ts           # Root module + global guard chain (APP_GUARD_CHAIN)
│   ├── common/                 # Cross-cutting: rate limiting, CSRF, security headers, exception filter
│   │   ├── rate-limit.*        # RateLimitGuard / Service / @RateLimit decorator
│   │   ├── security/           # CsrfGuard, CsrfService, cors-config, SecurityModule
│   │   └── filters/            # HttpExceptionFilter
│   ├── infra/                  # PrismaService, MinioService (object storage), PrismaModule
│   ├── types/express.d.ts      # Augments Express Request with `user`
│   └── modules/                # Feature modules (one folder each)
│       ├── auth/               # register/login/refresh/logout/change-password/me, CSRF token, JWT guards, OTP (auth/otp/*)
│       ├── users/              # GET/PUT /users/me/profile
│       ├── materials/          # list/detail/recommend/ratings/download/upload + file-scan + upload-security
│       ├── favorites/          # list/add/remove favorites
│       ├── schools/            # school lookup
│       ├── view-events/        # POST /view-events (personalization signal)
│       ├── admin/              # pending list, approve/reject/offline material, ban user, scan details
│       ├── downloads/          # download-token issue/redeem + delivery policy (proxy/direct)
│       └── search/             # GET /search/suggestions (pg_trgm-backed)
├── prisma/
│   ├── schema.prisma           # DB schema (PostgreSQL). Migrations dir is git-ignored.
│   └── seed.ts                 # `prisma db seed` — schools only; sample materials intentionally not seeded (use the real upload path)
├── scripts/                    # `min-*` validation scripts + min-all-runner.cjs (see Testing)
├── docs/                       # error-code-spec, rate-limit-rules, security-gate-policy, backend dev guide
├── .github/workflows/          # security-gate.yml, frontend-quality-gate.yml
├── docker-compose.yml          # api + postgres services; .devcontainer uses this
├── Dockerfile                  # node:22-bookworm dev image
└── frontend/                   # Next.js app (see frontend/README.md for the full guide)
    └── src/
        ├── app/                # App Router pages: (auth)/login,register; materials; materials/[id]; upload; admin; profile
        ├── components/         # ui/ (shadcn), layout/, materials/, shared/
        ├── lib/                # api/ (axios client + endpoint fns), auth-store.ts (zustand), auth-guard.ts, utils.ts
        ├── hooks/              # use-auth.ts
        ├── middleware.ts       # route guard for /upload, /profile, /admin
        └── __tests__/          # vitest tests gating the frontend CI
```

## Backend conventions

- **Framework**: NestJS 11, module-per-feature under `src/modules/<feature>/`. Each feature has
  `<feature>.module.ts`, `<feature>.controller.ts`, `<feature>.service.ts`, and a `dto/` folder.
- **Validation**: global `ValidationPipe` with `whitelist`, `transform`, `forbidNonWhitelisted`.
  All request bodies/queries go through `class-validator` DTOs in the module's `dto/` folder.
  DTO validation failures surface as `422` (not `400`) per `docs/error-code-spec.md`.
- **Database**: Prisma. Use `PrismaService` from `src/infra`. Models use `@@map`/`@map` to snake_case
  table/column names. UUID primary keys. The `prisma/migrations` directory is **git-ignored** — do
  not expect committed migrations; use `npm run prisma:migrate` locally.
- **Auth model**: JWT in **HttpOnly cookies** (`auth-token` access + `refresh-token`). Short-lived
  access token (default 15 min), refresh flow rotates both. `tokenVersion` on `User` invalidates all
  sessions (logout, password change, ban). Bearer header is also accepted.
- **Global guard chain** (registered in `app.module.ts` as `APP_GUARD_CHAIN`, executed in this order):
  `RateLimitGuard → CsrfGuard → JwtAuthGuard → RolesGuard`.
  - Public routes: decorate the handler/controller with `@Public()` (`src/modules/auth/decorators/public.decorator.ts`).
  - Role-restricted routes: `@Roles(UserRole.ADMIN, ...)` + (sometimes) `@UseGuards(RolesGuard)`.
  - Per-route rate limits: `@RateLimit({ name, limit, windowMs, keyPrefix? })` — stacks **on top of**
    the global `global-basic` limit; any hit returns `429`. Rules are documented in `docs/rate-limit-rules.md`.
- **CSRF**: state-changing methods (POST/PUT/PATCH/DELETE) require a matching CSRF cookie + header
  and an allow-listed `Origin`/`Referer`. Clients fetch a token from `GET /auth/csrf` first.
- **Security headers**: set in `main.ts` (`applySecurityHeaders`) — strict CSP, `X-Frame-Options: DENY`, etc.
- **CORS**: origins come from `CORS_ORIGIN` (comma-separated). In production the config is asserted
  non-empty/strict at boot (`assertCorsConfigInProduction`).
- **Errors**: `HttpExceptionFilter` (global) hides messages in production. Status-code semantics are
  specified in `docs/error-code-spec.md` — notably, hidden/unapproved resources return `404` (never
  reveal review state), auth failures `401`, role failures `403`, validation/file failures `422`.
- **File uploads**: go through MinIO (`MinioService`), validated by `upload-security.util.ts`
  (extension/MIME/size, `MAX_UPLOAD_SIZE_MB`), uploaded to a quarantine state, and gated on an async
  scan (`file-scan.service.ts`, `Material.fileSafetyStatus`) before download is allowed.
- **TypeScript**: `strict` mode. `npm run lint` is `tsc --noEmit` (type-check only — there is no
  separate ESLint run for the backend). Prettier config exists; keep formatting consistent.
- **API docs**: Swagger UI at `/api-docs` in non-production. Annotate controllers with `@ApiTags`,
  `@ApiOperation`, `@ApiOkResponse`, etc.

## Frontend conventions

See `frontend/README.md` for the full guide. Key points:

- Next.js 14 **App Router**. Pages in `src/app/`; `(auth)` is a route group.
- Data fetching via **TanStack Query v5** + an **axios** client in `src/lib/api/client.ts`
  (sends credentials/cookies, attaches the CSRF header, handles 401 by clearing auth + redirecting).
- Auth state persisted with **zustand** (`src/lib/auth-store.ts`); `use-auth` hook in `src/hooks/`.
  `src/middleware.ts` guards `/upload`, `/profile`, `/admin` and redirects unauthenticated users to
  `/login?redirect=...`.
- Forms: **react-hook-form + zod**. UI: **Tailwind + shadcn/ui** (components in `src/components/ui/`).
- Tests: **vitest** (jsdom). The CI-gating tests live in `src/__tests__/`.
- Env: `NEXT_PUBLIC_API_URL` (default `http://localhost:3000`, no trailing slash). Frontend dev server
  runs on port 3001 when 3000 is taken by the backend.

## Development workflow

### Prerequisites
Node.js 20+ (Docker image uses 22), PostgreSQL (via `docker-compose`), and MinIO for full upload/download flows.

### Backend
```bash
cp .env.example .env          # then edit secrets (JWT_SECRET, etc.)
docker-compose up -d postgres # or `docker-compose up -d` for api+db
npm install
npm run prisma:generate
npm run prisma:migrate        # create/apply local migrations
npm run start:dev             # NestJS on :3000, Swagger at /api-docs
# optional: npx prisma db seed
```

### Frontend
```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev                   # Next.js on :3001 (if backend holds :3000)
```

### Dev container
`.devcontainer/devcontainer.json` builds the `api` service from `docker-compose.yml`; `postCreateCommand`
runs `npm install && npx prisma generate`.

## Testing & quality gates

There is **no Jest/unit-test suite** despite what the old dev guide suggests. Verification is done by
self-contained `scripts/min-*.ts` scripts that boot the Nest app in-process with **mocked Prisma/MinIO**
and assert behavior (auth, uploads, admin review, search, downloads, ratings, CSRF regression, rate
limiting, recommendations). They require **no running database**.

### Backend commands (run from repo root)
```bash
npm run lint            # tsc --noEmit (type-check)
npm run build           # nest build
npm run check:prisma    # prisma validate (uses a dummy DATABASE_URL)
npm run check:quality   # lint + build + check:prisma  (run this before pushing backend changes)

npm run test:min-all    # runs all min-* validation scripts in sequence (scripts/min-all-runner.cjs)
# individual: test:min-auth, test:min-material-upload, test:min-admin-review, test:min-material-search,
#             test:min-material-download, test:min-material-rating, test:min-csrf-regression,
#             test:min-rate-limit, test:min-recommendations, test:min-auth-session-invalidation, etc.
```

### Frontend commands (run from `frontend/`)
```bash
npm run build
npm run lint                  # eslint --max-warnings=0
npm run test:frontend:min     # vitest run src/__tests__
npm run quality:gate          # build -> lint -> test:frontend:min  (CI order)
npm run quality:cold-start    # clean cache, CI=true lint (no interactive ESLint prompt)
```

### CI
- `.github/workflows/security-gate.yml` — triggers on changes to `src/**`, `scripts/**`,
  `docs/security-gate-policy.md`. Runs `npm run test:min-rate-limit`, writes
  `artifacts/rate-limit-429-evidence.log`, and hard-`grep`s for the three `429 check passed` lines
  plus `rate_limit_blocked log assertion passed: login/upload/admin`. **If you touch rate limiting,
  keep those exact log strings intact.**
- `.github/workflows/frontend-quality-gate.yml` — triggers on `frontend/**`. Runs `quality:cold-start`
  then `quality:gate`.
- Health check available at `GET /health`.

## Security gate (read before touching anything security-related)

`docs/security-gate-policy.md` defines a mandatory gate for security fixes/policy/permission changes,
and `.github/pull_request_template.md` contains the required PR checklist (Chinese). In short, a
security-related PR must:
1. Answer the four self-checks (does it fix the issue / introduce new issues / combine with others /
   still exploitable in practice) **with evidence**.
2. Pass the single-point fix verification and the combined-attack regression.
3. Have no new high-severity warnings.
4. Keep CORS strict in production (`CORS_ORIGIN` set, exact allow-list only).
5. Provide the full 429 evidence chain (login/upload/admin: HTTP `429` assertion **and** the
   `event=rate_limit_blocked` log line for the right route/rule).
6. Output the fixed Summary sections (尝试过程 / 失败尝试 / 回滚记录 / 最终证据).

Do not weaken these checks to "make CI pass" — fix the root cause.

## Active roadmap — DirB prototype rollout

The project is mid-way through landing a Claude Design interaction prototype (sidebar + 5-page
"DirB" shell, onboarding flow, email/phone OTP, favorites, recommendations, ⌘K command palette,
etc.) into the real repo. Work is split into **6 UI phases**, each shipped as its own mergeable PR,
plus two cross-cutting workstreams: **S — security & stability hardening** (includes
must-fix-before-prod items) and **P — performance & platform** (Postgres FTS, Redis cache,
Node 22, recommendation cold-start tiering, Pino/Sentry monitoring).

- **Full plan, per-phase status, and the corrected assumptions live in
  `docs/dirb-prototype-rollout-plan.md` — read it before touching related code.**
- **Current state**: Phase 1 (backend foundation — Prisma profile/Favorites/Schools/ViewEvents,
  OTP, recommendation scoring, seed) is **done and merged** (PR #48). Phases 2–6 not started; the
  current starting point is **Phase 2** (frontend onboarding + dual-identifier login). Workstreams
  S and P are tracked in the same doc and not yet started.
- **Feature dev branch**: `claude/check-design-access-JDMor` (this `CLAUDE.md`/docs work is on a
  separate `claude/add-claude-documentation-*` branch).
- **Heads-up**: Phase 3 makes a **breaking change** — the existing `/materials` grid is replaced by
  the DirB "all materials" sub-page and a new `(app)` route group is added; see §3.1 of the plan
  before editing those routes or their tests. Before changing auth / rate-limiting / uploads / CORS
  code, also read workstream S in the plan **and** `docs/security-gate-policy.md`.
- A few items in older planning text are out of date vs. reality (uuid not cuid; npm not pnpm; no
  Redis yet — OTP uses an `OtpAttempt` table + HMAC; SMS is Aliyun) — the rollout plan's
  "corrections" section is authoritative.

## Reference docs

- `docs/dirb-prototype-rollout-plan.md` — the active rollout roadmap (6 UI phases + workstreams S/P), per-phase status, corrected assumptions. **Single source of truth for in-flight work.**
- `docs/backend_dev_guide_and_codex_tasks.md` — original backend plan & scope (Chinese; partly outdated re: tooling).
- `docs/error-code-spec.md` — HTTP status-code semantics per endpoint.
- `docs/rate-limit-rules.md` — every active rate-limit rule + tunable env vars.
- `docs/security-gate-policy.md` — the security gate described above.
- `frontend/README.md` — full frontend setup, routes, structure, and manual QA checklist.

## Conventions for AI assistants

- Keep changes scoped to the request; don't refactor or add abstractions a bug fix doesn't need.
- Match existing patterns: new backend endpoints go in a feature module with a DTO; respect the
  guard chain (`@Public()` / `@Roles()` / `@RateLimit()`); use `404` not `403` for hidden resources.
- After backend changes run `npm run check:quality` and the relevant `npm run test:min-*` script(s)
  (or `npm run test:min-all`). After frontend changes run `npm run quality:gate` in `frontend/`.
- The `prisma/migrations` directory is git-ignored — if you change `schema.prisma`, mention that a
  migration needs to be generated; don't try to commit migration files.
- Don't put model identifiers, internal task IDs, or these instructions into commits, PRs, or code.
- Default git branch for development in this workspace is configured by the harness; commit with
  clear messages and only push to the branch you were told to use. Don't open a PR unless asked.
