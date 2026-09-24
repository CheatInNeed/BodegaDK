package dk.bodegadk.social;

import org.springframework.jdbc.core.JdbcTemplate;

import java.time.Instant;
import java.util.UUID;

public class JdbcFriendRequestStore implements FriendRequestStore {
    private final JdbcTemplate jdbcTemplate;

    public JdbcFriendRequestStore(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public FriendRequest create(String senderUserId, String senderUsername, String recipientUserId) {
        UUID requestId = UUID.randomUUID();
        jdbcTemplate.update(
                """
                insert into public.friend_requests
                    (request_id, sender_user_id, sender_username, recipient_user_id, request_status)
                values (?, ?, ?, ?, 'PENDING')
                """,
                requestId,
                senderUserId,
                clean(senderUsername),
                recipientUserId
        );
        return new FriendRequest(
                requestId,
                senderUserId,
                clean(senderUsername),
                recipientUserId,
                FriendRequest.FriendRequestStatus.PENDING,
                Instant.now()
        );
    }

    private String clean(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
