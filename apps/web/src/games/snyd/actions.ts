import type { ClientToServerMessage } from '../../net/protocol.js';
import type { RoomSessionState, UiIntent } from '../../game-room/types.js';

/**
 * Convert UI-level intents into protocol-compliant Snyd actions.
 */
export function buildSnydAction(intent: UiIntent, state: RoomSessionState): ClientToServerMessage | null {
    if (state.winnerPlayerId) return null;

    if (intent.type === 'CALL_SNYD') {
        return {
            type: 'CALL_SNYD',
            payload: {},
        };
    }

    if (intent.type !== 'PLAY_SELECTED') {
        return null;
    }

    const cards = state.selectedHandCards;
    if (cards.length === 0) return null;

    return {
        type: 'PLAY_CARDS',
        payload: {
            cards,
            claimRank: intent.claimRank,
        },
    };
}
