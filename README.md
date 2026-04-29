# BodegaDK

Browser-based card game platform with:
- `apps/web` (TypeScript web client)
- `apps/server` (Spring Boot backend)
- `infra` (nginx + server compose)
- `supabase/migrations` (canonical app schema migrations)

Current platform capabilities include Supabase auth/profile support, durable
room and matchmaking metadata, server-authoritative realtime games, match
history, profile stats, all-time leaderboards, friends, direct challenges, and
notifications.

## Quick Start (Fast Local Dev)

From repo root:

```bash
npm install
npm run local:dev
```

This starts:
- server on `http://localhost:8080` (local profile)
- web on `http://localhost:5173`
- TypeScript watch + rebuild

The server uses Supabase Postgres for durable storage, so provide
`SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`, and
`SPRING_DATASOURCE_PASSWORD` through shell env or `.env.local` before running
server-backed flows.

## Run Docker Stack Locally

If you want nginx plus the server container locally:

```bash
cd infra
docker compose up -d --build
```

Health check:

```bash
curl -i http://localhost/api/health
```

## Full Stack (nginx + server)

```bash
npm run deploy:update
```

Open:
- `http://localhost`

Docker deploys require Supabase datasource and JWT/public config environment;
see [docs/instructions/SERVER_GUIDE.md](/Users/alex/WebstormProjects/BodegaDK/docs/instructions/SERVER_GUIDE.md).

## Useful Commands

```bash
npm run web:build
cd apps/server && mvn test
npm run server:local
npm run web:watch
npm run web:dev
npm run local:health
```

## Branch Deploy Helpers

```bash
npm run deploy:main
npm run deploy:dev
```

These commands switch branch before deploying.

## Documentation

- Contributor and agent guidance: [AGENTS.md](/Users/alex/WebstormProjects/BodegaDK/AGENTS.md)
- Supabase migrations and web auth config: [docs/instructions/SUPABASE.md](/Users/alex/WebstormProjects/BodegaDK/docs/instructions/SUPABASE.md)
- Database ownership decision: [docs/decisions/0001-canonical-database-and-migrations.md](/Users/alex/WebstormProjects/BodegaDK/docs/decisions/0001-canonical-database-and-migrations.md)
- Local development guide: [docs/instructions/DEVELOPMENT.md](/Users/alex/WebstormProjects/BodegaDK/docs/instructions/DEVELOPMENT.md)
- Debian/server deploy guide: [docs/instructions/SERVER_GUIDE.md](/Users/alex/WebstormProjects/BodegaDK/docs/instructions/SERVER_GUIDE.md)
- Protocol contract: [docs/design/PROTOCOL.md](/Users/alex/WebstormProjects/BodegaDK/docs/design/PROTOCOL.md)
- Engine integration contract: [docs/contracts/enginge_intergration_contract.md](/Users/alex/WebstormProjects/BodegaDK/docs/contracts/enginge_intergration_contract.md)
