import { renderCardBack, renderCardFront } from '../shared/cards.js';

export type KrigViewModel = {
    roomCode: string;
    trickNumber: number;
    selfPlayerId: string | null;
    statusText: string;
    canFlip: boolean;
    warActive: boolean;
    warDepth: number;
    warPileSize: number;
    centerPileSize: number;
    players: Array<{
        playerId: string;
        displayName: string;
        pileCount: number;
        stakeCount: number;
        tableCard: { kind: 'face' | 'back' | 'stack' | 'empty'; cardCode?: string; size?: string };
        isSelf: boolean;
        isReady: boolean;
        isRoundWinner: boolean;
        isRoundLoser: boolean;
        callout: string | null;
    }>;
    isGameOver: boolean;
    postGame: {
        winnerLabel: string;
        isTie: boolean;
        rematchButtonLabel: string;
        rematchDisabled: boolean;
        rematchStatusText: string;
        piles: Array<{ playerId: string; displayName: string; pileCount: number }>;
    } | null;
};

const CW = 72;
const CH = 100;

export function renderKrigRoom(vm: KrigViewModel): string {
    const self = vm.players.find((p) => p.isSelf) ?? null;
    const opponent = vm.players.find((p) => !p.isSelf) ?? null;

    return `<section class="krig-shell">
  ${topBar(vm)}
  <div style="position:relative;flex:1;display:flex;flex-direction:column;min-height:0;">
    ${vm.isGameOver && vm.postGame ? postGameOverlay(vm.postGame) : ''}
    ${playerZone(opponent, vm, false)}
    ${battleStrip(vm)}
    ${playerZone(self, vm, true)}
  </div>
</section>`;
}

function topBar(vm: KrigViewModel): string {
    return `<div class="krig-topbar">
  <span class="krig-brand">Krig</span>
  <span>Trick ${vm.trickNumber}</span>
  <span>Room: ${vm.roomCode}</span>
</div>`;
}

function playerZone(
    player: KrigViewModel['players'][number] | null,
    vm: KrigViewModel,
    isSelf: boolean,
): string {
    if (!player) {
        return `<div class="krig-player-zone${isSelf ? ' is-self' : ''}">
  <span style="color:rgba(255,255,255,0.25);font-size:12px;">Waiting for opponent…</span>
</div>`;
    }

    const card = flipZoneCard(player);
    const pile = drawPile(player.pileCount);
    const badge = playerBadge(player);
    const callout = player.callout
        ? `<div style="position:absolute;top:8px;right:12px;font-size:13px;font-weight:700;color:#ffd040;letter-spacing:0.5px;">${player.callout}</div>`
        : '';

    const winClass = player.isRoundWinner ? ' is-winner' : player.isRoundLoser ? ' is-loser' : '';

    return `<div class="krig-player-zone${isSelf ? ' is-self' : ''}${player.isReady && !vm.warActive ? ' is-active' : ''}">
  ${callout}
  <div class="krig-flip-zone${winClass}">${card}</div>
  <div style="display:flex;align-items:center;gap:14px;">
    ${isSelf ? `${pile}${badge}` : `${badge}${pile}`}
  </div>
</div>`;
}

function flipZoneCard(player: KrigViewModel['players'][number]): string {
    const { tableCard } = player;
    if (tableCard.kind === 'face' && tableCard.cardCode) {
        return renderCardFront(tableCard.cardCode, CW, CH);
    }
    if (tableCard.kind === 'empty') {
        return `<div style="width:${CW}px;height:${CH}px;border-radius:6px;border:1px dashed rgba(255,255,255,0.12);"></div>`;
    }
    return renderCardBack(`krig-${player.playerId}`, CW, CH);
}

function drawPile(count: number): string {
    if (count === 0) {
        return `<div style="width:50px;height:70px;border-radius:5px;border:1px dashed rgba(255,255,255,0.1);"></div>`;
    }
    const layers = Math.min(count, 4);
    const shadows = Array.from({ length: layers - 1 }, (_, i) => {
        const o = (i + 1) * 2;
        return `<div class="krig-pile-card" style="width:50px;height:70px;bottom:${o}px;right:${-o}px;opacity:${0.5 - i * 0.1};"></div>`;
    }).join('');
    return `<div class="krig-pile" style="width:50px;height:${70 + (layers - 1) * 2}px;">
  ${shadows}
  <div style="position:relative;width:50px;height:70px;border-radius:5px;background:#0C3A18;border:1px solid rgba(212,175,106,0.3);box-shadow:0 2px 8px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;">
    <span style="font-size:11px;color:rgba(212,175,106,0.6);letter-spacing:0.5px;">${count}</span>
  </div>
</div>`;
}

function playerBadge(player: KrigViewModel['players'][number]): string {
    const label = player.isSelf ? 'You' : player.displayName;
    const readyDot = player.isReady
        ? `<span style="width:7px;height:7px;border-radius:50%;background:#4ade80;display:inline-block;"></span>`
        : '';
    return `<div class="krig-player-badge">
  ${readyDot}
  <span>${label}</span>
  <span class="krig-pile-count">${player.pileCount} kort</span>
</div>`;
}

function battleStrip(vm: KrigViewModel): string {
    const warLabel = vm.warActive
        ? `<div class="krig-war-label">⚔ KRIG! ⚔</div>`
        : '';
    const stakeFan = vm.warPileSize > 0 ? renderStakeFan(vm.warPileSize) : '';
    const flipBtn = `<button class="btn primary" data-action="flip-card" ${!vm.canFlip ? 'disabled' : ''} style="min-width:140px;">Vend kort</button>`;

    return `<div class="krig-battle-strip">
  ${warLabel}
  ${stakeFan}
  <div class="krig-status-text">${vm.statusText}</div>
  ${flipBtn}
</div>`;
}

function renderStakeFan(count: number): string {
    const visible = Math.min(count, 8);
    const totalW = 26 + (visible - 1) * 10;
    const cards = Array.from({ length: visible }, (_, i) =>
        `<div class="krig-stake-card-fan" style="left:${i * 10}px;"></div>`,
    ).join('');
    return `<div class="krig-stake-fan" style="width:${totalW}px;">${cards}</div>`;
}

function postGameOverlay(postGame: NonNullable<KrigViewModel['postGame']>): string {
    return `<div class="krig-postgame-overlay">
  <div class="krig-postgame-card">
    <div class="krig-postgame-kicker">Game Over</div>
    <div class="krig-postgame-title">${postGame.isTie ? 'Uafgjort' : `${postGame.winnerLabel} vinder`}</div>
    <div class="krig-postgame-scores">
      ${postGame.piles.map((p) => `
      <div class="krig-postgame-score-row">
        <span>${p.displayName}</span>
        <strong>${p.pileCount} kort</strong>
      </div>`).join('')}
    </div>
    <p class="krig-postgame-note">${postGame.rematchStatusText}</p>
    <div class="krig-postgame-actions">
      <button class="btn primary" data-action="request-rematch" ${postGame.rematchDisabled ? 'disabled' : ''}>${postGame.rematchButtonLabel}</button>
      <button class="btn" data-action="leave-table">Forlad bord</button>
    </div>
  </div>
</div>`;
}
