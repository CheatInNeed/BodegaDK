export type CasinoViewModel = {
    roomCode: string;
    players: string[];
    turnPlayerId: string | null;
    dealerPlayerId: string | null;
    tableStacks: Array<{
        stackId: string;
        cards: string[];
        total: number;
        locked: boolean;
        topCard: string;
    }>;
    hand: Array<{
        card: string;
        selected: boolean;
    }>;
    deckCount: number;
    capturedCounts: Record<string, number>;
    started: boolean;
    isMyTurn: boolean;
    selfPlayerId: string | null;
    selectedHandCard: string | null;
};

export function renderCasinoRoom(
    viewModel: CasinoViewModel,
    controls: { disablePlay: boolean; disableBuild: boolean; selectedStackIds: string[] },
): string {
    const selectedSet = new Set(controls.selectedStackIds);
    const tableHtml = viewModel.tableStacks.map((stack) => {
        const selectedClass = selectedSet.has(stack.stackId) ? 'selected' : '';
        const lockText = stack.locked ? 'LOCKED' : 'OPEN';
        return `
      <button class="play-card table-card ${selectedClass}" data-action="casino-toggle-table" data-stack-id="${stack.stackId}">
        ${renderFaceCard(stack.topCard)}
        <span class="pill">Total: ${stack.total}</span>
        <span class="pill">${lockText}</span>
      </button>
    `;
    }).join('');

    const handHtml = viewModel.hand.map((item, index) => `
      <button class="play-card ${item.selected ? 'selected' : ''}" data-action="toggle-card" data-card="${item.card}" style="--card-offset:${index * 16}px">
        ${renderFaceCard(item.card)}
      </button>
    `).join('');

    const playerRows = viewModel.players.map((playerId) => {
        const captured = viewModel.capturedCounts[playerId] ?? 0;
        const role = playerId === viewModel.dealerPlayerId ? 'Dealer' : 'Non-dealer';
        const current = playerId === viewModel.turnPlayerId ? ' · Turn' : '';
        const you = playerId === viewModel.selfPlayerId ? ' (You)' : '';
        return `<div class="pill">${playerId}${you} · ${role} · Captured: ${captured}${current}</div>`;
    }).join('');

    return `
    <section class="card room-card room-table-card">
      <div class="room-header-row">
        <div class="pill">Room: ${viewModel.roomCode}</div>
        <div class="pill">Game: Casino</div>
        <div class="pill">Deck left: ${viewModel.deckCount}</div>
      </div>

      <div class="card-row">${playerRows}</div>

      <div class="private-panel">
        <div class="card-title">Table stacks</div>
        <div class="private-hand-row">
          ${tableHtml || '<span class="muted">No stacks on table</span>'}
        </div>
      </div>

      <div class="private-panel">
        <div class="card-title">Your hand</div>
        <div class="private-hand-row">
          ${handHtml || '<span class="muted">No cards in hand</span>'}
        </div>
      </div>

      <div class="card-row room-actions">
        <button class="btn primary" data-action="casino-play" ${controls.disablePlay ? 'disabled' : ''}>Capture / Trail</button>
        <button class="btn" data-action="casino-build" ${controls.disableBuild ? 'disabled' : ''}>Build stack</button>
      </div>

      ${!viewModel.started ? '<p class="card-desc">Waiting for 2 players to connect.</p>' : ''}
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
