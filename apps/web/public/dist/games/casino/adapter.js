import { resolvePlayerName } from '../../game-room/player-display.js';
import { buildCasinoAction } from './actions.js';
export const casinoAdapter = {
    id: 'casino',
    canHandle(game) {
        return game.toLowerCase() === 'casino';
    },
    toViewModel({ publicState, privateState, selectedCards, selfPlayerId, playerNames }) {
        const selectedHandCard = selectedCards[0] ?? null;
        const handCodes = Array.isArray(privateState?.hand)
            ? privateState.hand.filter((card) => typeof card === 'string')
            : [];
        return {
            roomCode: typeof publicState?.roomCode === 'string' ? publicState.roomCode : '-',
            players: Array.isArray(publicState?.players)
                ? publicState.players
                    .map((player) => typeof player === 'string'
                    ? { playerId: player, displayName: resolvePlayerName(playerNames, player) }
                    : { playerId: player.playerId, displayName: resolvePlayerName(playerNames, player.playerId) })
                    .filter((player) => typeof player.playerId === 'string')
                : [],
            turnPlayerId: typeof publicState?.turnPlayerId === 'string' ? publicState.turnPlayerId : null,
            turnPlayerName: resolvePlayerName(playerNames, publicState?.turnPlayerId),
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
function isCasinoStack(value) {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const record = value;
    return typeof record.stackId === 'string'
        && Array.isArray(record.cards)
        && typeof record.total === 'number'
        && typeof record.locked === 'boolean'
        && typeof record.topCard === 'string';
}
function isRecordOfNumbers(value) {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    return Object.values(value).every((entry) => typeof entry === 'number');
}
