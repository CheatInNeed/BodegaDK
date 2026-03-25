import type { GameAdapter } from '../../game-room/types.js';
import { buildCasinoAction } from './actions.js';
import type { CasinoViewModel } from './view.js';

type CasinoTableStack = {
    stackId: string;
    cards: string[];
    total: number;
    locked: boolean;
    topCard: string;
};

type CasinoPublicState = {
    roomCode?: string;
    players?: string[];
    dealerPlayerId?: string | null;
    turnPlayerId?: string | null;
    tableStacks?: CasinoTableStack[];
    deckCount?: number;
    capturedCounts?: Record<string, number>;
    started?: boolean;
    [key: string]: unknown;
};

type CasinoPrivateState = {
    playerId?: string;
    hand?: string[];
    capturedCards?: string[];
    [key: string]: unknown;
};

export const casinoAdapter: GameAdapter<CasinoPublicState, CasinoPrivateState, CasinoViewModel> = {
    id: 'casino',

    canHandle(game: string) {
        return game.toLowerCase() === 'casino';
    },

    toViewModel({ publicState, privateState, selectedCards, selfPlayerId }) {
        const selectedHandCard = selectedCards[0] ?? null;
        const handCodes = Array.isArray(privateState?.hand)
            ? privateState.hand.filter((card): card is string => typeof card === 'string')
            : [];
        return {
            roomCode: typeof publicState?.roomCode === 'string' ? publicState.roomCode : '-',
            players: Array.isArray(publicState?.players)
                ? publicState.players.filter((player): player is string => typeof player === 'string')
                : [],
            turnPlayerId: typeof publicState?.turnPlayerId === 'string' ? publicState.turnPlayerId : null,
            dealerPlayerId: typeof publicState?.dealerPlayerId === 'string' ? publicState.dealerPlayerId : null,
            tableStacks: Array.isArray(publicState?.tableStacks)
                ? publicState.tableStacks.filter(isCasinoStack)
                : [],
            hand: handCodes.map((card) => ({
                card,
                selected: selectedHandCard === card,
            })),
            deckCount: typeof publicState?.deckCount === 'number' ? publicState.deckCount : 0,
            capturedCounts: isRecordOfNumbers(publicState?.capturedCounts) ? publicState.capturedCounts : {},
            started: publicState?.started === true,
            isMyTurn: !!selfPlayerId && publicState?.turnPlayerId === selfPlayerId,
            selfPlayerId,
            selectedHandCard,
        };
    },

    buildAction(intent, state) {
        return buildCasinoAction(intent, state);
    },
};

function isCasinoStack(value: unknown): value is CasinoTableStack {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const record = value as Record<string, unknown>;
    return typeof record.stackId === 'string'
        && Array.isArray(record.cards)
        && typeof record.total === 'number'
        && typeof record.locked === 'boolean'
        && typeof record.topCard === 'string';
}

function isRecordOfNumbers(value: unknown): value is Record<string, number> {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    return Object.values(value).every((entry) => typeof entry === 'number');
}
