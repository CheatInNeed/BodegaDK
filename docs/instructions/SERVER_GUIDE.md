# BodegaDK Server Guide (Debian)

Last updated: 2026-09-30

This guide deploys BodegaDK on a Debian host with Docker, nginx, the Spring
server, and the canonical Supabase Postgres database.

## Automatic Deploys (CD)

Every merge into `dev` is deployed automatically by
`.github/workflows/ci.yml`. Pull requests only run the checks; nothing is
deployed until the change is merged.

```text
PR -> Web (TypeScript) + Server (Spring Boot) + Docker build   (required checks)
merge to dev -> same checks on the merge commit
  -> push bodegadk-server and bodegadk-web images to ghcr.io (tag = short SHA)
  -> Supabase migrations (supabase db push)
  -> deploy: copy compose file + infra/deploy/deploy.sh to the host over SSH,
     pull that tag, restart the containers
  -> smoke test: GET /api/health must report the new SHA as "version"
  -> on failure: roll back to the previously deployed tag
```

The host builds nothing; it only pulls images that CI built and tested.
Deploy runs are listed under the `dev` environment in the repository's
Deployments view.

### One-time setup

On the host (`~/bodegadk-deploy/` is the deploy directory):

```bash
mkdir -p ~/bodegadk-deploy
cp -p ~/BodegaDK/.env.deploy ~/bodegadk-deploy/.env.deploy
```

`.env.deploy` holds `SPRING_DATASOURCE_*` (and optionally
`SUPABASE_JWT_ISSUER` and `BODEGADK_VAPID_*`). It never leaves the host.

A dedicated deploy key pair: the public key goes into
`~/.ssh/authorized_keys` on the host, the private key into the GitHub
repository secret `DEPLOY_SSH_KEY`. The host key is pinned in
`infra/deploy/known_hosts`; update it if the server is reinstalled.

The Supabase secrets (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`,
`SUPABASE_DB_PASSWORD`) are shared with `supabase-migrations.yml`.

### Deploying a specific version or rolling back by hand

```bash
bash ~/bodegadk-deploy/deploy.sh <short-sha>
bash ~/bodegadk-deploy/deploy.sh --rollback
```

Public images need no login. If the GHCR packages are private, run
`docker login ghcr.io` with a token that has `read:packages` first.

## Manual Setup And Fallback Deploy

The steps below set up a host from scratch and build the images on the host
itself. Use them for a new server or when GitHub Actions is unavailable.

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
PUBLIC_SUPABASE_URL="https://<project-ref>.supabase.co"
PUBLIC_SUPABASE_ANON_KEY="..."
```

`SUPABASE_JWT_ISSUER` is optional for the default BodegaDK Supabase project
because `npm run deploy:update` supplies
`https://awdhzmyieafhfpjmzwsh.supabase.co/auth/v1`. Set it explicitly when
deploying against a different Supabase project.

Important:

- `SPRING_DATASOURCE_*` must point at the canonical Supabase Postgres database.
- `SUPABASE_JWT_ISSUER` must match the Supabase project that issues browser
  access tokens.
- The Spring backend does not apply app schema migrations.
- App schema migrations live in `supabase/migrations/`.
- There is no deploy fallback database; missing datasource settings should stop
  deployment instead of silently switching persistence models.

## 7. Deploy Full Stack

From repo root:

```bash
npm run deploy:update
```

`deploy:update` builds both images on the host with
`infra/docker-compose.build.yml` and starts them:

- `cd infra && docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build`
  (falls back to `docker-compose`)

The images are tagged `local`, so `/api/health` reports `"version":"local"`.

## 8. Verify Deployment

```bash
cd infra
docker compose ps
curl -i http://localhost/api/health
```

Expected health response:

- HTTP `200`
- body includes `"status":"ok"` and `"version"` (the deployed short SHA, or
  `local` for a host build)

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

Install `docker-compose-plugin`. The current host only has the standalone
`docker-compose` v1; `deploy.sh` and `deploy:update` fall back to it.

### CD Deploy Fails At "Copy deploy files" Or "Pull and restart containers"

- `Permission denied (publickey)`: `DEPLOY_SSH_KEY` does not match a key in
  the host's `~/.ssh/authorized_keys`.
- `Host key verification failed`: the server was reinstalled; refresh
  `infra/deploy/known_hosts` with `ssh-keyscan -t ed25519 <server-ip>`.
- `No such file or directory` for `bodegadk-deploy`: run the one-time setup.

### CD Smoke Test Fails

The job rolls back automatically. Inspect the failed version on the host:

```bash
docker logs infra_server_1 --tail 100
```

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
docker compose -f docker-compose.yml -f docker-compose.build.yml build --no-cache server
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d
```
