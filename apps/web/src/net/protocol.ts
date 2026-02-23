export type WsEnvelope<TType extends string, TPayload> = {
    type: TType;
    payload: TPayload;
};

export type PlayerRef = string | { playerId: string; handCount?: number; name?: string };

export type SnydPublicState = {
    roomCode: string;
    players: PlayerRef[];
    turnPlayerId?: string;
    nextPlayerId?: string;
    pileCount?: number;
    playerCardCounts?: Record<string, number>;
    lastClaim?: {
        playerId: string;
        claimRank: string;
        count: number;
    };
    [key: string]: unknown;
};

export type SnydPrivateState = {
    playerId: string;
    hand: string[];
    [key: string]: unknown;
};

export type ConnectMessage = WsEnvelope<'CONNECT', { roomCode: string; token: string }>;
export type PlayCardsMessage = WsEnvelope<'PLAY_CARDS', { cards: string[]; claimRank: string }>;
export type CallSnydMessage = WsEnvelope<'CALL_SNYD', Record<string, never>>;

export type ClientToServerMessage = ConnectMessage | PlayCardsMessage | CallSnydMessage;

export type StateSnapshotMessage = WsEnvelope<'STATE_SNAPSHOT', {
    publicState: SnydPublicState;
    privateState: SnydPrivateState;
}>;

export type PublicUpdateMessage = WsEnvelope<'PUBLIC_UPDATE', Partial<SnydPublicState>>;
export type PrivateUpdateMessage = WsEnvelope<'PRIVATE_UPDATE', SnydPrivateState>;
export type ErrorMessage = WsEnvelope<'ERROR', { message: string }>;
export type GameFinishedMessage = WsEnvelope<'GAME_FINISHED', { winnerPlayerId: string }>;

export type ServerToClientMessage =
    | StateSnapshotMessage
    | PublicUpdateMessage
    | PrivateUpdateMessage
    | ErrorMessage
    | GameFinishedMessage;

export function parseServerMessage(raw: unknown): ServerToClientMessage | null {
    if (!isRecord(raw)) return null;
    if (typeof raw.type !== 'string') return null;
    if (!isRecord(raw.payload)) return null;

    if (
        raw.type === 'STATE_SNAPSHOT'
        || raw.type === 'PUBLIC_UPDATE'
        || raw.type === 'PRIVATE_UPDATE'
        || raw.type === 'ERROR'
        || raw.type === 'GAME_FINISHED'
    ) {
        return raw as ServerToClientMessage;
    }

    return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
