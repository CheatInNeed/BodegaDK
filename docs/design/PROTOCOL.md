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

## POST /rooms

Opretter et nyt room.

### Response

``` json
{
  "roomCode": "ABC123"
}
```

------------------------------------------------------------------------

## POST /rooms/{roomCode}/join

Joiner et eksisterende room.

### Response

``` json
{
  "ok": true
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
    "token": "room-session-token",
    "accessToken": "supabase-access-jwt"
  }
}
```

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

For `highcard`, `PLAY_CARDS` is also used with game-specific validation:

- `cards` must contain exactly one card code.
- `claimRank` is accepted but ignored.

Example (`highcard`):

``` json
{
  "type": "PLAY_CARDS",
  "payload": {
    "cards": ["HA"],
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
      "players": [
        { "playerId": "8e40cdb3-8d10-41aa-99b8-4a8764db16cb", "userId": "8e40cdb3-8d10-41aa-99b8-4a8764db16cb", "username": "Peter" },
        { "playerId": "29d78f90-2eaf-4d85-a629-c630a21feef8", "userId": "29d78f90-2eaf-4d85-a629-c630a21feef8", "username": "Player 29d78f90" }
      ],
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
    "players": [
      { "playerId": "8e40cdb3-8d10-41aa-99b8-4a8764db16cb", "userId": "8e40cdb3-8d10-41aa-99b8-4a8764db16cb", "username": "Peter" }
    ],
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
