# Web image: compiled client + nginx config baked in, so a deploy never depends
# on files checked out on the host. Build from the repository root:
#   docker build -f apps/web/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /repo

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
RUN npm ci

COPY scripts/ scripts/
COPY apps/web/ apps/web/

# Optional overrides; scripts/run-local-env.mjs falls back to the public
# Supabase defaults when these are empty.
ARG PUBLIC_SUPABASE_URL=""
ARG PUBLIC_SUPABASE_ANON_KEY=""
RUN [ -n "$PUBLIC_SUPABASE_URL" ] || unset PUBLIC_SUPABASE_URL; \
    [ -n "$PUBLIC_SUPABASE_ANON_KEY" ] || unset PUBLIC_SUPABASE_ANON_KEY; \
    npm run web:build

FROM nginx:alpine
LABEL org.opencontainers.image.source=https://github.com/CheatInNeed/BodegaDK
COPY infra/nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/public /usr/share/nginx/html
