import { CARD_THEMES, renderGCardBack, renderGPlayingCard, type CardTheme } from '../shared/game-cards.js';
import { writeRoute } from '../../app/router.js';

interface Card { id: string; rank: string; suit: { s: string; red: boolean } }

interface KrigState {
    p1Deck: Card[];
    p2Deck: Card[];
    phase: 'idle' | 'battle' | 'krig_announce' | 'krig_down' | 'krig_resolve' | 'gameover';
    p1Card: Card | null;
    p2Card: Card | null;
    krig: { p1Down: Card[]; p2Down: Card[]; p1Up: Card | null; p2Up: Card | null; _p1Up?: Card; _p2Up?: Card };
    pot: Card[];
    winner: 'p1' | 'p2' | null;
    statusMsg: string;
    busy: boolean;
    themeKey: string;
    p1Name: string;
    p2Name: string;
    animSpeed: number;
    showTweaks: boolean;
}

const SUITS = [
    { s: '♠', red: false }, { s: '♥', red: true },
    { s: '♦', red: true },  { s: '♣', red: false },
];
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const RANK_VAL: Record<string, number> = {
    '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,J:11,Q:12,K:13,A:14,
};

let _uid = 1;
const mkCard = (rank: string, suit: { s: string; red: boolean }): Card => ({ id: `k${_uid++}`, rank, suit });

function buildDeck(): Card[] {
    const d: Card[] = [];
    for (const suit of SUITS) for (const rank of RANKS) d.push(mkCard(rank, suit));
    for (let i = d.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [d[i], d[j]] = [d[j]!, d[i]!];
    }
    return d;
}

const CW = 80, CH = 112;
const SW = 58, SH = 81;

let gs: KrigState | null = null;
let root: HTMLElement | null = null;

function ms(base: number): number {
    return base / (gs?.animSpeed ?? 4);
}

function wait(base: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms(base)));
}

export function initKrigGame(): void {
    root = document.getElementById('krig-root');
    if (!root || root.dataset.initialized) return;
    root.dataset.initialized = 'true';

    const saved = (() => { try { return JSON.parse(localStorage.getItem('krig_tweaks') || '{}'); } catch { return {}; } })();
    const deck = buildDeck();
    gs = {
        p1Deck: deck.slice(0, 26),
        p2Deck: deck.slice(26),
        phase: 'idle',
        p1Card: null, p2Card: null,
        krig: { p1Down: [], p2Down: [], p1Up: null, p2Up: null },
        pot: [],
        winner: null,
        statusMsg: 'Vend kortet for at starte!',
        busy: false,
        themeKey: (saved.themeKey as string) ?? 'nordisk',
        p1Name: (saved.p1Name as string) ?? 'Magnus',
        p2Name: (saved.p2Name as string) ?? 'Lars',
        animSpeed: (saved.animSpeed as number) ?? 4,
        showTweaks: false,
    };

    render();

    root.addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
        if (!btn || !gs) return;
        const a = btn.dataset.action;
        if (a === 'flip')          void handlePress();
        if (a === 'new-game')      resetGame();
        if (a === 'leave')         leaveGame();
        if (a === 'toggle-tweaks') { gs.showTweaks = !gs.showTweaks; render(); }
        if (a === 'set-theme')     { gs.themeKey = btn.dataset.value ?? 'nordisk'; saveTweaks(); render(); }
        if (a === 'set-speed')     { gs.animSpeed = parseFloat(btn.dataset.value ?? '4'); saveTweaks(); }
    });

    root.addEventListener('input', (e) => {
        if (!gs) return;
        const el = e.target as HTMLInputElement;
        if (el.dataset.field === 'p1Name') {
            gs.p1Name = el.value;
            root!.querySelectorAll('[data-label="p1-name"]').forEach(n => { n.textContent = el.value; });
            saveTweaks();
        }
        if (el.dataset.field === 'p2Name') {
            gs.p2Name = el.value;
            root!.querySelectorAll('[data-label="p2-name"]').forEach(n => { n.textContent = el.value; });
            saveTweaks();
        }
        if (el.dataset.field === 'theme') {
            gs.themeKey = el.value;
            saveTweaks();
            render();
        }
    });

    window.addEventListener('keydown', onKeyDown);
}

function onKeyDown(e: KeyboardEvent) {
    if (!root?.isConnected) { window.removeEventListener('keydown', onKeyDown); return; }
    if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); void handlePress(); }
}

function saveTweaks() {
    if (!gs) return;
    localStorage.setItem('krig_tweaks', JSON.stringify({
        themeKey: gs.themeKey, p1Name: gs.p1Name, p2Name: gs.p2Name, animSpeed: gs.animSpeed,
    }));
}

function leaveGame() {
    writeRoute({ view: 'home', game: null, room: null, token: null, mock: false });
    window.dispatchEvent(new Event('popstate'));
}

function resetGame() {
    if (!gs) return;
    const deck = buildDeck();
    gs.p1Deck = deck.slice(0, 26); gs.p2Deck = deck.slice(26);
    gs.phase = 'idle'; gs.p1Card = null; gs.p2Card = null;
    gs.krig = { p1Down: [], p2Down: [], p1Up: null, p2Up: null };
    gs.pot = []; gs.winner = null;
    gs.statusMsg = 'Vend kortet for at starte!';
    gs.busy = false;
    render();
}

function render() {
    if (!root || !gs) return;
    const t = CARD_THEMES[gs.themeKey] ?? CARD_THEMES['nordisk']!;
    root.innerHTML = buildHTML(gs, t);
}

// ── Card stack ──────────────────────────────────────────────────────────────

function cardStack(count: number, t: CardTheme): string {
    const layers = Math.min(count, 4);
    if (layers === 0) {
        return `<div style="width:${SW}px;height:${SH}px;border-radius:${t.cardRadius}px;border:2px dashed rgba(212,175,106,0.12);display:flex;align-items:center;justify-content:center"><span style="color:rgba(212,175,106,0.18);font-size:18px">∅</span></div>`;
    }
    const cards = Array.from({ length: layers }, (_, i) => {
        const off = (layers - 1 - i) * 2;
        return `<div style="position:absolute;top:${off}px;left:${off}px;opacity:${i === layers-1 ? 1 : 0.65}">${renderGCardBack(SW, SH, t, `stk${i}`)}</div>`;
    }).join('');
    return `<div style="width:${SW+8}px;height:${SH+8}px;position:relative;flex-shrink:0">${cards}</div>`;
}

// ── Battle card (normal flip) ────────────────────────────────────────────────

function battleCard(card: Card, t: CardTheme, win: boolean, lose: boolean, role: string): string {
    const cls = ['card-flip', win ? 'card-win' : '', lose ? 'card-lose' : ''].filter(Boolean).join(' ');
    return `<div class="${cls}" data-role="${role}">${renderGPlayingCard(card, t, CW, CH)}</div>`;
}

// ── Krig hand (3 face-down + 1 deciding face-up) ────────────────────────────

function krigHand(down: Card[], up: Card | null, t: CardTheme, win: boolean, lose: boolean, fromTop: boolean): string {
    const anim = fromTop ? 'slide-down' : 'slide-up';
    const downHtml = down.map((c, i) =>
        `<div style="margin-left:${i>0?-16:0}px;animation:${anim} ${0.18+i*0.09}s ease both">${renderGCardBack(50, 70, t, `kd${c.id}`)}</div>`
    ).join('');
    const divider = down.length && up ? `<div style="width:1px;height:55px;background:rgba(212,175,106,0.18);flex-shrink:0"></div>` : '';
    const upHtml = up
        ? `<div class="${['card-flip', win?'card-win':'', lose?'card-lose':''].filter(Boolean).join(' ')}">${renderGPlayingCard(up, t, CW, CH)}</div>`
        : '';
    return `<div style="display:flex;align-items:center;gap:8px"><div style="display:flex">${downHtml}</div>${divider}${upHtml}</div>`;
}

// ── Full HTML ────────────────────────────────────────────────────────────────

function buildHTML(g: KrigState, t: CardTheme): string {
    const total = 52;
    const p1Pct = (g.p1Deck.length / total) * 100;
    const p2Pct = (g.p2Deck.length / total) * 100;
    const showingKrig = g.phase === 'krig_down' || g.phase === 'krig_resolve';

    // P2 center card area
    let p2Center = `<div style="width:${CW}px;height:${CH}px;border-radius:6px;border:1.5px dashed rgba(212,175,106,0.1)"></div>`;
    if (showingKrig && g.krig.p2Down.length) {
        p2Center = krigHand(g.krig.p2Down, g.krig.p2Up, t, g.winner==='p2', g.winner==='p1', true);
    } else if (!showingKrig && g.p2Card) {
        p2Center = battleCard(g.p2Card, t, g.winner==='p2', g.winner==='p1', 'p2-card');
    }

    // P1 center card area
    let p1Center = `<div style="width:${CW}px;height:${CH}px;border-radius:6px;border:1.5px dashed rgba(212,175,106,0.1)"></div>`;
    if (showingKrig && g.krig.p1Down.length) {
        p1Center = krigHand(g.krig.p1Down, g.krig.p1Up, t, g.winner==='p1', g.winner==='p2', false);
    } else if (!showingKrig && g.p1Card) {
        p1Center = battleCard(g.p1Card, t, g.winner==='p1', g.winner==='p2', 'p1-card');
    }

    const btnLabel = g.phase==='krig_announce' ? 'Læg 3 ned' : g.phase==='krig_down' ? 'Afgørelse!' : 'Vend!';
    const btnOk = !g.busy && (g.phase==='idle' || g.phase==='krig_announce' || g.phase==='krig_down');
    const gameoverWinner = g.p1Deck.length >= g.p2Deck.length ? g.p1Name : g.p2Name;

    const tweaksPanel = g.showTweaks ? `
<div class="tweaks-panel">
  <div class="tweaks-title">Tweaks</div>
  <div class="tweak-item"><label>Spiller 1</label><input data-field="p1Name" value="${escHtml(g.p1Name)}"/></div>
  <div class="tweak-item"><label>Spiller 2</label><input data-field="p2Name" value="${escHtml(g.p2Name)}"/></div>
  <div class="tweak-item"><label>Korttema</label>
    <select data-field="theme">
      ${['klassisk','nordisk','mork'].map(k => `<option value="${k}" ${g.themeKey===k?'selected':''}>${k==='mork'?'Mørk':k.charAt(0).toUpperCase()+k.slice(1)}</option>`).join('')}
    </select>
  </div>
  <div class="tweak-item"><label>Hastighed</label>
    ${[['0.5','Langsom'],['1','Normal'],['2','Hurtig'],['4','Turbo']].map(([v,l]) =>
      `<button data-action="set-speed" data-value="${v}" style="display:block;width:100%;margin-bottom:4px;padding:5px 8px;text-align:left;background:${String(g.animSpeed)===v?'rgba(212,175,106,0.18)':'transparent'};border:1px solid rgba(212,175,106,0.18);border-radius:4px;color:#f1e8d8;font-size:12px;cursor:pointer;font-family:inherit">${l}</button>`
    ).join('')}
  </div>
</div>` : '';

    return `<div class="kg-table">

  <div class="player-zone">
    <div style="text-align:center">
      <div class="player-name" data-label="p2-name">${escHtml(g.p2Name)}</div>
      <div class="player-count">${g.p2Deck.length} kort</div>
    </div>
    ${cardStack(g.p2Deck.length, t)}
  </div>

  <div class="battle-zone">

    <div style="position:absolute;top:10%;display:flex;flex-direction:column;align-items:center;gap:8px">
      ${p2Center}
    </div>

    <div style="display:flex;flex-direction:column;align-items:center;gap:14px;z-index:10;pointer-events:auto">
      ${g.phase==='krig_announce' ? `
        <div style="text-align:center;margin-bottom:4px">
          <div class="krig-word">KRIG!</div>
          <div class="krig-sub">Krig er erklæret</div>
        </div>` : `
        <div style="text-align:center">
          <div class="score-bar">
            <div class="score-fill p2" style="width:${p2Pct}%"></div>
            <div class="score-fill p1" style="width:${p1Pct}%"></div>
          </div>
          <div class="score-labels">
            <span data-label="p1-name">${escHtml(g.p1Name)}</span>: ${g.p1Deck.length} &nbsp;
            <span data-label="p2-name">${escHtml(g.p2Name)}</span>: ${g.p2Deck.length}
          </div>
        </div>`}

      <button class="flip-btn" data-action="flip" ${btnOk?'':'disabled'}>${btnLabel}</button>

      ${g.pot.length ? `<div class="pot-label">${g.pot.length} kort i potten</div>` : ''}
      <div class="status-msg">${escHtml(g.statusMsg)}</div>
    </div>

    <div style="position:absolute;bottom:10%;display:flex;flex-direction:column;align-items:center;gap:8px">
      ${p1Center}
    </div>

  </div>

  <div class="player-zone">
    ${cardStack(g.p1Deck.length, t)}
    <div style="text-align:center">
      <div class="player-name" data-label="p1-name">${escHtml(g.p1Name)}</div>
      <div class="player-count">${g.p1Deck.length} kort</div>
    </div>
  </div>

  ${g.phase==='gameover' ? `
  <div class="overlay">
    <div class="overlay-title">${escHtml(gameoverWinner)}</div>
    <div class="overlay-sub">Vinder af krig!</div>
    <div class="bodega-quip">Taber betaler næste omgang</div>
    <button class="new-game-btn" data-action="new-game">Ny kamp</button>
  </div>` : ''}

  <button class="game-room-leave-btn kg-leave-btn" data-action="leave">← Forlad</button>
  <button class="kg-tweaks-toggle" data-action="toggle-tweaks" title="Indstillinger">⚙</button>
  ${tweaksPanel}
</div>`;
}

function escHtml(s: string): string {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Game logic ───────────────────────────────────────────────────────────────

async function handlePress(): Promise<void> {
    if (!gs || gs.busy) return;

    if (gs.phase === 'idle') {
        if (!gs.p1Deck.length || !gs.p2Deck.length) { gs.phase = 'gameover'; render(); return; }
        gs.busy = true;
        const c1 = gs.p1Deck[0]!, c2 = gs.p2Deck[0]!;
        gs.p1Deck = gs.p1Deck.slice(1); gs.p2Deck = gs.p2Deck.slice(1);
        gs.p1Card = c1; gs.p2Card = c2;
        gs.statusMsg = ''; gs.phase = 'battle';
        render();
        await wait(480);
        if (RANK_VAL[c1.rank]! !== RANK_VAL[c2.rank]!) {
            await resolveWin(RANK_VAL[c1.rank]! > RANK_VAL[c2.rank]! ? 'p1' : 'p2', [...gs.pot, c1, c2], true);
        } else {
            gs.pot = [...gs.pot, c1, c2];
            gs.phase = 'krig_announce'; gs.statusMsg = ''; gs.busy = false;
            render();
        }
        return;
    }

    if (gs.phase === 'krig_announce') {
        if (gs.p1Deck.length < 4 || gs.p2Deck.length < 4) { gs.phase = 'gameover'; render(); return; }
        gs.busy = true;
        const p1Down = gs.p1Deck.slice(0,3), p2Down = gs.p2Deck.slice(0,3);
        const p1Up = gs.p1Deck[3]!, p2Up = gs.p2Deck[3]!;
        gs.p1Deck = gs.p1Deck.slice(4); gs.p2Deck = gs.p2Deck.slice(4);
        gs.pot = [...gs.pot, ...p1Down, ...p2Down];
        gs.krig = { p1Down, p2Down, p1Up: null, p2Up: null, _p1Up: p1Up, _p2Up: p2Up };
        gs.p1Card = null; gs.p2Card = null;
        gs.phase = 'krig_down'; gs.statusMsg = ''; gs.busy = false;
        render();
        return;
    }

    if (gs.phase === 'krig_down') {
        gs.busy = true;
        const p1Up = gs.krig._p1Up!, p2Up = gs.krig._p2Up!;
        gs.krig = { ...gs.krig, p1Up, p2Up };
        gs.pot = [...gs.pot, p1Up, p2Up];
        gs.phase = 'krig_resolve'; gs.statusMsg = '';
        render();
        await wait(480);
        const kv1 = RANK_VAL[p1Up.rank]!, kv2 = RANK_VAL[p2Up.rank]!;
        if (kv1 !== kv2) {
            await resolveWin(kv1 > kv2 ? 'p1' : 'p2', [...gs.pot], false);
        } else {
            await wait(800);
            gs.krig = { p1Down:[], p2Down:[], p1Up:null, p2Up:null };
            gs.p1Card = p1Up; gs.p2Card = p2Up;
            gs.phase = 'krig_announce'; gs.statusMsg = ''; gs.busy = false;
            render();
        }
        return;
    }
}

async function resolveWin(who: 'p1'|'p2', wonCards: Card[], isNormalBattle: boolean): Promise<void> {
    if (!gs) return;
    gs.winner = who;
    gs.statusMsg = who==='p1' ? `${gs.p1Name} vinder!` : `${gs.p2Name} vinder!`;
    render();

    await wait(1300);

    if (isNormalBattle && root) {
        const cls = who==='p1' ? 'travel-down' : 'travel-up';
        root.querySelector('[data-role="p1-card"]')?.classList.add(cls);
        root.querySelector('[data-role="p2-card"]')?.classList.add(cls);
        await wait(550);
    }

    if (who==='p1') gs.p1Deck = [...gs.p1Deck, ...wonCards];
    else gs.p2Deck = [...gs.p2Deck, ...wonCards];
    gs.pot = []; gs.p1Card = null; gs.p2Card = null;
    gs.krig = { p1Down:[], p2Down:[], p1Up:null, p2Up:null };
    gs.winner = null;

    await wait(200);
    gs.phase = 'idle'; gs.statusMsg = 'Vend kortet for at fortsætte!'; gs.busy = false;
    render();
}
