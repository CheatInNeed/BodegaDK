import type { Card } from './engine.js';

const PIPS: Record<string, Array<[number, number, boolean]>> = {
    'A':  [[50, 50, false]],
    '2':  [[50, 22, false], [50, 78, true]],
    '3':  [[50, 18, false], [50, 50, false], [50, 82, true]],
    '4':  [[27, 21, false], [73, 21, false], [27, 79, true], [73, 79, true]],
    '5':  [[27, 21, false], [73, 21, false], [50, 50, false], [27, 79, true], [73, 79, true]],
    '6':  [[27, 19, false], [73, 19, false], [27, 50, false], [73, 50, false], [27, 81, true], [73, 81, true]],
    '7':  [[27, 17, false], [73, 17, false], [50, 34, false], [27, 54, false], [73, 54, false], [27, 80, true], [73, 80, true]],
    '8':  [[27, 14, false], [73, 14, false], [50, 31, false], [27, 51, false], [73, 51, false], [50, 67, true], [27, 82, true], [73, 82, true]],
    '9':  [[27, 13, false], [73, 13, false], [27, 36, false], [73, 36, false], [50, 50, false], [27, 64, true], [73, 64, true], [27, 87, true], [73, 87, true]],
    '10': [[27, 11, false], [73, 11, false], [50, 26, false], [27, 41, false], [73, 41, false], [27, 59, true], [73, 59, true], [50, 74, true], [27, 89, true], [73, 89, true]],
};

const FACE_ICON: Record<string, string> = { J: '⚔', Q: '♛', K: '♚' };
export const FACE_RANKS = ['J', 'Q', 'K'];

const CARD_BG    = '#FAF5EA';
const CARD_BC    = '#C8B070';
const RED_C      = '#B91C1C';
const BLACK_C    = '#1A1205';
const BACK_BG    = '#0C3A18';
const BACK_LINE  = 'rgba(212,175,106,0.28)';
const BACK_ACC   = 'rgba(212,175,106,0.18)';
const BACK_CTR   = 'rgba(212,175,106,0.12)';
const INNER_BC   = 'rgba(180,150,80,0.35)';
const CR         = 6;
const SHADOW     = '0 4px 18px rgba(0,0,0,0.6),0 1px 4px rgba(0,0,0,0.3)';

export function renderCardBack(uid: string, cw: number, ch: number): string {
    const pid = `g5cb-${uid}`;
    const stars = [[20, 22], [cw - 20, 22], [20, ch - 12], [cw - 20, ch - 12]]
        .map(([cx, cy]) => `<text x="${cx}" y="${cy}" text-anchor="middle" font-size="9" fill="${BACK_LINE}" font-family="serif">✦</text>`)
        .join('');
    return `<div style="width:${cw}px;height:${ch}px;border-radius:${CR}px;border:1px solid ${CARD_BC};box-shadow:${SHADOW};overflow:hidden;background:${BACK_BG};position:relative;flex-shrink:0;">
<svg width="${cw}" height="${ch}" style="position:absolute;inset:0;" xmlns="http://www.w3.org/2000/svg">
  <defs><pattern id="${pid}" width="18" height="18" patternUnits="userSpaceOnUse">
    <rect width="18" height="18" fill="${BACK_BG}"/>
    <path d="M9 0 L18 9 L9 18 L0 9 Z" fill="none" stroke="${BACK_LINE}" stroke-width="0.7"/>
    <circle cx="9" cy="9" r="1.2" fill="${BACK_ACC}"/>
  </pattern></defs>
  <rect width="${cw}" height="${ch}" fill="url(#${pid})"/>
  <rect x="7" y="7" width="${cw - 14}" height="${ch - 14}" rx="${CR}" fill="none" stroke="${BACK_LINE}" stroke-width="1.2"/>
  <rect x="12" y="12" width="${cw - 24}" height="${ch - 24}" rx="${Math.max(CR - 3, 2)}" fill="none" stroke="${BACK_ACC}" stroke-width="0.8"/>
  <text x="${cw / 2}" y="${ch / 2 + 10}" text-anchor="middle" font-size="32" fill="${BACK_CTR}" font-family="serif">◆</text>
  <text x="${cw / 2}" y="${ch / 2 + 9}" text-anchor="middle" font-size="13" fill="${BACK_LINE}" font-family="serif">B</text>
  ${stars}
</svg>
</div>`;
}

function corner(rank: string, sym: string, color: string, flip: boolean): string {
    const pos = flip
        ? 'bottom:5px;right:5px;transform:rotate(180deg);'
        : 'top:5px;left:5px;';
    const fs = rank === '10' ? '12px' : '14px';
    const ls = rank === '10' ? '-1px' : '0';
    return `<div style="position:absolute;${pos}text-align:center;line-height:1;user-select:none;">
  <div style="font-size:${fs};font-weight:700;color:${color};font-family:Georgia,serif;letter-spacing:${ls};line-height:1.05;">${rank}</div>
  <div style="font-size:10px;color:${color};line-height:1.1;">${sym}</div>
</div>`;
}

function numberCard(card: Card, cw: number, ch: number): string {
    const color = card.suit?.red ? RED_C : BLACK_C;
    const sym   = card.suit?.s ?? '';
    const pips  = PIPS[card.rank] ?? [];
    const isAce = card.rank === 'A';
    const fs    = isAce ? 36 : card.rank === '10' ? 13 : ['8','9'].includes(card.rank) ? 14 : 15;

    const pipHtml = pips.map(([px, py, flip]) => {
        const t = flip
            ? `translate(-50%,-50%) rotate(180deg)`
            : `translate(-50%,-50%)`;
        return `<div style="position:absolute;left:${px}%;top:${py}%;transform:${t};transform-origin:0 0;"><span style="font-size:${fs}px;color:${color};line-height:1;display:block;">${sym}</span></div>`;
    }).join('');

    return `<div style="width:${cw}px;height:${ch}px;border-radius:${CR}px;border:1px solid ${CARD_BC};box-shadow:${SHADOW};background:${CARD_BG};position:relative;overflow:hidden;flex-shrink:0;">
  <div style="position:absolute;inset:5px;border:1px solid ${INNER_BC};border-radius:${Math.max(CR-2,2)}px;pointer-events:none;"></div>
  ${corner(card.rank, sym, color, false)}
  ${corner(card.rank, sym, color, true)}
  <div style="position:absolute;top:36px;bottom:36px;left:12px;right:12px;">${pipHtml}</div>
</div>`;
}

function faceCard(card: Card, cw: number, ch: number): string {
    const color = card.suit?.red ? RED_C : BLACK_C;
    const sym   = card.suit?.s ?? '';
    const icon  = FACE_ICON[card.rank] ?? '';
    const rankFs = cw < 60 ? '26px' : '42px';
    const iconFs = cw < 60 ? '10px' : '16px';
    const symFs  = cw < 60 ? '12px' : '18px';
    const divider = `<div style="display:flex;align-items:center;gap:4px;margin:0 20px;opacity:0.3;"><div style="flex:1;height:1px;background:${color};"></div><span style="font-size:8px;color:${color};">✦</span><div style="flex:1;height:1px;background:${color};"></div></div>`;

    return `<div style="width:${cw}px;height:${ch}px;border-radius:${CR}px;border:1px solid ${CARD_BC};box-shadow:${SHADOW};background:${CARD_BG};position:relative;overflow:hidden;flex-shrink:0;">
  <div style="position:absolute;inset:5px;border:1px solid ${INNER_BC};border-radius:${Math.max(CR-2,2)}px;pointer-events:none;"></div>
  <div style="position:absolute;left:14px;right:14px;top:30px;bottom:30px;background:rgba(180,150,80,0.06);border-radius:4px;"></div>
  ${corner(card.rank, sym, color, false)}
  ${corner(card.rank, sym, color, true)}
  <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;width:100%;">
    ${divider}
    <div style="font-size:${rankFs};font-family:Georgia,serif;font-weight:900;color:${color};line-height:1;margin-top:4px;">${card.rank}</div>
    <div style="font-size:${iconFs};color:${color};line-height:1;margin-top:4px;opacity:0.55;">${icon}</div>
    <div style="font-size:${symFs};color:${color};line-height:1;margin-top:3px;">${sym}</div>
    <div style="margin-top:4px;">${divider}</div>
  </div>
</div>`;
}

export function renderCardFront(card: Card, cw: number, ch: number): string {
    if (FACE_RANKS.includes(card.rank)) return faceCard(card, cw, ch);
    return numberCard(card, cw, ch);
}

export function renderHandFan(
    cards: Card[],
    selectedIds: Set<string>,
    interactive: boolean,
    faceUp: boolean,
    cw: number,
    ch: number,
): string {
    if (cards.length === 0) {
        return `<div style="height:${ch + 38}px;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.25);font-size:12px;letter-spacing:1px;font-style:italic;">— tom hånd —</div>`;
    }
    const n    = cards.length;
    const mid  = (n - 1) / 2;
    const maxA = Math.min(22, n * 3.5);
    const over = Math.max(26, Math.min(38, 200 / n));
    const totalW = cw + (n - 1) * over;

    const html = cards.map((card, i) => {
        const off      = i - mid;
        const rotate   = (off / Math.max(mid, 1)) * maxA;
        const arcY     = (Math.abs(off) / Math.max(mid, 1)) * 12;
        const isSel    = selectedIds.has(card.id);
        const liftY    = isSel ? -22 : 0;
        const shadow   = isSel
            ? `0 0 0 2.5px #ffb300,0 0 22px rgba(255,179,0,0.45),${SHADOW}`
            : SHADOW;
        const selBadge = isSel
            ? `<div style="position:absolute;top:-7px;right:-5px;width:18px;height:18px;border-radius:50%;background:#ffb300;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:900;color:#1a0800;z-index:10;box-shadow:0 2px 8px rgba(0,0,0,0.5);">✓</div>`
            : '';
        const content  = faceUp ? renderCardFront(card, cw, ch) : renderCardBack(`opp${i}`, cw, ch);
        const action   = interactive
            ? `data-g500-action="toggle-select" data-card-id="${card.id}"`
            : '';
        const cursor   = interactive ? 'pointer' : 'default';

        return `<div ${action} style="position:absolute;left:${i * over}px;bottom:8px;z-index:${i};transform-origin:bottom center;transform:rotate(${rotate}deg) translateY(${arcY + liftY}px);transition:transform 0.16s ease;cursor:${cursor};">
  <div style="border-radius:${CR}px;box-shadow:${shadow};transition:box-shadow 0.16s ease;">${content}</div>
  ${selBadge}
</div>`;
    }).join('');

    return `<div style="position:relative;width:${totalW}px;height:${ch + 38}px;margin:0 auto;">${html}</div>`;
}
