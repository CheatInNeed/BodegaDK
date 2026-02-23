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

export function renderSnydRoom(viewModel: SnydViewModel, controls: { disablePlay: boolean; disableCallSnyd: boolean }): string {
    const players = viewModel.players.map((player) => {
        const countLabel = player.handCount === null ? '?' : String(player.handCount);
        const tags: string[] = [];
        if (player.isSelf) tags.push('You');
        if (player.isCurrentTurn) tags.push('Turn');

        return `
      <tr>
        <td>${player.playerId}</td>
        <td>${countLabel}</td>
        <td>${tags.join(' · ') || '-'}</td>
      </tr>
    `;
    }).join('');

    const hand = viewModel.hand.map((item) => `
      <button class="hand-card ${item.selected ? 'selected' : ''}" data-action="toggle-card" data-card="${item.card}">${item.card}</button>
    `).join('');

    return `
    <section class="card room-card">
      <div class="room-header-row">
        <div class="pill">Room: ${viewModel.roomCode}</div>
        <div class="pill">Turn: ${viewModel.turnPlayerId ?? '-'}</div>
        <div class="pill">Next: ${viewModel.nextPlayerId ?? '-'}</div>
        <div class="pill">Pile: ${viewModel.pileCount}</div>
      </div>

      <div class="card-title">Public game state</div>
      <div class="table-wrap">
        <table class="state-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Cards</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>${players}</tbody>
        </table>
      </div>

      <p class="card-desc">Last claim: ${viewModel.lastClaimText}</p>
    </section>

    <section class="card room-card">
      <div class="card-title">Private hand</div>
      <div class="hand-list">${hand || '<span class="muted">No cards</span>'}</div>

      <div class="card-row room-actions">
        <label class="claim-label">Claim rank
          <input class="claim-input" id="claimRankInput" value="${viewModel.claimRankInput}" maxlength="2" />
        </label>
        <button class="btn primary" data-action="play-selected" ${controls.disablePlay ? 'disabled' : ''}>Play selected (${viewModel.selectedCount})</button>
        <button class="btn" data-action="call-snyd" ${controls.disableCallSnyd ? 'disabled' : ''}>Call snyd</button>
      </div>
    </section>
  `;
}
