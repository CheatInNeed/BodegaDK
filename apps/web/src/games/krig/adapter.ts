import { resolvePlayerName } from '../../game-room/player-display.js';
import type { CardDisplayModel, GameAdapter, RoomSessionState, UiIntent } from '../../game-room/types.js';
import { createLayoutSpec } from '../../game-room/ui.js';
import type { ClientToServerMessage, PlayerRef } from '../../net/protocol.js';
import type { KrigViewModel } from './view.js';

type KrigTrick = {
    trickNumber?: number;
    firstPlayerId?: string;
    firstCard?: string | null;
    secondPlayerId?: string;
    secondCard?: string | null;
    winnerPlayerId?: string | null;
    outcome?: string;
    cardsWon?: number;
    warDepth?: number;
};

type KrigPublicState = {
    roomCode?: string;
    gamePhase?: 'PLAYING' | 'GAME_OVER' | string;
    trickNumber?: number;
    players?: PlayerRef[];
    drawPileCounts?: Record<string, number>;
    drawPileCountsBeforeTrick?: Record<string, number>;
    stakeCardCounts?: Record<string, number>;
    matchWinnerPlayerId?: string | null;
    rematchPlayerIds?: string[];
    readyPlayerIds?: string[];
    currentFaceUpCards?: Record<string, string | null>;
    warActive?: boolean;
    warDepth?: number;
    warPileSize?: number;
    centerPileSize?: number;
    statusText?: string;
    lastTrick?: KrigTrick | null;
    [key: string]: unknown;
};

type KrigPrivateState = {
    playerId?: string;
    drawPileCount?: number;
    [key: string]: unknown;
};

export const krigAdapter: GameAdapter<KrigPublicState, KrigPrivateState, KrigViewModel> = {
    id: 'krig',
    ui: createLayoutSpec({
        maxPlayers: 2,
        preferredLayout: 'duel',
        centerBoardMode: 'battle',
        seatRenderMode: 'revealed-card',
    }),

    canHandle(game: string) {
        return game.toLowerCase() === 'krig';
    },

    toViewModel({ sessionState, publicState, selfPlayerId, playerNames }) {
        const playerIds = Array.isArray(publicState?.players)
            ? publicState.players
                .map((player) => typeof player === 'string' ? player : player.playerId)
                .filter((playerId): playerId is string => typeof playerId === 'string')
            : [];
        const readyPlayerIds = readStringArray(publicState?.readyPlayerIds);
        const rematchPlayerIds = readStringArray(publicState?.rematchPlayerIds);
        const readyPlayerSet = new Set(readyPlayerIds);
        const rematchPlayerSet = new Set(rematchPlayerIds);
        const currentFaceUpCards = readCardMap(publicState?.currentFaceUpCards);
        const presentation = sessionState.krigPresentation;
        const trick = readTrick(publicState?.lastTrick);
        const gamePhase = publicState?.gamePhase === 'GAME_OVER' ? 'GAME_OVER' : 'PLAYING';
        const revealVisible = !!trick
            && trick.trickNumber === presentation.activeBattleRound
            && presentation.phase === 'result';
        const suspenseVisible = !!trick
            && trick.trickNumber === presentation.activeBattleRound
            && presentation.phase === 'suspense';
        const selfIsReady = readyPlayerSet.has(selfPlayerId ?? '');
        const isRoundLocked = gamePhase === 'GAME_OVER' || selfIsReady || suspenseVisible || revealVisible;
        const opponentLeft = playerIds.length < 2;
        const postGameVisible = gamePhase === 'GAME_OVER' && presentation.phase === 'idle';
        const winnerPlayerId = typeof publicState?.matchWinnerPlayerId === 'string' ? publicState.matchWinnerPlayerId : null;
        const selfRequestedRematch = rematchPlayerSet.has(selfPlayerId ?? '');
        const rematchDisabled = opponentLeft || selfRequestedRematch;
        const warDepth = typeof publicState?.warDepth === 'number' ? publicState.warDepth : trick?.warDepth ?? 0;
        const cardsInCenter = typeof publicState?.centerPileSize === 'number' ? publicState.centerPileSize : trick?.cardsWon ?? 0;
        const warPileSize = typeof publicState?.warPileSize === 'number' ? publicState.warPileSize : Math.max(0, cardsInCenter - 2);
        const drawPileCounts = suspenseVisible && publicState?.drawPileCountsBeforeTrick
            ? publicState.drawPileCountsBeforeTrick
            : publicState?.drawPileCounts;

        return {
            roomCode: typeof publicState?.roomCode === 'string' ? publicState.roomCode : '-',
            trickNumber: typeof publicState?.trickNumber === 'number' ? publicState.trickNumber : 1,
            selfPlayerId,
            isGameOver: gamePhase === 'GAME_OVER',
            statusText: describeStatus({
                selfPlayerId,
                readyPlayerSet,
                trick,
                suspenseVisible,
                revealVisible,
                gamePhase,
                opponentLeft,
                playerNames,
                fallback: typeof publicState?.statusText === 'string' ? publicState.statusText : null,
            }),
            canFlip: !isRoundLocked && !sessionState.winnerPlayerId && !opponentLeft,
            warActive: (publicState?.warActive === true || warDepth > 0) && !postGameVisible,
            warDepth,
            warPileSize,
            centerPileSize: cardsInCenter,
            players: playerIds.map((playerId) => {
                const isWinner = revealVisible && trick?.winnerPlayerId === playerId;
                const isLoser = revealVisible && !!trick?.winnerPlayerId && trick.winnerPlayerId !== playerId;
                const tableCard = buildTableCard({
                    playerId,
                    currentFaceUpCards,
                    suspenseVisible,
                    revealVisible,
                    postGameVisible,
                    isReady: readyPlayerSet.has(playerId),
                });

                return {
                    playerId,
                    displayName: resolvePlayerName(playerNames, playerId),
                    pileCount: typeof drawPileCounts?.[playerId] === 'number' ? drawPileCounts[playerId] : 0,
                    stakeCount: typeof publicState?.stakeCardCounts?.[playerId] === 'number' ? publicState.stakeCardCounts[playerId] : 0,
                    tableCard,
                    isSelf: selfPlayerId === playerId,
                    isReady: readyPlayerSet.has(playerId),
                    isRoundWinner: isWinner,
                    isRoundLoser: isLoser,
                    callout: isWinner ? `+${trick?.cardsWon ?? cardsInCenter} cards` : null,
                };
            }),
            postGame: postGameVisible
                ? {
                    winnerLabel: winnerPlayerId ? resolvePlayerName(playerNames, winnerPlayerId) : 'Tie Game',
                    isTie: !winnerPlayerId,
                    rematchButtonLabel: opponentLeft
                        ? 'Opponent left'
                        : selfRequestedRematch
                            ? 'Waiting for opponent...'
                            : 'Rematch',
                    rematchDisabled,
                    rematchStatusText: opponentLeft
                        ? 'Opponent left the table. Return to the lobby to start a new match.'
                        : selfRequestedRematch
                            ? 'Your rematch vote is locked in.'
                            : 'Both players must press rematch to deal a new game.',
                    piles: playerIds.map((playerId) => ({
                        playerId,
                        displayName: resolvePlayerName(playerNames, playerId),
                    pileCount: typeof publicState?.drawPileCounts?.[playerId] === 'number' ? publicState.drawPileCounts[playerId] : 0,
                    })),
                }
                : null,
        };
    },

    buildAction(intent, state) {
        return buildKrigAction(intent, state);
    },
};

function buildKrigAction(intent: UiIntent, state: RoomSessionState): ClientToServerMessage | null {
    const publicState = state.publicState as KrigPublicState | null;
    const gamePhase = publicState?.gamePhase === 'GAME_OVER' ? 'GAME_OVER' : 'PLAYING';

    if (intent.type === 'REQUEST_REMATCH') {
        const rematchPlayerIds = readStringArray(publicState?.rematchPlayerIds);
        const selfAlreadyRequested = !!state.playerId && rematchPlayerIds.includes(state.playerId);
        const players = Array.isArray(publicState?.players) ? publicState.players : [];
        if (gamePhase !== 'GAME_OVER' || selfAlreadyRequested || players.length < 2) return null;

        return {
            type: 'REQUEST_REMATCH',
            payload: {},
        };
    }

    if (intent.type !== 'FLIP_CARD') return null;
    if (state.winnerPlayerId) return null;

    const readyPlayerIds = readStringArray(publicState?.readyPlayerIds);
    const selfAlreadyReady = !!state.playerId && readyPlayerIds.includes(state.playerId);
    const roundLocked = gamePhase === 'GAME_OVER' || selfAlreadyReady || state.krigPresentation.phase !== 'idle';
    if (roundLocked) return null;

    return {
        type: 'FLIP_CARD',
        payload: {},
    };
}

function buildTableCard(input: {
    playerId: string;
    currentFaceUpCards: Record<string, string | null>;
    suspenseVisible: boolean;
    revealVisible: boolean;
    postGameVisible: boolean;
    isReady: boolean;
}): CardDisplayModel {
    if (input.postGameVisible) {
        return { kind: 'empty', label: '', size: 'sm' };
    }

    if (input.revealVisible) {
        const card = input.currentFaceUpCards[input.playerId];
        if (typeof card === 'string') {
            return { kind: 'face', cardCode: card, size: 'sm' };
        }
    }

    if (input.suspenseVisible || input.isReady) {
        return { kind: 'back', label: '', size: 'sm' };
    }

    return { kind: 'stack', count: undefined, label: 'Draw pile', size: 'sm' };
}

function describeStatus(input: {
    selfPlayerId: string | null;
    readyPlayerSet: Set<string>;
    trick: KrigTrick | null;
    suspenseVisible: boolean;
    revealVisible: boolean;
    gamePhase: 'PLAYING' | 'GAME_OVER';
    opponentLeft: boolean;
    playerNames: Record<string, string>;
    fallback: string | null;
}): string {
    if (input.gamePhase === 'GAME_OVER') {
        if (input.opponentLeft) {
            return 'Opponent left the table.';
        }
        if (input.trick?.winnerPlayerId) {
            return `${resolvePlayerName(input.playerNames, input.trick.winnerPlayerId)} wins the game.`;
        }
        return 'Final result: tie game.';
    }

    if (input.suspenseVisible) {
        return input.trick?.warDepth && input.trick.warDepth > 0 ? 'Krig!' : 'Cards are flipping...';
    }

    if (input.revealVisible && input.trick) {
        if (input.trick.winnerPlayerId) {
            const winner = resolvePlayerName(input.playerNames, input.trick.winnerPlayerId);
            const cardsWon = input.trick.cardsWon ?? 2;
            return input.trick.warDepth && input.trick.warDepth > 0
                ? `${winner} wins the war and takes ${cardsWon} cards.`
                : `${winner} wins the trick and takes ${cardsWon} cards.`;
        }
        return 'War ended in a tie.';
    }

    if (input.selfPlayerId && input.readyPlayerSet.has(input.selfPlayerId)) {
        return 'Flip locked in. Waiting for opponent...';
    }

    if (input.readyPlayerSet.size > 0) {
        return 'Opponent is ready. Flip your top card.';
    }

    return input.fallback ?? 'Flip your top card.';
}

function readStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function readCardMap(value: unknown): Record<string, string | null> {
    if (typeof value !== 'object' || value === null) return {};

    return Object.entries(value as Record<string, unknown>).reduce<Record<string, string | null>>((acc, [key, entry]) => {
        acc[key] = typeof entry === 'string' ? entry : null;
        return acc;
    }, {});
}

function readTrick(value: unknown): KrigTrick | null {
    return typeof value === 'object' && value !== null ? value as KrigTrick : null;
}
