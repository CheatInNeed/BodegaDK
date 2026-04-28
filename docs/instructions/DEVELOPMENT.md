# BodegaDK -- Development Guide

Denne guide forklarer hvordan du kører og udvikler på projektet lokalt.

Se også:

-   `docs/design/WEB_CLIENT_GAME_ROOM.md` for detaljer om game-room client layer.
-   `docs/instructions/SUPABASE.md` for Supabase migrations, secrets, and web auth/profile config.

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

Hvis du vil have Supabase auth/profile features lokalt, sæt også:

``` bash
export PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
export PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
```

Du kan også lægge dem i en lokal fil i repo root:

``` bash
cp .env.local.example .env.local
```

`npm run web:config`, `npm run web:build`, `npm run web:watch`,
`npm run web:serve` og `npm run local:dev` læser nu automatisk fra
`.env.local` eller `.env`, hvis shell env vars ikke allerede er sat.

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

### Fast iteration (anbefalet uden Docker)

Kør i to terminaler fra repo root:

``` bash
# terminal A: compile TypeScript on changes
npm run web:watch

# terminal B: serve web on 5173
npm run web:dev
```

Web URL:

- http://localhost:5173

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

### Server local profile (ingen DB, hurtig debug)

Fra repo root:

``` bash
npm run server:local
```

Det kører Spring med profile `local`:

- disable datasource auto-config
- port 8080

Brug denne når du vil teste HighCard hurtigt uden Postgres.

------------------------------------------------------------------------

## 2.1 Pure local mode (web 5173 + server 8080)

Mål: hurtig iteration på gameplay uden Docker.

### One command (anbefalet)

``` bash
npm run local:dev
```

Dette starter i samme terminal:

- server (`8080`) med `local` profile
- web TypeScript watch
- web static server (`5173`)
- `Ctrl+C` stopper alle processer

### Manuel (3 terminaler)

1. Start server:

``` bash
npm run server:local
```

2. Start web watch:

``` bash
npm run web:watch
```

3. Start web static server:

``` bash
npm run web:dev
```

4. Åbn:

- http://localhost:5173

I denne mode:

- REST kaldes mod `http://localhost:8080/rooms`
- WS kaldes mod `ws://localhost:8080/ws`

Hvis Supabase public config mangler, virker gameplay stadig, men login,
signup og avatar-flow bliver slået fra.

Hvis auth/profile skal virke i denne mode, så sørg for at
`PUBLIC_SUPABASE_URL` og `PUBLIC_SUPABASE_ANON_KEY` findes enten i shell
env eller i `.env.local` før du starter `npm run local:dev`.

------------------------------------------------------------------------

## 3) Kør Full Stack (prod-like via Docker)

Fra repo root:

``` bash
cd infra
docker compose up --build
```

Åbn: - http://localhost (nginx)

Bemærk om database:

- `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME` og
  `SPRING_DATASOURCE_PASSWORD` skal være sat i shell environment eller
  `.env.deploy`; ellers stopper Docker deployet med en konfigurationsfejl
- disse værdier skal pege på den canonical Supabase Postgres database
- database schema changes are not applied by the Spring backend; schema is
  managed only through `supabase/migrations/`
- `PUBLIC_SUPABASE_URL` og `PUBLIC_SUPABASE_ANON_KEY` påvirker kun web
  klientens auth/profile integration og ændrer ikke backendens datasource

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

### Tilføj et nyt spil til lobby og quick play

Når et nyt realtime-spil skal kunne bruges fra både lobby og quick play,
skal wiring være på plads i både backend, web og docs:

1. Backend game catalog
   Opdater `apps/server/src/main/java/dk/bodegadk/runtime/GameCatalogService.java`
   med korrekt `id`, `minPlayers`, `maxPlayers`, `strictCount`,
   `lobbyEnabled`, `quickPlayEnabled` og `realtimeSupported`.

2. Backend engine port
   Sørg for at spillet har en `GameLoopService.EnginePort`-adapter under
   `apps/server/src/main/java/dk/bodegadk/runtime/` med `@Component`, så
   WebSocket-loopet og matchmaking kan starte spillet rigtigt.

3. Lobby game switching
   `SELECT_GAME` wires centralt gennem lobby-koordinatoren. Et nyt spil
   skal derfor markeres korrekt i `GameCatalogService` med
   `lobbyEnabled=true`, men engine-adapteren skal ikke selv håndtere
   `SELECT_GAME` eller vedligeholde engine-specifikke allowlists.

4. Web game registration
   Registrer adapter/view i `apps/web/src/index.ts`, så spillet kan åbnes
   i room-view og indgå i quick play routing.

5. Quick play card aliases
   Hvis frontend bruger en UI-nøgle som `game.500`, så hold backendens
   game-normalisering i sync, så matchmaking accepterer både UI-alias og
   canonical game id.

6. Lobby presentation
   Tilføj spillet i `apps/web/src/app/lobby-view.ts` med thumbnail, seat
   bounds og preview metadata, og hold `playerBoundsForLobbyGame(...)` i
   `apps/web/src/index.ts` synkroniseret.

7. Strings og assets
   Læg brugerrettede tekster i `apps/web/src/i18n.ts` og brug eksisterende
   thumbnails i `apps/web/public/images/game-cards/`.

8. Tests og docs
   Tilføj mindst én backend test for matchmaking/start flow og opdater
   relevante docs, typisk `docs/design/PROTOCOL.md`,
   `docs/instructions/DEVELOPMENT.md` eller changelog/design docs.

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
