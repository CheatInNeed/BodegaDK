# 0002 Observability Stack

## Status

Accepted.

## Context

Until September 2026 the Spring server wrote no application logs, had only a
hard-coded `/health` that always answered `ok`, and exposed no metrics.
Several failures were swallowed silently (crashing room tasks, push failures).
When a player reported "the game froze", there was nothing to look at.

For the 62582 DevOps course we also want to show a working
build → deploy → observe loop.

Constraints:

- One Docker host running `docker compose` (server + nginx), Supabase as PaaS
  database. No Kubernetes.
- Small team, student budget: prefer free, self-hostable, low-maintenance
  tools.
- Live game state is in memory in one JVM, so per-instance metrics are enough
  for now.

## Decision

1. **Logs:** SLF4J/Logback (built into Spring Boot) with MDC tags
   (`requestId`, `roomCode`, `playerId`). In Docker the server writes
   ECS JSON (Spring Boot 3.4+ structured logging, reason for the upgrade to
   3.5).
2. **Health and metrics:** Spring Boot Actuator + Micrometer with the
   Prometheus registry, on an internal management port (8081).
3. **Monitoring stack** as an optional compose profile (`monitoring`):
   Prometheus (metrics + alert rules), Loki (logs), Grafana Alloy (ships Docker
   logs to Loki), Grafana (dashboards). All configuration is provisioned from
   files in `infra/monitoring/`.
4. **Alert notifications are deferred.** Rules exist and are visible in
   Prometheus/Grafana; Alertmanager can be added later without changing them.

## Alternatives considered

| Option | Why not (for now) |
|---|---|
| ELK / OpenSearch | Elasticsearch needs several GB of RAM; too heavy for one small host. Loki indexes only labels and is much cheaper. |
| Hosted SaaS (Grafana Cloud, Datadog, Better Stack) | Easy to start, but sends player data to a third party, has free-tier limits, and hides the parts the course wants us to understand. Grafana Cloud stays a drop-in option because Alloy/Prometheus can remote-write to it. |
| Promtail instead of Alloy | Promtail reached end of life in 2026; Alloy is its official replacement. |
| Docker Loki logging driver | Needs a plugin installed on the host, and a Loki outage can block container logging. Alloy reads the normal json-file logs instead. |
| logstash-logback-encoder for JSON | Works on Boot 3.3, but Boot 3.3 was out of OSS support; upgrading gave native JSON logs and security fixes. |
| Tracing (OpenTelemetry + Tempo) | Useful once there are several services; today one server plus request IDs is enough. |

## Consequences

- `docker compose logs server` shows JSON lines; read them with `jq`
  (see `docs/instructions/LOGGING.md`).
- The monitoring containers use roughly 0.5–1 GB RAM extra on the host. They
  run only when the `monitoring` profile is enabled.
- The server image now includes `curl` for the Docker healthcheck, and nginx
  waits for the server to be healthy before starting. The Docker healthcheck
  uses Actuator *liveness*, not *readiness*: since deploys became automatic
  (CD with smoke test and rollback), a database outage must not make
  `deploy.sh` fail before the rollback logic runs. Database health is
  monitored through readiness, metrics and logs instead.
- The CD job copies `infra/monitoring/` to the deploy host with
  `docker-compose.yml`, and image publishing waits for the `infra-config`
  CI checks.
- Metrics are per server instance. If we scale out (Redis-backed rooms), gauges
  like `bodegadk_rooms` must be summed across instances in queries (they
  already use `sum(...)`).
