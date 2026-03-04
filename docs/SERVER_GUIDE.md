# BodegaDK Server Guide (Debian)

This guide sets up and deploys BodegaDK on a Debian server (example IP: `130.225.170.77`) using `main` or `dev`.

## 1) Connect to server

```bash
ssh <user>@130.225.170.77
```

## 2) Install prerequisites

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg lsb-release git nodejs npm docker.io docker-compose
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
```

Log out and back in (or run `newgrp docker`) so Docker group membership is active.

## 3) Verify tooling

```bash
git --version
npm --version
docker --version
docker-compose --version
```

## 4) Clone repository

```bash
git clone https://github.com/CheatInNeed/BodegaDK.git
cd BodegaDK
git fetch
```

## 5) Install dependencies and build web

If lockfile is missing, use `npm install` (not `npm ci`):

```bash
npm install
npm run web:build
```

## 6) Start full stack (nginx + server + postgres)

```bash
cd infra
docker-compose up -d --build
```

## 7) Verify deployment

```bash
docker-compose ps
curl -i http://localhost/api/health
```

Open in browser:

- `http://130.225.170.77`

## Update/Deploy flow

From repo root:

```bash
npm run deploy:main
# or
npm run deploy:dev
```

`deploy:main` performs:

1. `git fetch`
2. `git checkout main`
3. `git pull`
4. `npm run deploy:update`

`deploy:dev` performs:

1. `git fetch`
2. `git checkout dev`
3. `git pull`
4. `npm run deploy:update`

`deploy:update` performs:

1. `npm install`
2. `npm run web:build`
3. `docker-compose up -d --build` (from `infra/`)

## Troubleshooting

### `git: command not found` or `npm: command not found`

Install missing packages from step 2.

### `docker-compose` permission denied (`/var/run/docker.sock`)

```bash
sudo usermod -aG docker $USER
newgrp docker
docker ps
```

Then retry:

```bash
cd ~/BodegaDK/infra
docker-compose up -d --build
```

### `npm ci` fails with lockfile error

Use:

```bash
npm install
```

### `Missing script: web:build`

Check available scripts:

```bash
npm run
```

If needed, build web directly:

```bash
cd apps/web
npm install
npx tsc
```

### Spring build error: `Unable to find main class`

Usually branch mismatch or stale state. Check:

```bash
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
find apps/server/src -type f | head
```

Then rebuild server image without cache:

```bash
cd infra
docker-compose build --no-cache server
docker-compose up -d --build
```
