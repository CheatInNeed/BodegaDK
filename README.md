# BodegaDK

## Start Guide

### 1. Start database

Root:

```bash
cd ~/BodegaDK/infra
```

Command:

```bash
docker-compose up -d db
```

Verify:

```bash
docker ps
```

Postgres should show:

```bash
0.0.0.0:5432->5432/tcp
```

### 2. Start backend

Root:

```bash
cd ~/BodegaDK/apps/server
```

Command:

```bash
mvn spring-boot:run
```

Backend URL:

```text
http://localhost:8080
```

Requirements:

- Java 21
- Maven
- Postgres running on `localhost:5432`

### 3. Start frontend

Root:

```bash
cd ~/BodegaDK
```

Command:

```bash
npm run web:dev
```

Frontend URL:

```text
http://localhost:5173
```

### Equivalent helper command for backend

If you are already in repo root, this does the same as `cd apps/server && mvn spring-boot:run`:

```bash
npm run server:dev
```

### Full startup sequence

Terminal 1:

```bash
cd ~/BodegaDK/infra
docker-compose up -d db
```

Terminal 2:

```bash
cd ~/BodegaDK/apps/server
mvn spring-boot:run
```

Terminal 3:

```bash
cd ~/BodegaDK
npm run web:dev
```

### Notes

- Frontend can load even if backend is down.
- Lobby creation/joining only works when backend and database are running.
- Lobby actions require a logged-in Supabase user.

## Deploy Scripts

From repo root on the server:

```bash
npm run deploy:main
# or
npm run deploy:dev
```

What these do:

- `deploy:main`: fetch, checkout `main`, pull, then deploy.
- `deploy:dev`: fetch, checkout `dev`, pull, then deploy.
- `deploy:update`: install deps, build web, then run `docker-compose up -d --build` from `infra/`.
