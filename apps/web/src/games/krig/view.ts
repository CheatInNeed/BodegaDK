export type KrigViewModel = {
    roomCode: string;
    round: number;
    totalRounds: number;
    turnPlayerId: string | null;
    selfPlayerId: string | null;
    players: Array<{
        playerId: string;
        score: number;
        tableCard: string | null;
        isSelf: boolean;
        isCurrentTurn: boolean;
    }>;
    hand: Array<{ card: string; selected: boolean }>;
    lastBattleText: string;
    selectedCard: string | null;
};

export function renderKrigRoom(viewModel: KrigViewModel): string {
    const handHtml = viewModel.hand.map((item, index) => `
      <button class="play-card ${item.selected ? 'selected' : ''}" data-action="toggle-card" data-card="${item.card}" style="--card-offset:${index * 16}px">
        ${renderFaceCard(item.card)}
      </button>
    `).join('');

    const playersHtml = viewModel.players.map((player) => `
      <div class="single-card-seat">
        <span class="pill">${player.isSelf ? 'You' : player.playerId}</span>
        <span class="pill">Score ${player.score}</span>
        <span class="pill">${player.isCurrentTurn ? 'Your turn' : 'Waiting'}</span>
        <div class="single-card-center-card">${player.tableCard ? renderFaceCard(player.tableCard) : '<span class="card-desc">No card yet</span>'}</div>
      </div>
    `).join('');

    return `
    <section class="card room-card room-table-card">
      <div class="room-header-row">
        <div class="pill">Room: ${viewModel.roomCode}</div>
        <div class="pill">Game: Krig</div>
        <div class="pill">Round: ${viewModel.round}/${viewModel.totalRounds}</div>
      </div>

      <div class="single-card-board">
        ${playersHtml}
      </div>

      <div class="private-panel">
        <div class="card-title">Quick multiplayer test game</div>
        <p class="card-desc">${viewModel.lastBattleText}</p>
        <div class="private-hand-row">
          ${handHtml}
        </div>

        <div class="card-row room-actions">
          <span class="pill">Selected: ${viewModel.selectedCard ?? '-'}</span>
          <button class="btn primary" data-action="play-selected" ${!viewModel.selectedCard ? 'disabled' : ''}>Play selected card</button>
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
