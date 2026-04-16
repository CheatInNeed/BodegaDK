import { resolvePlayerName } from '../../game-room/player-display.js';
import type { CardDisplayModel, GameAdapter, RoomSessionState, UiIntent } from '../../game-room/types.js';
import { createLayoutSpec } from '../../game-room/ui.js';
import type { ClientToServerMessage, PlayerRef } from '../../net/protocol.js';
import type { KrigViewModel } from './view.js';

type KrigBattle = {
    round?: number;
    firstPlayerId?: string;
    firstCard?: string;
    secondPlayerId?: string;
    secondCard?: string;
    winnerPlayerId?: string | null;
    outcome?: string;
};

type KrigPublicState = {
    roomCode?: string;
    round?: number;
    totalRounds?: number;
    players?: PlayerRef[];
    scores?: Record<string, number>;
    submittedPlayerIds?: string[];
    revealedCards?: Record<string, string | null>;
    lastBattle?: KrigBattle | null;
    [key: string]: unknown;
};

type KrigPrivateState = {
    playerId?: string;
    hand?: string[];
    [key: string]: unknown;
};

export const krigAdapter: GameAdapter<KrigPublicState, KrigPrivateState, KrigViewModel> = {
    id: 'krig',
    ui: createLayoutSpec({
        maxPlayers: 8,
        preferredLayout: 'duel',
        centerBoardMode: 'battle',
        seatRenderMode: 'revealed-card',
    }),

    canHandle(game: string) {
        return game.toLowerCase() === 'krig';
    },

    toViewModel({ sessionState, publicState, privateState, selectedCards, selfPlayerId, playerNames }) {
        const playerIds = Array.isArray(publicState?.players)
            ? publicState.players
                .map((player) => typeof player === 'string' ? player : player.playerId)
                .filter((playerId): playerId is string => typeof playerId === 'string')
            : [];
        const handCodes = Array.isArray(privateState?.hand)
            ? privateState.hand.filter((card): card is string => typeof card === 'string')
            : [];
        const submittedPlayerIds = Array.isArray(publicState?.submittedPlayerIds)
            ? publicState.submittedPlayerIds.filter((playerId): playerId is string => typeof playerId === 'string')
            : [];
        const submittedPlayerSet = new Set(submittedPlayerIds);
        const revealedCards = readCardMap(publicState?.revealedCards);
        const presentation = sessionState.krigPresentation;
        const battle = readBattle(publicState?.lastBattle);
        const revealVisible = !!battle
            && battle.round === presentation.activeBattleRound
            && presentation.phase === 'result';
        const suspenseVisible = !!battle
            && battle.round === presentation.activeBattleRound
            && presentation.phase === 'suspense';
        const hideCompletedBattle = !!battle
            && presentation.phase === 'idle'
            && presentation.completedBattleRound === battle.round;
        const selfHasSubmitted = submittedPlayerSet.has(selfPlayerId ?? '');
        const isRoundLocked = selfHasSubmitted || suspenseVisible || revealVisible;

        return {
            roomCode: typeof publicState?.roomCode === 'string' ? publicState.roomCode : '-',
            round: typeof publicState?.round === 'number' ? publicState.round : 1,
            totalRounds: typeof publicState?.totalRounds === 'number' ? publicState.totalRounds : 5,
            selfPlayerId,
            statusText: describeStatus({
                selfPlayerId,
                submittedPlayerSet,
                battle,
                suspenseVisible,
                revealVisible,
                hideCompletedBattle,
                playerNames,
            }),
            canPlayCard: !isRoundLocked && !sessionState.winnerPlayerId,
            players: playerIds.map((playerId) => {
                const isWinner = revealVisible && battle?.winnerPlayerId === playerId;
                const isLoser = revealVisible && !!battle?.winnerPlayerId && battle.winnerPlayerId !== playerId;
                const tableCard = buildTableCard({
                    playerId,
                    submittedPlayerSet,
                    revealedCards,
                    suspenseVisible,
                    revealVisible,
                    hideCompletedBattle,
                });

                return {
                    playerId,
                    displayName: resolvePlayerName(playerNames, playerId),
                    score: typeof publicState?.scores?.[playerId] === 'number' ? publicState.scores[playerId] : 0,
                    tableCard,
                    isSelf: selfPlayerId === playerId,
                    isWaiting: submittedPlayerSet.has(playerId),
                    isRoundWinner: isWinner,
                    isRoundLoser: isLoser,
                    scoreDeltaText: isWinner ? '+1 point' : null,
                };
            }),
            hand: handCodes.map((card) => ({
                card,
                selected: selectedCards.includes(card),
            })),
            selectedCard: selectedCards[0] ?? null,
        };
    },

    buildAction(intent, state) {
        return buildKrigAction(intent, state);
    },
};

function buildKrigAction(intent: UiIntent, state: RoomSessionState): ClientToServerMessage | null {
    if (intent.type !== 'PLAY_SELECTED') return null;
    if (state.winnerPlayerId) return null;
    if (state.selectedHandCards.length !== 1) return null;

    const publicState = state.publicState as KrigPublicState | null;
    const submittedPlayerIds = Array.isArray(publicState?.submittedPlayerIds)
        ? publicState.submittedPlayerIds.filter((playerId): playerId is string => typeof playerId === 'string')
        : [];
    const selfAlreadySubmitted = !!state.playerId && submittedPlayerIds.includes(state.playerId);
    const roundLocked = selfAlreadySubmitted || state.krigPresentation.phase !== 'idle';
    if (roundLocked) return null;

    return {
        type: 'PLAY_CARDS',
        payload: {
            cards: [state.selectedHandCards[0]],
            claimRank: 'A',
        },
    };
}

function buildTableCard(input: {
    playerId: string;
    submittedPlayerSet: Set<string>;
    revealedCards: Record<string, string | null>;
    suspenseVisible: boolean;
    revealVisible: boolean;
    hideCompletedBattle: boolean;
}): CardDisplayModel {
    if (input.hideCompletedBattle) {
        return { kind: 'empty', label: 'No card', size: 'sm' };
    }

    if (input.revealVisible) {
        const revealedCard = input.revealedCards[input.playerId];
        if (typeof revealedCard === 'string') {
            return { kind: 'face', cardCode: revealedCard, size: 'sm' };
        }
    }

    if (input.suspenseVisible || input.submittedPlayerSet.has(input.playerId)) {
        return { kind: 'back', label: 'Ready', size: 'sm' };
    }

    return { kind: 'empty', label: 'No card', size: 'sm' };
}

function describeStatus(input: {
    selfPlayerId: string | null;
    submittedPlayerSet: Set<string>;
    battle: KrigBattle | null;
    suspenseVisible: boolean;
    revealVisible: boolean;
    hideCompletedBattle: boolean;
    playerNames: Record<string, string>;
}): string {
    if (input.suspenseVisible) {
        return 'Cards are down. Reveal incoming...';
    }

    if (input.revealVisible && input.battle) {
        if (input.battle.winnerPlayerId) {
            return `${resolvePlayerName(input.playerNames, input.battle.winnerPlayerId)} wins the round.`;
        }
        return 'Round tied.';
    }

    if (input.hideCompletedBattle) {
        return 'Pick your next card.';
    }

    if (input.selfPlayerId && input.submittedPlayerSet.has(input.selfPlayerId)) {
        return 'Card locked in. Waiting for opponent...';
    }

    if (input.submittedPlayerSet.size > 0) {
        return 'Opponent is ready. Pick your card.';
    }

    return 'Pick one card.';
}

function readCardMap(value: unknown): Record<string, string | null> {
    if (typeof value !== 'object' || value === null) return {};

    return Object.entries(value as Record<string, unknown>).reduce<Record<string, string | null>>((acc, [key, entry]) => {
        acc[key] = typeof entry === 'string' ? entry : null;
        return acc;
    }, {});
}

function readBattle(value: unknown): KrigBattle | null {
    return typeof value === 'object' && value !== null ? value as KrigBattle : null;
}
