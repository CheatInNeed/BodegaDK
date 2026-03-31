import type { ClientToServerMessage } from '../net/protocol.js';

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';

/**
 * Session state shared between transport, reducer, and UI mapping layers.
 */
export type RoomSessionState = {
    connection: ConnectionStatus;
    roomCode: string;
    playerId: string | null;
    game: string;
    publicState: Record<string, unknown> | null;
    privateState: Record<string, unknown> | null;
    selectedHandCards: string[];
    lastError: string | null;
    winnerPlayerId: string | null;
};

export type UiIntent =
    | { type: 'PLAY_SELECTED'; claimRank: string }
    | { type: 'CALL_SNYD' };

/**
 * Game-specific bridge that maps generic room state to concrete UI behavior.
 */
export type GameAdapter<TPublic extends Record<string, unknown>, TPrivate extends Record<string, unknown>, TViewModel> = {
    id: string;
    canHandle(game: string): boolean;
    toViewModel(input: {
        publicState: TPublic | null;
        privateState: TPrivate | null;
        selectedCards: string[];
        selfPlayerId: string | null;
    }): TViewModel;
    buildAction?(intent: UiIntent, state: RoomSessionState): ClientToServerMessage | null;
};

export type RoomBootstrap = {
    roomCode: string;
    token: string;
    accessToken: string;
    game: string;
    useMock: boolean;
};

export type RoomTransportHandlers = {
    onOpen: () => void;
    onMessage: (raw: unknown) => void;
    onClose: () => void;
    onError: (message: string) => void;
};

export interface RoomTransport {
    connect(handlers: RoomTransportHandlers): void;
    send(message: ClientToServerMessage): void;
    close(): void;
}
