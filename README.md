# BodegaDK

Browser-based card game platform with:
- `apps/web` (TypeScript web client)
- `apps/server` (Spring Boot backend)
- `infra` (nginx + postgres + compose)

## Quick Start (Fast Local Dev)

From repo root:

```bash
npm install
npm run local:dev
```

This starts:
- server on `http://localhost:8080` (local profile, no DB required)
- web on `http://localhost:5173`
- TypeScript watch + rebuild

## Run Server + DB on localhost (Docker)

If you want postgres-backed stack pieces locally:

```bash
cd infra
docker compose up -d db server
```

Health check:

```bash
curl -i http://localhost:8080/health
```

## Full Stack (nginx + server + db)

```bash
npm run deploy:update
```

Open:
- `http://localhost`

## Useful Commands

```bash
npm run web:build
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
- Local development guide: [docs/instructions/DEVELOPMENT.md](/Users/alex/WebstormProjects/BodegaDK/docs/instructions/DEVELOPMENT.md)
- Debian/server deploy guide: [docs/instructions/SERVER_GUIDE.md](/Users/alex/WebstormProjects/BodegaDK/docs/instructions/SERVER_GUIDE.md)
- Protocol contract: [docs/design/PROTOCOL.md](/Users/alex/WebstormProjects/BodegaDK/docs/design/PROTOCOL.md)
- Engine integration contract: [docs/contracts/enginge_intergration_contract.md](/Users/alex/WebstormProjects/BodegaDK/docs/contracts/enginge_intergration_contract.md)
