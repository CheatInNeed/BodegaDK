# AGENTS.md

## Scope
This file defines working rules for coding agents in this repository.
Apply these instructions to all changes unless a task explicitly overrides them.

## Project Snapshot
Monorepo components:
- `apps/web`: browser client (TypeScript, static assets served from `public/`)
- `apps/server`: Spring Boot backend (Java 21, REST + WebSocket)
- `infra`: Docker Compose + nginx + postgres setup
- `docs`: architecture, protocol, homepage contract, development, and security documentation

Frontend routing is split:
- Pathname routes: `/`, `/login`, `/signup`, `/custom`
- Query-param app views on `/`: `?view=home|play|settings|help|lobby-browser|lobby|room`
- `/` currently defaults to `home`

## Core Invariants
- Server is authoritative for game rules, turn flow, RNG, and win conditions.
- Client must only render state and send intents; do not move rules into frontend code.
- Keep REST/WS contract changes synchronized across web, server, and docs.
- Preserve nginx proxy behavior for `/api/*`: rewrite to backend paths without `/api`.
- Preserve nginx proxy behavior for `/ws`: keep WebSocket upgrade headers.
- Preserve the current route split between pathname auth pages and query-param app views unless the task explicitly changes routing.

## Current Dev Tooling
Run from repository root unless noted.

Root npm scripts now delegate to `apps/web` through npm workspaces:

```bash
npm install
npm run dev
```

Useful commands:

```bash
npm run web:build
npm run web:watch
npm run web:serve
npm run server:local
npm run local:dev
npm run local:health
cd apps/server && mvn test
```

Full stack (nginx + server + db):

```bash
npm run deploy:update
```

Deployment helpers:

```bash
npm run deploy:main
npm run deploy:dev
```

Do not run `deploy:main` or `deploy:dev` unless explicitly asked; they switch git branches.
`deploy:update` intentionally tries `docker compose` first and falls back to `docker-compose`.

## Area-Specific Guidance

### `apps/web`
- Keep all user-facing strings in `apps/web/src/i18n.ts`; do not hardcode UI copy in render functions.
- Keep styles in `apps/web/public/styles.css` and reuse existing CSS variables/tokens.
- Do not introduce Tailwind, inline styles, or external font dependencies.
- Ensure TypeScript output remains compatible with `apps/web/public/dist`.
- Treat `apps/web/public/app-config.js` as generated runtime config, not a tracked source file.
- Preserve shared utility classes used by multiple flows; auth/homepage uses `.full`, lobby still uses `.full-width`.
- Keep the current auth path routes working: `/login`, `/signup`, `/custom`.
- Keep the current lobby flow working:
  - `?view=lobby-browser`
  - `?view=lobby`
  - transition from lobby into `?view=room`
- `playCards()` and `button[data-action="open-game"]` are reused across the play view and homepage. Do not change their behavior casually.

Homepage V1 rules:
- `/?view=home` must remain distinct from `/?view=play`.
- The source of truth is `docs/contracts/homepage_v1_contract.md`.
- Current card status is:
  - real: `Games`
  - placeholder: `Continue Game`, `Quick Play / Create / Join`, `Leaderboard`, `Profile`, `Invite / Friends`, `Stats`
- Do not surface partial plumbing as real homepage features. HighCard quickplay and Supabase auth/avatar support exist elsewhere, but homepage cards still follow the locked contract.

Supabase rules:
- App-owned Supabase schema changes belong in `supabase/migrations/`.
- Do not treat the Supabase dashboard as the source of truth for schema.
- Public browser config comes from `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` via generated runtime config.
- Private migration credentials belong in GitHub secrets, not in source files.

### `apps/server`
- Target Java 21 and existing Spring Boot patterns.
- Keep direct backend paths consistent with current contracts:
  - `GET /rooms`
  - `POST /rooms`
  - `POST /rooms/{roomCode}/join`
  - `POST /rooms/{roomCode}/kick`
  - `POST /rooms/{roomCode}/leave`
  - `GET /health`
  - `WS /ws`
- Keep docker/nginx routing consistent: backend REST paths are reached through `/api/*` in nginx, except `/ws`.
- For engine or domain rule changes, add or update tests under `apps/server/src/test`.

### `infra`
- Treat `infra/nginx/nginx.conf` route rewrites as contract-critical.
- Do not change port assumptions without updating docs and scripts:
  - web dev `5173`
  - server `8080`
  - postgres `5432`
  - nginx `80`
- Preserve cache/header behavior intentionally; nginx changes can affect deploy freshness and browser cache behavior.

## Repo Hygiene
- Do not commit local assistant or editor metadata:
  - `.ai/`
  - `.idea/` local state files
- Do not commit generated outputs unless the task explicitly requires it:
  - `apps/web/public/dist/`
  - `apps/server/target/`
- Be careful with `package-lock.json`; only commit it when dependency or workspace changes actually require it.

## Documentation Sync Rules
If behavior changes, update corresponding docs in the same task:
- `docs/contracts/homepage_v1_contract.md` for homepage layout/behavior changes
- `docs/instructions/SUPABASE.md` for Supabase schema/config/CI changes
- `docs/design/PROTOCOL.md` for REST/WS payload or message changes
- `docs/instructions/DEVELOPMENT.md` for local workflow changes
- `docs/design/ARCHITECTURE_AND_PROJECT_STRUCTURE.md` for structural changes
- `docs/security/security.md` for security model changes

Related docs commonly needed during feature work:
- `docs/design/WEB_CLIENT_GAME_ROOM.md`
- `docs/design/DESIGN_GUIDE.md`
- `docs/design/SERVER_ENGINE.md`

## Change Checklist (Before Hand-Off)
- Run the smallest relevant validation for the change scope.
- Web-only change: `npm run web:build`.
- Server-only change: `cd apps/server && mvn test`.
- Cross-cutting change: run both checks.
- Homepage, lobby, or room-flow change: verify at least one manual route/flow in addition to the build.
- For protocol/runtime flow changes, verify at least one end-to-end local flow with `npm run local:dev`.
- Keep changes minimal and scoped; avoid unrelated refactors.
