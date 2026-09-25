# Observability: health, metrics, logs and dashboards

How we see what the BodegaDK server is doing in production. Why these tools were chosen:
`docs/decisions/0002-observability-stack.md`. How to write log lines: `docs/instructions/LOGGING.md`.

## The big picture

```text
                       Docker host
 ┌──────────────────────────────────────────────────────────────────────┐
 │  nginx :80 ──/api, /ws──▶ server :8080  (players)                     │
 │                            server :8081  (Actuator, internal only)    │
 │                               │  ▲                                    │
 │         metrics every 15s     │  │ healthcheck every 10s (Docker)     │
 │                               ▼  │                                    │
 │  prometheus :9090 ◀───────────┘                                       │
 │        │                                                              │
 │  docker logs (server, nginx) ──▶ alloy ──▶ loki :3100                 │
 │        │                                     │                        │
 │        └──────────────▶ grafana :3000 ◀──────┘                        │
 └──────────────────────────────────────────────────────────────────────┘
      9090 and 3000 listen on 127.0.0.1 only → open them through an SSH tunnel
```

| Piece | Answers | Where |
|---|---|---|
| Logs | What happened and why? | `docker compose logs server`, Grafana → Explore → Loki |
| Health check | Is the server working right now? | `docker compose ps` (healthy/unhealthy) |
| Metrics | How are things going over time? | Grafana dashboard "BodegaDK Overview" |
| Alert rules | Do we need to act now? | Prometheus → Alerts, "Alerts firing" on the dashboard |

## Health checks (always on)

Spring Boot Actuator runs on port **8081** inside the server container. nginx only forwards to 8080,
so none of this is reachable from the internet.

| URL (inside Docker network) | Meaning |
|---|---|
| `http://server:8081/actuator/health` | Overall status with details (database, disk) |
| `http://server:8081/actuator/health/liveness` | Is the Java process alive? |
| `http://server:8081/actuator/health/readiness` | Can it serve players? Includes the database. |
| `http://server:8081/actuator/prometheus` | All metrics, in Prometheus text format |

The old `GET /health` on 8080 still answers `{"status":"ok"}` for existing scripts.

Docker calls the readiness URL every 10 seconds. `docker compose ps` shows `healthy`/`unhealthy`, and
nginx only starts once the server is healthy. If the database is unreachable during a deploy, the
deploy fails loudly instead of serving 502 errors.

Check by hand:

```bash
cd infra
docker compose ps
docker compose exec server curl -s localhost:8081/actuator/health
```

## Metrics

Free from Spring Boot: REST request counts and timings per endpoint (`http_server_requests_seconds_*`),
JVM memory/GC/threads, CPU, Tomcat, database pool (`hikaricp_*`).

Our own (`dk.bodegadk.metrics.BodegaMetrics` and `RuntimeGaugesBinder`):

| Metric | Type | Meaning |
|---|---|---|
| `bodegadk_ws_sessions` | gauge | Players connected over WebSocket right now |
| `bodegadk_rooms{status}` | gauge | Rooms in memory by status (LOBBY, IN_GAME, ...) |
| `bodegadk_game_action_seconds_*{game,outcome}` | timer | Game actions: count, duration; outcome `ok` / `rejected` / `crash` |
| `bodegadk_games_started_total{game}` | counter | Games started |
| `bodegadk_games_finished_total{game}` | counter | Games finished |
| `bodegadk_ws_connect_rejected_total{reason}` | counter | Refused WebSocket CONNECTs, e.g. `invalid_token`, `not_participant` |
| `bodegadk_heartbeat_timeouts_total` | counter | Players dropped because heartbeats stopped |
| `bodegadk_match_history_failures_total` | counter | Finished games whose result could not be saved |
| `bodegadk_push_total{outcome}` | counter | Push notifications `sent` / `failed` / `expired` |

A **counter** only goes up (read it with `rate()` or `increase()`); a **gauge** goes up and down; a
**timer** is a counter plus durations, with histogram buckets so Grafana can show p95.

Rule for new metrics: tags must have a small fixed set of values. Never tag with room codes or user IDs.

## The monitoring stack (optional)

Prometheus, Loki, Alloy and Grafana are in `infra/docker-compose.yml` under the compose profile
`monitoring`, with their config in `infra/monitoring/`. They are **not** started by default.

### Turn it on

Add to `.env.deploy` on the host:

```bash
COMPOSE_PROFILES=monitoring
GRAFANA_ADMIN_PASSWORD=<choose a strong password>
```

Then deploy as usual (`npm run deploy:update`). Docker Compose reads `COMPOSE_PROFILES` and starts the
monitoring containers too. To start only the monitoring part on a running host:

```bash
cd infra
docker compose --profile monitoring up -d prometheus loki alloy grafana
```

Extra memory on the host: about 0.5–1 GB.

### Open Grafana

Grafana listens on `127.0.0.1:3000` of the host. From your own machine:

```bash
ssh -L 3000:localhost:3000 <user>@<host>
```

Then open http://localhost:3000, log in as `admin` with `GRAFANA_ADMIN_PASSWORD`. The home dashboard
is **BodegaDK Overview**. Prometheus works the same way on port 9090 (`ssh -L 9090:localhost:9090 ...`).

### The dashboard

`infra/monitoring/grafana/dashboards/bodegadk-overview.json`, loaded automatically:

- **Top row:** server up/down, players connected, games in progress, REST 5xx rate, game crashes (24h),
  alerts firing
- **REST traffic:** requests per second per endpoint, p50/p95 response time
- **Games:** actions per game and outcome, action time p95, rooms by status, games started/finished,
  connection problems, push notifications
- **JVM and database:** heap, CPU, connection pool
- **Logs:** server errors/warnings, all server logs, nginx 5xx. The **filter box** at the top narrows
  the log panels to a room code, request ID or any text.

Edit the dashboard in git, not in the UI. UI changes are not saved (`allowUiUpdates: false`). To change
a panel: edit it in Grafana, use *Share → Export → JSON*, paste the result into the file, and commit it.

### Searching logs (Grafana → Explore → Loki)

| Question | LogQL query |
|---|---|
| All server errors | `{service="server", level="ERROR"}` |
| Everything in room ABCD | `{service="server"} \| room="ABCD"` |
| One REST request, server and nginx | `{service=~"server\|nginx"} \| request_id="<id>"` |
| Refused WebSocket connects | `{service="server"} \|= "CONNECT rejected"` |
| nginx 5xx | `{service="nginx"} \| json \| status >= 500` |

`level` is a Loki label; `request_id`, `room` and `player` are structured metadata extracted by Alloy
(`infra/monitoring/alloy/config.alloy`).

### Alert rules

`infra/monitoring/prometheus/alerts.yml`, with unit tests in `alerts.test.yml`:

| Alert | Fires when | What to do |
|---|---|---|
| `BodegaServerDown` | Server not scraped for 1 minute | `docker compose ps`, server logs |
| `BodegaHighServerErrorRate` | > 5% REST 5xx for 5 minutes | Look for `Unexpected error handling` in logs |
| `BodegaGameActionCrashed` | Any game action crashed | Logs, level ERROR, `Game action ... failed`; the stack trace shows the engine line |
| `BodegaMatchHistoryWriteFailed` | A result could not be saved | Check database/Supabase status |
| `BodegaHeartbeatTimeoutSpike` | > 20 heartbeat timeouts per 5 min, for 5 min | Network/proxy problems around `/ws` |
| `BodegaJvmMemoryHigh` | Heap > 90% after GC for 10 min | Possible leak; compare with `bodegadk_rooms` |

Alerts are **visible only** (Prometheus → Alerts, and the "Alerts firing" panel). Nobody is notified
yet. To add notifications later, add an Alertmanager container and an `alerting:` block in
`prometheus.yml`; the rules stay the same.

### Retention and data

- Metrics: 15 days (`--storage.tsdb.retention.time`), volume `prometheus-data`
- Logs: 14 days (`retention_period` in `loki.yml`), volume `loki-data`
- Docker's own log files: 3 × 10 MB per container

## Checks in CI

The `infra-config` job in `.github/workflows/ci.yml` validates `docker-compose.yml`, the nginx config,
the Prometheus config, the alert rules (including their unit tests), the Loki and Alloy configs, and the
dashboard JSON on every PR.
