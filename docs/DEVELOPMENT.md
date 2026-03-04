# BodegaDK -- Development Guide

Denne guide forklarer hvordan du kører og udvikler på projektet lokalt.

Se også:

-   `docs/WEB_CLIENT_GAME_ROOM.md` for detaljer om game-room client layer.

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

## 4) Kør Game Room (ny client layer)

Game room læses fra URL query params:

-   `view=room`
-   `game=snyd`
-   `room=ABC123`
-   `token=player-token`

Eksempel:

``` text
http://localhost:5173/?view=room&game=snyd&room=ABC123&token=p1
```

### Mock mode (indtil rigtig server-logic findes)

Tilføj `mock=1` for lokal simulation af server updates:

``` text
http://localhost:5173/?view=room&game=snyd&room=ABC123&token=p1&mock=1
```

For at teste public/private split med 2 clients:

1.  Åbn tab A med `token=p1`
2.  Åbn tab B med `token=p2`
3.  Brug samme `room` i begge tabs

I mock mode:

-   public updates broadcastes til alle tabs i samme room
-   private updates sendes kun til relevant playerId

### Open game fra UI

Når du klikker "Open" på Snyd-kortet:

-   client navigerer til `view=room`
-   sætter default `room=ABC123` hvis mangler
-   genererer token hvis mangler
-   kører i `mock=1` som default

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
