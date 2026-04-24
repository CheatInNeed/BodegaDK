import { renderCardBack, renderCardFront, renderHandFan } from '../shared/cards.js';

export type FemMeld = {
    id: string;
    suit: string;
    cards: string[];
    pointsPerPlayer: Record<string, number>;
};

export type FemPlayerInfo = {
    playerId: string;
    displayName: string;
    score: number;
    cardCount: number;
    isSelf: boolean;
    isCurrentTurn: boolean;
};

export type FemViewModel = {
    selfPlayerId: string | null;
    players: FemPlayerInfo[];
    turnPlayerId: string | null;
    isMyTurn: boolean;
    roundNumber: number;
    phase: string;
    stockPileCount: number;
    discardPileTop: string | null;
    melds: FemMeld[];
    hand: string[];
    selectedCards: string[];
    projectedRoundScore: number;
    discardGrabPhase: boolean;
    grabPriorityPlayerId: string | null;
    isGrabPriority: boolean;
    winnerPlayerId: string | null;
    canDraw: boolean;
    canDrawDiscard: boolean;
    canTakePile: boolean;
    canLayMeld: boolean;
    canExtendMeld: boolean;
    canDiscard: boolean;
    canClaimDiscard: boolean;
    canPassGrab: boolean;
};

const CW = 68, CH = 95;
const MW = 48, MH = 67;
const SHADOW = '0 4px 18px rgba(0,0,0,0.6),0 1px 4px rgba(0,0,0,0.3)';

function scoreBar(players: FemPlayerInfo[]): string {
    if (players.length < 2) return '';
    const self = players.find((p) => p.isSelf);
    const others = players.filter((p) => !p.isSelf);
    const selfScore = self?.score ?? 0;
    const selfPct = Math.min(selfScore / 500 * 100, 100);

    const tracks = others.map((opp) => {
        const pct = Math.min(opp.score / 500 * 100, 100);
        return `<div class="g500-score-track">
    <div class="g500-score-fill g500-score-p1" style="width:${pct}%"></div>
    <div class="g500-score-fill g500-score-p0" style="width:${selfPct}%"></div>
    <div class="g500-score-mid"></div>
  </div>`;
    }).join('');

    const opponentLabel = others.length === 1
        ? `<span class="g500-score-label">${others[0].score} pt</span>`
        : `<span class="g500-score-label">${others.map((o) => `${o.displayName}: ${o.score}`).join(' · ')} pt</span>`;

    return `<div class="g500-score-bar">
  ${opponentLabel}
  ${tracks}
  <span class="g500-score-label g500-score-label-amber">${selfScore} pt</span>
</div>`;
}

function playerBadge(player: FemPlayerInfo, reversed = false): string {
    const active = player.isCurrentTurn;
    const dir    = reversed ? 'row-reverse' : 'row';
    const align  = reversed ? 'right' : 'left';
    const nc     = active ? '#ffb300' : '#e8ddd7';
    const ab     = active ? 'linear-gradient(135deg,#ffb300,#e08000)' : 'rgba(255,255,255,0.1)';
    const abdr   = active ? 'rgba(255,179,0,0.65)' : 'rgba(255,255,255,0.13)';
    const ac     = active ? '#1a0a00' : '#e8ddd7';
    const sc     = player.score >= 400 ? '#f6a46f' : 'rgba(255,255,255,0.65)';
    const init   = (player.displayName || '?')[0].toUpperCase();
    const badge  = active
        ? `<div class="g500-turn-badge"><div class="g500-pulse-dot"></div><span>Tur</span></div>`
        : '';
    return `<div style="display:flex;align-items:center;gap:10px;flex-direction:${dir};">
  <div style="width:36px;height:36px;border-radius:50%;flex-shrink:0;background:${ab};border:2px solid ${abdr};display:flex;align-items:center;justify-content:center;font-family:Georgia,serif;font-weight:900;font-size:15px;color:${ac};">${init}</div>
  <div style="text-align:${align};">
    <div style="font-family:Georgia,serif;font-weight:900;font-size:14px;text-transform:uppercase;letter-spacing:1.2px;color:${nc};">${player.displayName}</div>
    <div style="font-size:11px;color:rgba(255,255,255,0.45);"><span style="font-weight:700;font-size:13px;color:${sc};">${player.score}</span><span style="margin-left:2px;">/ 500 pt</span></div>
  </div>
  ${badge}
</div>`;
}

function meldGroup(meld: FemMeld, cw: number, ch: number, action?: string): string {
    const spread  = Math.min(cw * 0.52, 20);
    const totalW  = cw + (meld.cards.length - 1) * spread;
    const cards   = meld.cards.map((code, i) =>
        `<div style="position:absolute;left:${i * spread}px;z-index:${i};">${renderCardFront(code, cw, ch)}</div>`
    ).join('');
    const pts     = Object.values(meld.pointsPerPlayer).reduce((s, n) => s + n, 0);
    const ptsHtml = pts > 0
        ? `<div style="position:absolute;bottom:-14px;left:0;font-size:8px;letter-spacing:1px;color:rgba(255,179,0,0.7);font-weight:700;">${pts} pt</div>`
        : '';
    const cursor  = action ? 'cursor:pointer;' : '';
    const attrs   = action ? `data-action="${action}" data-meld-id="${meld.id}"` : '';
    return `<div ${attrs} style="position:relative;height:${ch}px;width:${totalW}px;flex-shrink:0;${cursor}">${cards}${ptsHtml}</div>`;
}

function meldSection(melds: FemMeld[], cw: number, ch: number, clickAction?: string): string {
    if (!melds.length) {
        return `<div style="height:${ch}px;display:flex;align-items:center;color:rgba(255,255,255,0.2);font-size:11px;letter-spacing:0.5px;font-style:italic;padding-left:4px;">ingen stik lagt endnu</div>`;
    }
    return `<div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap;">
  ${melds.map((m, gi) => `<div style="position:relative;margin-bottom:16px;"><div style="position:absolute;top:-13px;left:0;font-size:8px;letter-spacing:2px;text-transform:uppercase;color:rgba(255,179,0,0.55);font-weight:700;">${m.suit} ${gi + 1}</div>${meldGroup(m, cw, ch, clickAction)}</div>`).join('')}
</div>`;
}

function drawPile(count: number, canDraw: boolean): string {
    const stacks = [3, 2, 1].map((off) =>
        `<div style="position:absolute;top:${-off * 2.5}px;left:${-off * 1.5}px;opacity:0.55;">${renderCardBack(`dstk${off}`, 72, 101)}</div>`
    ).join('');
    const overlay = canDraw
        ? `<div data-action="fem-draw-stock" class="g500-pile-overlay" style="cursor:pointer;"><span class="g500-hover-label">Træk</span></div>`
        : '';
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:8px;">
  <div class="g500-pile-wrap${canDraw ? ' g500-pile-hoverable' : ''}">
    ${stacks}
    <div style="position:relative;z-index:4;box-shadow:${SHADOW};border-radius:6px;">${renderCardBack('dtop', 72, 101)}</div>
    ${overlay}
  </div>
  <div style="text-align:center;line-height:1.45;">
    <div class="g500-pile-label">Bunke</div>
    <div class="g500-pile-count">${count} kort</div>
  </div>
</div>`;
}

function discardPile(top: string | null, canDrawDiscard: boolean): string {
    const topH = top
        ? `<div style="position:relative;z-index:2;">
            ${renderCardFront(top, 72, 101)}
            ${canDrawDiscard ? `<div data-action="fem-draw-discard" class="g500-pile-overlay" style="cursor:pointer;"><span class="g500-hover-label">Tag kort</span></div>` : ''}
          </div>`
        : `<div style="width:72px;height:101px;border-radius:6px;border:2px dashed rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.18);font-size:24px;">—</div>`;

    return `<div style="display:flex;flex-direction:column;align-items:center;gap:8px;">
  <div class="g500-pile-wrap${canDrawDiscard && top ? ' g500-pile-hoverable' : ''}" style="width:72px;height:101px;">
    ${topH}
  </div>
  <div style="text-align:center;line-height:1.45;">
    <div class="g500-pile-label">Aflagning</div>
    ${top ? `<div class="g500-pile-count">${top}</div>` : '<div class="g500-pile-count">tom</div>'}
  </div>
</div>`;
}

function grabPhasePanel(vm: FemViewModel): string {
    if (!vm.discardGrabPhase) return '';

    const grabberName = vm.players.find((p) => p.playerId === vm.grabPriorityPlayerId)?.displayName ?? vm.grabPriorityPlayerId ?? '?';

    if (!vm.isGrabPriority) {
        return `<div style="text-align:center;padding:10px 0;color:rgba(255,255,255,0.55);font-size:12px;letter-spacing:0.5px;">
  <div class="g500-waiting"><div class="g500-waiting-dot"></div><span>Venter på ${grabberName} (grab-fase)</span></div>
</div>`;
    }

    const claimButtons = vm.melds.map((m) =>
        `<button class="btn primary" style="font-size:11px;" data-action="fem-claim-discard" data-meld-id="${m.id}" type="button">Tilføj til ${m.suit}-stik</button>`
    ).join('');

    return `<div style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:8px 0;">
  <div style="color:#ffb300;font-size:12px;font-weight:700;letter-spacing:1px;">Grab-fase: tag det aflagte kort</div>
  <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;">
    ${claimButtons}
    <button class="btn" data-action="fem-pass-grab" type="button">Pas</button>
  </div>
</div>`;
}

function gameOverBanner(vm: FemViewModel): string {
    if (!vm.winnerPlayerId) return '';
    const winner = vm.players.find((p) => p.playerId === vm.winnerPlayerId);
    const label  = vm.winnerPlayerId === vm.selfPlayerId
        ? 'Du vandt spillet!'
        : `${winner?.displayName ?? vm.winnerPlayerId} vandt spillet!`;
    return `<div style="position:absolute;top:0;left:0;right:0;background:rgba(255,179,0,0.15);border-bottom:2px solid rgba(255,179,0,0.4);padding:8px 16px;text-align:center;font-family:Georgia,serif;font-weight:700;font-size:14px;color:#ffb300;letter-spacing:1px;z-index:20;">${label}</div>`;
}

export function renderFemRoom(vm: FemViewModel): string {
    const self      = vm.players.find((p) => p.isSelf);
    const opponents = vm.players.filter((p) => !p.isSelf);
    const selSet    = new Set(vm.selectedCards);
    const selCount  = vm.selectedCards.length;

    const meldClickAction = vm.discardGrabPhase && vm.isGrabPriority
        ? 'fem-claim-discard'
        : vm.isMyTurn && !vm.discardGrabPhase && vm.canExtendMeld
        ? 'fem-extend-meld'
        : undefined;

    const oppZones = opponents.map((opp) => `
<div class="g500-zone g500-opponent${opp.isCurrentTurn ? ' g500-zone-active' : ''}">
  <div class="g500-zone-row">
    ${playerBadge(opp, true)}
    <div style="margin-top:12px;">${meldSection(vm.melds.filter((_) => true), MW, MH)}</div>
  </div>
  <div style="display:flex;justify-content:center;margin-top:6px;">
    ${renderHandFan(Array.from({ length: opp.cardCount }, (_, i) => `back${i}`), new Set(), false, false, 50, 70)}
  </div>
</div>`).join('');

    const actionButtons = (() => {
        if (vm.phase !== 'PLAYING' && vm.winnerPlayerId) return '';
        if (!vm.isMyTurn) return `<div class="g500-waiting"><div class="g500-waiting-dot"></div><span>Venter...</span></div>`;
        if (vm.discardGrabPhase) return grabPhasePanel(vm);

        const btns: string[] = [];
        if (vm.canDraw) btns.push(`<button class="btn primary" data-action="fem-draw-stock" type="button">Træk fra bunke</button>`);
        if (vm.canDrawDiscard && vm.discardPileTop) btns.push(`<button class="btn" data-action="fem-draw-discard" type="button">Tag aflagt kort</button>`);
        if (vm.canTakePile) btns.push(`<button class="btn" data-action="fem-take-pile" type="button">Tag hele bunken</button>`);
        if (vm.canLayMeld) btns.push(`<button class="btn primary" data-action="fem-lay-meld" type="button">Læg stik (${selCount} kort)</button>`);
        if (vm.canDiscard && selCount === 1) btns.push(`<button class="btn" data-action="fem-discard" type="button">Aflæg</button>`);

        return btns.join('');
    })();

    const extendHint = vm.isMyTurn && !vm.discardGrabPhase && vm.canExtendMeld && vm.melds.length > 0
        ? `<div style="font-size:10px;color:rgba(255,179,0,0.6);letter-spacing:0.5px;">Klik på et stik for at tilføje dit valgte kort</div>`
        : '';

    return `<section class="g500-shell">
  <div class="g500-table">
    <svg class="g500-felt-svg" aria-hidden="true"><defs><pattern id="g500felt" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="1.2" cy="1.2" r="0.7" fill="white"/><circle cx="3.7" cy="3.7" r="0.7" fill="white"/></pattern></defs><rect width="100%" height="100%" fill="url(#g500felt)"/></svg>
    <div class="g500-vignette" aria-hidden="true"></div>
    <div class="g500-ring" aria-hidden="true"></div>

    ${gameOverBanner(vm)}

    <div class="g500-topbar">
      <button class="game-room-leave-btn" type="button" data-action="leave-table">← Forlad</button>
      ${scoreBar(vm.players)}
      <span style="font-size:11px;color:rgba(255,255,255,0.4);letter-spacing:1px;">Runde ${vm.roundNumber}</span>
    </div>

    ${oppZones}

    <div class="g500-center">
      <div class="g500-center-oval" aria-hidden="true"></div>
      <div style="position:relative;z-index:2;">${drawPile(vm.stockPileCount, vm.canDraw && !vm.discardGrabPhase)}</div>
      <div class="g500-divider" aria-hidden="true"></div>
      <div style="position:relative;z-index:2;">${discardPile(vm.discardPileTop, vm.canDrawDiscard && !vm.discardGrabPhase)}</div>
    </div>

    <div style="position:relative;z-index:2;padding:8px 16px 4px;">
      ${meldSection(vm.melds, MW, MH, meldClickAction)}
    </div>

    <div class="g500-zone g500-player${vm.isMyTurn ? ' g500-zone-active g500-player-active' : ''}">
      ${vm.discardGrabPhase && vm.isGrabPriority ? grabPhasePanel(vm) : ''}
      <div style="display:flex;justify-content:center;margin-bottom:8px;">
        ${renderHandFan(vm.hand, selSet, true, true, CW, CH)}
      </div>
      <div class="g500-action-row">
        ${self ? playerBadge(self) : ''}
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end;">
          ${extendHint}
          ${vm.isMyTurn && !vm.discardGrabPhase ? actionButtons : (!vm.isMyTurn && !vm.discardGrabPhase ? actionButtons : '')}
        </div>
      </div>
      ${vm.discardGrabPhase && !vm.isGrabPriority ? `<div style="display:flex;justify-content:center;">${grabPhasePanel(vm)}</div>` : ''}
    </div>
  </div>
</section>`;
}
