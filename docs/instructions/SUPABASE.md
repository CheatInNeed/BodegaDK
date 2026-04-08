# Supabase Migration Workflow

This project uses Supabase as a side persistence service for:

- email/password authentication
- signup metadata
- avatar storage in `public.avatars`

Supabase is **not** the authoritative backend for game rules, lobby flow,
or real-time gameplay. Those stay in the Spring Boot server.

## Source of truth

From this point forward:

- database schema changes belong in `supabase/migrations/`
- GitHub Actions applies migrations to the hosted Supabase project
- manual dashboard schema edits are discouraged and should be avoided

## Required GitHub secrets

Set these repository secrets in GitHub:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_REF`
- `SUPABASE_DB_PASSWORD`

These are used by `.github/workflows/supabase-migrations.yml`.

## Shared database branch policy

This repository currently uses one hosted Supabase database for both
`dev` and `master`.

Required workflow:

1. Create new migrations on `dev`
2. Let `dev` deploy them first
3. Merge/sync those migrations into `master`
4. Let `master` deploy only after its migration history matches `dev`

The GitHub workflow enforces this by blocking `master` if `dev` already
contains migrations that `master` does not.

## One-time bootstrap from the existing hosted project

The current hosted Supabase database was created outside this repo, so the
first migration should be captured from the live project instead of
recreated by hand.

From repo root:

```bash
npm run supabase:login
SUPABASE_PROJECT_REF=<your-project-ref> npm run supabase:link
npm run supabase:pull
```

That generates the baseline SQL migration under `supabase/migrations/`.

Review the result before committing, especially:

- `public.avatars`
- RLS policies and grants needed by the web client
- any app-owned SQL functions, triggers, or indexes

## Ongoing migration workflow

Create a new migration:

```bash
npm run supabase:migration:new -- add_avatar_constraints
```

Preview the deploy:

```bash
npm run supabase:push:dry-run
```

Apply locally against the linked hosted project:

```bash
npm run supabase:push
```

Then commit the new SQL file and merge to `dev`.

## Frontend runtime config

The web client no longer hardcodes the Supabase URL and anon key in
TypeScript.

Public browser config is generated into:

- `apps/web/public/app-config.js`

The generation script reads:

- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_ANON_KEY`

Examples:

```bash
export PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
export PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
npm run web:build
```

These values are public browser config, not private server secrets.

If either value is missing:

- the web app still builds
- gameplay/lobby UI still works
- Supabase auth/profile features are disabled

## Files involved

- `supabase/config.toml`
- `supabase/migrations/`
- `.github/workflows/supabase-migrations.yml`
- `apps/web/src/supabase.ts`
- `scripts/write-public-config.mjs`
