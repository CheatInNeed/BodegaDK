/**
 * 500-game adapter — bridges the Java server's WebSocket state to the UI.
 *
 * SERVER STATE SHAPE (what the backend must send):
 *
 * publicState  (visible to all players):
 *   players            string[]               — player IDs in turn order
 *   turnPlayerId       string | null          — whose turn it is
 *   roundNumber        number
 *   scores             Record<id, number>     — cumulative round scores (target: 500)
 *   stockPileCount     number                 — cards remaining in draw pile
 *   discardPileTop     string | null          — top card code e.g. "HQ", or null
 *   melds              Meld[]                 — face-up sets on the table
 *   playerCardCounts   Record<id, number>     — how many cards each player holds
 *   phase              "PLAYING" | "FINISHED"
 *   winnerPlayerId     string | null          — set when game ends
 *
 * privateState (per-player, sent only to that player):
 *   playerId           string
 *   hand               string[]               — card codes e.g. ["H5","CK","DA"]
 *   projectedRoundScore number
 *
 * CLIENT → SERVER intents (see buildAction below):
 *   DRAW_FROM_STOCK, DRAW_FROM_DISCARD, TAKE_DISCARD_PILE,
 *   LAY_MELD, EXTEND_MELD, DISCARD
 *
 * PLAYER COUNT: 2–4 players supported. UI layout adapts automatically.
 */
import { resolvePlayerName } from '../../game-room/player-display.js';
import type { GameAdapter, RoomSessionState, UiIntent } from '../../game-room/types.js';
import type { ClientToServerMessage } from '../../net/protocol.js';
import type { FemMeld, FemPlayerInfo, FemPostGame, FemViewModel } from './view.js';

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
        ownerId: string;
    }>;
    playerCardCounts?: Record<string, number>;
    phase?: string;
    winnerPlayerId?: string | null;
    [key: string]: unknown;
};

type FemPrivateState = {
    playerId?: string;
    hand?: string[];
    projectedRoundScore?: number;
    hasDrawnThisTurn?: boolean;
    [key: string]: unknown;
};

export const femAdapter: GameAdapter<FemPublicState, FemPrivateState, FemViewModel> = {
    id: 'fem',

    canHandle(game: string) {
        return game.toLowerCase() === 'fem';
    },

    toViewModel({ publicState, privateState, selectedCards, selfPlayerId, playerNames }) {
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
            ownerId: String(m.ownerId ?? ''),
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
        const canAct    = isMyTurn && isPlaying;
        const selCount  = selectedCards.length;
        const firstRound = publicState?.firstRound === true;
        const hasDrawn = privateState?.hasDrawnThisTurn === true;

        const postGame: FemPostGame | null = (phase === 'FINISHED' && winnerPlayerId)
            ? {
                winnerLabel: resolvePlayerName(playerNames, winnerPlayerId),
                scores: players
                    .slice()
                    .sort((a, b) => b.score - a.score)
                    .map((p) => ({ name: p.displayName, score: p.score, isWinner: p.playerId === winnerPlayerId })),
            }
            : null;

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
            winnerPlayerId,
            postGame,
            canDraw: canAct && !hasDrawn && stockPileCount > 0,
            canDrawDiscard: canAct && !hasDrawn && discardPileTop !== null,
            canTakePile: canAct && !hasDrawn && !firstRound && discardPileTop !== null,
            canLayMeld: canAct && hasDrawn && selCount >= 3,
            canExtendMeld: canAct && hasDrawn && selCount === 1 && melds.length > 0,
            canDiscard: canAct && hasDrawn && selCount === 1,
            canClose: canAct && hasDrawn && !firstRound && hand.length === 1,
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
            case 'FEM_DISCARD':
                if (selected.length !== 1) return null;
                return { type: 'DISCARD', payload: { card: selected[0] } };
            case 'FEM_CLOSE_ROUND':
                return { type: 'DISCARD', payload: { card: intent.card } };
            case 'REQUEST_REMATCH':
                return { type: 'REQUEST_REMATCH', payload: {} };
            default:
                return null;
        }
    },
};
