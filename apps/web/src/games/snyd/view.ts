import type { GameRoomLayoutSpec, SeatViewModel } from '../../game-room/types.js';
import { renderGameRoomSections, renderHandCards } from '../../game-room/ui.js';

export type SnydPlayerRow = {
    playerId: string;
    displayName: string;
    handCount: number | null;
    isCurrentTurn: boolean;
    isSelf: boolean;
};

export type SnydViewModel = {
    roomCode: string;
    turnPlayerId: string | null;
    turnPlayerName: string;
    nextPlayerId: string | null;
    nextPlayerName: string;
    pileCount: number;
    lastClaimText: string;
    claimRankInput: string;
    isMyTurn: boolean;
    selectedCount: number;
    players: SnydPlayerRow[];
    hand: Array<{ card: string; selected: boolean }>;
};

export function renderSnydRoom(
    viewModel: SnydViewModel,
    controls: { disablePlay: boolean; disableCallSnyd: boolean },
    layout: GameRoomLayoutSpec,
): string {
    const seats: SeatViewModel[] = viewModel.players.map((player) => ({
        playerId: player.playerId,
        label: player.isSelf ? 'Dig' : player.displayName,
        isSelf: player.isSelf,
        isCurrentTurn: player.isCurrentTurn,
        badges: [`${player.handCount ?? 0} kort`],
        stackCount: player.handCount ?? 0,
    }));

    return renderGameRoomSections({
        layout,
        roomClassName: 'room-snyd',
        tableClassName: 'table-snyd',
        headerPills: [
            `Room: ${viewModel.roomCode}`,
            `Tur: ${viewModel.turnPlayerId ? viewModel.turnPlayerName : '-'}`,
            `Næste: ${viewModel.nextPlayerId ? viewModel.nextPlayerName : '-'}`,
            `Bunke: ${viewModel.pileCount}`,
        ],
        seats,
        centerHtml: `
          <div class="table-center-info">
            <div class="table-title">Snyd</div>
            <div class="table-center-stat-row">
              <span class="pill table-center-stat">Bunke ${viewModel.pileCount}</span>
              <span class="pill table-center-stat">${viewModel.isMyTurn ? 'Din tur' : 'Venter på tur'}</span>
            </div>
            <div class="table-sub">${viewModel.lastClaimText}</div>
          </div>
        `,
        trayTitle: 'Din hånd',
        trayBodyHtml: `
          <div class="private-hand-row">
            ${viewModel.hand.length > 0 ? renderHandCards(viewModel.hand) : '<span class="muted">Ingen kort</span>'}
          </div>
        `,
        trayFooterHtml: `
          <div class="card-row room-actions">
            <label class="claim-label">Meldt rang
              <input class="claim-input" id="claimRankInput" value="${viewModel.claimRankInput}" maxlength="2" />
            </label>
            <button class="btn primary" data-action="play-selected" ${controls.disablePlay ? 'disabled' : ''}>Spil valgte (${viewModel.selectedCount})</button>
            <button class="btn" data-action="call-snyd" ${controls.disableCallSnyd ? 'disabled' : ''}>Kald Snyd</button>
          </div>
        `,
    });
}
