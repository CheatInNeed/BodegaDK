# AGENTS.md

## Scope
This file defines working rules for coding agents in this repository.
Apply these instructions to all changes unless a task explicitly overrides them.

## Project Snapshot
Monorepo components:
- `apps/web`: browser client (TypeScript, static assets served from `public/`)
- `apps/server`: Spring Boot backend (Java 21, REST + WebSocket)
- `infra`: Docker Compose + nginx + postgres setup
- `docs`: architecture, protocol, development, security documentation

## Core Invariants
- Server is authoritative for game rules, turn flow, RNG, and win conditions.
- Client must only render state and send intents; do not move rules into frontend code.
- Keep REST/WS contract changes synchronized across web, server, and docs.
- Preserve nginx proxy behavior for `/api/*`: rewrite to backend paths without `/api`.
- Preserve nginx proxy behavior for `/ws`: keep WebSocket upgrade headers.

## Local Dev Commands
Run from repository root unless noted.

```bash
npm install
npm run local:dev
```

Useful commands:

```bash
npm run web:build
npm run web:watch
npm run web:serve
npm run server:local
npm run local:health
cd apps/server && mvn test
```

Full stack (nginx + server + db):

```bash
npm run deploy:update
```

Do not run `npm run deploy:main` or `npm run deploy:dev` unless explicitly asked; they switch git branches.

## Area-Specific Guidance

### `apps/web`
- Keep all user-facing strings in `apps/web/src/i18n.ts` (no hardcoded UI text).
- Keep styles in `apps/web/public/styles.css` and reuse CSS variables/tokens.
- Do not introduce Tailwind, inline styles, or external font dependencies.
- Ensure TypeScript output remains compatible with `apps/web/public/dist`.

### `apps/server`
- Target Java 21 and existing Spring Boot patterns.
- Keep direct backend paths consistent with current contracts: `/rooms`, `/rooms/{roomCode}/join`, `/health`, `/ws`.
- Keep docker/nginx routing consistent: backend REST paths are reached through `/api/*` (except `/ws`).
- For engine or domain rule changes, add/adjust tests under `apps/server/src/test`.

### `infra`
- Treat `infra/nginx/nginx.conf` route rewrites as contract-critical.
- Do not change port assumptions without updating docs and scripts (web dev `5173`, server `8080`, postgres `5432`, nginx `80`).

## Documentation Sync Rules
If behavior changes, update corresponding docs in the same task:
- `docs/design/PROTOCOL.md` for REST/WS payload or message changes
- `docs/instructions/DEVELOPMENT.md` for local workflow changes
- `docs/design/ARCHITECTURE_AND_PROJECT_STRUCTURE.md` for structural changes
- `docs/security/security.md` for security model changes

Note: root `README.md` currently points to some outdated doc paths; prefer the `docs/instructions` and `docs/design` paths above when adding new references.

## Change Checklist (Before Hand-Off)
- Run the smallest relevant validation for the change scope.
- Web-only change: `npm run web:build`.
- Server-only change: `cd apps/server && mvn test`.
- Cross-cutting change: run both checks.
- For protocol/runtime flow changes, verify at least one end-to-end local flow (`npm run local:dev` and room join/play path).
- Keep changes minimal and scoped; avoid unrelated refactors.
