package dk.bodegadk.push;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

public class JdbcPushSubscriptionStore implements PushSubscriptionStore {
    private final JdbcTemplate jdbcTemplate;

    public JdbcPushSubscriptionStore(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void upsert(StoredPushSubscription subscription) {
        jdbcTemplate.update(
                """
                insert into public.push_subscriptions
                    (endpoint, p256dh_key, auth_key, user_id, username, device_id, device_label, user_agent, active, last_seen_at)
                values (?, ?, ?, ?, ?, ?, ?, ?, true, now())
                on conflict (endpoint) do update
                set p256dh_key = excluded.p256dh_key,
                    auth_key = excluded.auth_key,
                    user_id = excluded.user_id,
                    username = excluded.username,
                    device_id = excluded.device_id,
                    device_label = excluded.device_label,
                    user_agent = excluded.user_agent,
                    active = true,
                    revoked_at = null,
                    last_seen_at = now()
                """,
                subscription.endpoint(),
                subscription.p256dh(),
                subscription.auth(),
                subscription.userId(),
                subscription.username(),
                subscription.deviceId(),
                subscription.deviceLabel(),
                subscription.userAgent()
        );
    }

    @Override
    public Optional<StoredPushSubscription> findActiveByEndpoint(String endpoint) {
        List<StoredPushSubscription> rows = jdbcTemplate.query(
                """
                select endpoint, p256dh_key, auth_key, user_id, username, device_id, device_label, user_agent, created_at, last_seen_at
                from public.push_subscriptions
                where endpoint = ? and active = true
                """,
                mapper(),
                endpoint
        );
        return rows.stream().findFirst();
    }

    @Override
    public List<StoredPushSubscription> activeSubscriptions() {
        return jdbcTemplate.query(
                """
                select endpoint, p256dh_key, auth_key, user_id, username, device_id, device_label, user_agent, created_at, last_seen_at
                from public.push_subscriptions
                where active = true
                order by last_seen_at desc
                """,
                mapper()
        );
    }

    @Override
    public boolean deleteByEndpoint(String endpoint) {
        int updated = jdbcTemplate.update(
                """
                update public.push_subscriptions
                set active = false, revoked_at = now()
                where endpoint = ? and active = true
                """,
                endpoint
        );
        return updated > 0;
    }

    private RowMapper<StoredPushSubscription> mapper() {
        return (rs, rowNum) -> new StoredPushSubscription(
                rs.getString("endpoint"),
                rs.getString("p256dh_key"),
                rs.getString("auth_key"),
                rs.getString("user_id"),
                rs.getString("username"),
                rs.getString("device_id"),
                rs.getString("device_label"),
                rs.getString("user_agent"),
                readInstant(rs, "created_at"),
                readInstant(rs, "last_seen_at")
        );
    }

    private Instant readInstant(ResultSet rs, String column) throws SQLException {
        Timestamp timestamp = rs.getTimestamp(column);
        return timestamp == null ? Instant.now() : timestamp.toInstant();
    }
}
