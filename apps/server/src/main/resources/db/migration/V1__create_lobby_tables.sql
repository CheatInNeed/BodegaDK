CREATE TABLE IF NOT EXISTS rooms (
    room_code VARCHAR(16) PRIMARY KEY,
    host_player_id VARCHAR(255) NOT NULL,
    game_id VARCHAR(64) NOT NULL,
    is_public BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(32) NOT NULL,
    min_players INTEGER NOT NULL,
    max_players INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS room_players (
    room_code VARCHAR(16) NOT NULL REFERENCES rooms(room_code) ON DELETE CASCADE,
    player_id VARCHAR(255) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (room_code, player_id)
);

CREATE INDEX IF NOT EXISTS idx_rooms_public_waiting ON rooms (is_public, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_room_players_room_code ON room_players (room_code, joined_at);
