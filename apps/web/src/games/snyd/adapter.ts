import type { GameAdapter } from '../../game-room/types.js';
import type { SnydPrivateState, SnydPublicState } from '../../net/protocol.js';
import { buildSnydAction } from './actions.js';
import type { SnydViewModel } from './view.js';

export const snydAdapter: GameAdapter<SnydPublicState, SnydPrivateState, SnydViewModel> = {
    id: 'snyd',

    canHandle(game: string) {
        return game.toLowerCase() === 'snyd' || game.toLowerCase() === 'game.cheat';
    },

    toViewModel({ publicState, privateState, selectedCards, selfPlayerId }) {
        const players = (publicState?.players ?? []).map((player) => {
            const playerId = typeof player === 'string' ? player : player.playerId;
            const countFromRow = typeof player === 'string' ? undefined : player.handCount;
            const countFromMap = publicState?.playerCardCounts?.[playerId];
            const handCount = countFromRow ?? countFromMap ?? null;

            return {
                playerId,
                handCount,
                isCurrentTurn: publicState?.turnPlayerId === playerId,
                isSelf: selfPlayerId === playerId,
            };
        });

        const hand = (privateState?.hand ?? []).map((card) => ({
            card,
            selected: selectedCards.includes(card),
        }));

        const claim = publicState?.lastClaim;
        const lastClaimText = claim
            ? `${claim.playerId} claimed ${claim.count} x ${claim.claimRank}`
            : 'No claim yet';
        const isMyTurn = !!selfPlayerId && publicState?.turnPlayerId === selfPlayerId;

        return {
            roomCode: publicState?.roomCode ?? '-',
            turnPlayerId: publicState?.turnPlayerId ?? null,
            nextPlayerId: publicState?.nextPlayerId ?? null,
            pileCount: publicState?.pileCount ?? 0,
            lastClaimText,
            claimRankInput: claim?.claimRank ?? 'A',
            isMyTurn,
            selectedCount: selectedCards.length,
            players,
            hand,
        };
    },

    buildAction(intent, state) {
        return buildSnydAction(intent, state);
    },
};
