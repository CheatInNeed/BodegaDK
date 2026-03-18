import type { GameAdapter } from '../../game-room/types.js';
import type { RoomSessionState, UiIntent } from '../../game-room/types.js';
import type { ClientToServerMessage } from '../../net/protocol.js';
import type { SingleCardHighestWinsViewModel } from '../single-card-highest-wins/view.js';

type HighCardPublicState = {
    roomCode?: string;
    computerCard?: string | null;
    wins?: number;
    losses?: number;
    lastRound?: {
        playerCard?: string;
        dealerCard?: string;
        comparison?: string;
        result?: string;
    } | null;
    [key: string]: unknown;
};

type HighCardPrivateState = {
    playerId?: string;
    hand?: string[];
    [key: string]: unknown;
};

export const highcardAdapter: GameAdapter<HighCardPublicState, HighCardPrivateState, SingleCardHighestWinsViewModel> = {
    id: 'highcard',

    canHandle(game: string) {
        const normalized = game.toLowerCase();
        return normalized === 'highcard' || normalized === 'single-card-highest-wins';
    },

    toViewModel({ publicState, privateState, selectedCards }) {
        const handCodes = Array.isArray(privateState?.hand)
            ? privateState.hand.filter((card): card is string => typeof card === 'string')
            : [];
        const hand = handCodes.map((card) => ({
            card,
            selected: selectedCards.includes(card),
        }));
        const wins = typeof publicState?.wins === 'number' ? publicState.wins : 0;
        const losses = typeof publicState?.losses === 'number' ? publicState.losses : 0;
        const lastRound = publicState?.lastRound;

        return {
            roomCode: typeof publicState?.roomCode === 'string' ? publicState.roomCode : '-',
            dealerLabel: 'Dealer',
            playerLabel: 'You',
            middleCard: typeof publicState?.computerCard === 'string' ? publicState.computerCard : '--',
            scoreYou: wins,
            scoreDealer: losses,
            feedbackText: toFeedbackText(lastRound),
            lastPlayerCard: typeof lastRound?.playerCard === 'string' ? lastRound.playerCard : null,
            lastDealerCard: typeof lastRound?.dealerCard === 'string' ? lastRound.dealerCard : null,
            hand,
            selectedCard: selectedCards[0] ?? null,
        };
    },

    buildAction(intent, state) {
        return buildHighCardAction(intent, state);
    },
};

function buildHighCardAction(intent: UiIntent, state: RoomSessionState): ClientToServerMessage | null {
    if (intent.type !== 'PLAY_SELECTED') return null;
    if (state.winnerPlayerId) return null;
    if (state.selectedHandCards.length !== 1) return null;

    return {
        type: 'PLAY_CARDS',
        payload: {
            cards: [state.selectedHandCards[0]],
            // Accepted by server contract, ignored for highcard.
            claimRank: intent.claimRank || 'A',
        },
    };
}

function toFeedbackText(round: HighCardPublicState['lastRound']): string {
    if (!round) {
        return 'Play a card to reveal round result.';
    }
    const playerCard = typeof round.playerCard === 'string' ? round.playerCard : 'your card';
    const dealerCard = typeof round.dealerCard === 'string' ? round.dealerCard : 'dealer card';
    if (round.comparison === 'HIGHER') {
        return `You won the round: ${playerCard} was higher than ${dealerCard}.`;
    }
    if (round.comparison === 'LOWER') {
        return `Dealer won the round: ${playerCard} was lower than ${dealerCard}.`;
    }
    if (round.comparison === 'EQUAL') {
        return `Tie on value (${playerCard} vs ${dealerCard}) counts as dealer win.`;
    }
    return 'Round result unavailable.';
}
