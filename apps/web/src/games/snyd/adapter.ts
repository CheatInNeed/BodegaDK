import { resolvePlayerName } from '../../game-room/player-display.js';
import type { GameAdapter } from '../../game-room/types.js';
import { createLayoutSpec } from '../../game-room/ui.js';
import type { SnydPrivateState, SnydPublicState } from '../../net/protocol.js';
import { buildSnydAction } from './actions.js';
import type { SnydViewModel } from './view.js';

/**
 * Snyd-specific adapter between protocol state and UI view model.
 */
export const snydAdapter: GameAdapter<SnydPublicState, SnydPrivateState, SnydViewModel> = {
    id: 'snyd',
    ui: createLayoutSpec({
        maxPlayers: 8,
        preferredLayout: 'ring',
        centerBoardMode: 'claim',
        seatRenderMode: 'stack',
    }),

    canHandle(game: string) {
        return game.toLowerCase() === 'snyd' || game.toLowerCase() === 'game.cheat';
    },

    toViewModel({ publicState, privateState, selectedCards, selfPlayerId, playerNames }) {
        const players = (publicState?.players ?? []).map((player) => {
            const playerId = typeof player === 'string' ? player : player.playerId;
            const countFromRow = typeof player === 'string' ? undefined : player.handCount;
            const countFromMap = publicState?.playerCardCounts?.[playerId];
            const handCount = countFromRow ?? countFromMap ?? null;

            return {
                playerId,
                displayName: resolvePlayerName(playerNames, playerId),
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
            ? `${resolvePlayerName(playerNames, claim.playerId)} claimed ${claim.count} x ${claim.claimRank}`
            : 'No claim yet';
        const isMyTurn = !!selfPlayerId && publicState?.turnPlayerId === selfPlayerId;

        return {
            roomCode: publicState?.roomCode ?? '-',
            turnPlayerId: publicState?.turnPlayerId ?? null,
            turnPlayerName: resolvePlayerName(playerNames, publicState?.turnPlayerId),
            nextPlayerId: publicState?.nextPlayerId ?? null,
            nextPlayerName: resolvePlayerName(playerNames, publicState?.nextPlayerId),
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
