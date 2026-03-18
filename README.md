# BodegaDK

Browser-based card game platform with:
- `apps/web` for the TypeScript web client
- `apps/server` for the Spring Boot backend
- `infra` for nginx, Postgres, and Docker Compose

## Quick Start

Install dependencies from repo root:

```bash
npm install
```

Start the frontend:

```bash
npm run web:dev
```

Start the backend:

```bash
npm run server:dev
```

Start Postgres locally when needed:

```bash
npm run db:up
```

Stop Postgres again:

```bash
npm run db:down
```

## Local URLs

- Web: `http://localhost:5173`
- Server: `http://localhost:8080`

## Useful Commands

```bash
npm run web:build
npm run deploy:update
npm run deploy:main
npm run deploy:dev
```

## Notes

- The lobby implementation supports private and public lobbies.
- High Card quickplay from `dev` is available alongside the lobby flow.
- The frontend can load without the backend, but lobby and realtime gameplay need the server running.

## Documentation

- Design guide: [docs/design/DESIGN_GUIDE.md](/Users/peterroland/Library/CloudStorage/OneDrive-DanmarksTekniskeUniversitet/DTU/4_Semester/62595_Full_stack_development/BodegaDK/docs/design/DESIGN_GUIDE.md)
- Development guide: [docs/instructions/DEVELOPMENT.md](/Users/peterroland/Library/CloudStorage/OneDrive-DanmarksTekniskeUniversitet/DTU/4_Semester/62595_Full_stack_development/BodegaDK/docs/instructions/DEVELOPMENT.md)
- Server guide: [docs/instructions/SERVER_GUIDE.md](/Users/peterroland/Library/CloudStorage/OneDrive-DanmarksTekniskeUniversitet/DTU/4_Semester/62595_Full_stack_development/BodegaDK/docs/instructions/SERVER_GUIDE.md)
- Protocol: [docs/design/PROTOCOL.md](/Users/peterroland/Library/CloudStorage/OneDrive-DanmarksTekniskeUniversitet/DTU/4_Semester/62595_Full_stack_development/BodegaDK/docs/design/PROTOCOL.md)
- Engine contract: [docs/contracts/enginge_intergration_contract.md](/Users/peterroland/Library/CloudStorage/OneDrive-DanmarksTekniskeUniversitet/DTU/4_Semester/62595_Full_stack_development/BodegaDK/docs/contracts/enginge_intergration_contract.md)
