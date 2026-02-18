# BodegaDK -- Development Guide

Denne guide forklarer hvordan du kører og udvikler på projektet lokalt.

------------------------------------------------------------------------

## Forudsætninger

Installer følgende:

-   Node.js (LTS) + npm
-   Java 21
-   Maven
-   Docker + Docker Compose (til full-stack / prod-like setup)

------------------------------------------------------------------------

## Repo struktur (kort)

-   `apps/web` = browser client (TypeScript + HTML/CSS)
-   `apps/server` = backend (Spring Boot + Maven)
-   `infra` = docker-compose + nginx + db
-   `packages/protocol` = REST/WS kontrakt (payload-formater)
-   `docs` = dokumentation

------------------------------------------------------------------------

## 1) Kør Web (dev)

### Install

Fra repo root:

``` bash
npm install
```

### Start web

``` bash
npm run web:dev
```

Web server kører som standard på: - http://localhost:5173

### Web build output (vigtigt)

Web bygges med `tsc` og output havner i:

-   `apps/web/public/dist/`

Det betyder at `apps/web/public/index.html` loader: - `/dist/index.js`

Hvis `/dist/index.js` giver 404, så check: - `apps/web/tsconfig.json`
har `"outDir": "public/dist"`

------------------------------------------------------------------------

## 2) Kør Server (dev)

> Kræver at `apps/server` har en Spring Boot app (min.
> `BodegaServerApplication.java` og `application.yml`)

``` bash
cd apps/server
mvn spring-boot:run
```

Server kører på: - http://localhost:8080

Test endpoint (når tilføjet): - http://localhost:8080/health

------------------------------------------------------------------------

## 3) Kør Full Stack (prod-like via Docker)

Fra repo root:

``` bash
cd infra
docker compose up --build
```

Åbn: - http://localhost (nginx)

Nginx: - serverer web (static) - proxyer `/api/*` til backend - proxyer
`/ws` til backend (WebSocket)

------------------------------------------------------------------------

## Ports

-   Web (dev): 5173
-   Nginx (docker): 80
-   Server (dev/docker): 8080
-   Postgres (docker): 5432

------------------------------------------------------------------------

## Arbejdsgang (vigtig)

-   Client sender kun *intent* (actions), fx "PLAY_CARDS"
-   Server validerer ALT:
    -   tur, regler, ejerskab, RNG, resolution
-   Client viser kun:
    -   public state
    -   private state for current user

------------------------------------------------------------------------

## Fejlfinding

### "tsc: command not found"

Kør:

``` bash
npm install -w apps/web -D typescript
```

### "Cannot find /dist/index.js"

Check `apps/web/tsconfig.json`:

-   `"outDir": "public/dist"`

og at du har kørt:

``` bash
npm run web:build
```

------------------------------------------------------------------------
