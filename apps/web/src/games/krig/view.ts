import type { GameRoomLayoutSpec, SeatViewModel } from '../../game-room/types.js';
import { fallbackLayoutMode, renderCard, renderGameRoomSections, renderHandCards } from '../../game-room/ui.js';

export type KrigViewModel = {
    roomCode: string;
    round: number;
    totalRounds: number;
    turnPlayerId: string | null;
    turnPlayerName: string;
    selfPlayerId: string | null;
    players: Array<{
        playerId: string;
        displayName: string;
        score: number;
        tableCard: string | null;
        isSelf: boolean;
        isCurrentTurn: boolean;
    }>;
    hand: Array<{ card: string; selected: boolean }>;
    lastBattleText: string;
    selectedCard: string | null;
};

export function renderKrigRoom(viewModel: KrigViewModel, layout: GameRoomLayoutSpec): string {
    const layoutForPlayers: GameRoomLayoutSpec = {
        ...layout,
        preferredLayout: fallbackLayoutMode(viewModel.players.length),
    };

    const seats: SeatViewModel[] = viewModel.players.map((player) => ({
        playerId: player.playerId,
        label: player.isSelf ? 'You' : player.displayName,
        isSelf: player.isSelf,
        isCurrentTurn: player.isCurrentTurn,
        badges: [`Score ${player.score}`],
        tableCard: player.tableCard
            ? { kind: 'face', cardCode: player.tableCard, size: 'sm' }
            : { kind: 'empty', label: 'No card', size: 'sm' },
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
        centerHtml: `
          <div class="table-center-info">
            <div class="table-title">Krig</div>
            <div class="table-center-stat-row">
              <span class="pill table-center-stat">Players ${viewModel.players.length}</span>
              <span class="pill table-center-stat">${viewModel.turnPlayerId ? `Turn ${viewModel.turnPlayerName}` : 'Waiting for turn'}</span>
            </div>
            <div class="table-sub">${viewModel.lastBattleText}</div>
          </div>
        `,
        trayTitle: 'Quick multiplayer test game',
        trayDescription: viewModel.lastBattleText,
        trayBodyHtml: `
          <div class="private-hand-row">
            ${renderHandCards(viewModel.hand)}
          </div>
        `,
        trayFooterHtml: `
          <div class="card-row room-actions">
            <span class="pill">Selected: ${viewModel.selectedCard ?? '-'}</span>
            <button class="btn primary" data-action="play-selected" ${!viewModel.selectedCard ? 'disabled' : ''}>Play selected card</button>
          </div>
        `,
    });
}
