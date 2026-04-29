# Homepage V1 Implementation Contract

## Goal

Implement a dedicated V1 homepage for `/?view=home` in the web client.

This homepage must reflect the locked design:

-   **Real**
    -   Matchmaking hub
    -   Games card / game discovery
    -   Leaderboard
-   **Placeholder**
    -   Continue Game
    -   Profile
    -   Invite / Friends
    -   Stats

The homepage must be visually complete, but only wire real functionality
where support is already verified.

------------------------------------------------------------------------

## Current repo state

-   Routing is split between:
    -   pathname routes: `/login`, `/signup`, `/custom`
    -   query-param app views: `/?view=home|play|settings|help|room`
-   `/?view=home` already exists, but currently renders the same game grid
    as `/?view=play`
-   The web client may apply shared visual themes, but theme switching does
    not change homepage routing, card inventory, or behavior
-   Games discovery is already real through the existing game-card grid and
    `button[data-action="open-game"]` event handling
-   Lobby creation, join-by-code, and the dedicated lobby-browser route are
    already implemented elsewhere in the app and may be surfaced on the
    homepage as a single matchmaking hub
-   `styles.css` currently contains a malformed `.full` rule; homepage work
    may fix CSS correctness where needed for reliable layout rendering

------------------------------------------------------------------------

## Scope

### In scope

-   Add a dedicated homepage render path
-   Render a homepage layout composed of cards
-   Reuse the existing real game grid/card UI for the Games section
-   Add placeholder cards for unsupported features using subtle disabled
    styling rather than developer-status scaffolding
-   Promote the homepage matchmaking hub from placeholder to real
-   Add minimal CSS for homepage layout and responsive behavior
-   Add homepage-specific i18n strings
-   Fix CSS syntax issues required for homepage styles to render correctly

### Out of scope

-   No new backend endpoints
-   No new Supabase queries
-   No session persistence
-   No profile data wiring beyond placeholder
-   No invite/friends system
-   No global stats system
-   No new quick play flow beyond reusing existing lobby create/join entry points
-   No theme-specific homepage behavior differences beyond presentation

------------------------------------------------------------------------

## Implementation rule

**If a homepage feature does not already have verified end-to-end
support, render it as a placeholder card.**

The homepage may expose verified lobby entry points as real actions as
long as they reuse the existing lobby creation, join, and browser flows
without changing the underlying lobby route behavior.

------------------------------------------------------------------------

## Files to inspect and modify

### Primary

-   `apps/web/src/index.ts`
-   `apps/web/src/i18n.ts`
-   `apps/web/public/styles.css`

------------------------------------------------------------------------

## Reuse rules

-   Reuse the existing `playCards()` output for the real Games section
-   Preserve the existing `button[data-action="open-game"]` behavior exactly
    as it works today
-   The homepage matchmaking hub must reuse existing lobby logic:
    -   Join by code uses the existing join flow
    -   Create room uses the existing room creation flow
    -   Browse lobbies navigates to the existing dedicated lobby-browser route
-   Do not surface partial plumbing as real homepage features:
    -   Supabase auth/avatar support exists elsewhere, but homepage Profile
        remains placeholder

------------------------------------------------------------------------

## Target homepage structure

``` text
Home view
  hero/header text
  top action row
    Continue Game (placeholder)
    Rooms / Create / Join (real matchmaking hub)
    content grid
    Games (real)
    Leaderboard (real)
    Profile (placeholder)
    Invite / Friends (placeholder)
    Stats (placeholder)
```

------------------------------------------------------------------------

## Exact homepage card inventory

The homepage currently renders the following visible cards/sections in
`/?view=home`:

-   Hero/header section: informational only, not an interactive feature
    card
-   Continue Game card: placeholder
-   Rooms / Create / Join card: real
    -   Join via code input + Join button
    -   Create Room button
    -   Open Lobby Browser button
-   Games card: real
    -   Reuses the existing `playCards()` output with the lobby promo removed
    -   The section itself is real because it exposes the existing game
        discovery and `open-game` interactions
-   Leaderboard card: real
    -   Opens the authenticated `?view=leaderboard` screen
-   Profile card: placeholder
-   Invite / Friends card: placeholder
-   Stats card: placeholder

Clarification:

-   The homepage now shows three real cards: `Rooms / Create / Join`,
    `Games`, and `Leaderboard`
-   Remaining unsupported cards must render as subtle disabled cards with a
    small muted availability label rather than placeholder pills or action
    buttons

------------------------------------------------------------------------

## Acceptance criteria

1.  `/?view=home` renders a homepage distinct from `/?view=play`
2.  The homepage contains:
    -   Continue Game placeholder
    -   Rooms / Create / Join matchmaking hub
    -   Games card with real existing game cards
    -   Leaderboard card with real navigation to the leaderboard screen
    -   Profile placeholder
    -   Invite/Friends placeholder
    -   Stats placeholder
3.  The homepage matchmaking hub allows:
    -   joining an existing room by code
    -   creating a new room using the existing create flow
    -   navigating to the dedicated lobby browser
4.  Existing game-card interactions still work from the homepage Games
    section
5.  Unsupported cards are visibly unavailable without showing developer
    status badges or button-heavy scaffolding
6.  Layout is responsive
7.  `/?view=play` remains the existing game-selection view
8.  No router, API, or protocol changes are introduced
9.  No new backend logic is added
