package dk.bodegadk.runtime;

import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Map;

public class JdbcChallengesStore implements ChallengesStore {
    private static final int DEFAULT_EXPIRY_HOURS = 24;

    private final JdbcTemplate jdbcTemplate;
    private final GameCatalogService gameCatalogService;
    private final RoomMetadataStore roomMetadataStore;
    private final InMemoryRuntimeStore runtimeStore;
    private final NotificationsStore notificationsStore;

    public JdbcChallengesStore(
            JdbcTemplate jdbcTemplate,
            GameCatalogService gameCatalogService,
            RoomMetadataStore roomMetadataStore,
            InMemoryRuntimeStore runtimeStore,
            NotificationsStore notificationsStore
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.gameCatalogService = gameCatalogService;
        this.roomMetadataStore = roomMetadataStore;
        this.runtimeStore = runtimeStore;
        this.notificationsStore = notificationsStore;
    }

    @Override
    public ChallengeSummary createChallenge(String challengerUserId, String username, String gameType) {
        expireOldChallenges();
        String targetUsername = normalizeUsername(username);
        String challengedUserId = userIdForUsername(targetUsername);
        if (challengerUserId.equals(challengedUserId)) {
            throw new ChallengeValidationException("Users cannot challenge themselves");
        }
        if (!areAcceptedFriends(challengerUserId, challengedUserId)) {
            throw new ChallengeValidationException("Challenges are limited to friends");
        }

        GameSummary game = activeGame(gameCatalogService.normalize(gameType));
        String challengeId = jdbcTemplate.queryForObject(
                """
                insert into public.challenges (challenger_user_id, challenged_user_id, game_id, status, expires_at)
                values (?::uuid, ?::uuid, ?::uuid, 'PENDING', now() + (? || ' hours')::interval)
                returning id::text
                """,
                String.class,
                challengerUserId,
                challengedUserId,
                game.id(),
                String.valueOf(DEFAULT_EXPIRY_HOURS)
        );
        ChallengeSummary challenge = challenge(challengeId);
        notifyChallengeReceived(challenge);
        return challenge;
    }

    @Override
    public ChallengeAcceptResult acceptChallenge(String challengedUserId, String challengeId) {
        expireOldChallenges();
        ChallengeSummary existing = challengeForParticipant(challengeId, challengedUserId);
        if (!existing.challenged().userId().equals(challengedUserId)) {
            throw new ChallengeNotFoundException("Challenge not found");
        }
        if (!"PENDING".equals(existing.status())) {
            throw new ChallengeConflictException("Challenge is not pending");
        }
        if (existing.expiresAt() != null && !existing.expiresAt().isAfter(Instant.now())) {
            expireOldChallenges();
            throw new ChallengeConflictException("Challenge has expired");
        }

        ChallengeRoom room = createPrivateLobby(existing);
        int updated = jdbcTemplate.update(
                """
                update public.challenges
                set status = 'ACCEPTED',
                    room_id = (select id from public.rooms where room_code = ?),
                    responded_at = now()
                where id = ?::uuid
                  and challenged_user_id = ?::uuid
                  and status = 'PENDING'
                """,
                room.roomCode(),
                challengeId,
                challengedUserId
        );
        if (updated == 0) {
            throw new ChallengeConflictException("Challenge is not pending");
        }
        ChallengeSummary challenge = challenge(challengeId);
        notifyChallengeAccepted(challenge, room);
        return new ChallengeAcceptResult(challenge, room);
    }

    @Override
    public ChallengeSummary declineChallenge(String challengedUserId, String challengeId) {
        ChallengeSummary existing = challengeForParticipant(challengeId, challengedUserId);
        if (!existing.challenged().userId().equals(challengedUserId)) {
            throw new ChallengeNotFoundException("Challenge not found");
        }
        int updated = jdbcTemplate.update(
                """
                update public.challenges
                set status = 'DECLINED',
                    responded_at = now()
                where id = ?::uuid
                  and challenged_user_id = ?::uuid
                  and status = 'PENDING'
                """,
                challengeId,
                challengedUserId
        );
        if (updated == 0) {
            throw new ChallengeConflictException("Challenge is not pending");
        }
        ChallengeSummary challenge = challenge(challengeId);
        notifyChallengeDeclined(challenge);
        return challenge;
    }

    @Override
    public ChallengeSummary cancelChallenge(String challengerUserId, String challengeId) {
        ChallengeSummary existing = challengeForParticipant(challengeId, challengerUserId);
        if (!existing.challenger().userId().equals(challengerUserId)) {
            throw new ChallengeNotFoundException("Challenge not found");
        }
        int updated = jdbcTemplate.update(
                """
                update public.challenges
                set status = 'CANCELLED',
                    responded_at = now()
                where id = ?::uuid
                  and challenger_user_id = ?::uuid
                  and status = 'PENDING'
                """,
                challengeId,
                challengerUserId
        );
        if (updated == 0) {
            throw new ChallengeConflictException("Challenge is not pending");
        }
        return challenge(challengeId);
    }

    private ChallengeRoom createPrivateLobby(ChallengeSummary challenge) {
        String roomCode;
        do {
            roomCode = runtimeStore.generateRoomCode();
        } while (roomMetadataStore.roomExists(roomCode));

        roomMetadataStore.createRoom(
                roomCode,
                challenge.challenger().userId(),
                RoomMetadataStore.RoomVisibility.PRIVATE,
                challenge.game().slug(),
                InMemoryRuntimeStore.RoomStatus.LOBBY
        );
        runtimeStore.mirrorRoom(roomCode, challenge.game().slug(), true, challenge.challenger().userId(), InMemoryRuntimeStore.RoomStatus.LOBBY);
        runtimeStore.joinRoom(
                roomCode,
                challenge.challenger().userId(),
                challenge.challenger().username(),
                MatchmakingService.runtimeToken(roomCode, challenge.challenger().userId())
        );
        runtimeStore.joinRoom(
                roomCode,
                challenge.challenged().userId(),
                challenge.challenged().username(),
                MatchmakingService.runtimeToken(roomCode, challenge.challenged().userId())
        );
        roomMetadataStore.upsertParticipant(roomCode, challenge.challenger().userId(), challenge.challenger().username());
        roomMetadataStore.upsertParticipant(roomCode, challenge.challenged().userId(), challenge.challenged().username());
        return new ChallengeRoom(
                roomCode,
                challenge.challenged().userId(),
                challenge.challenger().userId(),
                true,
                challenge.game().slug(),
                InMemoryRuntimeStore.RoomStatus.LOBBY.name()
        );
    }

    private void notifyChallengeReceived(ChallengeSummary challenge) {
        notificationsStore.createIfUnreadMissing(
                challenge.challenged().userId(),
                challenge.challenger().userId(),
                "challenge.received",
                Map.of(
                        "entityKey", challenge.id(),
                        "challengeId", challenge.id(),
                        "gameType", challenge.game().slug(),
                        "action", "challenge"
                )
        );
    }

    private void notifyChallengeAccepted(ChallengeSummary challenge, ChallengeRoom room) {
        notificationsStore.createIfUnreadMissing(
                challenge.challenger().userId(),
                challenge.challenged().userId(),
                "challenge.accepted",
                Map.of(
                        "entityKey", challenge.id(),
                        "challengeId", challenge.id(),
                        "gameType", challenge.game().slug(),
                        "roomCode", room.roomCode(),
                        "action", "room"
                )
        );
    }

    private void notifyChallengeDeclined(ChallengeSummary challenge) {
        notificationsStore.createIfUnreadMissing(
                challenge.challenger().userId(),
                challenge.challenged().userId(),
                "challenge.declined",
                Map.of(
                        "entityKey", challenge.id(),
                        "challengeId", challenge.id(),
                        "gameType", challenge.game().slug(),
                        "action", "profile"
                )
        );
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

    private String normalizeUsername(String username) {
        if (username == null || username.isBlank()) {
            throw new ChallengeValidationException("username is required");
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
            throw new ChallengeNotFoundException("User not found");
        }
    }

    private boolean areAcceptedFriends(String userA, String userB) {
        Integer count = jdbcTemplate.queryForObject(
                """
                select count(*)
                from public.friendships
                where status = 'ACCEPTED'
                  and least(requester_user_id, addressee_user_id) = least(?::uuid, ?::uuid)
                  and greatest(requester_user_id, addressee_user_id) = greatest(?::uuid, ?::uuid)
                """,
                Integer.class,
                userA,
                userB,
                userA,
                userB
        );
        return count != null && count > 0;
    }

    private GameSummary activeGame(String gameType) {
        if (gameCatalogService.find(gameType).isEmpty() || !gameCatalogService.require(gameType).lobbyEnabled()) {
            throw new ChallengeValidationException("Game is not challengeable");
        }
        try {
            return jdbcTemplate.queryForObject(
                    """
                    select id::text as id, slug, title
                    from public.games
                    where slug = ?
                      and is_active = true
                    """,
                    (rs, rowNum) -> new GameSummary(rs.getString("id"), rs.getString("slug"), rs.getString("title")),
                    gameType
            );
        } catch (EmptyResultDataAccessException exception) {
            throw new ChallengeValidationException("Game is not active");
        }
    }

    private ChallengeSummary challengeForParticipant(String challengeId, String currentUserId) {
        try {
            return jdbcTemplate.queryForObject(
                    challengeSelect("""
                    where challenges.id = ?::uuid
                      and (challenges.challenger_user_id = ?::uuid or challenges.challenged_user_id = ?::uuid)
                    """),
                    this::mapChallenge,
                    challengeId,
                    currentUserId,
                    currentUserId
            );
        } catch (EmptyResultDataAccessException exception) {
            throw new ChallengeNotFoundException("Challenge not found");
        }
    }

    private ChallengeSummary challenge(String challengeId) {
        try {
            return jdbcTemplate.queryForObject(
                    challengeSelect("where challenges.id = ?::uuid"),
                    this::mapChallenge,
                    challengeId
            );
        } catch (EmptyResultDataAccessException exception) {
            throw new ChallengeNotFoundException("Challenge not found");
        }
    }

    private String challengeSelect(String whereClause) {
        return """
                select
                  challenges.id::text as id,
                  challenges.status,
                  challenges.challenger_user_id::text as challenger_user_id,
                  challenger_profile.username as challenger_username,
                  challenger_profile.display_name as challenger_display_name,
                  challenges.challenged_user_id::text as challenged_user_id,
                  challenged_profile.username as challenged_username,
                  challenged_profile.display_name as challenged_display_name,
                  games.id::text as game_id,
                  games.slug as game_slug,
                  games.title as game_title,
                  rooms.room_code,
                  challenges.created_at,
                  challenges.expires_at,
                  challenges.responded_at
                from public.challenges
                join public.games on games.id = challenges.game_id
                left join public.rooms on rooms.id = challenges.room_id
                left join public.profiles challenger_profile on challenger_profile.user_id = challenges.challenger_user_id
                left join public.profiles challenged_profile on challenged_profile.user_id = challenges.challenged_user_id
                """ + whereClause;
    }

    private ChallengeSummary mapChallenge(ResultSet rs, int rowNum) throws SQLException {
        String challengerUserId = rs.getString("challenger_user_id");
        String challengedUserId = rs.getString("challenged_user_id");
        return new ChallengeSummary(
                rs.getString("id"),
                rs.getString("status"),
                new FriendsStore.FriendUser(
                        challengerUserId,
                        fallback(rs.getString("challenger_username"), challengerUserId),
                        rs.getString("challenger_display_name")
                ),
                new FriendsStore.FriendUser(
                        challengedUserId,
                        fallback(rs.getString("challenged_username"), challengedUserId),
                        rs.getString("challenged_display_name")
                ),
                new GameSummary(rs.getString("game_id"), rs.getString("game_slug"), rs.getString("game_title")),
                rs.getString("room_code"),
                toInstant(rs.getTimestamp("created_at")),
                toInstant(rs.getTimestamp("expires_at")),
                toInstant(rs.getTimestamp("responded_at"))
        );
    }

    private String fallback(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }

    private Instant toInstant(Timestamp timestamp) {
        return timestamp == null ? null : timestamp.toInstant();
    }
}
