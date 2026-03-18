/**
 * Base envelope for all WebSocket traffic between client and server.
 */
export type WsEnvelope<TType extends string, TPayload> = {
    type: TType;
    payload: TPayload;
};

export type PlayerRef = string | { playerId: string; handCount?: number; name?: string };
export type RoomStatus = 'LOBBY' | 'IN_GAME';

export type LobbyPublicState = {
    roomCode: string;
    players: PlayerRef[];
    hostPlayerId?: string | null;
    selectedGame?: string;
    status?: RoomStatus;
    isPrivate?: boolean;
    version?: number;
    [key: string]: unknown;
};

export type SnydPublicState = LobbyPublicState & {
    turnPlayerId?: string;
    nextPlayerId?: string;
    pileCount?: number;
    playerCardCounts?: Record<string, number>;
    lastClaim?: {
        playerId: string;
        claimRank: string;
        count: number;
    };
};

export type SnydPrivateState = {
    playerId: string;
    hand: string[];
    [key: string]: unknown;
};

export type ConnectMessage = WsEnvelope<'CONNECT', { roomCode: string; token: string }>;
export type HeartbeatMessage = WsEnvelope<'HEARTBEAT', Record<string, never>>;
export type SelectGameMessage = WsEnvelope<'SELECT_GAME', { game: string }>;
export type StartGameMessage = WsEnvelope<'START_GAME', Record<string, never>>;
export type PlayCardsMessage = WsEnvelope<'PLAY_CARDS', { cards: string[]; claimRank: string }>;
export type CallSnydMessage = WsEnvelope<'CALL_SNYD', Record<string, never>>;

export type ClientToServerMessage =
    | ConnectMessage
    | HeartbeatMessage
    | SelectGameMessage
    | StartGameMessage
    | PlayCardsMessage
    | CallSnydMessage;

export type StateSnapshotMessage = WsEnvelope<'STATE_SNAPSHOT', {
    publicState: SnydPublicState;
    privateState: Partial<SnydPrivateState> & Record<string, unknown>;
}>;

export type PublicUpdateMessage = WsEnvelope<'PUBLIC_UPDATE', Partial<SnydPublicState>>;
export type PrivateUpdateMessage = WsEnvelope<'PRIVATE_UPDATE', Partial<SnydPrivateState> & Record<string, unknown>>;
export type HeartbeatAckMessage = WsEnvelope<'HEARTBEAT_ACK', { at: string }>;
export type RoomClosedMessage = WsEnvelope<'ROOM_CLOSED', Record<string, never>>;
export type ErrorMessage = WsEnvelope<'ERROR', { message: string }>;
export type GameFinishedMessage = WsEnvelope<'GAME_FINISHED', { winnerPlayerId: string }>;

export type ServerToClientMessage =
    | StateSnapshotMessage
    | PublicUpdateMessage
    | PrivateUpdateMessage
    | HeartbeatAckMessage
    | RoomClosedMessage
    | ErrorMessage
    | GameFinishedMessage;

/**
 * Runtime guard for untyped JSON payloads from the socket layer.
 * Returns null for unknown/unsupported message shapes.
 */
export function parseServerMessage(raw: unknown): ServerToClientMessage | null {
    if (!isRecord(raw)) return null;
    if (typeof raw.type !== 'string') return null;
    if (!isRecord(raw.payload)) return null;

    if (
        raw.type === 'STATE_SNAPSHOT'
        || raw.type === 'PUBLIC_UPDATE'
        || raw.type === 'PRIVATE_UPDATE'
        || raw.type === 'HEARTBEAT_ACK'
        || raw.type === 'ROOM_CLOSED'
        || raw.type === 'ERROR'
        || raw.type === 'GAME_FINISHED'
    ) {
        return raw as ServerToClientMessage;
    }

    return null;
}

/**
 * Narrow unknown values to non-null object records.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
