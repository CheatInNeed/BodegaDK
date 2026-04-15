import type { GameRoomLayoutSpec, SeatViewModel } from '../../game-room/types.js';
import { renderCard, renderGameRoomSections, renderHandCards } from '../../game-room/ui.js';

export type SingleCardHighestWinsViewModel = {
    roomCode: string;
    dealerLabel: string;
    playerLabel: string;
    middleCard: string;
    scoreYou: number;
    scoreDealer: number;
    feedbackText: string;
    lastPlayerCard: string | null;
    lastDealerCard: string | null;
    hand: Array<{ card: string; selected: boolean }>;
    selectedCard: string | null;
};

export function renderSingleCardHighestWinsRoom(viewModel: SingleCardHighestWinsViewModel, layout: GameRoomLayoutSpec): string {
    const seats: SeatViewModel[] = [
        {
            playerId: 'dealer',
            label: viewModel.dealerLabel,
            isSelf: false,
            isCurrentTurn: false,
            badges: [`Score ${viewModel.scoreDealer}`],
        },
        {
            playerId: 'self',
            label: viewModel.playerLabel,
            isSelf: true,
            isCurrentTurn: true,
            badges: [`Score ${viewModel.scoreYou}`],
            meta: viewModel.selectedCard ? `Selected ${viewModel.selectedCard}` : null,
        },
    ];

    return renderGameRoomSections({
        layout,
        roomClassName: 'room-highcard',
        tableClassName: 'table-highcard',
        headerPills: [
            `Room: ${viewModel.roomCode}`,
            'Game: Single Card Highest Wins',
            `Score: You ${viewModel.scoreYou} - ${viewModel.scoreDealer} Dealer`,
        ],
        seats,
        centerHtml: `
          <div class="table-center-info game-room-center-card">
            <div class="table-title">Middle card</div>
            <div class="single-card-center-card">${renderCard({ kind: 'face', cardCode: viewModel.middleCard, size: 'lg' })}</div>
            <p class="card-desc">Play a card with a higher value.</p>
            <p class="card-desc">${viewModel.feedbackText}</p>
            <p class="card-desc">Last round: ${viewModel.lastPlayerCard ?? '-'} vs ${viewModel.lastDealerCard ?? '-'}</p>
          </div>
        `,
        trayTitle: 'Your hand (7 cards)',
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
