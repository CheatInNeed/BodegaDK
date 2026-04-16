/**
 * Base envelope for all WebSocket traffic between client and server.
 */
export type WsEnvelope<TType extends string, TPayload> = {
    type: TType;
    payload: TPayload;
};

export type PlayerRef = string | { playerId: string; handCount?: number; name?: string };
export type RoomStatus = 'LOBBY' | 'IN_GAME';
export type CasinoValueMap = Record<string, number[]>;

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

export type CasinoPublicState = {
    roomCode: string;
    players: string[];
    dealerPlayerId?: string | null;
    turnPlayerId?: string | null;
    tableStacks?: Array<{
        stackId: string;
        cards: string[];
        total: number;
        locked: boolean;
        topCard: string;
    }>;
    deckCount?: number;
    capturedCounts?: Record<string, number>;
    lastCapturePlayerId?: string | null;
    started?: boolean;
    rules?: {
        valueMap: CasinoValueMap;
    };
    [key: string]: unknown;
};

export type CasinoPrivateState = {
    playerId: string;
    hand: string[];
    capturedCards?: string[];
    [key: string]: unknown;
};

export type ConnectMessage = WsEnvelope<'CONNECT', {
    roomCode: string;
    token: string;
    game?: string;
    setup?: {
        casinoRules?: {
            valueMap: CasinoValueMap;
        };
    };
}>;
export type HeartbeatMessage = WsEnvelope<'HEARTBEAT', Record<string, never>>;
export type SelectGameMessage = WsEnvelope<'SELECT_GAME', { game: string }>;
export type StartGameMessage = WsEnvelope<'START_GAME', Record<string, never>>;
export type RequestRematchMessage = WsEnvelope<'REQUEST_REMATCH', Record<string, never>>;
export type PlayCardsMessage = WsEnvelope<'PLAY_CARDS', { cards: string[]; claimRank: string }>;
export type CallSnydMessage = WsEnvelope<'CALL_SNYD', Record<string, never>>;
export type CasinoPlayMoveMessage = WsEnvelope<'CASINO_PLAY_MOVE', {
    handCard: string;
    captureStackIds: string[];
    playedValue?: number;
}>;
export type CasinoBuildStackMessage = WsEnvelope<'CASINO_BUILD_STACK', {
    handCard: string;
    targetStackId: string;
    playedValue?: number;
}>;
export type CasinoMergeStacksMessage = WsEnvelope<'CASINO_MERGE_STACKS', {
    stackIds: string[];
}>;

export type ClientToServerMessage =
    | ConnectMessage
    | HeartbeatMessage
    | SelectGameMessage
    | StartGameMessage
    | RequestRematchMessage
    | PlayCardsMessage
    | CallSnydMessage
    | CasinoPlayMoveMessage
    | CasinoBuildStackMessage
    | CasinoMergeStacksMessage;

export type StateSnapshotMessage = WsEnvelope<'STATE_SNAPSHOT', {
    publicState: Record<string, unknown>;
    privateState: Record<string, unknown>;
}>;

export type PublicUpdateMessage = WsEnvelope<'PUBLIC_UPDATE', Record<string, unknown>>;
export type PrivateUpdateMessage = WsEnvelope<'PRIVATE_UPDATE', Record<string, unknown>>;
export type HeartbeatAckMessage = WsEnvelope<'HEARTBEAT_ACK', { at: string }>;
export type RoomClosedMessage = WsEnvelope<'ROOM_CLOSED', Record<string, never>>;
export type ErrorMessage = WsEnvelope<'ERROR', { message: string }>;
export type GameFinishedMessage = WsEnvelope<'GAME_FINISHED', { winnerPlayerId: string | null }>;

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

const SUITS = ['H', 'D', 'C', 'S'] as const;
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;

export function createDefaultCasinoValueMap(): CasinoValueMap {
    const valueMap: CasinoValueMap = {};
    for (const suit of SUITS) {
        for (const rank of RANKS) {
            valueMap[`${suit}${rank}`] = rankToValues(rank);
        }
    }
    return valueMap;
}

function rankToValues(rank: string): number[] {
    if (rank === 'A') return [1, 14];
    if (rank === 'J') return [11];
    if (rank === 'Q') return [12];
    if (rank === 'K') return [13];
    return [Number(rank)];
}
