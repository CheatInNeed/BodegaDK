# BodegaDK Server Guide (Debian)

Last updated: 2026-03-11

This guide deploys BodegaDK on a Debian host with Docker, nginx, server, and postgres.

## 1) Connect to server

```bash
ssh <user>@<server-ip>
```

## 2) Install prerequisites

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg lsb-release git nodejs npm docker.io docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
```

Log out/in again (or run `newgrp docker`) so Docker group membership applies.

## 3) Verify tooling

```bash
git --version
npm --version
docker --version
docker compose version
```

## 4) Clone repository

```bash
git clone https://github.com/CheatInNeed/BodegaDK.git
cd BodegaDK
git fetch --all --prune
```

## 5) Choose branch to deploy

Do this before deploying. HighCard availability depends on branch content.

```bash
git checkout <branch>
git pull --ff-only
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
```

If you need HighCard from current integration work, deploy the branch that contains it (for example `server-v0.1` if that is where it lives), not automatically `main` or `dev`.

## 6) Deploy full stack

From repo root:

```bash
npm run deploy:update
```

`deploy:update` performs:
1. `npm install`
2. `npm run web:build`
3. `cd infra && (docker compose up -d --build || docker-compose up -d --build)`

## 7) Verify deployment

```bash
cd infra
docker compose ps
curl -i http://localhost/api/health
```

Expected health response:
- HTTP `200`
- body includes `{"status":"ok"}`.

## 8) Verify HighCard API readiness

Create a room:

```bash
curl -sS -X POST http://localhost/api/rooms \
  -H 'Content-Type: application/json' \
  -d '{"gameType":"highcard"}'
```

Expected:

```json
{"roomCode":"ABC123"}
```

Join a room:

```bash
curl -sS -X POST http://localhost/api/rooms/<ROOM_CODE>/join \
  -H 'Authorization: Bearer <supabase-access-token>' \
  -H 'Content-Type: application/json' \
  -d '{"username":"Alice"}'
```

Expected:

```json
{"ok":true}
```

## 9) Open browser and test gameplay

Open:
- `http://<server-ip>`

Then:
1. Go to Play.
2. Open `Single Card Highest Wins`.
3. Verify room starts and gameplay proceeds (score + higher/lower feedback updates).

## Update flows

### Deploy current checked-out branch

```bash
git fetch --all --prune
git checkout <branch>
git pull --ff-only
npm run deploy:update
```

### Deploy main or dev using scripts

```bash
npm run deploy:main
# or
npm run deploy:dev
```

Note: these scripts switch branches before deploy, so they can deploy code that differs from your current integration branch.

## Troubleshooting

### `docker: command not found`

Install Docker (`docker.io`) and relogin.

### `docker compose` not found

Install `docker-compose-plugin`.

### `permission denied /var/run/docker.sock`

```bash
sudo usermod -aG docker "$USER"
newgrp docker
docker ps
```

### HighCard not available after deploy

Check deployed branch and commit:

```bash
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
```

Then redeploy from the branch that contains HighCard integration.

### Build error during server image build

Rebuild without cache:

```bash
cd infra
docker compose build --no-cache server
docker compose up -d --build
```
