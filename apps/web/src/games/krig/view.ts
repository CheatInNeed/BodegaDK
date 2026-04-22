import type { CardDisplayModel, GameRoomLayoutSpec, SeatViewModel } from '../../game-room/types.js';
import { fallbackLayoutMode, renderGameRoomSections } from '../../game-room/ui.js';

export type KrigViewModel = {
    roomCode: string;
    trickNumber: number;
    selfPlayerId: string | null;
    statusText: string;
    canFlip: boolean;
    warActive: boolean;
    warDepth: number;
    warPileSize: number;
    centerPileSize: number;
    players: Array<{
        playerId: string;
        displayName: string;
        pileCount: number;
        stakeCount: number;
        tableCard: CardDisplayModel;
        isSelf: boolean;
        isReady: boolean;
        isRoundWinner: boolean;
        isRoundLoser: boolean;
        callout: string | null;
    }>;
    isGameOver: boolean;
    postGame: {
        winnerLabel: string;
        isTie: boolean;
        rematchButtonLabel: string;
        rematchDisabled: boolean;
        rematchStatusText: string;
        piles: Array<{
            playerId: string;
            displayName: string;
            pileCount: number;
        }>;
    } | null;
};

export function renderKrigRoom(viewModel: KrigViewModel, layout: GameRoomLayoutSpec, handTrayOpen: boolean): string {
    const layoutForPlayers: GameRoomLayoutSpec = {
        ...layout,
        preferredLayout: fallbackLayoutMode(viewModel.players.length),
    };

    const seats: SeatViewModel[] = viewModel.isGameOver ? [] : viewModel.players.map((player) => ({
        playerId: player.playerId,
        label: player.isSelf ? 'You' : player.displayName,
        isSelf: player.isSelf,
        isCurrentTurn: false,
        stateTone: player.isRoundWinner ? 'winner' : player.isRoundLoser ? 'loser' : player.isReady ? 'waiting' : 'default',
        badges: [`${player.pileCount} cards`],
        callout: player.callout,
        stackCount: player.pileCount,
        tableCard: player.tableCard,
        tableExtraHtml: viewModel.warActive && player.stakeCount > 0 ? renderStakeCards(player.stakeCount) : '',
    }));

    return renderGameRoomSections({
        layout: layoutForPlayers,
        roomClassName: 'room-krig',
        tableClassName: 'table-krig',
        headerPills: [
            `Room: ${viewModel.roomCode}`,
            'Game: Krig',
            `Trick: ${viewModel.trickNumber}`,
        ],
        seats,
        handTrayOpen,
        centerHtml: viewModel.isGameOver
            ? `${viewModel.postGame ? renderPostGameOverlay(viewModel.postGame) : ''}`
            : renderCenter(viewModel),
        trayTitle: viewModel.isGameOver ? 'Match complete' : '',
        trayDescription: null,
        trayBodyHtml: viewModel.isGameOver
            ? ''
            : '',
        trayFooterHtml: '',
    });
}

function renderCenter(viewModel: KrigViewModel): string {
    return `
      <div class="table-center-info table-center-info-compact krig-center">
        <div class="table-title">${viewModel.warActive ? 'KRIG!' : 'Krig'}</div>
        <div class="table-center-prompt">${viewModel.statusText}</div>
        <div class="card-row room-actions krig-floating-actions">
          <button class="btn primary" data-action="flip-card" ${!viewModel.canFlip ? 'disabled' : ''}>Flip card</button>
        </div>
      </div>
    `;
}

function renderStakeCards(count: number): string {
    const visibleCount = Math.max(1, Math.min(count, 6));
    let cards = '';
    for (let i = 0; i < visibleCount; i++) {
        cards += `<span class="krig-stake-card" style="--stake-offset:${i * 18}px"></span>`;
    }
    return `<div class="krig-stake-row" aria-hidden="true">${cards}</div>`;
}

function renderPostGameOverlay(postGame: NonNullable<KrigViewModel['postGame']>): string {
    return `
      <div class="krig-postgame-overlay">
        <div class="krig-postgame-card">
          <div class="krig-postgame-kicker">Game Over</div>
          <div class="krig-postgame-title">${postGame.isTie ? 'It is a tie' : `${postGame.winnerLabel} wins`}</div>
          <div class="krig-postgame-scores">
            ${postGame.piles.map((entry) => `
              <div class="krig-postgame-score-row">
                <span>${entry.displayName}</span>
                <strong>${entry.pileCount}</strong>
              </div>
            `).join('')}
          </div>
          <p class="krig-postgame-note">${postGame.rematchStatusText}</p>
          <div class="krig-postgame-actions">
            <button class="btn primary" data-action="request-rematch" ${postGame.rematchDisabled ? 'disabled' : ''}>${postGame.rematchButtonLabel}</button>
            <button class="btn" data-action="leave-table">Leave Table</button>
          </div>
        </div>
      </div>
    `;
}
