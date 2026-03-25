import type { RoomSessionState, UiIntent } from '../../game-room/types.js';
import type { ClientToServerMessage } from '../../net/protocol.js';

export function buildCasinoAction(intent: UiIntent, state: RoomSessionState): ClientToServerMessage | null {
    if (state.winnerPlayerId) {
        return null;
    }
    if (intent.type === 'CASINO_MERGE_STACKS') {
        return {
            type: 'CASINO_MERGE_STACKS',
            payload: {
                stackIds: intent.stackIds,
            },
        };
    }
    if (intent.type === 'CASINO_BUILD_STACK') {
        return {
            type: 'CASINO_BUILD_STACK',
            payload: {
                handCard: intent.handCard,
                targetStackId: intent.targetStackId,
                playedValue: intent.playedValue,
            },
        };
    }
    if (intent.type !== 'CASINO_PLAY_MOVE') {
        return null;
    }
    return {
        type: 'CASINO_PLAY_MOVE',
        payload: {
            handCard: intent.handCard,
            captureStackIds: intent.captureStackIds,
            playedValue: intent.playedValue,
        },
    };
}
