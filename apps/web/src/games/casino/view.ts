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
    controls: {
        disablePlay: boolean;
        disableBuild: boolean;
        disableMerge: boolean;
        selectedStackIds: string[];
        connection: string;
        errorMessage: string | null;
        winnerPlayerId: string | null;
    },
): string {
    const selectedSet = new Set(controls.selectedStackIds);
    const seatHtml = viewModel.players.map((playerId, index) => {
        const captured = viewModel.capturedCounts[playerId] ?? 0;
        const isActive = playerId === viewModel.turnPlayerId;
        const isSelf = playerId === viewModel.selfPlayerId;
        const role = playerId === viewModel.dealerPlayerId ? 'Dealer' : 'Player';
        const seatClass = index === 0 ? 'casino-seat-top' : 'casino-seat-bottom';
        return `
      <div class="casino-seat ${seatClass} ${isActive ? 'active' : ''}">
        <div class="casino-seat-avatar">${playerId.slice(0, 2).toUpperCase()}</div>
        <div class="casino-seat-copy">
          <div class="casino-seat-name">${isSelf ? `${playerId} (You)` : playerId}</div>
          <div class="casino-seat-meta">${role} · Captured ${captured}</div>
        </div>
      </div>
    `;
    }).join('');

    const logRows = [
        controls.errorMessage ? `<div class="casino-log-entry casino-log-entry-error"><span class="casino-log-label">Warning</span><p>${controls.errorMessage}</p></div>` : '',
        controls.winnerPlayerId ? `<div class="casino-log-entry"><span class="casino-log-label">Winner</span><p>${controls.winnerPlayerId} cleared the table.</p></div>` : '',
        `<div class="casino-log-entry"><span class="casino-log-label">Status</span><p>${viewModel.started ? (viewModel.isMyTurn ? 'Your turn. Pick one card and choose stacks to capture, build, or merge.' : `Waiting for ${viewModel.turnPlayerId ?? 'the other player'} to move.`) : 'Waiting for a second player to join the table.'}</p></div>`,
        `<div class="casino-log-entry"><span class="casino-log-label">Table</span><p>Deck has ${viewModel.deckCount} cards left and ${viewModel.tableStacks.length} active stack${viewModel.tableStacks.length === 1 ? '' : 's'}.</p></div>`,
    ].filter(Boolean).join('');

    const stackHtml = viewModel.tableStacks.map((stack) => {
        const selectedClass = selectedSet.has(stack.stackId) ? 'selected' : '';
        return `
      <button class="casino-stack ${selectedClass}" data-action="casino-toggle-table" data-stack-id="${stack.stackId}">
        <div class="casino-stack-card">${renderFaceCard(stack.topCard)}</div>
        <div class="casino-stack-info">
          <span>Total ${stack.total}</span>
          <span>${stack.locked ? 'Locked' : 'Open'}</span>
        </div>
      </button>
    `;
    }).join('');

    const handHtml = viewModel.hand.map((item, index) => `
      <button class="casino-hand-card ${item.selected ? 'selected' : ''}" data-action="toggle-card" data-card="${item.card}" style="--card-offset:${index * 16}px">
        ${renderFaceCard(item.card)}
      </button>
    `).join('');

    return `
    <section class="casino-screen">
      <header class="casino-topbar">
        <div>
          <div class="casino-brand">The Digital Bodega</div>
          <div class="casino-subtitle">Casino · Room ${viewModel.roomCode}</div>
        </div>
        <div class="casino-topbar-actions">
          <span class="casino-status-pill">${controls.connection}</span>
          <button class="btn primary" data-action="leave-table">Leave Table</button>
        </div>
      </header>

      <aside class="casino-sidebar">
        <div class="casino-sidebar-head">
          <h2>Table Log</h2>
          <p>${viewModel.players.length} Players Active</p>
        </div>
        <div class="casino-log">
          ${logRows}
        </div>
      </aside>

      <div class="casino-main">
        <div class="casino-table-shell">
          <div class="casino-table-felt"></div>
          ${seatHtml}
          <div class="casino-board-center">
            <div class="casino-center-cluster">
              <div class="casino-deck-card">
                <div class="casino-deck-back">B</div>
                <span class="casino-deck-label">Deck (${viewModel.deckCount})</span>
              </div>
              <div class="casino-stack-grid">
                ${stackHtml || '<div class="casino-empty-state">No stacks on the table</div>'}
              </div>
            </div>
          </div>
        </div>

        <div class="casino-hand-dock">
          <div class="casino-hand-header">
            <div>
              <div class="casino-hand-title">Your Hand</div>
              <div class="casino-hand-copy">
                ${viewModel.selectedHandCard ? `Selected: ${viewModel.selectedHandCard}` : 'Select one card, then choose stacks on the felt.'}
              </div>
            </div>
            <div class="casino-action-row">
              <button class="btn primary" data-action="casino-play" ${controls.disablePlay ? 'disabled' : ''}>Capture / Trail</button>
              <button class="btn" data-action="casino-build" ${controls.disableBuild ? 'disabled' : ''}>Build</button>
              <button class="btn" data-action="casino-merge" ${controls.disableMerge ? 'disabled' : ''}>Merge</button>
            </div>
          </div>
          <div class="casino-hand-row">
            ${handHtml || '<span class="muted">No cards in hand</span>'}
          </div>
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
