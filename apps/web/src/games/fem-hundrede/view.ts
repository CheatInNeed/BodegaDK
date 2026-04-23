import type { Card, FemHundredeState } from './engine.js';
import { isValidMeld } from './engine.js';
import { renderCardBack, renderCardFront, renderHandFan } from './cards.js';

const CW = 68, CH = 95;
const MW = 50, MH = 70;
const SHADOW = '0 4px 18px rgba(0,0,0,0.6),0 1px 4px rgba(0,0,0,0.3)';

function scoreBar(scores: [number, number]): string {
    const p0 = Math.min(scores[0] / 500 * 100, 100);
    const p1 = Math.min(scores[1] / 500 * 100, 100);
    return `<div class="g500-score-bar">
  <span class="g500-score-label">${scores[1]} pt</span>
  <div class="g500-score-track">
    <div class="g500-score-fill g500-score-p1" style="width:${p1}%"></div>
    <div class="g500-score-fill g500-score-p0" style="width:${p0}%"></div>
    <div class="g500-score-mid"></div>
  </div>
  <span class="g500-score-label g500-score-label-amber">${scores[0]} pt</span>
</div>`;
}

function playerBadge(name: string, score: number, active: boolean, reversed = false): string {
    const dir   = reversed ? 'row-reverse' : 'row';
    const align = reversed ? 'right' : 'left';
    const nc    = active ? '#ffb300' : '#e8ddd7';
    const ab    = active ? 'linear-gradient(135deg,#ffb300,#e08000)' : 'rgba(255,255,255,0.1)';
    const abdr  = active ? 'rgba(255,179,0,0.65)' : 'rgba(255,255,255,0.13)';
    const ac    = active ? '#1a0a00' : '#e8ddd7';
    const sc    = score >= 400 ? '#f6a46f' : 'rgba(255,255,255,0.65)';
    const init  = (name || '?')[0].toUpperCase();
    const badge = active
        ? `<div class="g500-turn-badge"><div class="g500-pulse-dot"></div><span>Din tur</span></div>`
        : '';
    return `<div style="display:flex;align-items:center;gap:10px;flex-direction:${dir};">
  <div style="width:36px;height:36px;border-radius:50%;flex-shrink:0;background:${ab};border:2px solid ${abdr};display:flex;align-items:center;justify-content:center;font-family:Georgia,serif;font-weight:900;font-size:15px;color:${ac};">${init}</div>
  <div style="text-align:${align};">
    <div style="font-family:Georgia,serif;font-weight:900;font-size:14px;text-transform:uppercase;letter-spacing:1.2px;color:${nc};">${name}</div>
    <div style="font-size:11px;color:rgba(255,255,255,0.45);"><span style="font-weight:700;font-size:13px;color:${sc};">${score}</span><span style="margin-left:2px;">/ 500 pt</span></div>
  </div>
  ${badge}
</div>`;
}

function meldGroup(cards: Card[], cw: number, ch: number): string {
    const spread  = Math.min(cw * 0.52, 20);
    const totalW  = cw + (cards.length - 1) * spread;
    const html    = cards.map((c, i) =>
        `<div style="position:absolute;left:${i * spread}px;z-index:${i};">${renderCardFront(c, cw, ch)}</div>`
    ).join('');
    return `<div style="position:relative;height:${ch}px;width:${totalW}px;flex-shrink:0;">${html}</div>`;
}

function playerMelds(melds: Card[][], cw: number, ch: number): string {
    if (!melds.length) {
        return `<div style="height:${ch}px;display:flex;align-items:center;color:rgba(255,255,255,0.2);font-size:11px;letter-spacing:0.5px;font-style:italic;padding-left:4px;">ingen stik lagt endnu</div>`;
    }
    return `<div style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap;">
  ${melds.map((g, gi) => `<div style="position:relative;"><div style="position:absolute;top:-13px;left:0;font-size:8px;letter-spacing:2px;text-transform:uppercase;color:rgba(255,179,0,0.55);font-weight:700;">Stik ${gi + 1}</div>${meldGroup(g, cw, ch)}</div>`).join('')}
</div>`;
}

function drawPile(count: number, canDraw: boolean): string {
    const stacks = [3, 2, 1].map((off) =>
        `<div style="position:absolute;top:${-off * 2.5}px;left:${-off * 1.5}px;opacity:0.55;">${renderCardBack(`dstk${off}`, 72, 101)}</div>`
    ).join('');
    const overlay = canDraw
        ? `<div data-g500-action="draw" class="g500-pile-overlay"><span class="g500-hover-label">Træk</span></div>`
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

function discardPile(pile: Card[], canTake: boolean): string {
    const top   = pile[pile.length - 1];
    const prev  = pile[pile.length - 2];
    const prevH = prev
        ? `<div style="position:absolute;top:3px;left:3px;opacity:0.5;z-index:1;">${renderCardFront(prev, 72, 101)}</div>`
        : '';
    const topH  = top
        ? `<div style="position:relative;z-index:2;">${renderCardFront(top, 72, 101)}${canTake ? `<div data-g500-action="take-top" class="g500-pile-overlay"><span class="g500-hover-label">Tag øverste</span></div>` : ''}</div>`
        : `<div style="width:72px;height:101px;border-radius:6px;border:2px dashed rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.18);font-size:24px;">—</div>`;

    return `<div style="display:flex;flex-direction:column;align-items:center;gap:8px;">
  <div class="g500-pile-wrap${canTake && top ? ' g500-pile-hoverable' : ''}" style="width:72px;height:101px;">
    ${prevH}
    ${topH}
  </div>
  <div style="text-align:center;line-height:1.45;">
    <div class="g500-pile-label">Aflagning</div>
    <div class="g500-pile-count">${pile.length} kort</div>
  </div>
</div>`;
}

export function renderFemHundredeGame(state: FemHundredeState): string {
    const { phase, currentPlayer, hands, melds, scores, selected, discardPile: dp, drawPileCount, message, toast } = state;
    const isMyTurn  = currentPlayer === 0;
    const canDraw   = phase === 'draw' && isMyTurn;
    const canTake   = phase === 'draw' && isMyTurn;
    const selCards  = hands[0].filter((c) => selected.has(c.id));
    const canMeld   = phase === 'play' && isMyTurn && isValidMeld(selCards);
    const canDiscard = phase === 'play' && isMyTurn && selCards.length === 1;
    const canTakePile = canTake && dp.length > 1;

    return `<section class="g500-shell">
  <div class="g500-table">
    <svg class="g500-felt-svg" aria-hidden="true"><defs><pattern id="g500felt" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="1.2" cy="1.2" r="0.7" fill="white"/><circle cx="3.7" cy="3.7" r="0.7" fill="white"/></pattern></defs><rect width="100%" height="100%" fill="url(#g500felt)"/></svg>
    <div class="g500-vignette" aria-hidden="true"></div>
    <div class="g500-ring" aria-hidden="true"></div>

    <div class="g500-topbar">
      <span class="g500-brand">500 · BodegaDK</span>
      ${scoreBar(scores)}
      <button class="g500-reset-btn" data-g500-action="reset">Ny runde</button>
    </div>

    <div class="g500-zone g500-opponent${currentPlayer === 1 ? ' g500-zone-active' : ''}">
      <div class="g500-zone-row">
        ${playerBadge(state.playerNames[1], scores[1], currentPlayer === 1, true)}
        <div style="margin-top:12px;">${playerMelds(melds[1], MW, MH)}</div>
        <div style="width:140px;"></div>
      </div>
      <div style="display:flex;justify-content:center;">
        ${renderHandFan(hands[1], new Set(), false, false, CW, CH)}
      </div>
    </div>

    <div class="g500-center">
      <div class="g500-center-oval" aria-hidden="true"></div>
      <div style="position:relative;z-index:2;">${drawPile(drawPileCount, canDraw)}</div>
      <div class="g500-divider" aria-hidden="true"></div>
      <div style="position:relative;z-index:2;">${discardPile(dp, canTake)}</div>
      ${canTakePile ? `<div style="position:relative;z-index:2;"><button class="btn primary" data-g500-action="take-pile">Tag hele bunken (${dp.length})</button></div>` : ''}
    </div>

    <div class="g500-zone g500-player${isMyTurn ? ' g500-zone-active g500-player-active' : ''}">
      <div style="display:flex;justify-content:center;margin-bottom:12px;margin-top:4px;">
        ${playerMelds(melds[0], MW, MH)}
      </div>
      <div style="display:flex;justify-content:center;margin-bottom:8px;">
        ${renderHandFan(hands[0], selected, true, true, CW, CH)}
      </div>
      <div class="g500-action-row">
        ${playerBadge(state.playerNames[0], scores[0], isMyTurn)}
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end;">
          <p class="g500-message">${message}</p>
          ${canMeld    ? `<button class="btn primary" data-g500-action="lay-meld">Læg stik (${selCards.length} kort)</button>` : ''}
          ${canDiscard ? `<button class="btn" data-g500-action="discard">Aflæg</button>` : ''}
          ${!isMyTurn  ? `<div class="g500-waiting"><div class="g500-waiting-dot"></div><span>Venter...</span></div>` : ''}
        </div>
      </div>
    </div>

    ${toast ? `<div class="g500-toast" aria-live="polite">${toast}</div>` : ''}
  </div>
</section>`;
}
