import type { ClientToServerMessage } from '../net/protocol.js';

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export type TableLayoutMode = 'duel' | 'ring';
export type TableVariant = 'green-felt';
export type CenterBoardMode = 'focus' | 'battle' | 'claim';
export type SeatRenderMode = 'label-only' | 'stack' | 'revealed-card' | 'mixed';
export type SeatPositionClass =
    | 'seat-bottom'
    | 'seat-bottom-right'
    | 'seat-right'
    | 'seat-top-right'
    | 'seat-top'
    | 'seat-top-left'
    | 'seat-left'
    | 'seat-bottom-left';

export type CardDisplayModel = {
    kind: 'face' | 'back' | 'stack' | 'empty';
    cardCode?: string;
    count?: number;
    selected?: boolean;
    interactive?: boolean;
    label?: string;
    size?: 'sm' | 'md' | 'lg';
};

export type SeatViewModel = {
    playerId: string;
    label: string;
    isSelf: boolean;
    isCurrentTurn: boolean;
    stateTone?: 'default' | 'winner' | 'loser' | 'waiting';
    badges?: string[];
    meta?: string | null;
    callout?: string | null;
    stackCount?: number;
    tableCard?: CardDisplayModel | null;
    positionClass?: SeatPositionClass;
};

export type KrigPresentationPhase = 'idle' | 'suspense' | 'result';

export type KrigPresentationState = {
    phase: KrigPresentationPhase;
    activeBattleRound: number | null;
    completedBattleRound: number | null;
};

export type GameRoomLayoutSpec = {
    maxPlayers: number;
    preferredLayout: TableLayoutMode;
    tableVariant: TableVariant;
    centerBoardMode: CenterBoardMode;
    hasPrivateTray: boolean;
    seatRenderMode: SeatRenderMode;
};

export type GameRoomSectionModel = {
    layout: GameRoomLayoutSpec;
    headerPills: string[];
    seats: SeatViewModel[];
    centerHtml: string;
    trayTitle?: string;
    trayDescription?: string | null;
    trayBodyHtml?: string;
    trayFooterHtml?: string;
    roomClassName?: string;
    tableClassName?: string;
};

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
    krigPresentation: KrigPresentationState;
};

export type UiIntent =
    | { type: 'PLAY_SELECTED'; claimRank: string }
    | { type: 'REQUEST_REMATCH' }
    | { type: 'CALL_SNYD' }
    | { type: 'CASINO_PLAY_MOVE'; handCard: string; captureStackIds: string[]; playedValue?: number }
    | { type: 'CASINO_BUILD_STACK'; handCard: string; targetStackId: string; playedValue?: number }
    | { type: 'CASINO_MERGE_STACKS'; stackIds: string[] };

/**
 * Game-specific bridge that maps generic room state to concrete UI behavior.
 */
export type GameAdapter<TPublic extends Record<string, unknown>, TPrivate extends Record<string, unknown>, TViewModel> = {
    id: string;
    canHandle(game: string): boolean;
    ui?: GameRoomLayoutSpec;
    toViewModel(input: {
        sessionState: RoomSessionState;
        publicState: TPublic | null;
        privateState: TPrivate | null;
        selectedCards: string[];
        selfPlayerId: string | null;
        playerNames: Record<string, string>;
    }): TViewModel;
    buildAction?(intent: UiIntent, state: RoomSessionState): ClientToServerMessage | null;
};

export type RoomBootstrap = {
    roomCode: string;
    token: string;
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
