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

Room status values:

- `LOBBY`: players can join and configure the room
- `IN_GAME`: active gameplay; the browser sends room heartbeats while this is live
- `FINISHED`: terminal persisted room state used by stale-room cleanup and history

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
  "roomCode": "ABC123",
  "playerId": "supabase-user-id-or-guest-id",
  "token": "session-token",
  "hostPlayerId": "supabase-user-id-or-guest-id",
  "isPrivate": false,
  "selectedGame": "highcard",
  "status": "LOBBY"
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
  "ok": true,
  "roomCode": "ABC123",
  "playerId": "supabase-user-id-or-guest-id",
  "token": "session-token",
  "hostPlayerId": "supabase-user-id-or-guest-id",
  "selectedGame": "highcard",
  "status": "LOBBY"
}
```

------------------------------------------------------------------------

## POST /rooms/{roomCode}/visibility

Host-only endpoint used while the room is still in `LOBBY`.

### Request

``` json
{
  "actorToken": "session-token",
  "isPrivate": true
}
```

### Response

``` json
{
  "ok": true
}
```

The backend updates lobby visibility immediately and broadcasts the new
`isPrivate` value to all connected room clients through `PUBLIC_UPDATE`.

------------------------------------------------------------------------

## POST /matchmaking/queue

Sætter en spiller i quick-play kø.
Hvis spilleren allerede har en ventende matchmaking ticket, returnerer
endpointet den eksisterende ticket i stedet for at oprette endnu en. Det
gælder på tværs af spil, så én spiller kun kan have én aktiv queue ticket ad
gangen.

### Request

``` json
{
  "gameType": "casino",
  "playerId": "supabase-user-id-or-guest-id",
  "username": "Alice",
  "token": "session-token"
}
```

### Response

``` json
{
  "ticketId": "uuid",
  "gameType": "casino",
  "status": "WAITING",
  "roomCode": null,
  "playerId": "supabase-user-id-or-guest-id",
  "token": "session-token",
  "queuedPlayers": 1,
  "playersNeeded": 1,
  "minPlayers": 2,
  "maxPlayers": 2,
  "strictCount": true,
  "estimatedWaitSeconds": 12
}
```

------------------------------------------------------------------------

## GET /matchmaking/queue/{ticketId}

Henter status for en quick-play ticket.

Når `status` bliver `MATCHED`, vil `roomCode` være udfyldt og klienten
skal navigere direkte til `view=room`.

------------------------------------------------------------------------

## DELETE /matchmaking/queue/{ticketId}

Annullerer en quick-play ticket.

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

## FLIP_CARD

``` json
{
  "type": "FLIP_CARD",
  "payload": {}
}
```

For `krig`, this marks the player ready to flip the top card of their
face-down draw pile. When both players have sent `FLIP_CARD`, the server
resolves the trick:

- each player flips the top card from their draw pile
- higher value wins all center cards
- equal values trigger War: each player stakes up to 3 face-down cards while
  preserving 1 card to flip, then flips the next available card
- repeated ties continue War until one player wins or no player can continue
- the winner places all center cards at the bottom of their draw pile
- the game ends when a player has 0 cards after a resolved trick

Players never send or receive their draw-pile card identities before reveal.

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

## START_GAME

``` json
{
  "type": "START_GAME",
  "payload": {}
}
```

`START_GAME` er nu den fælles room lifecycle-besked for alle realtime
spil:

- private lobbies bruger den når værten trykker start
- quick play bruger den server-side, straks efter matchmaking har samlet
  nok spillere

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

For `krig`, `publicState` includes classic War draw-pile and center-pile
fields:

```json
{
  "roomCode": "ABC123",
  "players": [
    { "playerId": "p1", "username": "Alice" },
    { "playerId": "p2", "username": "Bob" }
  ],
  "trickNumber": 1,
  "gamePhase": "PLAYING",
  "drawPileCounts": {
    "p1": 26,
    "p2": 26
  },
  "drawPileCountsBeforeTrick": {},
  "matchWinnerPlayerId": null,
  "rematchPlayerIds": [],
  "readyPlayerIds": ["p1"],
  "currentFaceUpCards": {
    "p1": null,
    "p2": null
  },
  "warActive": false,
  "warDepth": 0,
  "warPileSize": 0,
  "centerPileSize": 0,
  "stakeCardCounts": {
    "p1": 0,
    "p2": 0
  },
  "statusText": "Waiting for both players to flip.",
  "lastTrick": null
}
```

When both players have flipped, `readyPlayerIds` becomes empty,
`currentFaceUpCards` contains the active revealed card codes, and `lastTrick`
contains the resolved trick result:

```json
{
  "trickNumber": 1,
  "firstPlayerId": "p1",
  "firstCard": "HA",
  "secondPlayerId": "p2",
  "secondCard": "SK",
  "winnerPlayerId": "p1",
  "outcome": "FIRST",
  "cardsWon": 2,
  "warDepth": 0
}
```

During War, `warDepth` is greater than `0`, `warPileSize` counts face-down
stake cards in the center, `stakeCardCounts` splits those face-down cards by
player for table rendering, and `centerPileSize` counts all cards currently in
the center. While a resolved trick reveal is being presented, clients may use
`drawPileCountsBeforeTrick` to avoid visually applying the won cards before the
reveal animation. When the game finishes, `gamePhase` becomes `GAME_OVER`,
`matchWinnerPlayerId` contains the player who collected the deck or `null` if
neither player can continue a tied War, and `rematchPlayerIds` starts empty
until players opt into a rematch.

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
