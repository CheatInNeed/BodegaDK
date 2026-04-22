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
    public void createRoom(String roomCode, String hostPlayerId, boolean isPrivate, String gameType, InMemoryRuntimeStore.RoomStatus status) {
        jdbcTemplate.update(
                """
                insert into public.rooms (room_code, host_player_id, game_type, room_status, is_private)
                values (?, ?, ?, ?, ?)
                """,
                roomCode,
                hostPlayerId,
                gameType,
                status.name(),
                isPrivate
        );
    }

    @Override
    public Optional<StoredRoom> room(String roomCode) {
        List<StoredRoom> rooms = jdbcTemplate.query(
                "select room_code, host_player_id, is_private, game_type, room_status from public.rooms where room_code = ?",
                (rs, rowNum) -> mapRoom(rs, loadParticipants(roomCode)),
                roomCode
        );
        return rooms.stream().findFirst();
    }

    @Override
    public List<StoredRoom> publicRooms() {
        return jdbcTemplate.query(
                "select room_code, host_player_id, is_private, game_type, room_status from public.rooms where is_private = false order by room_code asc",
                (rs, rowNum) -> {
                    String roomCode = rs.getString("room_code");
                    return mapRoom(rs, loadParticipants(roomCode));
                }
        );
    }

    @Override
    public void upsertParticipant(String roomCode, String playerId, String username) {
        jdbcTemplate.update(
                """
                insert into public.room_players (room_code, player_id, username)
                values (?, ?, ?)
                on conflict (room_code, player_id) do update
                set username = excluded.username
                """,
                roomCode,
                playerId,
                username
        );
    }

    @Override
    public void removeParticipant(String roomCode, String playerId) {
        jdbcTemplate.update(
                "delete from public.room_players where room_code = ? and player_id = ?",
                roomCode,
                playerId
        );
    }

    @Override
    public void updateRoomHost(String roomCode, String hostPlayerId) {
        jdbcTemplate.update(
                "update public.rooms set host_player_id = ? where room_code = ?",
                hostPlayerId,
                roomCode
        );
    }

    @Override
    public void updateRoomGameType(String roomCode, String gameType) {
        jdbcTemplate.update(
                "update public.rooms set game_type = ? where room_code = ?",
                gameType,
                roomCode
        );
    }

    @Override
    public void updateRoomStatus(String roomCode, InMemoryRuntimeStore.RoomStatus status) {
        jdbcTemplate.update(
                "update public.rooms set room_status = ? where room_code = ?",
                status.name(),
                roomCode
        );
    }

    @Override
    public void deleteRoom(String roomCode) {
        jdbcTemplate.update("delete from public.rooms where room_code = ?", roomCode);
    }

    @Override
    public UUID enqueueTicket(String gameType, String playerId, String username, String token, int minPlayers, int maxPlayers, boolean strictCount) {
        List<UUID> existingTickets = jdbcTemplate.query(
                """
                select ticket_id
                from public.matchmaking_tickets
                where player_id = ? and ticket_status = 'WAITING'
                order by created_at asc
                limit 1
                """,
                (rs, rowNum) -> UUID.fromString(rs.getString("ticket_id")),
                playerId
        );
        if (!existingTickets.isEmpty()) {
            return existingTickets.getFirst();
        }

        UUID ticketId = UUID.randomUUID();
        jdbcTemplate.update(
                """
                insert into public.matchmaking_tickets
                    (ticket_id, game_type, player_id, username, session_token, ticket_status, min_players, max_players, strict_count)
                values (?, ?, ?, ?, ?, 'WAITING', ?, ?, ?)
                """,
                ticketId,
                gameType,
                playerId,
                username,
                token,
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
                select ticket_id, game_type, player_id, username, session_token, ticket_status, room_code,
                       min_players, max_players, strict_count, created_at
                from public.matchmaking_tickets
                where ticket_id = ?
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
                select ticket_id, game_type, player_id, username, session_token, ticket_status, room_code,
                       min_players, max_players, strict_count, created_at
                from public.matchmaking_tickets
                where game_type = ? and ticket_status = 'WAITING'
                order by created_at asc
                """,
                ticketMapper(),
                gameType
        );
    }

    @Override
    public void markTicketMatched(UUID ticketId, String roomCode) {
        jdbcTemplate.update(
                "update public.matchmaking_tickets set ticket_status = 'MATCHED', room_code = ? where ticket_id = ?",
                roomCode,
                ticketId
        );
    }

    @Override
    public void cancelTicket(UUID ticketId) {
        jdbcTemplate.update(
                "update public.matchmaking_tickets set ticket_status = 'CANCELLED' where ticket_id = ?",
                ticketId
        );
    }

    private StoredRoom mapRoom(ResultSet rs, List<InMemoryRuntimeStore.PlayerSummary> participants) throws SQLException {
        return new StoredRoom(
                rs.getString("room_code"),
                rs.getString("host_player_id"),
                rs.getBoolean("is_private"),
                rs.getString("game_type"),
                InMemoryRuntimeStore.RoomStatus.valueOf(rs.getString("room_status")),
                participants
        );
    }

    private List<InMemoryRuntimeStore.PlayerSummary> loadParticipants(String roomCode) {
        return jdbcTemplate.query(
                """
                select player_id, username
                from public.room_players
                where room_code = ?
                order by joined_at asc, player_id asc
                """,
                (rs, rowNum) -> new InMemoryRuntimeStore.PlayerSummary(rs.getString("player_id"), rs.getString("username")),
                roomCode
        );
    }

    private RowMapper<MatchmakingTicket> ticketMapper() {
        return (rs, rowNum) -> new MatchmakingTicket(
                UUID.fromString(rs.getString("ticket_id")),
                rs.getString("game_type"),
                rs.getString("player_id"),
                rs.getString("username"),
                rs.getString("session_token"),
                MatchmakingTicketStatus.valueOf(rs.getString("ticket_status")),
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
