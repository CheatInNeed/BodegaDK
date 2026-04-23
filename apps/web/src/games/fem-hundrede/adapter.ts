 import { resolvePlayerName } from '../../game-room/player-display.js';
import type { GameAdapter, RoomSessionState, UiIntent } from '../../game-room/types.js';
import type { ClientToServerMessage } from '../../net/protocol.js';
import type { FemMeld, FemPlayerInfo, FemViewModel } from './view.js';

type FemPublicState = {
    players?: Array<{ playerId: string; username?: string | null } | string>;
    turnPlayerId?: string | null;
    roundNumber?: number;
    scores?: Record<string, number>;
    stockPileCount?: number;
    discardPileTop?: string | null;
    melds?: Array<{
        id: string;
        suit: string;
        cards: string[];
        pointsPerPlayer: Record<string, number>;
    }>;
    playerCardCounts?: Record<string, number>;
    phase?: string;
    discardGrabPhase?: boolean;
    grabPriorityPlayerId?: string | null;
    winnerPlayerId?: string | null;
    [key: string]: unknown;
};

type FemPrivateState = {
    playerId?: string;
    hand?: string[];
    projectedRoundScore?: number;
    [key: string]: unknown;
};

export const femAdapter: GameAdapter<FemPublicState, FemPrivateState, FemViewModel> = {
    id: 'fem',

    canHandle(game: string) {
        return game.toLowerCase() === 'fem';
    },

    toViewModel({ sessionState, publicState, privateState, selectedCards, selfPlayerId, playerNames }) {
        const rawPlayers = Array.isArray(publicState?.players) ? publicState.players : [];
        const playerIds: string[] = rawPlayers.map((p) =>
            typeof p === 'string' ? p : (typeof p === 'object' && p !== null ? (p as { playerId: string }).playerId : '')
        ).filter(Boolean);

        const scores = (typeof publicState?.scores === 'object' && publicState.scores !== null)
            ? publicState.scores as Record<string, number>
            : {};
        const cardCounts = (typeof publicState?.playerCardCounts === 'object' && publicState.playerCardCounts !== null)
            ? publicState.playerCardCounts as Record<string, number>
            : {};
        const turnPlayerId = typeof publicState?.turnPlayerId === 'string' ? publicState.turnPlayerId : null;
        const isMyTurn = !!selfPlayerId && selfPlayerId === turnPlayerId;
        const phase = typeof publicState?.phase === 'string' ? publicState.phase : 'PLAYING';
        const discardGrabPhase = publicState?.discardGrabPhase === true;
        const grabPriorityPlayerId = typeof publicState?.grabPriorityPlayerId === 'string' ? publicState.grabPriorityPlayerId : null;
        const isGrabPriority = !!selfPlayerId && selfPlayerId === grabPriorityPlayerId;
        const winnerPlayerId = typeof publicState?.winnerPlayerId === 'string' ? publicState.winnerPlayerId : null;
        const stockPileCount = typeof publicState?.stockPileCount === 'number' ? publicState.stockPileCount : 0;
        const discardPileTop = typeof publicState?.discardPileTop === 'string' ? publicState.discardPileTop : null;
        const hand = Array.isArray(privateState?.hand) ? privateState.hand.filter((c): c is string => typeof c === 'string') : [];
        const projectedRoundScore = typeof privateState?.projectedRoundScore === 'number' ? privateState.projectedRoundScore : 0;
        const rawMelds = Array.isArray(publicState?.melds) ? publicState.melds : [];
        const melds: FemMeld[] = rawMelds.map((m) => ({
            id: String(m.id ?? ''),
            suit: String(m.suit ?? ''),
            cards: Array.isArray(m.cards) ? m.cards.filter((c): c is string => typeof c === 'string') : [],
            pointsPerPlayer: (typeof m.pointsPerPlayer === 'object' && m.pointsPerPlayer !== null)
                ? m.pointsPerPlayer as Record<string, number>
                : {},
        }));

        const players: FemPlayerInfo[] = playerIds.map((playerId) => ({
            playerId,
            displayName: resolvePlayerName(playerNames, playerId),
            score: scores[playerId] ?? 0,
            cardCount: cardCounts[playerId] ?? 0,
            isSelf: playerId === selfPlayerId,
            isCurrentTurn: playerId === turnPlayerId,
        }));

        const isPlaying = phase === 'PLAYING';
        const canAct    = isMyTurn && isPlaying && !discardGrabPhase;
        const selCount  = selectedCards.length;

        return {
            selfPlayerId,
            players,
            turnPlayerId,
            isMyTurn,
            roundNumber: typeof publicState?.roundNumber === 'number' ? publicState.roundNumber : 1,
            phase,
            stockPileCount,
            discardPileTop,
            melds,
            hand,
            selectedCards,
            projectedRoundScore,
            discardGrabPhase,
            grabPriorityPlayerId,
            isGrabPriority,
            winnerPlayerId,
            canDraw: canAct && stockPileCount > 0,
            canDrawDiscard: canAct && discardPileTop !== null,
            canTakePile: canAct && discardPileTop !== null,
            canLayMeld: canAct && selCount >= 3,
            canExtendMeld: canAct && selCount === 1 && melds.length > 0,
            canDiscard: canAct && selCount === 1,
            canClaimDiscard: discardGrabPhase && isGrabPriority && melds.length > 0,
            canPassGrab: discardGrabPhase && isGrabPriority,
        };
    },

    buildAction(intent: UiIntent, state: RoomSessionState): ClientToServerMessage | null {
        const selected = state.selectedHandCards;

        switch (intent.type) {
            case 'FEM_DRAW_FROM_STOCK':
                return { type: 'DRAW_FROM_STOCK', payload: {} };
            case 'FEM_DRAW_FROM_DISCARD':
                return { type: 'DRAW_FROM_DISCARD', payload: {} };
            case 'FEM_TAKE_DISCARD_PILE':
                return { type: 'TAKE_DISCARD_PILE', payload: {} };
            case 'FEM_LAY_MELD':
                if (selected.length < 3) return null;
                return { type: 'LAY_MELD', payload: { cards: selected } };
            case 'FEM_EXTEND_MELD':
                if (selected.length !== 1) return null;
                return { type: 'EXTEND_MELD', payload: { meldId: intent.meldId, card: selected[0] } };
            case 'FEM_SWAP_JOKER':
                return { type: 'SWAP_JOKER', payload: { meldId: intent.meldId, jokerCode: intent.jokerCode, realCardCode: intent.realCardCode } };
            case 'FEM_DISCARD':
                if (selected.length !== 1) return null;
                return { type: 'DISCARD', payload: { card: selected[0] } };
            case 'FEM_CLAIM_DISCARD':
                return { type: 'CLAIM_DISCARD', payload: { meldId: intent.meldId } };
            case 'FEM_PASS_GRAB':
                return { type: 'PASS_GRAB', payload: {} };
            default:
                return null;
        }
    },
};
