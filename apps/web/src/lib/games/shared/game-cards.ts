import { t as translate } from '../../../i18n';

// ── Nordisk card theme (hardcoded single theme) ──────────────────────────────

export interface CardTheme {
    id: string;
    label: string;
    cardBg: string;
    cardBorder: string;
    cardRadius: number;
    cardShadow: string;
    innerBorder: string | null;
    red: string;
    blk: string;
    backBg: string;
    backLine: string;
}

export const THEME: CardTheme = {
    id: 'nordisk', label: 'Nordisk',
    cardBg: '#FFFFFF', cardBorder: '1px solid #E2E8F0', cardRadius: 12,
    cardShadow: '0 4px 24px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)',
    innerBorder: null,
    red: '#C0392B', blk: '#111827',
    backBg: '#1A2535', backLine: 'rgba(255,255,255,0.12)',
};

// ── Card code parsing ────────────────────────────────────────────────────────

export type ParsedCard = { rank: string; suit: { s: string; red: boolean }; isJoker: boolean };

const SUIT_MAP: Record<string, { s: string; red: boolean }> = {
    H: { s: '\u2665', red: true },
    D: { s: '\u2666', red: true },
    C: { s: '\u2663', red: false },
    S: { s: '\u2660', red: false },
};

const VALID_RANKS = new Set(['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']);

/**
 * Parse a server card code (e.g. "HA", "S10", "JK1") into display parts.
 * Returns null for invalid codes.
 */
export function parseCardCode(code: string): ParsedCard | null {
    const c = code.trim().toUpperCase();
    if (c.startsWith('JK')) {
        return { rank: 'JK', suit: { s: '\u2605', red: false }, isJoker: true };
    }
    if (c.length < 2) return null;
    const suitInfo = SUIT_MAP[c[0]];
    if (!suitInfo) return null;
    const rank = c.slice(1);
    if (!VALID_RANKS.has(rank)) return null;
    return { rank, suit: suitInfo, isJoker: false };
}

// ── Pip & face layout data ───────────────────────────────────────────────────

const PIPS: Record<string, [number, number, number][]> = {
    A: [[50,50,0]],
    '2': [[50,22,0],[50,78,1]],
    '3': [[50,18,0],[50,50,0],[50,82,1]],
    '4': [[27,21,0],[73,21,0],[27,79,1],[73,79,1]],
    '5': [[27,21,0],[73,21,0],[50,50,0],[27,79,1],[73,79,1]],
    '6': [[27,19,0],[73,19,0],[27,50,0],[73,50,0],[27,81,1],[73,81,1]],
    '7': [[27,17,0],[73,17,0],[50,34,0],[27,54,0],[73,54,0],[27,80,1],[73,80,1]],
    '8': [[27,14,0],[73,14,0],[50,31,0],[27,51,0],[73,51,0],[50,67,1],[27,82,1],[73,82,1]],
    '9': [[27,13,0],[73,13,0],[27,36,0],[73,36,0],[50,50,0],[27,64,1],[73,64,1],[27,87,1],[73,87,1]],
    '10': [[27,11,0],[73,11,0],[50,26,0],[27,41,0],[73,41,0],[27,59,1],[73,59,1],[50,74,1],[27,89,1],[73,89,1]],
};

const FACE_RANKS = new Set(['J', 'Q', 'K']);

// ── Internal helpers ─────────────────────────────────────────────────────────

function corner(rank: string, sym: string, color: string, flipped: boolean): string {
    const pos = flipped ? 'bottom:5px;right:5px;transform:rotate(180deg)' : 'top:5px;left:5px';
    return `<div style="position:absolute;${pos};text-align:center;line-height:1;user-select:none">
<div style="font-size:${rank==='10'?12:14}px;font-weight:700;color:${color};font-family:'Playfair Display',serif;letter-spacing:${rank==='10'?'-1px':'0'};line-height:1.05">${rank}</div>
<div style="font-size:10px;color:${color};line-height:1.1">${sym}</div>
</div>`;
}

function numberCard(rank: string, suit: {s:string,red:boolean}, t: CardTheme, cw: number, ch: number): string {
    const color = suit.red ? t.red : t.blk;
    const pips = PIPS[rank] ?? [];
    // Pip size and pip area are tuned for a 78x109 card; scale them for other sizes.
    const scale = cw / 78;
    const sz = (rank==='A' ? 36 : rank==='10' ? 13 : ['8','9'].includes(rank) ? 14 : 15) * Math.max(scale, 0.7);
    const padY = Math.round(ch * 0.33);
    const padX = Math.round(12 * scale);
    const pipHtml = pips.map(([px,py,flip]) =>
        `<div style="position:absolute;left:${px}%;top:${py}%;transform:translate(-50%,-50%)${flip?' rotate(180deg)':''}"><span style="font-size:${sz}px;color:${color};line-height:1;user-select:none;display:block">${suit.s}</span></div>`
    ).join('');
    return `<div style="width:${cw}px;height:${ch}px;border-radius:${t.cardRadius}px;border:${t.cardBorder};box-shadow:${t.cardShadow};background:${t.cardBg};position:relative;overflow:hidden;flex-shrink:0">
${t.innerBorder ? `<div style="position:absolute;inset:5px;border:1px solid ${t.innerBorder};border-radius:${Math.max(t.cardRadius-2,2)}px;pointer-events:none"></div>` : ''}
${corner(rank, suit.s, color, false)}${corner(rank, suit.s, color, true)}
<div style="position:absolute;top:${padY}px;bottom:${padY}px;left:${padX}px;right:${padX}px">${pipHtml}</div></div>`;
}

function faceCard(rank: string, suit: {s:string,red:boolean}, t: CardTheme, cw: number, ch: number): string {
    const color = suit.red ? t.red : t.blk;
    const rankFs = cw < 60 ? `${Math.round(cw * 0.4)}px` : '42px';
    const symFs  = cw < 60 ? '12px' : '18px';
    return `<div style="width:${cw}px;height:${ch}px;border-radius:${t.cardRadius}px;border:${t.cardBorder};box-shadow:${t.cardShadow};background:${t.cardBg};position:relative;overflow:hidden;flex-shrink:0">
${t.innerBorder ? `<div style="position:absolute;inset:5px;border:1px solid ${t.innerBorder};border-radius:${Math.max(t.cardRadius-2,2)}px;pointer-events:none"></div>` : ''}
${corner(rank, suit.s, color, false)}${corner(rank, suit.s, color, true)}
<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;width:100%">
<div style="font-size:${rankFs};font-family:'Playfair Display',serif;font-weight:900;color:${color};line-height:1">${rank}</div>
<div style="font-size:${symFs};color:${color};line-height:1;margin-top:4px">${suit.s}</div>
</div></div>`;
}

function jokerCard(t: CardTheme, cw: number, ch: number): string {
    const star = (flipped: boolean) => {
        const pos = flipped ? 'bottom:5px;right:5px;transform:rotate(180deg)' : 'top:5px;left:5px';
        return `<div style="position:absolute;${pos};font-size:12px;color:${t.blk};line-height:1;user-select:none">\u2605</div>`;
    };
    const textFs = cw < 60 ? '9px' : '13px';
    return `<div style="width:${cw}px;height:${ch}px;border-radius:${t.cardRadius}px;border:${t.cardBorder};box-shadow:${t.cardShadow};background:${t.cardBg};position:relative;overflow:hidden;flex-shrink:0">
${star(false)}${star(true)}
<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:${textFs};font-family:'Playfair Display',serif;font-weight:900;letter-spacing:2px;color:${t.blk}">JOKER</div>
</div>`;
}

// ── Public rendering API ─────────────────────────────────────────────────────

/** Render the back of a card. `uid` is kept for API compatibility. */
export function renderCardBack(cw: number, ch: number, _uid: string, t: CardTheme = THEME): string {
    return `<div style="width:${cw}px;height:${ch}px;border-radius:${t.cardRadius}px;border:${t.cardBorder};box-shadow:${t.cardShadow};overflow:hidden;background:${t.backBg};position:relative;flex-shrink:0">
<div style="position:absolute;inset:6px;border:1px solid ${t.backLine};border-radius:${Math.max(t.cardRadius-4,2)}px"></div>
</div>`;
}

/** Render a face-up playing card from a ParsedCard. */
export function renderPlayingCard(card: ParsedCard, cw: number, ch: number, t: CardTheme = THEME): string {
    if (card.isJoker) return jokerCard(t, cw, ch);
    return FACE_RANKS.has(card.rank)
        ? faceCard(card.rank, card.suit, t, cw, ch)
        : numberCard(card.rank, card.suit, t, cw, ch);
}

/** Render a card from a server code string. Returns empty string for invalid codes. */
export function renderCardFront(code: string, cw: number, ch: number, t: CardTheme = THEME): string {
    const card = parseCardCode(code);
    if (!card) return '';
    return renderPlayingCard(card, cw, ch, t);
}

/** Render a layered stack of card backs (1-4 visible layers). */
export function renderCardStack(count: number, cw: number, ch: number, uid: string, t: CardTheme = THEME): string {
    const layers = Math.min(count, 4);
    if (layers === 0) {
        return renderEmptySlot(cw, ch);
    }
    const cards = Array.from({ length: layers }, (_, index) => {
        const offset = (layers - 1 - index) * 2;
        return `<div style="position:absolute;top:${offset}px;left:${offset}px;opacity:${index === layers - 1 ? 1 : 0.65}">${renderCardBack(cw, ch, `${uid}-${index}`, t)}</div>`;
    }).join('');
    return `<div style="width:${cw + 8}px;height:${ch + 8}px;position:relative;flex-shrink:0">${cards}</div>`;
}

/** Render a dashed empty card placeholder. */
export function renderEmptySlot(cw: number, ch: number): string {
    return `<div style="width:${cw}px;height:${ch}px;border-radius:${THEME.cardRadius}px;border:1.5px dashed rgba(212,175,106,0.1);display:flex;align-items:center;justify-content:center"><span style="color:rgba(212,175,106,0.18);font-size:18px">\u2205</span></div>`;
}

// Fan geometry: cards sit on a circle so each card's tilt matches the curve under it.
const FAN_STEP_DEG = 3.5;     // tilt between neighbouring cards
const FAN_MAX_EDGE_DEG = 13;  // outermost tilt; large hands use a smaller step
const FAN_RADIUS = 1000;      // px; ~65px spacing at 3.5deg, so the drop matches the spread

/** Card size for the player's own hand fan (matches HighCard's centre card). */
export const HAND_CARD_W = 96;
export const HAND_CARD_H = 134;

/**
 * Render an arc-fanned hand of cards with optional selection highlighting.
 *
 * Interactive fans (the player's hand) are spaced by CSS (`.hand-fan` in styles.css) so
 * the spread adapts to the hand size and window width; other fans use fixed px spacing.
 */
export function renderHandFan(
    cards: string[],
    selectedCodes: Set<string>,
    interactive: boolean,
    faceUp: boolean,
    cw: number,
    ch: number,
    t: CardTheme = THEME,
): string {
    if (cards.length === 0) {
        return `<div style="height:${ch + 38}px;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.25);font-size:12px;letter-spacing:1px;font-style:italic;">${translate('room.emptyHand')}</div>`;
    }
    const n    = cards.length;
    const mid  = (n - 1) / 2;
    const step = mid > 0 ? Math.min(FAN_STEP_DEG, FAN_MAX_EDGE_DEG / mid) : 0;
    const over = Math.max(26, Math.min(38, 200 / n));
    const totalW = cw + (n - 1) * over;
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    // Raise the whole fan by its deepest point (edge drop plus the lower corner of the
    // tilted edge card) so no card dips below the fan's box.
    const edge = toRad(mid * step);
    const base = 8 + Math.ceil(FAN_RADIUS * (1 - Math.cos(edge)) + (cw / 2) * Math.sin(edge));
    const height = ch + 30 + base;

    const html = cards.map((code, i) => {
        const off    = i - mid;
        const rotate = off * step;
        const arcY   = FAN_RADIUS * (1 - Math.cos(toRad(rotate)));
        const isSel  = selectedCodes.has(code);
        const liftY  = isSel ? -22 : 0;
        const shadow = isSel
            ? `0 0 0 2.5px #ffb300,0 0 22px rgba(255,179,0,0.45),${t.cardShadow}`
            : t.cardShadow;
        const selBadge = isSel
            ? `<div style="position:absolute;top:-7px;right:-5px;width:18px;height:18px;border-radius:50%;background:#ffb300;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:900;color:#1a0800;z-index:10;box-shadow:0 2px 8px rgba(0,0,0,0.5);">\u2713</div>`
            : '';
        const content   = faceUp ? renderCardFront(code, cw, ch, t) : renderCardBack(cw, ch, `opp${i}`, t);
        const position  = interactive ? `--i:${i};` : `left:${i * over}px;`;
        const action    = interactive ? `data-action="toggle-card" data-card="${code}"` : '';
        const dragAttrs = interactive ? `draggable="true" data-drag-card="${code}"` : '';
        // Transform parts live in CSS variables so the .hand-card hover rules in styles.css can override them.
        const cls       = interactive ? 'hand-card hand-card--interactive' : 'hand-card';

        return `<div ${action} ${dragAttrs} class="${cls}" style="${position}--z:${i};--rot:${rotate.toFixed(2)}deg;--arc:${arcY.toFixed(1)}px;--sel:${liftY}px;">
  <div style="border-radius:${t.cardRadius}px;box-shadow:${shadow};transition:box-shadow 0.16s ease;">${content}</div>
  ${selBadge}
</div>`;
    }).join('');

    if (interactive) {
        return `<div class="hand-fan" style="--n:${n};--cw:${cw}px;--fan-base:${base}px;height:${height}px;">${html}</div>`;
    }
    return `<div style="position:relative;width:${totalW}px;height:${height}px;margin:0 auto;--fan-base:${base}px;">${html}</div>`;
}

// ── Backward compat re-exports (to be removed after all games migrate) ───────

/** @deprecated Use THEME directly */
export const CARD_THEMES = { nordisk: THEME } as Record<string, CardTheme>;

/** @deprecated Use renderCardBack */
export const renderGCardBack = renderCardBack;

/** @deprecated Use renderPlayingCard */
export function renderGPlayingCard(card: {rank:string, suit:{s:string,red:boolean}}, t: CardTheme, cw: number, ch: number): string {
    return renderPlayingCard({ ...card, isJoker: false }, cw, ch, t);
}
