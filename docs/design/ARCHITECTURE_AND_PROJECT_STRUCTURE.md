# BodegaDK -- Full Stack Architecture & Project Structure

## Overview

This document describes the current architecture, repository structure, and
deployment model for the BodegaDK web-based game platform.

Related implementation docs:

- `docs/design/WEB_CLIENT_GAME_ROOM.md`
- `docs/design/ROOM_AND_MATCHMAKING_ARCHITECTURE.md`
- `docs/design/PROTOCOL.md`
- `docs/contracts/gameroom_ui_contract.md`

Platform goals:

- Server-authoritative game logic
- Authenticated TypeScript browser client
- REST for setup, profile, social, and notification flows
- WebSocket for realtime gameplay
- Supabase Postgres as the canonical durable database
- Docker/nginx deployment on a VM
- Support for multiple games and social multiplayer features

## 1. Core Architecture Principles

### 1.1 Server Is Authoritative

The server controls:

- Deck shuffling
- Card dealing
- Turn order
- Rule validation
- Challenge and claim resolution
- Room lifecycle transitions
- Matchmaking decisions
- Win detection and final result writes

The client must not:

- Validate game rules as authority
- Decide turns
- Shuffle cards
- Determine winners
- Write durable match results directly

The client is responsible for:

- Rendering UI
- Sending player intents
- Displaying public state
- Displaying private state only for the current player
- Calling authenticated REST APIs for profile, social, and lobby setup

## 2. Communication Model

### 2.1 REST

REST is used for:

- Health checks
- Room creation, listing, joining, leaving, kicking, and metadata
- Quick-play matchmaking queue and ticket polling
- Profile match history and per-game stats
- Leaderboard reads
- Friends list and friend request lifecycle
- Direct challenges
- Notification list/read lifecycle

Representative backend paths:

- `GET /health`
- `GET /rooms`
- `POST /rooms`
- `POST /rooms/{roomCode}/join`
- `POST /rooms/{roomCode}/kick`
- `POST /rooms/{roomCode}/leave`
- `POST /matchmaking/queue`
- `GET /matchmaking/tickets/{id}`
- `POST /matchmaking/tickets/{id}/cancel`
- `GET /me/matches`
- `GET /me/stats`
- `GET /leaderboard`
- `GET /friends`
- `GET /friends/requests`
- `POST /friends/request`
- `POST /friends/{id}/accept`
- `POST /friends/{id}/decline`
- `DELETE /friends/{id}`
- `POST /challenges`
- `POST /challenges/{id}/accept`
- `POST /challenges/{id}/decline`
- `POST /challenges/{id}/cancel`
- `GET /notifications`
- `POST /notifications/{id}/read`
- `POST /notifications/read-all`

Nginx exposes these through `/api/*` and strips the `/api` prefix before
forwarding to Spring.

### 2.2 WebSocket

Single endpoint:

- `/ws`

Flow:

1. Client connects with room code and Supabase access token.
2. Server validates the token and checks persisted room membership.
3. Server sends `STATE_SNAPSHOT`.
4. Client sends game or lobby intents.
5. Server validates and updates authoritative state.
6. Server broadcasts `PUBLIC_UPDATE`.
7. Server sends `PRIVATE_UPDATE` per user where needed.
8. When a win condition is met, server emits `GAME_FINISHED` and writes
   durable match/stat/leaderboard results.

## 3. Repository Structure

```text
BodegaDK/
  apps/
    web/
    server/
  infra/
  scripts/
  supabase/
    migrations/
  docs/
```

## 4. `apps/web` -- Browser Client

```text
apps/web/
  public/
    index.html
    styles.css
  src/
    index.ts
    i18n.ts
    app/
      router.ts
    game-room/
      types.ts
      store.ts
      session.ts
      view.ts
      transport/
        ws-client.ts
    games/
      snyd/
      casino/
      highcard/
      krig/
      fem/
    net/
      api.ts
      protocol.ts
      mock-server.ts
    leaderboard.ts
    profile.ts
  package.json
  tsconfig.json
  vite.config.ts
  Dockerfile
```

Responsibilities:

- UI rendering
- Pathname and query-param app routing
- Auth/profile integration through public Supabase config
- REST API calls
- WebSocket connection lifecycle
- Local UI state management
- Game-room session lifecycle
- Public/private state rendering through per-game adapters
- Quick-play queue polling
- Lobby versus in-game view switching
- Profile, leaderboard, friends, challenges, and notification surfaces

### 4.1 Game Room Client Layer

Implemented client game-room flow:

1. URL bootstrap: `?view=room&game=...&room=...`
2. Session opens `/ws` or local mock transport.
3. Session sends `CONNECT` with Supabase `accessToken`.
4. Store receives `STATE_SNAPSHOT`, `PUBLIC_UPDATE`, `PRIVATE_UPDATE`,
   `ERROR`, and `GAME_FINISHED`.
5. Adapter maps protocol state to a game-specific UI view model.
6. UI renders the shared room frame, table surface, seats, center board, and
   private controls.
7. UI intents map to protocol messages for the selected game.

UI-side source of truth for active live card rooms:

- `docs/contracts/gameroom_ui_contract.md`

## 5. `apps/server` -- Spring Boot Backend

```text
apps/server/
  src/main/java/dk/bodegadk/
    auth/
    config/
    rest/
    runtime/
    ws/
    domain/
      games/
      rooms/
  src/test/java/
  pom.xml
  Dockerfile
```

REST layer responsibilities:

- Health checks
- Authenticated room and matchmaking endpoints
- Profile history and stats reads
- Leaderboard reads
- Friends, challenges, and notification endpoints

WebSocket layer responsibilities:

- Authenticated connection
- Persisted room membership verification
- Routing game/lobby messages to the runtime
- Broadcasting public and private updates

Domain/runtime responsibilities:

- Game engines and port adapters
- Lobby coordination
- Matchmaking service
- In-memory active engine state
- JDBC stores for durable metadata and social/history projections

Persistence split:

- Durable app data is stored in canonical Supabase Postgres.
- Schema changes are managed only through `supabase/migrations/`.
- Spring writes trusted state through JDBC stores.
- WebSocket bindings and active engine snapshots still live in memory.

## 6. `infra` -- Deployment

```text
infra/
  docker-compose.yml
  nginx/
    nginx.conf
```

Services:

- `nginx`: static web assets plus reverse proxy
- `server`: Spring Boot backend

Database ownership and migration strategy:

- `docs/decisions/0001-canonical-database-and-migrations.md`

Nginx proxies:

- `/api/*` to Spring backend paths without `/api`
- `/ws` to Spring with WebSocket upgrade headers

## 7. Deployment Model

Production shape:

```text
Browser -> Nginx -> Spring Boot Server -> Supabase Postgres
```

The web and server services run inside Docker containers on a VM. The database
is the canonical Supabase Postgres project and is not replaced by a local
deploy fallback.

Required backend environment:

- `SPRING_DATASOURCE_URL`
- `SPRING_DATASOURCE_USERNAME`
- `SPRING_DATASOURCE_PASSWORD`
- `SUPABASE_JWT_ISSUER`

Required public web environment:

- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_ANON_KEY`

## 8. Scalability Strategy

Possible future improvements:

- Redis or another shared runtime store for distributed active room state
- Horizontal scaling of backend instances
- Load balancing via reverse proxy
- Dedicated matchmaking service
- Metrics and monitoring
- Durable active-game snapshot recovery

## 9. Summary

This structure keeps BodegaDK split cleanly between a rendering-focused
browser client, an authoritative Spring runtime, and a canonical Supabase
database. REST handles setup/profile/social surfaces, WebSocket handles live
gameplay, and docs/protocol files remain the contract glue between them.
