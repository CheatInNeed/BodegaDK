# Web Multiplayer Game Architecture -- Mini GDD

## Overview

This document describes the architecture and runtime model for a
browser‑based multiplayer game platform similar to chess.com, focused on
card and dice games.

The system uses a **server‑authoritative model** and delivers the client
via standard web technologies.

------------------------------------------------------------------------

## Core Principles

**1. Browser‑Delivered Client** - Users visit a URL
(e.g. https://yourgame.com) - The browser automatically downloads: -
HTML (structure) - CSS (styling) - JavaScript (application logic) - This
happens automatically in the background.

The user does not install anything manually.

**2. Client Runs Locally in Browser** After download, JavaScript
executes locally inside the browser.

Responsibilities: - Render game UI - Handle user input - Send player
actions to server - Receive and display state updates

The client never owns the authoritative game state.

------------------------------------------------------------------------

## Server‑Authoritative Model

The server is always the source of truth.

Server responsibilities: - Maintain all game state - Validate all player
actions - Run game engine logic - Generate RNG (cards, dice) - Prevent
cheating - Broadcast state updates to clients

Client responsibilities: - Send "intent" messages (example: ROLL, BET,
PLAY_CARD) - Render server‑provided state

------------------------------------------------------------------------

## Network Flow

Standard runtime sequence:

1.  User visits: https://yourgame.com

2.  Browser downloads client files:

    -   index.html
    -   app.js
    -   style.css

3.  Browser executes app.js locally

4.  Client connects to server via WebSocket: wss://yourgame.com/socket

5.  Realtime gameplay begins

------------------------------------------------------------------------

## Repository Structure (Monorepo)

Recommended structure:

    apps/
      web/        Browser client (React / Next / Vite)
      api/        Game server (NestJS / Node)

    packages/
      protocol/   Shared message types
      engine-core Shared game rules (pure logic)

Benefits: - Shared TypeScript types - Consistent protocol - Easier
maintenance - Industry standard approach

------------------------------------------------------------------------

## Game Engine Placement

Game engine runs primarily on the server.

Engine characteristics: - Deterministic logic - Stateless functions - No
direct networking - No database access

Optional: shared engine code may be reused on client for UI helpers.

Server always validates and applies final state.

------------------------------------------------------------------------

## Deployment Model

Production deployment typically includes:

-   Web server (serves client)
-   Game server (Node.js / NestJS)
-   Database (Postgres)
-   Optional Redis (scaling)

All client code delivered via URL.

------------------------------------------------------------------------

## Scalability Target

Architecture supports:

-   100--1000 daily users easily on single server
-   Horizontal scaling later if needed

Industry standard approach.

------------------------------------------------------------------------

## Summary

This architecture ensures:

-   No client installation required
-   Secure authoritative game logic
-   Realtime multiplayer support
-   Scalable backend model
-   Industry‑standard implementation
