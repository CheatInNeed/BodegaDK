import { resolvePlayerName } from '../../game-room/player-display.js';
import { createLayoutSpec } from '../../game-room/ui.js';
export const krigAdapter = {
    id: 'krig',
    ui: createLayoutSpec({
        maxPlayers: 2,
        preferredLayout: 'duel',
        centerBoardMode: 'battle',
        seatRenderMode: 'revealed-card',
    }),
    canHandle(game) {
        return game.toLowerCase() === 'krig';
    },
    toViewModel({ sessionState, publicState, selfPlayerId, playerNames }) {
        const playerIds = Array.isArray(publicState?.players)
            ? publicState.players
                .map((player) => typeof player === 'string' ? player : player.playerId)
                .filter((playerId) => typeof playerId === 'string')
            : [];
        const readyPlayerIds = readStringArray(publicState?.readyPlayerIds);
        const rematchPlayerIds = readStringArray(publicState?.rematchPlayerIds);
        const readyPlayerSet = new Set(readyPlayerIds);
        const rematchPlayerSet = new Set(rematchPlayerIds);
        const currentFaceUpCards = readCardMap(publicState?.currentFaceUpCards);
        const presentation = sessionState.krigPresentation;
        const trick = readTrick(publicState?.lastTrick);
        const gamePhase = publicState?.gamePhase === 'GAME_OVER' ? 'GAME_OVER' : 'PLAYING';
        const eventId = typeof publicState?.presentationEventId === 'number' ? publicState.presentationEventId : null;
        const revealVisible = !!trick
            && eventId === presentation.activeBattleRound
            && presentation.phase === 'result';
        const suspenseVisible = !!trick
            && eventId === presentation.activeBattleRound
            && presentation.phase === 'suspense';
        const krigRevealVisible = !!trick
            && eventId === presentation.activeBattleRound
            && presentation.phase === 'krig-reveal';
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
        // Show KRIG! banner during any active war animation phase.
        const warPresentationActive = !!trick
            && warDepth > 0
            && presentation.phase !== 'idle'
            && !postGameVisible;
        // Only slam-animate on the very first render of a fresh KRIG declaration.
        const warJustDeclared = warPresentationActive
            && presentation.phase === 'suspense'
            && trick?.outcome === 'TIE';
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
                krigRevealVisible,
                gamePhase,
                opponentLeft,
                playerNames,
                fallback: typeof publicState?.statusText === 'string' ? publicState.statusText : null,
            }),
            canFlip: !isRoundLocked && !sessionState.winnerPlayerId && !opponentLeft,
            warActive: warPresentationActive,
            warJustDeclared,
            isWarReveal: revealVisible && warDepth > 0,
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
                    krigRevealVisible,
                    postGameVisible,
                    isReady: readyPlayerSet.has(playerId),
                });
                // Only show stake cards during krig-reveal and war result — never during suspense or idle.
                const stakeCount = (krigRevealVisible || (revealVisible && warDepth > 0))
                    && typeof publicState?.stakeCardCounts?.[playerId] === 'number'
                    ? publicState.stakeCardCounts[playerId]
                    : 0;
                return {
                    playerId,
                    displayName: resolvePlayerName(playerNames, playerId),
                    pileCount: typeof drawPileCounts?.[playerId] === 'number' ? drawPileCounts[playerId] : 0,
                    stakeCount,
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
function buildKrigAction(intent, state) {
    const publicState = state.publicState;
    const gamePhase = publicState?.gamePhase === 'GAME_OVER' ? 'GAME_OVER' : 'PLAYING';
    if (intent.type === 'REQUEST_REMATCH') {
        const rematchPlayerIds = readStringArray(publicState?.rematchPlayerIds);
        const selfAlreadyRequested = !!state.playerId && rematchPlayerIds.includes(state.playerId);
        const players = Array.isArray(publicState?.players) ? publicState.players : [];
        if (gamePhase !== 'GAME_OVER' || selfAlreadyRequested || players.length < 2)
            return null;
        return {
            type: 'REQUEST_REMATCH',
            payload: {},
        };
    }
    if (intent.type !== 'FLIP_CARD')
        return null;
    if (state.winnerPlayerId)
        return null;
    const readyPlayerIds = readStringArray(publicState?.readyPlayerIds);
    const selfAlreadyReady = !!state.playerId && readyPlayerIds.includes(state.playerId);
    const phase = state.krigPresentation.phase;
    const roundLocked = gamePhase === 'GAME_OVER' || selfAlreadyReady || (phase !== 'idle' && phase !== 'krig-reveal');
    if (roundLocked)
        return null;
    return {
        type: 'FLIP_CARD',
        payload: {},
    };
}
function buildTableCard(input) {
    if (input.postGameVisible) {
        return { kind: 'empty', label: '', size: 'sm' };
    }
    if (input.revealVisible || input.krigRevealVisible) {
        // Both result and krig-reveal show currentFaceUpCards:
        // - result: decisive war cards (or normal battle cards)
        // - krig-reveal: initial tied cards (still in currentFaceUpCards before war flip)
        const card = input.currentFaceUpCards[input.playerId];
        if (typeof card === 'string') {
            return { kind: 'face', cardCode: card, size: 'sm' };
        }
    }
    if (input.suspenseVisible || input.isReady) {
        return { kind: 'back', label: 'Ready', size: 'sm' };
    }
    return { kind: 'back', label: 'Draw pile', size: 'sm' };
}
function describeStatus(input) {
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
    if (input.krigRevealVisible) {
        if (input.selfPlayerId && input.readyPlayerSet.has(input.selfPlayerId)) {
            return 'War card locked in. Waiting for opponent...';
        }
        return 'Krig! Flip your war card.';
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
function readStringArray(value) {
    return Array.isArray(value) ? value.filter((entry) => typeof entry === 'string') : [];
}
function readCardMap(value) {
    if (typeof value !== 'object' || value === null)
        return {};
    return Object.entries(value).reduce((acc, [key, entry]) => {
        acc[key] = typeof entry === 'string' ? entry : null;
        return acc;
    }, {});
}
function readTrick(value) {
    return typeof value === 'object' && value !== null ? value : null;
}
