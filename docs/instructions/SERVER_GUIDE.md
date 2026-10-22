# BodegaDK Server Guide (Debian)

Last updated: 2026-10-06

This guide deploys BodegaDK on a Debian host with Docker, nginx, the Spring
server, and the canonical Supabase Postgres database.

## Automatic Deploys (CD)

There are two environments, each on its own host with its own Supabase
project. Both are deployed by `.github/workflows/ci.yml`.

| | dev (test) | production |
| --- | --- | --- |
| Branch | `dev` | `master` |
| Host | http://130.225.170.77 | http://130.225.170.69 |
| Supabase project | `awdhzmyieafhfpjmzwsh` | `glcpevubpmjetewddvil` |
| Deploy | automatic on merge | after a reviewer approves the job |
| GitHub environment | `dev` | `production` |

Pull requests only run the checks; nothing is deployed until the change is
merged.

```text
PR -> Web (TypeScript) + Server (Spring Boot) + Docker build   (required checks)
merge to dev or master -> same checks on the merge commit
  -> push bodegadk-server and bodegadk-web images to ghcr.io (tag = short SHA)
  -> deploy job (master: waits for "Review deployments" -> Approve)
       -> Supabase migrations against that environment's project
       -> copy compose file + infra/deploy/deploy.sh to the host over SSH,
          pull that tag, restart the containers
       -> smoke test: GET /api/health must report the new SHA as "version"
       -> on failure: roll back to the previously deployed tag
```

The hosts build nothing; they only pull images that CI built and tested.
Deploy runs are listed per environment in the repository's Deployments view.

### Releasing to production

1. Open a pull request with base `master` and compare `dev`.
2. Merge it with **Create a merge commit** (not squash or rebase, which make
   the two branches diverge).
3. Open the run under Actions; when the deploy job is waiting, click
   **Review deployments**, tick `production` and **Approve and deploy**.

Migrations run right after the approval, before the new containers start. A
migration that is not backwards compatible therefore needs a short window
where the old server runs against the new schema.

### Where the settings live

- `infra/deploy/environments/<env>.env`: public values per environment (host,
  Supabase URL and publishable key). The web image is built with these, so
  each environment gets its own web image.
- GitHub secrets: `DEPLOY_SSH_KEY`, `SUPABASE_ACCESS_TOKEN`,
  `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`. Production has its own set
  as **environment secrets** on `production`; dev uses the repository-level
  secrets with the same names.
- `~/bodegadk-deploy/.env.deploy` on each host: `SPRING_DATASOURCE_*` for
  that environment's Supabase project (and optionally `BODEGADK_VAPID_*`,
  `COMPOSE_PROFILES=monitoring`). It never leaves the host. On production it
  must also set `SUPABASE_JWT_ISSUER`, because `deploy.sh` otherwise falls
  back to the dev project's issuer and every login would be rejected.
- `infra/deploy/known_hosts`: pinned SSH host key of both hosts; update it if
  a server is reinstalled.

### One-time setup of a host

```bash
sudo apt update && sudo apt install -y docker.io docker-compose curl
sudo usermod -aG docker "$USER"
sudo ufw allow 80/tcp
mkdir -p ~/bodegadk-deploy && chmod 700 ~/bodegadk-deploy
```

Create `~/bodegadk-deploy/.env.deploy` (mode `600`):

```bash
export SPRING_DATASOURCE_URL='jdbc:postgresql://<session-pooler-host>:5432/postgres?sslmode=require'
export SPRING_DATASOURCE_USERNAME='postgres.<project-ref>'
export SPRING_DATASOURCE_PASSWORD='<database-password>'
export SUPABASE_JWT_ISSUER='https://<project-ref>.supabase.co/auth/v1'
```

Each host has its own deploy key pair: the public key goes into
`~/.ssh/authorized_keys` on the host, the private key into `DEPLOY_SSH_KEY`
for that environment.

The `production` GitHub environment has **Required reviewers** enabled and is
restricted to the `master` branch.

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

### CD Deploy Fails At "Apply Supabase migrations"

Nothing has been deployed yet at this point.

- `Missing required secret`: the secret is not set for that environment.
- `403` / `Unauthorized` from `supabase link`: `SUPABASE_ACCESS_TOKEN` cannot
  access that project (wrong organization, missing permission, or expired).
- A SQL error: fix the migration in a new pull request. Migrations that
  already succeeded stay applied; `supabase db push` continues from there.

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
