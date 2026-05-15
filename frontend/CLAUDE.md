# CLAUDE.md — frontend

Scoped guidance for the Next.js client. See the repo-root `CLAUDE.md` and `frontend/README.md` for
the full picture; this file only highlights what's frontend-specific and easy to get wrong.

## Stack & conventions

- **Next.js 14 App Router**. Pages in `src/app/`; `(auth)` is a route group (login/register).
- Data: **TanStack Query v5** + an **axios** client in `src/lib/api/client.ts` — sends cookies,
  attaches the CSRF header, and on `401` clears auth state + redirects to `/login`. Per-endpoint
  functions live in `src/lib/api/*.ts`.
- Auth state: **zustand** (`src/lib/auth-store.ts`); `use-auth` hook in `src/hooks/`.
  `src/middleware.ts` guards `/upload`, `/profile`, `/admin` → `/login?redirect=...`.
- Forms: **react-hook-form + zod**. UI: **Tailwind + shadcn/ui** (`src/components/ui/`); icons
  `lucide-react`. Radix primitives for dialogs/tabs/etc.
- Tests: **vitest** (jsdom); the CI-gating ones are in `src/__tests__/`.
- Env: `NEXT_PUBLIC_API_URL` (default `http://localhost:3000`, no trailing slash). Dev server runs
  on `:3001` when the backend holds `:3000`.

## Quality gate (run from `frontend/` before pushing)

```bash
npm run build
npm run lint                  # eslint --max-warnings=0
npm run test:frontend:min     # vitest run src/__tests__
npm run quality:gate          # build -> lint -> test (CI order)
npm run quality:cold-start    # clean cache + CI=true lint (matches CI's first step)
```
CI: `.github/workflows/frontend-quality-gate.yml` runs `quality:cold-start` then `quality:gate` on
`frontend/**` changes.

## In-flight: DirB rollout (read before big changes)

The full roadmap is `docs/dirb-prototype-rollout-plan.md` (repo root). Frontend-relevant heads-up:

- **Phase 3 is a breaking change**: the current `/materials` grid (`src/app/materials/page.tsx`)
  becomes the DirB "all materials" sub-page, and a new `(app)` route group (`src/app/(app)/layout.tsx`
  with sidebar + topbar) wraps `/`, `/rank`, `/favorites`, `/subject/[name]`, `/grade/[stage]/[grade]`,
  `/materials`. The existing `src/components/layout/navbar.tsx` is hidden inside `(app)`. ~8 hard-coded
  `/materials` references and 3 tests (`api-client-403`, `materials-api-rating`, `admin-guard`) must
  change together — see §3.1 / §3.1.1 of the plan.
- `/materials/[id]` detail, `/upload`, `/profile`, `/admin` routes stay; the API client, auth, CSRF,
  Bearer handling and React Query cache do **not** change in Phase 3.
- Phase 2 (current starting point): dual-identifier login (email/phone) + OTP UI + `/onboarding` +
  extending the `User` type with profile fields in `src/types/index.ts`.
