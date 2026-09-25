# Server logging

How the Spring server writes logs, how to read them, and the rules for adding new log lines.

## Where to read logs

| Where | Command |
|---|---|
| Local (`npm run server:local`) | Logs print in the terminal. The `local` profile shows DEBUG lines. |
| Docker (`infra/`) | `docker compose logs -f server` |
| Only errors | `docker compose logs server \| grep -E "ERROR\|WARN"` |
| One room | `docker compose logs server \| grep "room=ABCD"` |
| One REST request | `docker compose logs server \| grep "req=<id>"` (the ID is in the `X-Request-Id` response header) |

Container logs rotate at 3 x 10 MB per container (see `infra/docker-compose.yml`).

## Reading a log line

```
2026-09-25T14:03:11.412+02:00 ERROR 1 --- [pool-3-thread-1] req=7c1e… room=ABCD player=9b2e… d.b.ws.GameWsHandler : Game action PLAY_CARDS failed
java.lang.NullPointerException: ...
    at dk.bodegadk.server.domain.games.krig.KrigEngine.apply(KrigEngine.java:87)
```

- `ERROR`: the log level (see below)
- `req= room= player=`: tags added automatically from `LogContext` (SLF4J MDC). A tag is left out when it is not set.
- `d.b.ws.GameWsHandler`: which class wrote the line
- The stack trace below the line shows exactly where the code failed

## Log levels

| Level | Use for | Examples |
|---|---|---|
| `ERROR` | Something broke and needs a fix | Game engine threw, match history could not be saved, unexpected REST error |
| `WARN` | Unusual, but handled | CONNECT rejected, invalid WS message, push notification failed, WS transport error |
| `INFO` | Important normal events | Player connected/disconnected, game started/finished, heartbeat timeout, room closed |
| `DEBUG` | Detail for troubleshooting | Every REST request with status and duration, every game action, rule rejections ("not your turn") |

Production shows INFO and above. To turn on DEBUG in Docker, set `BODEGADK_LOG_LEVEL=DEBUG` in
`.env.deploy` and redeploy. Locally, set `LOGGING_LEVEL_DK_BODEGADK=DEBUG` (the `local` profile does this by default).

## Tags (MDC) and request IDs

- **REST:** `RequestIdFilter` gives every HTTP request an ID. nginx creates it (`$request_id`) and passes it in
  `X-Request-Id`; without nginx the server generates one. The ID is returned in the `X-Request-Id` response header,
  so a failing request in the browser can be matched to the server log.
- **WebSocket:** `GameWsHandler` tags lines with `wsSession`, `roomCode` and `playerId`. Each game action gets its
  own `requestId` (the action's `ActionCommand.requestId`).
- Tags live on the current thread. Work handed to another thread (e.g. `runtimeStore.submit`) must set them again.
  Always use `try (LogContext ignored = LogContext.open().with(...)) { ... }` so tags are removed afterwards.

## Rules for new log lines

1. Get a logger: `private static final Logger log = LoggerFactory.getLogger(MyClass.class);`
2. Use placeholders, not string concatenation: `log.info("Room {} closed", roomCode)`.
3. For errors, pass the exception as the **last** argument so the stack trace is printed:
   `log.error("Saving match failed", exception)`.
4. Never swallow an exception silently. At minimum `log.debug(...)` it, and explain in a comment why it is safe to ignore.
5. **Never log secrets or personal data:** no access tokens/JWTs, no runtime session tokens, no push endpoints or
   keys, no emails, no raw WebSocket message content (a CONNECT message contains the access token).
   User IDs (UUIDs) are fine.
6. Wrap client-supplied strings (message types, room codes from CONNECT) in `LogContext.sanitize(...)` so a client
   cannot inject fake log lines.
7. Expected client errors (404, 409, "not your turn") are not ERRORs. Use DEBUG, or don't log them.

## What is not covered yet

- JSON log output for log collectors (planned together with the monitoring stack; native in Spring Boot 3.4+)
- Health checks and metrics (Spring Boot Actuator, planned)
- Browser-side error reporting
