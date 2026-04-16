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
        centerHtml: `
          <div class="table-center-info table-center-info-compact">
            <div class="table-title">Krig</div>
            <div class="table-center-prompt">${viewModel.statusText}</div>
          </div>
        `,
        trayTitle: 'Quick multiplayer test game',
        trayDescription: viewModel.statusText,
        trayBodyHtml: `
          <div class="private-hand-row">
            ${renderHandCards(viewModel.hand)}
          </div>
        `,
        trayFooterHtml: `
          <div class="card-row room-actions">
            <span class="pill">Selected: ${viewModel.selectedCard ?? '-'}</span>
            <button class="btn primary" data-action="play-selected" ${!viewModel.selectedCard || !viewModel.canPlayCard ? 'disabled' : ''}>Play selected card</button>
          </div>
        `,
    });
}
