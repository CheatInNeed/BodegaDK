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

export const CARD_THEMES: Record<string, CardTheme> = {
    klassisk: {
        id: 'klassisk', label: 'Klassisk',
        cardBg: '#FAF5EA', cardBorder: '1px solid #C8B070', cardRadius: 7,
        cardShadow: '0 4px 20px rgba(0,0,0,0.6), 0 1px 4px rgba(0,0,0,0.3)',
        innerBorder: 'rgba(180,150,80,0.35)',
        red: '#B91C1C', blk: '#1A1205',
        backBg: '#0C3A18', backAccent: 'rgba(212,175,106,0.18)',
        backLine: 'rgba(212,175,106,0.25)', backCenter: 'rgba(212,175,106,0.12)',
        faceAccent: 'rgba(180,150,80,0.06)',
    },
    nordisk: {
        id: 'nordisk', label: 'Nordisk',
        cardBg: '#FFFFFF', cardBorder: '1px solid #E2E8F0', cardRadius: 12,
        cardShadow: '0 4px 24px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)',
        innerBorder: null,
        red: '#C0392B', blk: '#111827',
        backBg: '#1A2535', backAccent: 'rgba(255,255,255,0.08)',
        backLine: 'rgba(255,255,255,0.12)', backCenter: 'rgba(255,255,255,0.06)',
        faceAccent: 'rgba(0,0,0,0.025)',
    },
    mork: {
        id: 'mork', label: 'Mørk',
        cardBg: '#1C1A2E', cardBorder: '1px solid #2E2848', cardRadius: 10,
        cardShadow: '0 8px 32px rgba(0,0,0,0.8), 0 2px 6px rgba(0,0,0,0.5)',
        innerBorder: 'rgba(180,160,220,0.15)',
        red: '#E05050', blk: '#C8D0E8',
        backBg: '#3A0E22', backAccent: 'rgba(232,213,160,0.10)',
        backLine: 'rgba(232,213,160,0.15)', backCenter: 'rgba(232,213,160,0.08)',
        faceAccent: 'rgba(180,160,220,0.05)',
    },
};

export function renderGCardBack(cw: number, ch: number, t: CardTheme, uid: string): string {
    const pid = `kpat-${uid}`;
    const corners = ([[20,22],[cw-20,22],[20,ch-12],[cw-20,ch-12]] as [number,number][])
        .map(([cx,cy]) => `<text x="${cx}" y="${cy}" text-anchor="middle" font-size="9" fill="${t.backLine}" font-family="serif">✦</text>`)
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
<text x="${cw/2}" y="${ch/2+10}" text-anchor="middle" font-size="32" fill="${t.backCenter}" font-family="serif">◆</text>
<text x="${cw/2}" y="${ch/2+9}" text-anchor="middle" font-size="13" fill="${t.backLine}" font-family="serif">B</text>
${corners}</svg></div>`;
}

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

const FACE_ICON: Record<string, string> = { J: '⚔', Q: '♛', K: '♚' };

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
    const divider = `<div style="display:flex;align-items:center;gap:4px;margin:0 20px;opacity:0.3"><div style="flex:1;height:1px;background:${color}"></div><span style="font-size:8px;color:${color}">✦</span><div style="flex:1;height:1px;background:${color}"></div></div>`;
    return `<div style="width:${cw}px;height:${ch}px;border-radius:${t.cardRadius}px;border:${t.cardBorder};box-shadow:${t.cardShadow};background:${t.cardBg};position:relative;overflow:hidden;flex-shrink:0">
${t.innerBorder ? `<div style="position:absolute;inset:5px;border:1px solid ${t.innerBorder};border-radius:${Math.max(t.cardRadius-2,2)}px;pointer-events:none"></div>` : ''}
<div style="position:absolute;left:14px;right:14px;top:30px;bottom:30px;background:${t.faceAccent};border-radius:4px"></div>
${corner(rank, suit.s, color, false)}${corner(rank, suit.s, color, true)}
<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;width:100%">
${divider}
<div style="font-size:42px;font-family:'Playfair Display',serif;font-weight:900;color:${color};line-height:1;margin-top:5px">${rank}</div>
<div style="font-size:16px;color:${color};line-height:1;margin-top:5px;opacity:0.55">${icon}</div>
<div style="font-size:18px;color:${color};line-height:1;margin-top:3px">${suit.s}</div>
${divider}
</div></div>`;
}

export function renderGPlayingCard(card: {rank:string, suit:{s:string,red:boolean}}, t: CardTheme, cw: number, ch: number): string {
    return ['J','Q','K'].includes(card.rank)
        ? faceCard(card.rank, card.suit, t, cw, ch)
        : numberCard(card.rank, card.suit, t, cw, ch);
}
