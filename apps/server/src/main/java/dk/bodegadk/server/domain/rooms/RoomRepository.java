package dk.bodegadk.server.domain.rooms;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public class RoomRepository {
    private final JdbcTemplate jdbcTemplate;

    public RoomRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Transactional
    public void createRoom(
            String roomCode,
            String hostPlayerId,
            String gameId,
            boolean isPublic,
            RoomStatus status,
            int minPlayers,
            int maxPlayers,
            String displayName
    ) {
        jdbcTemplate.update(
                """
                INSERT INTO rooms (room_code, host_player_id, game_id, is_public, status, min_players, max_players)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                roomCode,
                hostPlayerId,
                gameId,
                isPublic,
                status.name(),
                minPlayers,
                maxPlayers
        );

        addPlayer(roomCode, hostPlayerId, displayName);
    }

    public Optional<LobbyRoom> findRoom(String roomCode) {
        List<LobbyRoom> rooms = jdbcTemplate.query(
                """
                SELECT room_code, host_player_id, game_id, is_public, status, min_players, max_players,
                       created_at, updated_at, started_at
                FROM rooms
                WHERE room_code = ?
                """,
                this::mapRoom,
                roomCode
        );

        if (rooms.isEmpty()) {
            return Optional.empty();
        }

        LobbyRoom room = rooms.getFirst();
        return Optional.of(withPlayers(room));
    }

    public List<LobbyRoom> findPublicWaitingRooms() {
        List<LobbyRoom> rooms = jdbcTemplate.query(
                """
                SELECT room_code, host_player_id, game_id, is_public, status, min_players, max_players,
                       created_at, updated_at, started_at
                FROM rooms
                WHERE is_public = TRUE AND status = ?
                ORDER BY updated_at DESC, created_at DESC
                """,
                this::mapRoom,
                RoomStatus.WAITING.name()
        );

        return rooms.stream().map(this::withPlayers).toList();
    }

    public List<RoomPlayer> findPlayers(String roomCode) {
        return jdbcTemplate.query(
                """
                SELECT player_id, display_name, joined_at
                FROM room_players
                WHERE room_code = ?
                ORDER BY joined_at ASC
                """,
                this::mapPlayer,
                roomCode
        );
    }

    public boolean playerExists(String roomCode, String playerId) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM room_players WHERE room_code = ? AND player_id = ?",
                Integer.class,
                roomCode,
                playerId
        );
        return count != null && count > 0;
    }

    public void addPlayer(String roomCode, String playerId, String displayName) {
        jdbcTemplate.update(
                """
                INSERT INTO room_players (room_code, player_id, display_name)
                VALUES (?, ?, ?)
                ON CONFLICT (room_code, player_id)
                DO UPDATE SET display_name = EXCLUDED.display_name
                """,
                roomCode,
                playerId,
                displayName
        );
        touchRoom(roomCode);
    }

    public void removePlayer(String roomCode, String playerId) {
        jdbcTemplate.update(
                "DELETE FROM room_players WHERE room_code = ? AND player_id = ?",
                roomCode,
                playerId
        );
        touchRoom(roomCode);
    }

    public void updateVisibility(String roomCode, boolean isPublic) {
        jdbcTemplate.update(
                "UPDATE rooms SET is_public = ?, updated_at = NOW() WHERE room_code = ?",
                isPublic,
                roomCode
        );
    }

    public void updateStatus(String roomCode, RoomStatus status, Instant startedAt) {
        jdbcTemplate.update(
                "UPDATE rooms SET status = ?, started_at = ?, updated_at = NOW() WHERE room_code = ?",
                status.name(),
                startedAt == null ? null : Timestamp.from(startedAt),
                roomCode
        );
    }

    private void touchRoom(String roomCode) {
        jdbcTemplate.update("UPDATE rooms SET updated_at = NOW() WHERE room_code = ?", roomCode);
    }

    private LobbyRoom withPlayers(LobbyRoom room) {
        return new LobbyRoom(
                room.roomCode(),
                room.hostPlayerId(),
                room.gameId(),
                room.isPublic(),
                room.status(),
                room.minPlayers(),
                room.maxPlayers(),
                findPlayers(room.roomCode()),
                room.createdAt(),
                room.updatedAt(),
                room.startedAt()
        );
    }

    private LobbyRoom mapRoom(ResultSet rs, int rowNum) throws SQLException {
        return new LobbyRoom(
                rs.getString("room_code"),
                rs.getString("host_player_id"),
                rs.getString("game_id"),
                rs.getBoolean("is_public"),
                RoomStatus.valueOf(rs.getString("status")),
                rs.getInt("min_players"),
                rs.getInt("max_players"),
                List.of(),
                toInstant(rs.getTimestamp("created_at")),
                toInstant(rs.getTimestamp("updated_at")),
                toInstant(rs.getTimestamp("started_at"))
        );
    }

    private RoomPlayer mapPlayer(ResultSet rs, int rowNum) throws SQLException {
        return new RoomPlayer(
                rs.getString("player_id"),
                rs.getString("display_name"),
                toInstant(rs.getTimestamp("joined_at"))
        );
    }

    private Instant toInstant(Timestamp timestamp) {
        return timestamp == null ? null : timestamp.toInstant();
    }
}
