package dk.bodegadk.runtime;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;

public class JdbcFriendsStore implements FriendsStore {
    private final JdbcTemplate jdbcTemplate;
    private final NotificationsStore notificationsStore;

    public JdbcFriendsStore(JdbcTemplate jdbcTemplate) {
        this(jdbcTemplate, null);
    }

    public JdbcFriendsStore(JdbcTemplate jdbcTemplate, NotificationsStore notificationsStore) {
        this.jdbcTemplate = jdbcTemplate;
        this.notificationsStore = notificationsStore;
    }

    @Override
    public List<FriendshipSummary> acceptedFriends(String currentUserId) {
        return jdbcTemplate.query(
                friendshipSelect("""
                where friendships.status = 'ACCEPTED'
                  and (friendships.requester_user_id = ?::uuid or friendships.addressee_user_id = ?::uuid)
                order by lower(coalesce(other_profile.display_name, other_profile.username, other_profile.user_id::text)) asc,
                         friendships.updated_at desc
                """),
                this::mapFriendship,
                currentUserId,
                currentUserId,
                currentUserId
        );
    }

    @Override
    public FriendRequestPage pendingRequests(String currentUserId) {
        List<FriendshipSummary> incoming = jdbcTemplate.query(
                friendshipSelect("""
                where friendships.status = 'PENDING'
                  and friendships.addressee_user_id = ?::uuid
                order by friendships.created_at desc
                """),
                this::mapFriendship,
                currentUserId,
                currentUserId
        );
        List<FriendshipSummary> outgoing = jdbcTemplate.query(
                friendshipSelect("""
                where friendships.status = 'PENDING'
                  and friendships.requester_user_id = ?::uuid
                order by friendships.created_at desc
                """),
                this::mapFriendship,
                currentUserId,
                currentUserId
        );
        return new FriendRequestPage(incoming, outgoing);
    }

    @Override
    public FriendshipSummary sendRequest(String currentUserId, String username) {
        String normalizedUsername = normalizeUsername(username);
        String targetUserId = userIdForUsername(normalizedUsername);
        if (currentUserId.equals(targetUserId)) {
            throw new SelfFriendshipException();
        }

        FriendshipSummary existing = existingPair(currentUserId, targetUserId);
        if (existing != null) {
            if ("DECLINED".equals(existing.status())) {
                jdbcTemplate.update("delete from public.friendships where id = ?::uuid", existing.id());
            } else {
                throw new DuplicateFriendshipException("Friendship already exists");
            }
        }

        try {
            String friendshipId = jdbcTemplate.queryForObject(
                    """
                    insert into public.friendships (requester_user_id, addressee_user_id, status)
                    values (?::uuid, ?::uuid, 'PENDING')
                    returning id::text
                    """,
                    String.class,
                    currentUserId,
                    targetUserId
            );
            FriendshipSummary friendship = friendship(friendshipId);
            notifyFriendRequest(friendship);
            return friendship;
        } catch (DataIntegrityViolationException exception) {
            throw new DuplicateFriendshipException("Friendship already exists");
        }
    }

    @Override
    public FriendshipSummary acceptRequest(String currentUserId, String friendshipId) {
        int updated = jdbcTemplate.update(
                """
                update public.friendships
                set status = 'ACCEPTED'
                where id = ?::uuid
                  and addressee_user_id = ?::uuid
                  and status = 'PENDING'
                """,
                friendshipId,
                currentUserId
        );
        if (updated == 0) {
            throw new FriendNotFoundException("Friend request not found");
        }
        FriendshipSummary friendship = friendship(friendshipId);
        notifyFriendAccepted(friendship);
        return friendship;
    }

    @Override
    public FriendshipSummary declineRequest(String currentUserId, String friendshipId) {
        int updated = jdbcTemplate.update(
                """
                update public.friendships
                set status = 'DECLINED'
                where id = ?::uuid
                  and addressee_user_id = ?::uuid
                  and status = 'PENDING'
                """,
                friendshipId,
                currentUserId
        );
        if (updated == 0) {
            throw new FriendNotFoundException("Friend request not found");
        }
        return friendship(friendshipId);
    }

    @Override
    public void remove(String currentUserId, String friendshipId) {
        int deleted = jdbcTemplate.update(
                """
                delete from public.friendships
                where id = ?::uuid
                  and (requester_user_id = ?::uuid or addressee_user_id = ?::uuid)
                """,
                friendshipId,
                currentUserId,
                currentUserId
        );
        if (deleted == 0) {
            throw new FriendNotFoundException("Friendship not found");
        }
    }

    private String normalizeUsername(String username) {
        if (username == null || username.isBlank()) {
            throw new IllegalArgumentException("username is required");
        }
        return username.trim();
    }

    private String userIdForUsername(String username) {
        try {
            return jdbcTemplate.queryForObject(
                    """
                    select user_id::text
                    from public.profiles
                    where username = ?
                    """,
                    String.class,
                    username
            );
        } catch (EmptyResultDataAccessException exception) {
            throw new FriendNotFoundException("User not found");
        }
    }

    private FriendshipSummary existingPair(String currentUserId, String targetUserId) {
        try {
            return jdbcTemplate.queryForObject(
                    friendshipSelect("""
                    where least(friendships.requester_user_id, friendships.addressee_user_id) = least(?::uuid, ?::uuid)
                      and greatest(friendships.requester_user_id, friendships.addressee_user_id) = greatest(?::uuid, ?::uuid)
                    limit 1
                    """),
                    this::mapFriendship,
                    currentUserId,
                    currentUserId,
                    targetUserId,
                    currentUserId,
                    targetUserId
            );
        } catch (EmptyResultDataAccessException exception) {
            return null;
        }
    }

    private FriendshipSummary friendship(String friendshipId) {
        try {
            return jdbcTemplate.queryForObject(
                    friendshipSelect("where friendships.id = ?::uuid"),
                    this::mapFriendship,
                    null,
                    friendshipId
            );
        } catch (EmptyResultDataAccessException exception) {
            throw new FriendNotFoundException("Friendship not found");
        }
    }

    private String friendshipSelect(String whereClause) {
        return """
                select
                  friendships.id::text as id,
                  friendships.status,
                  friendships.requester_user_id::text as requester_user_id,
                  requester_profile.username as requester_username,
                  requester_profile.display_name as requester_display_name,
                  friendships.addressee_user_id::text as addressee_user_id,
                  addressee_profile.username as addressee_username,
                  addressee_profile.display_name as addressee_display_name,
                  friendships.created_at,
                  friendships.updated_at
                from public.friendships
                left join public.profiles requester_profile on requester_profile.user_id = friendships.requester_user_id
                left join public.profiles addressee_profile on addressee_profile.user_id = friendships.addressee_user_id
                left join public.profiles other_profile
                  on other_profile.user_id = case
                    when friendships.requester_user_id = ?::uuid then friendships.addressee_user_id
                    else friendships.requester_user_id
                  end
                """ + whereClause;
    }

    private FriendshipSummary mapFriendship(java.sql.ResultSet rs, int rowNum) throws java.sql.SQLException {
        return new FriendshipSummary(
                rs.getString("id"),
                rs.getString("status"),
                new FriendUser(
                        rs.getString("requester_user_id"),
                        fallback(rs.getString("requester_username"), rs.getString("requester_user_id")),
                        rs.getString("requester_display_name")
                ),
                new FriendUser(
                        rs.getString("addressee_user_id"),
                        fallback(rs.getString("addressee_username"), rs.getString("addressee_user_id")),
                        rs.getString("addressee_display_name")
                ),
                toInstant(rs.getTimestamp("created_at")),
                toInstant(rs.getTimestamp("updated_at"))
        );
    }

    private String fallback(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }

    private Instant toInstant(Timestamp timestamp) {
        return timestamp == null ? null : timestamp.toInstant();
    }

    private void notifyFriendRequest(FriendshipSummary friendship) {
        if (notificationsStore == null) {
            return;
        }
        notificationsStore.createIfUnreadMissing(
                friendship.addressee().userId(),
                friendship.requester().userId(),
                "friend.request.received",
                Map.of(
                        "entityKey", friendship.id(),
                        "friendshipId", friendship.id(),
                        "action", "profile"
                )
        );
    }

    private void notifyFriendAccepted(FriendshipSummary friendship) {
        if (notificationsStore == null) {
            return;
        }
        notificationsStore.createIfUnreadMissing(
                friendship.requester().userId(),
                friendship.addressee().userId(),
                "friend.request.accepted",
                Map.of(
                        "entityKey", friendship.id(),
                        "friendshipId", friendship.id(),
                        "action", "profile"
                )
        );
    }
}
