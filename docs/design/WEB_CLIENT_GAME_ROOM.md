# BodegaDK -- Web Client Game Room Layer

Dette dokument beskriver den implementerede game-room client layer i
`apps/web`.

UI-kontrakten for aktive game rooms findes i:

-   `docs/contracts/gameroom_ui_contract.md`

------------------------------------------------------------------------

## Formål

Game-room layeren giver en genbrugelig runtime til multiplayer views, hvor
clienten:

-   booter fra URL query params
-   forbinder over WebSocket envelope format (`{ type, payload }`)
-   håndterer adskilt `publicState` og `privateState`
-   mapper state til UI via per-game adapters
-   sender intents som protocol messages

Dette dokument dækker runtime/session flow.
Det nye UI contract dokument dækker den delte struktur for aktive game-room
views, seats, table surface, center board og private tray.

------------------------------------------------------------------------

## URL bootstrap

Nødvendige query params:

-   `view=room`
-   `game=<mode>`
-   `room=<roomCode>`

Eksempel:

``` text
/?view=room&game=snyd&room=ABC123
```

Valgfri:

-   `mock=1` bruger lokal mock transport i stedet for rigtig `/ws`

------------------------------------------------------------------------

## File map

-   `apps/web/src/app/router.ts`
    -   læser/skriver route query params
-   `apps/web/src/net/protocol.ts`
    -   typer for WS envelopes + parser af server messages
-   `apps/web/src/game-room/types.ts`
    -   session/store/adapter interfaces
-   `apps/web/src/game-room/store.ts`
    -   reducer for room state transitions
-   `apps/web/src/game-room/session.ts`
    -   session lifecycle, transportvalg, connect/send flow
-   `apps/web/src/game-room/transport/ws-client.ts`
    -   real WebSocket transport (`/ws`)
-   `apps/web/src/net/mock-server.ts`
    -   lokal mock server transport (dev/test)
-   `apps/web/src/game-room/view.ts`
    -   fælles room frame og banners
-   `apps/web/src/games/snyd/adapter.ts`
    -   mapning fra protocol state til Snyd view model
-   `apps/web/src/games/snyd/actions.ts`
    -   intent → `PLAY_CARDS` / `CALL_SNYD`
-   `apps/web/src/games/snyd/view.ts`
    -   Snyd specifik rendering
-   `apps/web/src/games/casino/adapter.ts`
    -   mapning fra protocol state til Casino view model
-   `apps/web/src/games/casino/actions.ts`
    -   intent → `CASINO_PLAY_MOVE` / `CASINO_BUILD_STACK` / `CASINO_MERGE_STACKS`
-   `apps/web/src/games/casino/view.ts`
    -   Casino specifik rendering
-   `apps/web/src/games/krig/adapter.ts`
    -   mapning fra Krig protocol state til Krig view model
-   `apps/web/src/games/krig/view.ts`
    -   server-drevet Krig bordrendering med spillerperspektiv
-   `apps/web/src/index.ts`
    -   app shell integration og room event binding

------------------------------------------------------------------------

## Runtime flow

1.  `index.ts` ser `view=room`
2.  Route valideres (`game`, `room`)
3.  Adapter findes for valgt game mode
4.  `createGameRoomSession(...)` oprettes
5.  Session åbner transport
6.  Ved open sendes `CONNECT` med Supabase `accessToken`
7.  Indkommende messages parses og dispatches til store
8.  Store opdaterer room state
9.  Adapter laver view model
10. UI re-rendres

------------------------------------------------------------------------

## Room state model

`RoomSessionState`:

-   `connection`: `idle | connecting | connected | reconnecting | error`
-   `roomCode`
-   `playerId`
-   `game`
-   `publicState`
-   `privateState`
-   `selectedHandCards`
-   `lastError`
-   `winnerPlayerId`

State rules:

-   `STATE_SNAPSHOT` erstatter public + private state
-   `PUBLIC_UPDATE` merges ind i public state
-   `PRIVATE_UPDATE` accepteres kun for current player
-   `ERROR` vises som non-blocking banner
-   `GAME_FINISHED` sætter winner og låser actions
-   `casino` bruger single-select for håndkort og separat lokal selection for
    table stacks

------------------------------------------------------------------------

## Adapter model

`GameAdapter` gør game-room runtime genbrugelig på tværs af spil:

-   `canHandle(game)` vælger adapter
-   `toViewModel(...)` mappper protocol shape → UI shape
-   `buildAction(...)` mapper UI intent → outbound protocol message

Aktive adapters er `snydAdapter`, `casinoAdapter`, `highcardAdapter`,
`krigAdapter` og `femAdapter`.

------------------------------------------------------------------------

## UI behavior (Snyd v1)

Room view viser:

-   Connection status
-   Room kode
-   Turn + next player
-   Public spilleroversigt med card counts
-   Pile count + last claim
-   Private hand som klikbare kortchips

Actions:

-   `Play selected`
-   `Call snyd`

Disse knapper disables når:

-   client ikke er connected
-   spillet er afsluttet
-   det ikke er spillerens tur
-   ingen kort er valgt (for `Play selected`)

------------------------------------------------------------------------

## UI behavior (Casino v1)

Room view viser:

-   Dealer / non-dealer roller
-   Table stacks med `stackId`, total og locked/open status
-   Private hånd som single-select kort
-   Captured counts per spiller
-   Deck count og waiting-state før spiller 2 forbinder

Actions:

-   `Capture / Trail`
-   `Build stack`
-   Quick merge når ingen håndkort er valgt og 2+ stacks matcher en håndværdi

------------------------------------------------------------------------

## UI behavior (Krig v1)

Krig bruger den fælles game-room session og WebSocket transport, men renderer
et specialiseret fuldskærmsbord for at bevare spillets nuværende visuelle
oplevelse.

Room view viser:

-   nuværende spiller nederst og modstander øverst
-   profile username fra room state eller fælles guest fallback
-   draw-pile counts og scorebar for begge spillere
-   face-down ready state når en spiller har sendt `FLIP_CARD`
-   resolved face-up cards efter begge spillere er ready
-   War presentation via `warDepth`, `warPileSize`, `stakeCardCounts` og
    `centerPileSize`
-   rematch overlay når `gamePhase` er `GAME_OVER`

Actions:

-   `Flip` sender `FLIP_CARD`
-   `Rematch` sender `REQUEST_REMATCH`
-   `Forlad` bruger den fælles `leave-table` room handling

Krig må gerne bruge klient-side presentation timers for suspense/reveal, men
kort, vindere, piles og rematch state skal altid komme fra serverens
`publicState`. Klienten må ikke genindføre lokal deck/RNG/game-rule state i
Krig viewet.

------------------------------------------------------------------------

## Mock transport (dev)

`mock=1` bruger `mock-server.ts`:

-   bruger `localStorage` til room state
-   bruger `BroadcastChannel` til at synkronisere tabs i samme room
-   sender public messages til alle
-   sender private messages kun til relevant player

Dette gør det muligt at teste 2-client scenarier uden backend implementation.

------------------------------------------------------------------------

## Error handling

Clienten håndterer:

-   Manglende query params → fejlvisning med required keys
-   Ukendt game mode → unsupported visning
-   Malformed server JSON → ignoreres + fejlstatus
-   PRIVATE_UPDATE for anden spiller → ignoreres + warning

------------------------------------------------------------------------

## Integration contract med backend

Backend contracten ligger i `docs/design/PROTOCOL.md`.

WebSocket inbound messages include:

-   `CONNECT`
-   `START_GAME`
-   `SELECT_GAME`
-   game-specific actions such as `PLAY_CARDS`, `CALL_SNYD`,
    `CASINO_PLAY_MOVE`, `FLIP_CARD`, and Fem actions

WebSocket outbound messages include:

-   `STATE_SNAPSHOT`
-   `PUBLIC_UPDATE`
-   `PRIVATE_UPDATE`
-   `ERROR`
-   `GAME_FINISHED`

Room setup, matchmaking, profile history/stats, leaderboard, friends,
challenges, and notifications use authenticated REST APIs documented in the
same protocol file.

------------------------------------------------------------------------

## Non-goals i denne iteration

-   Live engine board-state persistence/replay. Room metadata, completed match
    history, profile stats, leaderboard scores, friends, challenges, and
    notifications are persisted, but active game snapshots remain runtime
    memory.
-   Reconnect replay/resync strategy beyond reconnecting status and the normal
    snapshot/update flow.

------------------------------------------------------------------------
