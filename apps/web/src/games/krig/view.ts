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

export function renderKrigRoom(viewModel: KrigViewModel, layout: GameRoomLayoutSpec): string {
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
        badges: [`${player.pileCount} cards`, ...(player.isReady && !player.isRoundWinner && !player.isRoundLoser ? ['Ready'] : [])],
        callout: player.callout,
        stackCount: player.pileCount,
        tableCard: player.tableCard,
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
        centerHtml: viewModel.isGameOver
            ? `${viewModel.postGame ? renderPostGameOverlay(viewModel.postGame) : ''}`
            : renderCenter(viewModel),
        trayTitle: viewModel.isGameOver ? 'Match complete' : 'Draw pile',
        trayDescription: viewModel.statusText,
        trayBodyHtml: viewModel.isGameOver
            ? ''
            : renderPileSummary(viewModel),
        trayFooterHtml: viewModel.isGameOver
            ? ''
            : `
          <div class="card-row room-actions">
            <span class="pill">Center: ${viewModel.centerPileSize} cards</span>
            <button class="btn primary" data-action="flip-card" ${!viewModel.canFlip ? 'disabled' : ''}>Flip card</button>
          </div>
        `,
    });
}

function renderCenter(viewModel: KrigViewModel): string {
    return `
      <div class="table-center-info table-center-info-compact krig-center">
        <div class="table-title">${viewModel.warActive ? 'Krig!' : 'Krig'}</div>
        <div class="table-center-prompt">${viewModel.statusText}</div>
        <div class="krig-center-stakes">
          <span class="pill">${viewModel.warPileSize} stake cards</span>
          <span class="pill">${viewModel.centerPileSize} cards in center</span>
          ${viewModel.warDepth > 0 ? `<span class="pill">War depth ${viewModel.warDepth}</span>` : ''}
        </div>
      </div>
    `;
}

function renderPileSummary(viewModel: KrigViewModel): string {
    return `
      <div class="krig-pile-summary">
        ${viewModel.players.map((player) => `
          <div class="krig-pile-row">
            <span>${player.isSelf ? 'Your pile' : `${player.displayName}'s pile`}</span>
            <strong>${player.pileCount}</strong>
          </div>
        `).join('')}
      </div>
    `;
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
