import type { CardDisplayModel, GameRoomLayoutSpec, SeatViewModel } from '../../game-room/types.js';
import { fallbackLayoutMode, renderGameRoomSections, renderHandCards } from '../../game-room/ui.js';

export type KrigViewModel = {
    roomCode: string;
    round: number;
    totalRounds: number;
    selfPlayerId: string | null;
    statusText: string;
    canPlayCard: boolean;
    players: Array<{
        playerId: string;
        displayName: string;
        score: number;
        tableCard: CardDisplayModel;
        isSelf: boolean;
        isWaiting: boolean;
        isRoundWinner: boolean;
        isRoundLoser: boolean;
        scoreDeltaText: string | null;
    }>;
    hand: Array<{ card: string; selected: boolean }>;
    selectedCard: string | null;
    isGameOver: boolean;
    postGame: {
        winnerLabel: string;
        isTie: boolean;
        rematchButtonLabel: string;
        rematchDisabled: boolean;
        rematchStatusText: string;
        scores: Array<{
            playerId: string;
            displayName: string;
            score: number;
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
        stateTone: player.isRoundWinner ? 'winner' : player.isRoundLoser ? 'loser' : player.isWaiting ? 'waiting' : 'default',
        badges: [`Score ${player.score}`, ...(player.isWaiting && !player.isRoundWinner && !player.isRoundLoser ? ['Ready'] : [])],
        callout: player.scoreDeltaText,
        tableCard: player.tableCard,
    }));

    return renderGameRoomSections({
        layout: layoutForPlayers,
        roomClassName: 'room-krig',
        tableClassName: 'table-krig',
        headerPills: [
            `Room: ${viewModel.roomCode}`,
            'Game: Krig',
            `Round: ${viewModel.round}/${viewModel.totalRounds}`,
        ],
        seats,
        centerHtml: viewModel.isGameOver
            ? `${viewModel.postGame ? renderPostGameOverlay(viewModel.postGame) : ''}`
            : `
          <div class="table-center-info table-center-info-compact">
            <div class="table-title">Krig</div>
            <div class="table-center-prompt">${viewModel.statusText}</div>
          </div>
        `,
        trayTitle: viewModel.isGameOver ? 'Match complete' : 'Quick multiplayer test game',
        trayDescription: viewModel.statusText,
        trayBodyHtml: viewModel.isGameOver
            ? ''
            : `
          <div class="private-hand-row">
            ${renderHandCards(viewModel.hand)}
          </div>
        `,
        trayFooterHtml: viewModel.isGameOver
            ? ''
            : `
          <div class="card-row room-actions">
            <span class="pill">Selected: ${viewModel.selectedCard ?? '-'}</span>
            <button class="btn primary" data-action="play-selected" ${!viewModel.selectedCard || !viewModel.canPlayCard ? 'disabled' : ''}>Play selected card</button>
          </div>
        `,
    });
}

function renderPostGameOverlay(postGame: NonNullable<KrigViewModel['postGame']>): string {
    return `
      <div class="krig-postgame-overlay">
        <div class="krig-postgame-card">
          <div class="krig-postgame-kicker">Game Over</div>
          <div class="krig-postgame-title">${postGame.isTie ? 'It is a tie' : `${postGame.winnerLabel} wins`}</div>
          <div class="krig-postgame-scores">
            ${postGame.scores.map((entry) => `
              <div class="krig-postgame-score-row">
                <span>${entry.displayName}</span>
                <strong>${entry.score}</strong>
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
