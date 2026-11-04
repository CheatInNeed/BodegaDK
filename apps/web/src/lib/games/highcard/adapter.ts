import { t } from '../../../i18n';
import { formatCard, readHistory, toLogEntries } from '../../game-room/history';
import type { GameAdapter } from '../../game-room/types';
import type { RoomSessionState, UiIntent } from '../../game-room/types';
import { createLayoutSpec } from '../../game-room/ui';
import type { ClientToServerMessage, HistoryEvent } from '../../net/protocol';
import type { SingleCardHighestWinsViewModel } from '../single-card-highest-wins/view';

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
    ui: createLayoutSpec({
        maxPlayers: 2,
        preferredLayout: 'duel',
        centerBoardMode: 'focus',
        seatRenderMode: 'label-only',
    }),

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
            dealerLabel: t('room.highcard.dealer'),
            playerLabel: t('room.highcard.you'),
            middleCard: typeof publicState?.computerCard === 'string' ? publicState.computerCard : '--',
            scoreYou: wins,
            scoreDealer: losses,
            feedbackText: toFeedbackText(lastRound),
            lastPlayerCard: typeof lastRound?.playerCard === 'string' ? lastRound.playerCard : null,
            lastDealerCard: typeof lastRound?.dealerCard === 'string' ? lastRound.dealerCard : null,
            hand,
            selectedCard: selectedCards[0] ?? null,
            history: toLogEntries(readHistory(publicState?.history), describeHighCardEvent),
        };
    },

    buildAction(intent, state) {
        return buildHighCardAction(intent, state);
    },
};

function buildHighCardAction(intent: UiIntent, state: RoomSessionState): ClientToServerMessage | null {
    if (intent.type === 'REQUEST_REMATCH') {
        return { type: 'REQUEST_REMATCH', payload: {} };
    }

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

function describeHighCardEvent(event: HistoryEvent) {
    const d = event.data;
    if (event.type === 'HIGHCARD_ROUND') {
        const params = { round: d.round ?? '?', player: formatCard(d.playerCard), dealer: formatCard(d.dealerCard) };
        const key = d.comparison === 'HIGHER' ? 'room.history.highcard.higher'
            : d.comparison === 'LOWER' ? 'room.history.highcard.lower'
                : 'room.history.highcard.equal';
        return { text: t(key, params), kind: 'move' as const };
    }
    if (event.type === 'GAME_OVER') {
        const params = { wins: d.wins ?? '0', losses: d.losses ?? '0' };
        return {
            text: t(d.winnerPlayerId ? 'room.history.highcard.won' : 'room.history.highcard.lost', params),
            kind: 'round' as const,
        };
    }
    return null;
}

function toFeedbackText(round: HighCardPublicState['lastRound']): string {
    if (!round) {
        return t('room.highcard.feedback.none');
    }
    const playerCard = typeof round.playerCard === 'string' ? round.playerCard : t('room.highcard.yourCard');
    const dealerCard = typeof round.dealerCard === 'string' ? round.dealerCard : t('room.highcard.dealerCard');
    if (round.comparison === 'HIGHER') {
        return t('room.highcard.feedback.higher', { player: playerCard, dealer: dealerCard });
    }
    if (round.comparison === 'LOWER') {
        return t('room.highcard.feedback.lower', { player: playerCard, dealer: dealerCard });
    }
    if (round.comparison === 'EQUAL') {
        return t('room.highcard.feedback.equal', { player: playerCard, dealer: dealerCard });
    }
    return t('room.highcard.feedback.unknown');
}
