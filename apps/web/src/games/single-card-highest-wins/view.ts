export type SingleCardHighestWinsViewModel = {
    roomCode: string;
    dealerLabel: string;
    playerLabel: string;
    middleCard: string;
    hand: Array<{ card: string; selected: boolean }>;
    selectedCard: string | null;
};

export function renderSingleCardHighestWinsRoom(viewModel: SingleCardHighestWinsViewModel): string {
    const handHtml = viewModel.hand.map((item, index) => `
      <button class="play-card ${item.selected ? 'selected' : ''}" data-action="single-card-select" data-card="${item.card}" style="--card-offset:${index * 16}px">
        ${renderFaceCard(item.card)}
      </button>
    `).join('');

    return `
    <section class="card room-card room-table-card">
      <div class="room-header-row">
        <div class="pill">Room: ${viewModel.roomCode}</div>
        <div class="pill">Game: Single Card Highest Wins</div>
      </div>

      <div class="single-card-board">
        <div class="single-card-seat">
          <span class="pill">${viewModel.dealerLabel}</span>
        </div>
        <div class="single-card-center">
          <div class="card-title">Middle card</div>
          <div class="single-card-center-card">${renderFaceCard(viewModel.middleCard)}</div>
          <p class="card-desc">Play a card with the same value or higher.</p>
        </div>
        <div class="single-card-seat">
          <span class="pill">${viewModel.playerLabel}</span>
        </div>
      </div>

      <div class="private-panel">
        <div class="card-title">Your hand (7 cards)</div>
        <div class="private-hand-row">
          ${handHtml}
        </div>

        <div class="card-row room-actions">
          <span class="pill">Selected: ${viewModel.selectedCard ?? '-'}</span>
          <button class="btn primary" data-action="single-card-play" ${!viewModel.selectedCard ? 'disabled' : ''}>Play selected card</button>
        </div>
      </div>
    </section>
  `;
}

function renderFaceCard(cardCode: string): string {
    const parsed = parseCardCode(cardCode);
    const colorClass = parsed.suitColor === 'red' ? 'red' : 'black';

    return `
    <span class="play-card-face ${colorClass}">
      <span class="play-card-corner">${parsed.rank}${parsed.suit}</span>
      <span class="play-card-center">${parsed.suit}</span>
      <span class="play-card-corner rotate">${parsed.rank}${parsed.suit}</span>
    </span>
  `;
}

function parseCardCode(cardCode: string): { rank: string; suit: string; suitColor: 'red' | 'black' } {
    const normalized = cardCode.trim().toUpperCase();
    const suitKey = normalized.charAt(0);
    const rank = normalized.slice(1) || '?';

    if (suitKey === 'H') return { rank, suit: '♥', suitColor: 'red' };
    if (suitKey === 'D') return { rank, suit: '♦', suitColor: 'red' };
    if (suitKey === 'S') return { rank, suit: '♠', suitColor: 'black' };
    if (suitKey === 'C') return { rank, suit: '♣', suitColor: 'black' };

    return { rank: normalized, suit: '•', suitColor: 'black' };
}
