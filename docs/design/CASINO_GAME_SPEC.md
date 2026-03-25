# Casino -- Rules and Integration Spec

This document captures the Casino rules and implementation decisions as a
source of truth for reimplementation on `dev`.

It defines:

- gameplay rules
- turn and interaction rules
- server-authoritative state model
- protocol expectations
- implementation order

------------------------------------------------------------------------

## 1. Game Summary

Casino is a 2-player, server-authoritative card game using a standard 52-card
deck with no jokers.

Core loop:

- each player is dealt 4 cards
- 4 cards are placed face up on the table at game start
- players alternate turns
- a turn only ends when the player places a card from hand
- when both players have emptied their hands, 4 new cards are dealt to each
- no additional cards are dealt to the table after the initial 4
- when deck and hands are empty, remaining table cards go to the last player who
  made a capture

Winner rule for MVP:

- winner is the player with the most captured cards
- equal captured counts means draw

------------------------------------------------------------------------

## 2. Player and Dealer Rules

- exactly 2 players
- one player is the dealer for the entire game
- dealer always acts second in each hand cycle
- game starts only when both players are connected
- first turn belongs to the non-dealer

------------------------------------------------------------------------

## 3. Card Values

Default value model:

- `A` = `1` or `14`
- `2`..`10` = face value
- `J` = `11`
- `Q` = `12`
- `K` = `13`

Configuration rule:

- room setup must include a full `valueMap`
- the `valueMap` must cover all 52 cards
- per-card overrides are allowed
- missing entries are invalid and must reject room startup/connect

Resolution rule for Ace:

- players do not manually choose Ace value in UI
- engine resolves `1` vs `14` automatically based on which interpretation makes
  the requested move legal

------------------------------------------------------------------------

## 4. Turn Rules

A turn only ends when a card is played from hand.

Turn-ending actions:

- trail a card to the table
- capture table stacks using a hand card
- build a table stack by adding a hand card to a table stack

Non-turn-ending actions:

- merge existing table stacks together without using a hand card

This distinction is mandatory. Table-only restructuring must not pass turn.

------------------------------------------------------------------------

## 5. Table Model

The table is modeled as stacks, not loose individual cards.

Each stack has:

- `stackId`
- `cards`
- `total`
- `locked`
- `topCard`

Initial state:

- each of the 4 starting table cards is its own stack

------------------------------------------------------------------------

## 6. Legal Actions

### 6.1 Trail

If the player does not capture or build, they may place one hand card onto the
table as a new single-card stack.

Rules:

- consumes one hand card
- ends turn

### 6.2 Capture

Player uses one hand card to capture one or more table stacks.

Rules:

- selected stack totals must sum exactly to the played hand-card value
- for Ace, `1` or `14` may satisfy the sum
- captured stacks are removed from table
- played hand card is added to captured pile
- turn ends
- last capturing player marker is updated

### 6.3 Build Stack With Hand Card

Player adds one hand card onto one table stack to create a new total.

Rules:

- target stack must exist
- target stack must not be locked
- played hand card is placed onto that stack
- resulting total must match the value of another card still in that player's
  hand after removing the played card
- if no remaining hand card matches the resulting total, the build is illegal
- turn ends because a hand card was used

### 6.4 Merge Existing Table Stacks

Player may combine two or more existing table stacks into one larger stack
without playing a hand card.

Rules:

- requires selecting at least 2 stacks
- none of the selected stacks may be locked
- combined total must match the value of some card currently in the player's
  hand
- no hand card is consumed
- turn does not end

------------------------------------------------------------------------

## 7. Locked Stack Rules

Some stacks cannot be modified once formed.

A stack becomes locked when:

- its total becomes `7`
- or the played card value equals the resulting total during a build

Required behavior:

- locked stacks cannot be modified by later build actions
- locked stacks cannot be modified by later merge actions
- locked stacks may still be captured if a player plays a matching total from
  hand

------------------------------------------------------------------------

## 8. Endgame Rules

When both players have no cards in hand:

- if deck still has cards, deal 4 to each player
- non-dealer starts the new hand cycle
- if deck is empty, game ends

At game end:

- all remaining table stacks are awarded to the last player who made a capture
- if no capture was made, leftover stacks remain unawarded
- winner is player with highest captured-card count
- tie means draw

------------------------------------------------------------------------

## 9. Client Interaction Rules

### 9.1 Capture / Trail flow

- player selects one hand card
- player optionally selects one or more table stacks
- if stacks are selected, action is capture
- if no stacks are selected, action is trail

### 9.2 Build flow

- player selects one hand card
- player selects exactly one table stack
- submit `Build stack`

### 9.3 Quick merge flow

- if no hand card is selected
- and player selects 2 or more table stacks
- and player holds a hand card matching the combined total
- then stacks should merge automatically
- merge must not end the turn

------------------------------------------------------------------------

## 10. State Shape for Engine / Server

Recommended authoritative state:

```text
CasinoState
- roomCode
- players[2]
- dealerPlayerId
- turnPlayerId
- tableStacks[]
- deck[]
- hands[playerId]
- capturedCards[playerId]
- capturedCounts[playerId]
- lastCapturePlayerId
- started
- finished
- winnerPlayerId | null
- rules.valueMap
- nextStackSeq
```

------------------------------------------------------------------------

## 11. Protocol Requirements

Recommended client -> server messages for Casino:

- `CONNECT`
  - includes `roomCode`, `token`, `game`, `setup.casinoRules.valueMap`
- `CASINO_PLAY_MOVE`
  - `handCard`
  - `captureStackIds[]`
- `CASINO_BUILD_STACK`
  - `handCard`
  - `targetStackId`
- `CASINO_MERGE_STACKS`
  - `stackIds[]`

Public state must include:

- `roomCode`
- `players`
- `dealerPlayerId`
- `turnPlayerId`
- `tableStacks`
- `deckCount`
- `capturedCounts`
- `lastCapturePlayerId`
- `started`
- `rules.valueMap`

Private state must include:

- `playerId`
- `hand`
- `capturedCards`
