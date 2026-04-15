# Homepage V1 Implementation Contract

## Goal

Implement a dedicated V1 homepage for `/?view=home` in the web client.

This homepage must reflect the locked design:

-   **Real**
    -   Games card / game discovery
-   **Placeholder**
    -   Continue Game
    -   Quick Play / Create / Join
    -   Leaderboard
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
    not change homepage routing, card inventory, or placeholder/real status
-   Games discovery is already real through the existing game-card grid and
    `button[data-action="open-game"]` event handling
-   Quick Play and Profile have partial plumbing elsewhere in the app, but
    do not have verified homepage-ready end-to-end support and must remain
    placeholders in V1
-   `styles.css` currently contains a malformed `.full` rule; homepage work
    may fix CSS correctness where needed for reliable layout rendering

------------------------------------------------------------------------

## Scope

### In scope

-   Add a dedicated homepage render path
-   Render a homepage layout composed of cards
-   Reuse the existing real game grid/card UI for the Games section
-   Add placeholder cards for unsupported features
-   Add minimal CSS for homepage layout and responsive behavior
-   Add homepage-specific i18n strings
-   Fix CSS syntax issues required for homepage styles to render correctly

### Out of scope

-   No new backend endpoints
-   No new Supabase queries
-   No session persistence
-   No leaderboard logic
-   No profile data wiring beyond placeholder
-   No invite/friends system
-   No global stats system
-   No new quick play flow
-   No partial feature wiring disguised as real support
-   No theme-specific homepage behavior differences beyond presentation

------------------------------------------------------------------------

## Implementation rule

**If a homepage feature does not already have verified end-to-end
support, render it as a placeholder card.**

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
-   Do not surface partial plumbing as real homepage features:
    -   HighCard quickplay exists elsewhere, but homepage Quick Play remains
        placeholder
    -   Supabase auth/avatar support exists elsewhere, but homepage Profile
        remains placeholder

------------------------------------------------------------------------

## Target homepage structure

``` text
Home view
  hero/header text
  top action row
    Continue Game (placeholder)
    Quick Play / Create / Join (placeholder)
  content grid
    Games (real)
    Leaderboard (placeholder)
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
-   Quick Play / Create / Join card: placeholder
    -   Quick Play chip: placeholder
    -   Create Room chip: placeholder
    -   Join Room chip: placeholder
-   Games card: real
    -   Reuses the existing `playCards()` output unchanged
    -   The section itself is real because it exposes the existing game
        discovery and `open-game` interactions
-   Leaderboard card: placeholder
-   Profile card: placeholder
-   Invite / Friends card: placeholder
-   Stats card: placeholder

Clarification:

-   The homepage must show exactly one real homepage card: `Games`
-   All other homepage cards must render with placeholder treatment
    (`home-placeholder-card`, placeholder pill, disabled "coming soon"
    button)
-   The placeholder status applies even where partial plumbing exists
    elsewhere in the app

------------------------------------------------------------------------

## Acceptance criteria

1.  `/?view=home` renders a homepage distinct from `/?view=play`
2.  The homepage contains:
    -   Continue Game placeholder
    -   Quick Play / Create / Join placeholder
    -   Games card with real existing game cards
    -   Leaderboard placeholder
    -   Profile placeholder
    -   Invite/Friends placeholder
    -   Stats placeholder
3.  Existing game-card interactions still work from the homepage Games
    section
4.  Unsupported cards are visibly placeholders
5.  Layout is responsive
6.  Homepage placeholder cards do not expose misleading live actions
7.  `/?view=play` remains the existing game-selection view
8.  No router, API, or protocol changes are introduced
9.  No new backend logic is added
