import { resolvePlayerName } from '../../game-room/player-display.js';
import type { GameAdapter, RoomSessionState, UiIntent } from '../../game-room/types.js';
import { createLayoutSpec } from '../../game-room/ui.js';
import type { ClientToServerMessage, PlayerRef } from '../../net/protocol.js';
import type { KrigViewModel } from './view.js';

type KrigPublicState = {
    roomCode?: string;
    round?: number;
    totalRounds?: number;
    turnPlayerId?: string;
    players?: PlayerRef[];
    scores?: Record<string, number>;
    tableCards?: Record<string, string | null>;
    lastBattle?: {
        firstPlayerId?: string;
        firstCard?: string;
        secondPlayerId?: string;
        secondCard?: string;
        winnerPlayerId?: string | null;
        outcome?: string;
    } | null;
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

    toViewModel({ publicState, privateState, selectedCards, selfPlayerId, playerNames }) {
        const playerIds = Array.isArray(publicState?.players)
            ? publicState.players
                .map((player) => typeof player === 'string' ? player : player.playerId)
                .filter((playerId): playerId is string => typeof playerId === 'string')
            : [];
        const handCodes = Array.isArray(privateState?.hand)
            ? privateState.hand.filter((card): card is string => typeof card === 'string')
            : [];
        const lastBattle = publicState?.lastBattle;

        return {
            roomCode: typeof publicState?.roomCode === 'string' ? publicState.roomCode : '-',
            round: typeof publicState?.round === 'number' ? publicState.round : 1,
            totalRounds: typeof publicState?.totalRounds === 'number' ? publicState.totalRounds : 5,
            turnPlayerId: typeof publicState?.turnPlayerId === 'string' ? publicState.turnPlayerId : null,
            turnPlayerName: resolvePlayerName(playerNames, publicState?.turnPlayerId),
            selfPlayerId,
            players: playerIds.map((playerId) => ({
                playerId,
                displayName: resolvePlayerName(playerNames, playerId),
                score: typeof publicState?.scores?.[playerId] === 'number' ? publicState.scores[playerId] : 0,
                tableCard: typeof publicState?.tableCards?.[playerId] === 'string' ? publicState.tableCards[playerId] : null,
                isSelf: selfPlayerId === playerId,
                isCurrentTurn: publicState?.turnPlayerId === playerId,
            })),
            hand: handCodes.map((card) => ({
                card,
                selected: selectedCards.includes(card),
            })),
            lastBattleText: describeBattle(lastBattle, playerNames),
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

    return {
        type: 'PLAY_CARDS',
        payload: {
            cards: [state.selectedHandCards[0]],
            claimRank: 'A',
        },
    };
}

function describeBattle(battle: KrigPublicState['lastBattle'], playerNames: Record<string, string>): string {
    if (!battle) {
        return 'Each player selects one card. Highest card wins the round.';
    }
    const first = resolvePlayerName(playerNames, battle.firstPlayerId ?? null);
    const second = resolvePlayerName(playerNames, battle.secondPlayerId ?? null);
    const firstCard = battle.firstCard ?? '?';
    const secondCard = battle.secondCard ?? '?';
    if (battle.winnerPlayerId) {
        return `${first} played ${firstCard}, ${second} played ${secondCard}. ${resolvePlayerName(playerNames, battle.winnerPlayerId)} won the round.`;
    }
    return `${first} played ${firstCard}, ${second} played ${secondCard}. The round was a tie.`;
}
