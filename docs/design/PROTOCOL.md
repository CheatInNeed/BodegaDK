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

### Request

``` json
{
  "gameType": "highcard",
  "isPrivate": false,
  "playerId": "supabase-user-id-or-guest-id",
  "username": "Alice",
  "token": "session-token"
}
```

### Response

``` json
{
  "roomCode": "ABC123"
}
```

------------------------------------------------------------------------

## POST /rooms/{roomCode}/join

Joiner et eksisterende room.

### Request

``` json
{
  "playerId": "supabase-user-id-or-guest-id",
  "username": "Alice",
  "token": "session-token"
}
```

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
    "token": "jwt-or-session-token",
    "game": "casino",
    "setup": {
      "casinoRules": {
        "valueMap": {
          "HA": [1, 14]
        }
      }
    }
  }
}
```

For non-Casino games, `game` and `setup` are optional.

For `casino`, `setup.casinoRules.valueMap` must define all 52 cards or the
server rejects connect/start.

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

For `krig`, `PLAY_CARDS` is also used with game-specific validation:

- `cards` must contain exactly one card code.
- the server accepts one submission per player per round
- the first submitted card is kept hidden from public state until both players
  have submitted
- `claimRank` is accepted but ignored

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

## REQUEST_REMATCH

``` json
{
  "type": "REQUEST_REMATCH",
  "payload": {}
}
```

For `krig`, this is only valid after the match has reached `GAME_OVER`.
The server tracks which players have opted in. When both players have
requested a rematch, the server deals a fresh match and returns to
`PLAYING`.

------------------------------------------------------------------------

## CASINO_PLAY_MOVE

``` json
{
  "type": "CASINO_PLAY_MOVE",
  "payload": {
    "handCard": "HA",
    "captureStackIds": ["s1", "s2"],
    "playedValue": 14
  }
}
```

`captureStackIds` empty means trail card to table.

------------------------------------------------------------------------

## CASINO_BUILD_STACK

``` json
{
  "type": "CASINO_BUILD_STACK",
  "payload": {
    "handCard": "H4",
    "targetStackId": "s1",
    "playedValue": 4
  }
}
```

------------------------------------------------------------------------

## CASINO_MERGE_STACKS

``` json
{
  "type": "CASINO_MERGE_STACKS",
  "payload": {
    "stackIds": ["s1", "s2", "s3"]
  }
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
        { "playerId": "p1", "username": "Alice" },
        { "playerId": "p2", "username": "Bob" }
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

For `casino`, `publicState` includes `dealerPlayerId`, `tableStacks`,
`deckCount`, `capturedCounts`, `lastCapturePlayerId`, `started`,
`rules.valueMap`, and `privateState` includes `capturedCards`.

For `krig`, `publicState` includes simultaneous-play round fields:

```json
{
  "roomCode": "ABC123",
  "players": [
    { "playerId": "p1", "username": "Alice" },
    { "playerId": "p2", "username": "Bob" }
  ],
  "round": 1,
  "totalRounds": 5,
  "gamePhase": "PLAYING",
  "scores": {
    "p1": 0,
    "p2": 0
  },
  "matchWinnerPlayerId": null,
  "rematchPlayerIds": [],
  "submittedPlayerIds": ["p1"],
  "revealedCards": {
    "p1": null,
    "p2": null
  },
  "lastBattle": null
}
```

When both players have submitted, `submittedPlayerIds` becomes empty,
`revealedCards` contains both actual card codes, and `lastBattle` contains the
resolved round result:

```json
{
  "round": 1,
  "firstPlayerId": "p1",
  "firstCard": "HA",
  "secondPlayerId": "p2",
  "secondCard": "SK",
  "winnerPlayerId": "p1",
  "outcome": "FIRST"
}
```

When the final round finishes, `gamePhase` becomes `GAME_OVER`,
`matchWinnerPlayerId` contains the overall winner or `null` for a tie, and
`rematchPlayerIds` starts empty until players opt into a rematch.

------------------------------------------------------------------------

## PUBLIC_UPDATE

Broadcast til alle spillere.

``` json
{
  "type": "PUBLIC_UPDATE",
  "payload": {
    "players": [
      { "playerId": "p1", "username": "Alice" },
      { "playerId": "p2", "username": "Bob" }
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

For Casino draws, `winnerPlayerId` may be `null`.
For Krig draws, `winnerPlayerId` may also be `null`.

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
