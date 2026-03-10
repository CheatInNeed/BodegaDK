# BodegaDK -- Protocol (REST + WebSocket Contract)

Dette dokument definerer kontrakten mellem client (apps/web) og server
(apps/server).

Formål: - Undgå breaking changes - Have én kilde til sandhed for
payload-struktur - Gøre det tydeligt hvordan nye endpoints og
WS-messages tilføjes

Se også:

-   `docs/WEB_CLIENT_GAME_ROOM.md` for hvordan web-clienten bruger disse
    messages i game-room runtime.

------------------------------------------------------------------------

## Grundregel

Client og server må ikke ændre payload-formater uden at:

1.  Opdatere denne dokumentation
2.  Opdatere implementation i både web og server
3.  Sikre at ændringen er bagudkompatibel eller bevidst breaking

------------------------------------------------------------------------

# REST API (Lobby / Setup)

Base path (prod via nginx): /api/

Base path (dev): http://localhost:8080/

------------------------------------------------------------------------

## GET /rooms/games

Returnerer spil-kataloget med server-authoritative player limits.

### Response

``` json
[
  {
    "gameId": "snyd",
    "minPlayers": 2,
    "maxPlayers": 8
  }
]
```

------------------------------------------------------------------------

## POST /rooms

Opretter et nyt lobby-room. Opretteren bliver automatisk host.

### Request

``` json
{
  "playerId": "supabase-user-id",
  "displayName": "peter@example.com",
  "gameId": "snyd",
  "isPublic": false
}
```

### Response

``` json
{
  "roomCode": "ABC123",
  "hostPlayerId": "supabase-user-id",
  "gameId": "snyd",
  "isPublic": false,
  "status": "WAITING",
  "minPlayers": 2,
  "maxPlayers": 8,
  "currentPlayers": 1,
  "players": [
    {
      "playerId": "supabase-user-id",
      "displayName": "peter@example.com",
      "host": true
    }
  ]
}
```

------------------------------------------------------------------------

## GET /rooms

Returnerer kun public rooms hvor `status == WAITING`.

### Response

``` json
[
  {
    "roomCode": "ABC123",
    "gameId": "snyd",
    "isPublic": true,
    "status": "WAITING",
    "hostPlayerId": "supabase-user-id",
    "minPlayers": 2,
    "maxPlayers": 8,
    "currentPlayers": 3
  }
]
```

------------------------------------------------------------------------

## GET /rooms/{roomCode}

Henter detaljer for et specifikt room.

------------------------------------------------------------------------

## POST /rooms/{roomCode}/join

Joiner et eksisterende WAITING-room som aktiv spiller.

Hvis room allerede har `status == PLAYING`, returnerer serveren conflict.

### Request

``` json
{
  "playerId": "supabase-user-id",
  "displayName": "peter@example.com"
}
```

### Response

Samme shape som `POST /rooms`.

------------------------------------------------------------------------

## PATCH /rooms/{roomCode}

Host-only mutation af lobby state.

### Request

``` json
{
  "actorPlayerId": "supabase-user-id",
  "isPublic": true,
  "kickPlayerId": "other-player-id"
}
```

`isPublic` og `kickPlayerId` er begge valgfrie.

------------------------------------------------------------------------

## POST /rooms/{roomCode}/start

Host-only start af spillet. Serveren validerer minimum player count, sætter
room til `PLAYING`, og initialiserer game state før WebSocket connect.

### Request

``` json
{
  "actorPlayerId": "supabase-user-id"
}
```

------------------------------------------------------------------------

# WebSocket

Endpoint:

/ws

Alle WebSocket messages har format:

``` json
{
  "type": "STRING",
  "payload": { }
}
```

------------------------------------------------------------------------

# Client → Server

## CONNECT

``` json
{
  "type": "CONNECT",
  "payload": {
    "roomCode": "ABC123",
    "token": "supabase-user-id"
  }
}
```

Den nuværende implementation bruger Supabase user id direkte som `playerId`
på client og server. En senere JWT-validering kan genbruge samme envelope.

------------------------------------------------------------------------

## PLAY_CARDS (Snyd)

``` json
{
  "type": "PLAY_CARDS",
  "payload": {
    "cards": ["H3", "D3"],
    "claimRank": "A"
  }
}
```

------------------------------------------------------------------------

## CALL_SNYD

``` json
{
  "type": "CALL_SNYD",
  "payload": {}
}
```

------------------------------------------------------------------------

# Server → Client

## STATE_SNAPSHOT

Sendes ved connect eller re-sync.

``` json
{
  "type": "STATE_SNAPSHOT",
  "payload": {
    "publicState": {
      "roomCode": "ABC123",
      "players": ["p1", "p2"],
      "turnPlayerId": "p1",
      "pileCount": 8,
      "lastClaim": {
        "playerId": "p1",
        "claimRank": "A",
        "count": 2
      }
    },
    "privateState": {
      "playerId": "p2",
      "hand": ["H7", "C2", "DA"]
    }
  }
}
```

------------------------------------------------------------------------

## PUBLIC_UPDATE

Broadcast til alle spillere.

``` json
{
  "type": "PUBLIC_UPDATE",
  "payload": {
    "turnPlayerId": "p2",
    "pileCount": 10
  }
}
```

------------------------------------------------------------------------

## PRIVATE_UPDATE

Sendes kun til én spiller.

``` json
{
  "type": "PRIVATE_UPDATE",
  "payload": {
    "playerId": "p2",
    "hand": ["H7", "C2"]
  }
}
```

------------------------------------------------------------------------

## ERROR

``` json
{
  "type": "ERROR",
  "payload": {
    "message": "Not your turn"
  }
}
```

------------------------------------------------------------------------

## GAME_FINISHED

``` json
{
  "type": "GAME_FINISHED",
  "payload": {
    "winnerPlayerId": "p1"
  }
}
```

------------------------------------------------------------------------

# Definition of Done (Protocol)

Når du ændrer eller tilføjer:

-   REST endpoint
-   WS message type
-   Payload struktur

Skal du:

1.  Opdatere denne fil
2.  Opdatere server implementation
3.  Opdatere client implementation
4.  Teste med mindst 2 clients i samme room

------------------------------------------------------------------------
