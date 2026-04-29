# BodegaDK Server Guide (Debian)

Last updated: 2026-04-29

This guide deploys BodegaDK on a Debian host with Docker, nginx, the Spring
server, and the canonical Supabase Postgres database.

## 1. Connect To Server

```bash
ssh <user>@<server-ip>
```

## 2. Install Prerequisites

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg lsb-release git nodejs npm docker.io docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
```

Log out/in again, or run `newgrp docker`, so Docker group membership applies.

## 3. Verify Tooling

```bash
git --version
npm --version
docker --version
docker compose version
```

## 4. Clone Repository

```bash
git clone https://github.com/CheatInNeed/BodegaDK.git
cd BodegaDK
git fetch --all --prune
```

## 5. Choose Branch To Deploy

```bash
git checkout <branch>
git pull --ff-only
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
```

Deploy from the branch that contains the compatible Supabase migrations,
backend, and frontend for the target environment.

## 6. Configure Environment

Create `.env.deploy` in the repo root, or export these values in the shell
before deploying:

```bash
SPRING_DATASOURCE_URL="jdbc:postgresql://..."
SPRING_DATASOURCE_USERNAME="..."
SPRING_DATASOURCE_PASSWORD="..."
SUPABASE_JWT_ISSUER="https://<project-ref>.supabase.co/auth/v1"
PUBLIC_SUPABASE_URL="https://<project-ref>.supabase.co"
PUBLIC_SUPABASE_ANON_KEY="..."
```

Important:

- `SPRING_DATASOURCE_*` must point at the canonical Supabase Postgres database.
- The Spring backend does not apply app schema migrations.
- App schema migrations live in `supabase/migrations/`.
- There is no deploy fallback database; missing datasource settings should stop
  deployment instead of silently switching persistence models.

## 7. Deploy Full Stack

From repo root:

```bash
npm run deploy:update
```

`deploy:update` performs:

- `npm install`
- `npm run web:build`
- `cd infra && (docker compose up -d --build || docker-compose up -d --build)`

## 8. Verify Deployment

```bash
cd infra
docker compose ps
curl -i http://localhost/api/health
```

Expected health response:

- HTTP `200`
- body includes `{"status":"ok"}`

Authenticated APIs require a Supabase access token:

```bash
curl -i http://localhost/api/rooms \
  -H 'Authorization: Bearer <supabase-access-token>'
```

## 9. Browser Smoke Test

Open:

- `http://<server-ip>`

Recommended smoke paths:

- Sign in or sign up.
- Open Play and verify quick play/lobby navigation still works.
- Open Profile and verify profile, friends, and challenge surfaces load.
- Open the notification dropdown and verify read state updates.
- Open Leaderboard and verify it loads authenticated server data.

## Update Flows

### Deploy Current Checked-Out Branch

```bash
git fetch --all --prune
git checkout <branch>
git pull --ff-only
npm run deploy:update
```

### Deploy Main Or Dev Using Scripts

```bash
npm run deploy:main
# or
npm run deploy:dev
```

These scripts switch branches before deploy, so they can deploy code that
differs from your current integration branch.

## Troubleshooting

### `docker: command not found`

Install Docker and relogin.

### `docker compose` not found

Install `docker-compose-plugin`.

### `permission denied /var/run/docker.sock`

```bash
sudo usermod -aG docker "$USER"
newgrp docker
docker ps
```

### Server Fails With Datasource Configuration Error

Confirm `.env.deploy` or shell environment contains:

```bash
SPRING_DATASOURCE_URL
SPRING_DATASOURCE_USERNAME
SPRING_DATASOURCE_PASSWORD
```

### Authenticated Requests Return `401`

Check:

- The browser public Supabase config points at the same project as the backend.
- `SUPABASE_JWT_ISSUER` matches the Supabase project issuer.
- The request includes `Authorization: Bearer <supabase-access-token>`.

### Build Error During Server Image Build

Rebuild without cache:

```bash
cd infra
docker compose build --no-cache server
docker compose up -d --build
```
