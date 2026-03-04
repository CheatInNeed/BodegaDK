export type SnydPlayerRow = {
    playerId: string;
    handCount: number | null;
    isCurrentTurn: boolean;
    isSelf: boolean;
};

export type SnydViewModel = {
    roomCode: string;
    turnPlayerId: string | null;
    nextPlayerId: string | null;
    pileCount: number;
    lastClaimText: string;
    claimRankInput: string;
    isMyTurn: boolean;
    selectedCount: number;
    players: SnydPlayerRow[];
    hand: Array<{ card: string; selected: boolean }>;
};

type PlayerSeat = {
    playerId: string;
    handCount: number;
    isCurrentTurn: boolean;
    isSelf: boolean;
    positionClass: string;
};

export function renderSnydRoom(viewModel: SnydViewModel, controls: { disablePlay: boolean; disableCallSnyd: boolean }): string {
    const seats = buildSeats(viewModel.players);

    const seatHtml = seats.map((seat) => {
        const badgeClass = seat.isSelf ? 'seat-badge self' : 'seat-badge';
        const tags = [seat.isSelf ? 'Dig' : seat.playerId, seat.isCurrentTurn ? 'Tur' : null].filter(Boolean).join(' · ');

        return `
      <div class="table-seat ${seat.positionClass}">
        <div class="${badgeClass}">${tags}</div>
        <div class="card-stack">
          ${renderCardBacks(seat.handCount)}
        </div>
      </div>
    `;
    }).join('');

    const handHtml = viewModel.hand.map((item, index) => `
      <button class="play-card ${item.selected ? 'selected' : ''}" data-action="toggle-card" data-card="${item.card}" style="--card-offset:${index * 16}px">
        ${renderFaceCard(item.card)}
      </button>
    `).join('');

    return `
    <section class="card room-card room-table-card">
      <div class="room-header-row">
        <div class="pill">Room: ${viewModel.roomCode}</div>
        <div class="pill">Tur: ${viewModel.turnPlayerId ?? '-'}</div>
        <div class="pill">Næste: ${viewModel.nextPlayerId ?? '-'}</div>
        <div class="pill">Bunke: ${viewModel.pileCount}</div>
      </div>

      <div class="table-stage">
        <div class="table-bg-grain"></div>
        <div class="table-top">
          <div class="table-felt"></div>
          <div class="table-center-info">
            <div class="table-title">Snyd</div>
            <div class="table-sub">${viewModel.lastClaimText}</div>
          </div>
        </div>
        ${seatHtml}
      </div>

      <div class="private-panel">
        <div class="card-title">Din hånd</div>
        <div class="private-hand-row">
          ${handHtml || '<span class="muted">Ingen kort</span>'}
        </div>

        <div class="card-row room-actions">
          <label class="claim-label">Meldt rang
            <input class="claim-input" id="claimRankInput" value="${viewModel.claimRankInput}" maxlength="2" />
          </label>
          <button class="btn primary" data-action="play-selected" ${controls.disablePlay ? 'disabled' : ''}>Spil valgte (${viewModel.selectedCount})</button>
          <button class="btn" data-action="call-snyd" ${controls.disableCallSnyd ? 'disabled' : ''}>Kald Snyd</button>
        </div>
      </div>
    </section>
  `;
}

function buildSeats(players: SnydPlayerRow[]): PlayerSeat[] {
    const ordered = [...players];
    if (ordered.length === 0) return [];

    const selfIndex = ordered.findIndex((player) => player.isSelf);
    if (selfIndex > 0) {
        const self = ordered.splice(selfIndex, 1)[0];
        ordered.unshift(self);
    }

    const positions = ['seat-bottom', 'seat-bottom-right', 'seat-right', 'seat-top-right', 'seat-top', 'seat-top-left', 'seat-left', 'seat-bottom-left'];

    return ordered.slice(0, positions.length).map((player, index) => ({
        playerId: player.playerId,
        handCount: player.handCount ?? 0,
        isCurrentTurn: player.isCurrentTurn,
        isSelf: player.isSelf,
        positionClass: positions[index],
    }));
}

function renderCardBacks(count: number): string {
    const displayCount = Math.max(1, Math.min(count, 8));
    let html = '';

    for (let i = 0; i < displayCount; i++) {
        html += `<span class="mini-card-back" style="--stack-offset:${i * 10}px"></span>`;
    }

    return html;
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
