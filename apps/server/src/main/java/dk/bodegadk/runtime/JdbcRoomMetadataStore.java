package dk.bodegadk.runtime;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public class JdbcRoomMetadataStore implements RoomMetadataStore {
    private final JdbcTemplate jdbcTemplate;

    public JdbcRoomMetadataStore(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public boolean roomExists(String roomCode) {
        Integer count = jdbcTemplate.queryForObject(
                "select count(*) from public.rooms where room_code = ?",
                Integer.class,
                roomCode
        );
        return count != null && count > 0;
    }

    @Override
    public void createRoom(String roomCode, String hostUserId, RoomVisibility visibility, String gameType, InMemoryRuntimeStore.RoomStatus status) {
        jdbcTemplate.update(
                """
                insert into public.rooms (room_code, game_id, host_user_id, status, visibility)
                values (?, public.resolve_game_id(?), ?::uuid, ?, ?)
                """,
                roomCode,
                gameType,
                hostUserId,
                status.name(),
                visibility.name()
        );
    }

    @Override
    public Optional<StoredRoom> room(String roomCode) {
        List<StoredRoom> rooms = jdbcTemplate.query(
                """
                select rooms.room_code, rooms.host_user_id::text as host_user_id, rooms.visibility,
                       games.slug as game_type, rooms.status
                from public.rooms
                join public.games on games.id = rooms.game_id
                where rooms.room_code = ?
                """,
                (rs, rowNum) -> mapRoom(rs, loadParticipants(roomCode)),
                roomCode
        );
        return rooms.stream().findFirst();
    }

    @Override
    public List<StoredRoom> publicRooms() {
        return jdbcTemplate.query(
                """
                select rooms.room_code, rooms.host_user_id::text as host_user_id, rooms.visibility,
                       games.slug as game_type, rooms.status
                from public.rooms
                join public.games on games.id = rooms.game_id
                where rooms.visibility = 'PUBLIC' and rooms.status = 'LOBBY'
                  and exists (
                      select 1
                      from public.room_players
                      where room_players.room_id = rooms.id
                        and room_players.status in ('JOINED', 'READY')
                        and room_players.updated_at >= now() - interval '2 minutes'
                  )
                order by rooms.created_at asc, rooms.room_code asc
                """,
                (rs, rowNum) -> {
                    String roomCode = rs.getString("room_code");
                    return mapRoom(rs, loadParticipants(roomCode));
                }
        );
    }

    @Override
    public void upsertParticipant(String roomCode, String userId, String username) {
        jdbcTemplate.update(
                """
                insert into public.room_players (room_id, user_id, status, username_snapshot)
                select rooms.id, ?::uuid, 'JOINED', ?
                from public.rooms
                where rooms.room_code = ?
                on conflict (room_id, user_id) do update
                set status = 'JOINED',
                    username_snapshot = excluded.username_snapshot
                """,
                userId,
                username,
                roomCode
        );
    }

    @Override
    public void removeParticipant(String roomCode, String userId) {
        jdbcTemplate.update(
                """
                update public.room_players
                set status = 'LEFT'
                where room_id = (select id from public.rooms where room_code = ?)
                  and user_id = ?::uuid
                """,
                roomCode,
                userId
        );
    }

    @Override
    public void updateRoomHost(String roomCode, String hostUserId) {
        jdbcTemplate.update(
                "update public.rooms set host_user_id = ?::uuid where room_code = ?",
                hostUserId,
                roomCode
        );
    }

    @Override
    public void updateRoomGameType(String roomCode, String gameType) {
        jdbcTemplate.update(
                "update public.rooms set game_id = public.resolve_game_id(?) where room_code = ?",
                gameType,
                roomCode
        );
    }

    @Override
    public void updateRoomVisibility(String roomCode, RoomVisibility visibility) {
        jdbcTemplate.update(
                "update public.rooms set visibility = ? where room_code = ?",
                visibility.name(),
                roomCode
        );
    }

    @Override
    public void updateRoomStatus(String roomCode, InMemoryRuntimeStore.RoomStatus status) {
        jdbcTemplate.update(
                "update public.rooms set status = ?, last_heartbeat = case when ? = 'IN_GAME' then now() else last_heartbeat end where room_code = ?",
                status.name(),
                status.name(),
                roomCode
        );
    }

    @Override
    public void deleteRoom(String roomCode) {
        jdbcTemplate.update("update public.rooms set status = 'ABANDONED' where room_code = ?", roomCode);
    }

    @Override
    public UUID enqueueTicket(String gameType, String userId, String username, String clientSessionId, int minPlayers, int maxPlayers, boolean strictCount) {
        List<UUID> existingTickets = jdbcTemplate.query(
                """
                select id
                from public.matchmaking_tickets
                where user_id = ?::uuid and status = 'WAITING'
                order by created_at asc
                limit 1
                """,
                (rs, rowNum) -> UUID.fromString(rs.getString("id")),
                userId
        );
        if (!existingTickets.isEmpty()) {
            return existingTickets.getFirst();
        }

        UUID ticketId = UUID.randomUUID();
        jdbcTemplate.update(
                """
                insert into public.matchmaking_tickets
                    (id, game_id, user_id, client_session_id, username_snapshot, status, min_players, max_players, strict_count)
                values (?, public.resolve_game_id(?), ?::uuid, ?, ?, 'WAITING', ?, ?, ?)
                """,
                ticketId,
                gameType,
                userId,
                clientSessionId,
                username,
                minPlayers,
                maxPlayers,
                strictCount
        );
        return ticketId;
    }

    @Override
    public Optional<MatchmakingTicket> ticket(UUID ticketId) {
        List<MatchmakingTicket> tickets = jdbcTemplate.query(
                """
                select tickets.id, games.slug as game_type, tickets.user_id::text as user_id,
                       tickets.username_snapshot, tickets.client_session_id, tickets.status,
                       rooms.room_code, tickets.min_players, tickets.max_players, tickets.strict_count, tickets.created_at
                from public.matchmaking_tickets tickets
                join public.games on games.id = tickets.game_id
                left join public.rooms on rooms.id = tickets.matched_room_id
                where tickets.id = ?
                """,
                ticketMapper(),
                ticketId
        );
        return tickets.stream().findFirst();
    }

    @Override
    public List<MatchmakingTicket> waitingTickets(String gameType) {
        return jdbcTemplate.query(
                """
                select tickets.id, games.slug as game_type, tickets.user_id::text as user_id,
                       tickets.username_snapshot, tickets.client_session_id, tickets.status,
                       rooms.room_code, tickets.min_players, tickets.max_players, tickets.strict_count, tickets.created_at
                from public.matchmaking_tickets tickets
                join public.games on games.id = tickets.game_id
                left join public.rooms on rooms.id = tickets.matched_room_id
                where games.slug = ? and tickets.status = 'WAITING'
                order by tickets.created_at asc
                """,
                ticketMapper(),
                gameType
        );
    }

    @Override
    public void markTicketMatched(UUID ticketId, String roomCode) {
        jdbcTemplate.update(
                """
                update public.matchmaking_tickets
                set status = 'MATCHED',
                    matched_room_id = (select id from public.rooms where room_code = ?)
                where id = ?
                """,
                roomCode,
                ticketId
        );
    }

    @Override
    public void cancelTicket(UUID ticketId) {
        jdbcTemplate.update(
                "update public.matchmaking_tickets set status = 'CANCELLED' where id = ?",
                ticketId
        );
    }

    @Override
    public void markRoomAbandoned(String roomCode) {
        jdbcTemplate.update("update public.rooms set status = 'ABANDONED' where room_code = ?", roomCode);
    }

    private StoredRoom mapRoom(ResultSet rs, List<InMemoryRuntimeStore.PlayerSummary> participants) throws SQLException {
        return new StoredRoom(
                rs.getString("room_code"),
                rs.getString("host_user_id"),
                RoomVisibility.valueOf(rs.getString("visibility")),
                rs.getString("game_type"),
                InMemoryRuntimeStore.RoomStatus.valueOf(rs.getString("status")),
                participants
        );
    }

    private List<InMemoryRuntimeStore.PlayerSummary> loadParticipants(String roomCode) {
        return jdbcTemplate.query(
                """
                select user_id::text as user_id, username_snapshot
                from public.room_players
                where room_id = (select id from public.rooms where room_code = ?)
                  and status in ('JOINED', 'READY')
                order by joined_at asc, user_id asc
                """,
                (rs, rowNum) -> new InMemoryRuntimeStore.PlayerSummary(rs.getString("user_id"), rs.getString("username_snapshot")),
                roomCode
        );
    }

    private RowMapper<MatchmakingTicket> ticketMapper() {
        return (rs, rowNum) -> new MatchmakingTicket(
                UUID.fromString(rs.getString("id")),
                rs.getString("game_type"),
                rs.getString("user_id"),
                rs.getString("username_snapshot"),
                rs.getString("client_session_id"),
                MatchmakingTicketStatus.valueOf(rs.getString("status")),
                rs.getString("room_code"),
                rs.getInt("min_players"),
                rs.getInt("max_players"),
                rs.getBoolean("strict_count"),
                readInstant(rs, "created_at")
        );
    }

    private Instant readInstant(ResultSet rs, String column) throws SQLException {
        Timestamp timestamp = rs.getTimestamp(column);
        return timestamp == null ? Instant.now() : timestamp.toInstant();
    }
}
