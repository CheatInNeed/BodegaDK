package dk.bodegadk.runtime;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;

public class JdbcNotificationsStore implements NotificationsStore {
    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {
    };

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public JdbcNotificationsStore(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    @Override
    public NotificationPage notifications(String currentUserId, int limit) {
        int boundedLimit = Math.max(1, Math.min(limit, 50));
        expireOldChallenges();
        Integer unreadCount = jdbcTemplate.queryForObject(
                """
                select count(*)
                from public.notifications
                where user_id = ?::uuid
                  and read_at is null
                """,
                Integer.class,
                currentUserId
        );
        List<NotificationSummary> items = jdbcTemplate.query(
                notificationSelect("""
                where notifications.user_id = ?::uuid
                order by notifications.created_at desc
                limit ?
                """),
                this::mapNotification,
                currentUserId,
                boundedLimit
        );
        return new NotificationPage(items, unreadCount == null ? 0 : unreadCount, boundedLimit);
    }

    @Override
    public NotificationSummary markRead(String currentUserId, String notificationId) {
        int updated = jdbcTemplate.update(
                """
                update public.notifications
                set read_at = coalesce(read_at, now())
                where id = ?::uuid
                  and user_id = ?::uuid
                """,
                notificationId,
                currentUserId
        );
        if (updated == 0) {
            throw new NotificationNotFoundException("Notification not found");
        }
        return notification(currentUserId, notificationId);
    }

    @Override
    public void markAllRead(String currentUserId) {
        jdbcTemplate.update(
                """
                update public.notifications
                set read_at = coalesce(read_at, now())
                where user_id = ?::uuid
                  and read_at is null
                """,
                currentUserId
        );
    }

    @Override
    public void createIfUnreadMissing(String userId, String actorUserId, String type, Map<String, Object> payload) {
        String entityKey = entityKey(payload);
        Integer existing = jdbcTemplate.queryForObject(
                """
                select count(*)
                from public.notifications
                where user_id = ?::uuid
                  and type = ?
                  and read_at is null
                  and coalesce(payload ->> 'entityKey', '') = ?
                """,
                Integer.class,
                userId,
                type,
                entityKey
        );
        if (existing != null && existing > 0) {
            return;
        }

        jdbcTemplate.update(
                """
                insert into public.notifications (user_id, actor_user_id, type, payload)
                values (?::uuid, ?::uuid, ?, ?::jsonb)
                """,
                userId,
                actorUserId,
                type,
                jsonPayload(payload)
        );
    }

    private NotificationSummary notification(String currentUserId, String notificationId) {
        try {
            return jdbcTemplate.queryForObject(
                    notificationSelect("""
                    where notifications.id = ?::uuid
                      and notifications.user_id = ?::uuid
                    """),
                    this::mapNotification,
                    notificationId,
                    currentUserId
            );
        } catch (EmptyResultDataAccessException exception) {
            throw new NotificationNotFoundException("Notification not found");
        }
    }

    private void expireOldChallenges() {
        jdbcTemplate.update(
                """
                update public.challenges
                set status = 'EXPIRED'
                where status = 'PENDING'
                  and expires_at is not null
                  and expires_at <= now()
                """
        );
    }

    private String entityKey(Map<String, Object> payload) {
        Object value = payload.get("entityKey");
        if (value instanceof String text && !text.isBlank()) {
            return text;
        }
        for (String key : List.of("challengeId", "friendshipId", "roomCode")) {
            Object candidate = payload.get(key);
            if (candidate instanceof String text && !text.isBlank()) {
                return text;
            }
        }
        return "";
    }

    private String jsonPayload(Map<String, Object> payload) {
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (Exception exception) {
            throw new IllegalArgumentException("Invalid notification payload", exception);
        }
    }

    private String notificationSelect(String whereClause) {
        return """
                select
                  notifications.id::text as id,
                  notifications.type,
                  notifications.payload,
                  notifications.read_at,
                  notifications.created_at,
                  notifications.actor_user_id::text as actor_user_id,
                  actor_profile.username as actor_username,
                  actor_profile.display_name as actor_display_name
                from public.notifications
                left join public.profiles actor_profile on actor_profile.user_id = notifications.actor_user_id
                """ + whereClause;
    }

    private NotificationSummary mapNotification(ResultSet rs, int rowNum) throws SQLException {
        String actorUserId = rs.getString("actor_user_id");
        return new NotificationSummary(
                rs.getString("id"),
                rs.getString("type"),
                actorUserId == null ? null : new FriendsStore.FriendUser(
                        actorUserId,
                        fallback(rs.getString("actor_username"), actorUserId),
                        rs.getString("actor_display_name")
                ),
                readPayload(rs.getObject("payload")),
                toInstant(rs.getTimestamp("read_at")),
                toInstant(rs.getTimestamp("created_at"))
        );
    }

    private Map<String, Object> readPayload(Object rawPayload) {
        try {
            if (rawPayload == null) {
                return Map.of();
            }
            if (rawPayload instanceof String text) {
                return objectMapper.readValue(text, MAP_TYPE);
            }
            return objectMapper.convertValue(rawPayload, MAP_TYPE);
        } catch (Exception exception) {
            return Map.of();
        }
    }

    private String fallback(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }

    private Instant toInstant(Timestamp timestamp) {
        return timestamp == null ? null : timestamp.toInstant();
    }
}
