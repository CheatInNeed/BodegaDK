# BodegaDK -- PWA and Web Push

This document describes the installable web app and push-notification layer.

## Browser Contract

The web client provides:

- `public/manifest.webmanifest` for install metadata, icons, shortcuts, theme color, and standalone display.
- `public/sw.js` for app-shell caching, navigation fallback, push handling, and notification click routing.
- `src/pwa.ts` for service-worker registration, feature detection, subscription management, and test pushes.

Service workers and Push API require HTTPS in production. `localhost` is acceptable for local development.

The service worker must not cache `/api/*`, `/ws`, or `/app-config.js`.

## Push Flow

1. User opens Settings and clicks Enable.
2. Browser requests notification permission from that user gesture.
3. Browser creates a `PushSubscription` with the server VAPID public key.
4. Client posts the subscription to `POST /push/subscriptions`.
5. Server stores endpoint, encryption keys, user/device metadata, and active status.
6. Server sends Web Push payloads with the VAPID private key.
7. Service worker receives `push`, displays the notification, and opens/focuses the target URL on click.

## Device Behavior

The client detects capabilities instead of relying on user-agent parsing:

- `window.isSecureContext`
- `serviceWorker` in `navigator`
- `PushManager` in `window`
- `Notification` in `window`
- `(pointer: coarse)` for phone/tablet-style input
- `(display-mode: standalone)` for installed app display

On iPhone/iPad, Web Push is expected to work only for installed Home Screen web apps on supported OS versions, so the Settings UI shows install guidance on coarse-pointer browsers that are not standalone.

## Server Configuration

Set these environment variables for real push delivery:

```bash
export BODEGADK_VAPID_PUBLIC_KEY="base64url-public-key"
export BODEGADK_VAPID_PRIVATE_KEY="base64url-private-key"
export BODEGADK_VAPID_SUBJECT="mailto:admin@example.com"
```

When public/private keys are missing, `GET /push/config` returns `enabled: false`; clients can still load and show setup status, but cannot subscribe.

## Current MVP

Implemented now:

- Installable manifest and app icons.
- Service worker registration and app-shell caching.
- Push subscription, unsubscribe, and test notification endpoints.
- JDBC/Flyway persistence for subscriptions, with in-memory fallback for local profile.

Not yet wired to gameplay events:

- Match found.
- Friend invite.
- Room started.
- Turn reminder.

Those features should call `WebPushNotificationService.sendToEndpoint(...)` or a future fan-out method using the same stored subscriptions.
