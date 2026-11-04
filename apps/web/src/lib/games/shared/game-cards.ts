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
    backAccent: string;
    backLine: string;
    backCenter: string;
    faceAccent: string;
}

export const THEME: CardTheme = {
    id: 'nordisk', label: 'Nordisk',
    cardBg: '#FFFFFF', cardBorder: '1px solid #E2E8F0', cardRadius: 12,
    cardShadow: '0 4px 24px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)',
    innerBorder: null,
    red: '#C0392B', blk: '#111827',
    backBg: '#1A2535', backAccent: 'rgba(255,255,255,0.08)',
    backLine: 'rgba(255,255,255,0.12)', backCenter: 'rgba(255,255,255,0.06)',
    faceAccent: 'rgba(0,0,0,0.025)',
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

const FACE_ICON: Record<string, string> = { J: '\u2694', Q: '\u265B', K: '\u265A' };
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
    const sz = rank==='A' ? 36 : rank==='10' ? 13 : ['8','9'].includes(rank) ? 14 : 15;
    const pipHtml = pips.map(([px,py,flip]) =>
        `<div style="position:absolute;left:${px}%;top:${py}%;transform:translate(-50%,-50%)${flip?' rotate(180deg)':''}"><span style="font-size:${sz}px;color:${color};line-height:1;user-select:none;display:block">${suit.s}</span></div>`
    ).join('');
    return `<div style="width:${cw}px;height:${ch}px;border-radius:${t.cardRadius}px;border:${t.cardBorder};box-shadow:${t.cardShadow};background:${t.cardBg};position:relative;overflow:hidden;flex-shrink:0">
${t.innerBorder ? `<div style="position:absolute;inset:5px;border:1px solid ${t.innerBorder};border-radius:${Math.max(t.cardRadius-2,2)}px;pointer-events:none"></div>` : ''}
${corner(rank, suit.s, color, false)}${corner(rank, suit.s, color, true)}
<div style="position:absolute;top:36px;bottom:36px;left:12px;right:12px">${pipHtml}</div></div>`;
}

function faceCard(rank: string, suit: {s:string,red:boolean}, t: CardTheme, cw: number, ch: number): string {
    const color = suit.red ? t.red : t.blk;
    const icon = FACE_ICON[rank] ?? '';
    const rankFs = cw < 60 ? '26px' : '42px';
    const iconFs = cw < 60 ? '10px' : '16px';
    const symFs  = cw < 60 ? '12px' : '18px';
    const divider = `<div style="display:flex;align-items:center;gap:4px;margin:0 20px;opacity:0.3"><div style="flex:1;height:1px;background:${color}"></div><span style="font-size:8px;color:${color}">\u2726</span><div style="flex:1;height:1px;background:${color}"></div></div>`;
    return `<div style="width:${cw}px;height:${ch}px;border-radius:${t.cardRadius}px;border:${t.cardBorder};box-shadow:${t.cardShadow};background:${t.cardBg};position:relative;overflow:hidden;flex-shrink:0">
${t.innerBorder ? `<div style="position:absolute;inset:5px;border:1px solid ${t.innerBorder};border-radius:${Math.max(t.cardRadius-2,2)}px;pointer-events:none"></div>` : ''}
<div style="position:absolute;left:14px;right:14px;top:30px;bottom:30px;background:${t.faceAccent};border-radius:4px"></div>
${corner(rank, suit.s, color, false)}${corner(rank, suit.s, color, true)}
<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;width:100%">
${divider}
<div style="font-size:${rankFs};font-family:'Playfair Display',serif;font-weight:900;color:${color};line-height:1;margin-top:5px">${rank}</div>
<div style="font-size:${iconFs};color:${color};line-height:1;margin-top:5px;opacity:0.55">${icon}</div>
<div style="font-size:${symFs};color:${color};line-height:1;margin-top:3px">${suit.s}</div>
${divider}
</div></div>`;
}

function jokerCard(t: CardTheme, cw: number, ch: number): string {
    return `<div style="width:${cw}px;height:${ch}px;border-radius:${t.cardRadius}px;border:${t.cardBorder};box-shadow:${t.cardShadow};background:${t.cardBg};position:relative;overflow:hidden;flex-shrink:0">
${t.innerBorder ? `<div style="position:absolute;inset:5px;border:1px solid ${t.innerBorder};border-radius:${Math.max(t.cardRadius-2,2)}px;pointer-events:none"></div>` : ''}
<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;">
<div style="font-size:28px;line-height:1;">\uD83C\uDCCF</div>
<div style="font-size:9px;font-weight:700;color:#6b4;letter-spacing:2px;margin-top:4px;">JOKER</div>
</div></div>`;
}

// ── Public rendering API ─────────────────────────────────────────────────────

/** Render the back of a card. */
export function renderCardBack(cw: number, ch: number, uid: string, t: CardTheme = THEME): string {
    const pid = `kpat-${uid}`;
    const corners = ([[20,22],[cw-20,22],[20,ch-12],[cw-20,ch-12]] as [number,number][])
        .map(([cx,cy]) => `<text x="${cx}" y="${cy}" text-anchor="middle" font-size="9" fill="${t.backLine}" font-family="serif">\u2726</text>`)
        .join('');
    return `<div style="width:${cw}px;height:${ch}px;border-radius:${t.cardRadius}px;border:${t.cardBorder};box-shadow:${t.cardShadow};overflow:hidden;background:${t.backBg};position:relative;flex-shrink:0">
<svg width="${cw}" height="${ch}" style="position:absolute;inset:0"><defs>
<pattern id="${pid}" x="0" y="0" width="18" height="18" patternUnits="userSpaceOnUse">
<rect width="18" height="18" fill="${t.backBg}"/>
<path d="M9 0 L18 9 L9 18 L0 9 Z" fill="none" stroke="${t.backLine}" stroke-width="0.7"/>
<circle cx="9" cy="9" r="1.2" fill="${t.backAccent}"/>
</pattern></defs>
<rect width="${cw}" height="${ch}" fill="url(#${pid})"/>
<rect x="7" y="7" width="${cw-14}" height="${ch-14}" rx="${t.cardRadius}" fill="none" stroke="${t.backLine}" stroke-width="1.2"/>
<rect x="12" y="12" width="${cw-24}" height="${ch-24}" rx="${Math.max(t.cardRadius-3,2)}" fill="none" stroke="${t.backAccent}" stroke-width="0.8"/>
<text x="${cw/2}" y="${ch/2+10}" text-anchor="middle" font-size="32" fill="${t.backCenter}" font-family="serif">\u25C6</text>
<text x="${cw/2}" y="${ch/2+9}" text-anchor="middle" font-size="13" fill="${t.backLine}" font-family="serif">B</text>
${corners}</svg></div>`;
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

/** Render an arc-fanned hand of cards with optional selection highlighting. */
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
        return `<div style="height:${ch + 38}px;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.25);font-size:12px;letter-spacing:1px;font-style:italic;">\u2014 tom h\u00E5nd \u2014</div>`;
    }
    const n    = cards.length;
    const mid  = (n - 1) / 2;
    const maxA = Math.min(22, n * 3.5);
    const over = Math.max(26, Math.min(38, 200 / n));
    const totalW = cw + (n - 1) * over;

    const html = cards.map((code, i) => {
        const off    = i - mid;
        const rotate = (off / Math.max(mid, 1)) * maxA;
        const arcY   = (Math.abs(off) / Math.max(mid, 1)) * 12;
        const isSel  = selectedCodes.has(code);
        const liftY  = isSel ? -22 : 0;
        const shadow = isSel
            ? `0 0 0 2.5px #ffb300,0 0 22px rgba(255,179,0,0.45),${t.cardShadow}`
            : t.cardShadow;
        const selBadge = isSel
            ? `<div style="position:absolute;top:-7px;right:-5px;width:18px;height:18px;border-radius:50%;background:#ffb300;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:900;color:#1a0800;z-index:10;box-shadow:0 2px 8px rgba(0,0,0,0.5);">\u2713</div>`
            : '';
        const content   = faceUp ? renderCardFront(code, cw, ch, t) : renderCardBack(cw, ch, `opp${i}`, t);
        const action    = interactive ? `data-action="toggle-card" data-card="${code}"` : '';
        const dragAttrs = interactive ? `draggable="true" data-drag-card="${code}"` : '';
        const cursor    = interactive ? 'pointer' : 'default';

        return `<div ${action} ${dragAttrs} style="position:absolute;left:${i * over}px;bottom:8px;z-index:${i};transform-origin:bottom center;transform:rotate(${rotate}deg) translateY(${arcY + liftY}px);transition:transform 0.16s ease;cursor:${cursor};">
  <div style="border-radius:${t.cardRadius}px;box-shadow:${shadow};transition:box-shadow 0.16s ease;">${content}</div>
  ${selBadge}
</div>`;
    }).join('');

    return `<div style="position:relative;width:${totalW}px;height:${ch + 38}px;margin:0 auto;">${html}</div>`;
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
