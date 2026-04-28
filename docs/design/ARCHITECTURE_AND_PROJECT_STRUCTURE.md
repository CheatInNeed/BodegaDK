# BodegaDK -- Full Stack Architecture & Project Structure

## Overview

This document describes the architecture, repository structure, and
deployment model for the BodegaDK web-based game platform.

Detaljer om den konkrete web game-room implementation findes i:

-   `docs/design/WEB_CLIENT_GAME_ROOM.md`
-   `docs/design/ROOM_AND_MATCHMAKING_ARCHITECTURE.md`
-   `docs/contracts/gameroom_ui_contract.md`

Platform goals:

-   Server-authoritative game logic
-   Web-based TypeScript client
-   REST for lobby/setup
-   WebSocket for realtime gameplay
-   Docker-based deployment on a VM
-   Support for multiple games (Snyd, 500, dice games, etc.)

------------------------------------------------------------------------

# 1. Core Architecture Principles

## 1.1 Server is Authoritative

The server controls:

-   Deck shuffling
-   Card dealing
-   Turn order
-   Rule validation
-   Challenge resolution
-   Win detection
-   Final game results

The client MUST NOT:

-   Validate rules
-   Decide turns
-   Shuffle cards
-   Determine winners

The client is strictly responsible for:

-   Rendering UI
-   Sending player input
-   Displaying public state
-   Displaying private state (only for the current player)

------------------------------------------------------------------------

# 2. Communication Model

## 2.1 REST (Lobby / Setup)

Used for:

-   Authentication
-   Create room
-   Join room
-   Matchmaking queue
-   Fetch room metadata
-   Fetch user info
-   Game history

Example endpoints:

-   POST /auth/login
-   POST /rooms
-   POST /rooms/{id}/join
-   GET /rooms/{id}

------------------------------------------------------------------------

## 2.2 WebSocket (Realtime Gameplay)

Single endpoint:

-   /ws

Flow:

1.  Client connects with (roomId + token)
2.  Server authenticates connection
3.  Server sends STATE_SNAPSHOT
4.  Client sends game actions
5.  Server validates + updates state
6.  Server broadcasts PUBLIC_UPDATE
7.  Server sends PRIVATE_UPDATE (per user)
8.  When win condition met → GAME_FINISHED

------------------------------------------------------------------------

# 3. Repository Structure (Monorepo)

    BodegaDK/
      apps/
        web/
        server/

      packages/
        protocol/

      infra/
      docs/

------------------------------------------------------------------------

# 4. apps/web -- Browser Client

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
            adapter.ts
            actions.ts
            view.ts
        net/
          protocol.ts
          mock-server.ts

      package.json
      tsconfig.json
      vite.config.ts
      Dockerfile

Responsibilities:

-   UI rendering
-   Routing between views
-   REST communication
-   WebSocket connection
-   Local UI state management
-   Game-room session lifecycle
-   Public/private state rendering through per-game adapters
-   Quick-play queue polling
-   Lobby vs in-game view switching from room status

### 4.1 Game Room Client Layer

Client game-room flow (implemented):

1.  URL bootstrap: `?view=room&game=...&room=...&token=...`
2.  Session opens transport (`/ws` or mock transport)
3.  Session sends `CONNECT`
4.  Store receives:
    -   `STATE_SNAPSHOT`
    -   `PUBLIC_UPDATE`
    -   `PRIVATE_UPDATE`
    -   `ERROR`
    -   `GAME_FINISHED`
5.  Adapter maps protocol state → UI view model
6.  UI renders:
    -   room header + connection status
    -   public table (players, turn, pile, claim)
    -   private hand (selectable cards)
7.  UI intents map to protocol messages (`PLAY_CARDS`, `CALL_SNYD`)

Key principle remains unchanged:

-   server is authoritative for rules and outcomes
-   client only renders state and sends intents

UI-side source of truth for active live card rooms:

-   `docs/contracts/gameroom_ui_contract.md`

------------------------------------------------------------------------

# 5. apps/server -- Java Backend (Spring Boot)

    apps/server/
      src/main/java/dk/bodegadk/

        config/
        auth/
        rest/
        ws/

        domain/
          rooms/
          games/
            common/
            snyd/
            fem/
            dice/

        persistence/
          repo/
          migrations/

        dto/

      src/test/java/
      build.gradle / pom.xml
      Dockerfile

Layer responsibilities:

REST Layer: - Authentication - Room creation/join - Metadata endpoints
- Matchmaking queue endpoints

WebSocket Layer: - Authenticated connection - Routing game messages -
Broadcasting updates

Domain Layer: - GameEngine interface - SnydEngine implementation - Full
rule enforcement

Persistence split:

- durable app data is stored in canonical Supabase Postgres
- schema changes are managed only through `supabase/migrations/`
- WebSocket bindings and active engine state still live in memory

Persistence Layer: - Users - Rooms metadata - Game history - Statistics

Live room/game state stored in memory.

------------------------------------------------------------------------

# 6. packages/protocol -- Shared API Contract

    packages/protocol/
      rest/
      ws/
      README.md

Purpose:

-   Define REST schemas (OpenAPI)
-   Define WebSocket message formats
-   Keep client/server contracts stable

------------------------------------------------------------------------

# 7. infra -- Deployment

    infra/
      docker-compose.yml
      nginx/
        nginx.conf
      scripts/

Services:

-   nginx (static + reverse proxy)
-   server (Spring Boot)

Database ownership and migration strategy:

-   `docs/decisions/0001-canonical-database-and-migrations.md`

Nginx proxies:

-   /api → backend
-   /ws → backend (WebSocket upgrade)

------------------------------------------------------------------------

# 8. Deployment Model

Production setup:

Browser ↓ Nginx ↓ Spring Boot Server ↓ Supabase Postgres

The web and server services run inside Docker containers on a VM. The database
is the canonical Supabase Postgres project and is not replaced by a deploy
fallback database.

------------------------------------------------------------------------

# 9. Scalability Strategy (Future)

Possible future improvements:

-   Redis for distributed room state
-   Horizontal scaling of backend instances
-   Load balancing via reverse proxy
-   Dedicated matchmaking service
-   Metrics + monitoring

------------------------------------------------------------------------

# 10. Summary

This structure ensures:

-   Clean separation between UI and game logic
-   Fully authoritative backend
-   Secure rule validation
-   Easy deployment via Docker
-   Clear expansion path for additional games
