# BodegaDK

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
