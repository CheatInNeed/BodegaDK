#!/usr/bin/env bash
# Runs on the deploy host. The CD job in .github/workflows/ci.yml copies this
# script and infra/docker-compose.yml into ~/bodegadk-deploy/ and calls:
#
#   deploy.sh <image-tag>   pull that tag from GHCR and (re)start the stack
#   deploy.sh --rollback    restart the stack on the previously deployed tag
#
# Datasource secrets stay on the host in ./.env.deploy (same format as the
# repo-root .env.deploy). If GHCR_USER is set, a registry token is read from
# stdin for this pull only and logged out again on exit.
set -euo pipefail
cd "$(dirname "$0")"

if [ "${1:-}" = "--rollback" ]; then
  mode=rollback
  tag="$(cat .previous-tag 2>/dev/null || true)"
  [ -n "$tag" ] || { echo "deploy: no previous tag to roll back to" >&2; exit 1; }
else
  mode=deploy
  tag="${1:?usage: deploy.sh <image-tag> | --rollback}"
fi

set -a
. ./.env.deploy
set +a
export SUPABASE_JWT_ISSUER="${SUPABASE_JWT_ISSUER:-https://awdhzmyieafhfpjmzwsh.supabase.co/auth/v1}"
export IMAGE_TAG="$tag"
# Same project name as the original manual deploy from infra/, so the pipeline
# replaces those containers instead of clashing with them on port 80.
export COMPOSE_PROJECT_NAME=infra

if docker compose version >/dev/null 2>&1; then
  compose() { docker compose "$@"; }
else
  compose() { docker-compose "$@"; }
fi

if [ -n "${GHCR_USER:-}" ]; then
  docker login ghcr.io -u "$GHCR_USER" --password-stdin
  trap 'docker logout ghcr.io >/dev/null' EXIT
fi

echo "deploy: $mode -> $tag"
compose pull
compose up -d

current="$(cat .current-tag 2>/dev/null || true)"
if [ "$mode" = deploy ] && [ -n "$current" ] && [ "$current" != "$tag" ]; then
  echo "$current" > .previous-tag
fi
echo "$tag" > .current-tag

# Keep only the running and the rollback images; each deploy adds ~400 MB.
previous="$(cat .previous-tag 2>/dev/null || true)"
docker images --format '{{.Repository}}:{{.Tag}}' \
  | grep '^ghcr.io/cheatinneed/bodegadk-' \
  | grep -v -e ":${tag}\$" ${previous:+-e ":${previous}\$"} \
  | xargs -r docker rmi >/dev/null || true
docker image prune -f >/dev/null
