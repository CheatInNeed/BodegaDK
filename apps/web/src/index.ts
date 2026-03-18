import { applyI18n, getInitialLang, setLang, type Lang } from './i18n.js';
import { readRoute, writeRoute, type AppRoute, type View } from './app/router.js';
import { createGameRoomSession } from './game-room/session.js';
import type { GameAdapter } from './game-room/types.js';
import { renderRoomError, renderRoomFrame } from './game-room/view.js';
import { snydAdapter } from './games/snyd/adapter.js';
import { renderSnydRoom } from './games/snyd/view.js';
import { highcardAdapter } from './games/highcard/adapter.js';
import { renderLogin } from './login.js';
import { renderSingleCardHighestWinsRoom } from './games/single-card-highest-wins/view.js';
import { createRoom, joinRoom } from './net/api.js';

type GenericAdapter = GameAdapter<Record<string, unknown>, Record<string, unknown>, unknown>;
const adapters: GenericAdapter[] = [snydAdapter as GenericAdapter, highcardAdapter as GenericAdapter];

const state = {
    lang: getInitialLang() as Lang,
    view: 'play' as View,
    sidebarCollapsed: false,
    route: readRoute() as AppRoute,
};

type ActiveSession = ReturnType<typeof createGameRoomSession<Record<string, unknown>, Record<string, unknown>, unknown>>;
const HIGHCARD_GAME_ID = 'highcard';

let roomSession: ActiveSession | null = null;
let roomSessionKey: string | null = null;
let unsubscribeRoomSession: (() => void) | null = null;

function iconSvg(pathD: string) {
    return `
    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="${pathD}"></path>
    </svg>
  `;
}

function renderApp() {
    if (window.location.pathname === '/login') {
        renderLogin();
        return;
    }

    const app = document.getElementById('app');
    if (!app) throw new Error('Missing #app');

    app.innerHTML = `
    <div class="shell ${state.sidebarCollapsed ? 'collapsed' : ''}" id="shell">
      <header class="topbar">
        <a class="brand" href="#" id="goHome" aria-label="Gå til forsiden">
          <div class="logo" aria-hidden="true"></div>
          <span data-i18n="app.name"></span>
        </a>

        <div class="topbar-right">
          <select class="select" id="langSelect" aria-label="Sprog">
            <option value="da">DA</option>
            <option value="en">EN</option>
          </select>

          <button class="btn" id="loginBtn" data-i18n="top.login"></button>
          <button class="btn primary" id="signupBtn" data-i18n="top.signup"></button>
          <button class="btn" id="profileBtn" data-i18n="top.profile"></button>
        </div>
      </header>

      <aside class="sidebar">
        <div class="sidebar-header">
          <div class="sidebar-title pill">Menu</div>
          <button class="burger" id="burgerBtn" aria-label="Åbn/luk menu">☰</button>
        </div>

        <nav class="nav" aria-label="Hovedmenu">
          ${navItem('play', 'nav.play', iconSvg('M8 5v14l11-7z'))}
          ${navItem('settings', 'nav.settings', iconSvg('M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.1 7.1 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 13.9 1h-3.8a.5.5 0 0 0-.49.42l-.36 2.54c-.58.23-1.12.54-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 7.48a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.23.4.32.65.22l2.39-.96c.5.4 1.05.71 1.63.94l.36 2.54c.04.24.25.42.49.42h3.8c.24 0 .45-.18.49-.42l.36-2.54c.58-.23 1.12-.54 1.63-.94l2.39.96c.25.1.52.01.65-.22l1.92-3.32a.5.5 0 0 0-.12-.64zM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5z'))}
          ${navItem('help', 'nav.help', iconSvg('M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14a4 4 0 0 0-4 4h2a2 2 0 1 1 2 2c-1.1 0-2 .9-2 2v1h2v-1c0-.55.45-1 1-1a4 4 0 0 0 0-8z'))}
        </nav>
      </aside>

      <main class="main" id="main"></main>
    </div>
  `;

    const langSelect = document.getElementById('langSelect') as HTMLSelectElement | null;
    if (langSelect) langSelect.value = state.lang;

    applyI18n(app, state.lang);
    renderView();
    wireEvents();
}

function navItem(view: View, key: string, icon: string) {
    const active = state.view === view ? 'active' : '';
    return `
    <div class="nav-item ${active}" role="button" tabindex="0" data-view="${view}">
      ${icon}
      <span class="nav-label" data-i18n="${key}"></span>
    </div>
  `;
}

function renderView() {
    const main = document.getElementById('main');
    if (!main) return;

    if (state.view === 'home') {
        cleanupRoomSession();
        main.innerHTML = `
      <h1 class="h1" data-i18n="home.title"></h1>
      <p class="sub" data-i18n="home.subtitle"></p>
      ${playCards()}
    `;
    } else if (state.view === 'play') {
        cleanupRoomSession();
        main.innerHTML = `
      <h1 class="h1" data-i18n="play.title"></h1>
      <p class="sub" data-i18n="play.subtitle"></p>
      ${playCards()}
    `;
    } else if (state.view === 'settings') {
        cleanupRoomSession();
        main.innerHTML = `
      <h1 class="h1" data-i18n="nav.settings"></h1>
      <div class="card">
        <p class="card-desc">
          (Placeholder) Her kan I senere have lyd, tema, sprog, kontoindstillinger osv.
        </p>
        <div class="card-row">
          <span class="pill">Tema: Default</span>
          <button class="btn" id="fakeThemeBtn">Skift tema (senere)</button>
        </div>
      </div>
    `;
    } else if (state.view === 'help') {
        cleanupRoomSession();
        main.innerHTML = `
      <h1 class="h1" data-i18n="nav.help"></h1>
      <div class="card">
        <p class="card-desc">
          (Placeholder) FAQ, regler for spil, kontakt, rapportér fejl osv.
        </p>
      </div>
    `;
    } else if (state.view === 'room') {
        main.innerHTML = renderRoomContent();
    }

    applyI18n(document, state.lang);
    wireRoomEvents();
}

function renderRoomContent(): string {
    const route = state.route;
    if (!route.room || !route.token || !route.game) {
        cleanupRoomSession();
        return renderRoomError('Missing query params. Required: view=room&game=highcard&room=ABC123&token=yourToken');
    }

    const adapter = adapters.find((candidate) => candidate.canHandle(route.game ?? ''));
    if (!adapter) {
        cleanupRoomSession();
        return renderRoomError(`Unsupported game mode: ${route.game}`);
    }

    const key = `${route.game}|${route.room}|${route.token}|${route.mock ? 'mock' : 'ws'}`;
    if (!roomSession || roomSessionKey !== key) {
        cleanupRoomSession();
        roomSessionKey = key;
        roomSession = createGameRoomSession({
            bootstrap: {
                game: route.game,
                roomCode: route.room,
                token: route.token,
                useMock: route.mock,
            },
            adapter,
        });

        unsubscribeRoomSession = roomSession.subscribe(() => {
            if (state.view === 'room') {
                renderView();
            }
        });

        roomSession.start();
    }

    const roomState = roomSession.getState();
    const viewModel = roomSession.toViewModel();
    const disableByConnection = roomState.connection !== 'connected' || !!roomState.winnerPlayerId;
    const bodyHtml = adapter.id === highcardAdapter.id
        ? renderSingleCardHighestWinsRoom(viewModel as Parameters<typeof renderSingleCardHighestWinsRoom>[0])
        : renderSnydRoom(viewModel as Parameters<typeof renderSnydRoom>[0], {
            disablePlay: disableByConnection
                || !(viewModel as Parameters<typeof renderSnydRoom>[0]).isMyTurn
                || (viewModel as Parameters<typeof renderSnydRoom>[0]).selectedCount === 0,
            disableCallSnyd: disableByConnection || !(viewModel as Parameters<typeof renderSnydRoom>[0]).isMyTurn,
        });

    return renderRoomFrame({
        connection: roomState.connection,
        gameTitle: route.game,
        errorMessage: roomState.lastError,
        winnerPlayerId: roomState.winnerPlayerId,
        bodyHtml,
    });
}

function cleanupRoomSession() {
    unsubscribeRoomSession?.();
    unsubscribeRoomSession = null;
    roomSession?.stop();
    roomSession = null;
    roomSessionKey = null;
}

function playCards() {
    return `
    <div class="grid">
      ${gameCard('game.cheat', 'Et klassisk bluff-spil (Snyd).', 'action.open')}
      ${gameCard('single.card.highest.wins', 'Backend-ready: single player vs dealer high-card game.', 'action.open')}
      ${gameCard('game.500', 'Kortspil med stik og meldinger (placeholder).', 'action.open')}
      ${gameCard('game.dice', 'Terningebaseret spil (placeholder).', 'action.open')}
      ${gameCard('game.more', 'Flere spil bliver tilføjet løbende.', 'action.play')}
    </div>
  `;
}

function gameCard(titleKey: string, desc: string, actionKey: string) {
    return `
    <div class="card">
      <div class="card-title" data-i18n="${titleKey}"></div>
      <div class="card-desc">${desc}</div>
      <div class="card-row">
        <span class="pill">Status: Placeholder</span>
        <button class="btn primary" data-i18n="${actionKey}" data-action="open-game" data-game="${titleKey}"></button>
      </div>
    </div>
  `;
}

function wireEvents() {
    const burgerBtn = document.getElementById('burgerBtn');
    burgerBtn?.addEventListener('click', () => {
        state.sidebarCollapsed = !state.sidebarCollapsed;
        renderApp();
    });

    document.querySelectorAll<HTMLElement>('.nav-item').forEach((el) => {
        const view = el.dataset.view as View | undefined;
        if (!view) return;

        const go = () => {
            navigate({ view });
        };

        el.addEventListener('click', go);
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                go();
            }
        });
    });

    const goHome = document.getElementById('goHome');
    goHome?.addEventListener('click', (e) => {
        e.preventDefault();
        navigate({ view: 'home' });
    });

    const langSelect = document.getElementById('langSelect') as HTMLSelectElement | null;
    langSelect?.addEventListener('change', () => {
        const next = langSelect.value === 'en' ? 'en' : 'da';
        state.lang = next;
        setLang(next);
        renderApp();
    });

    document.querySelectorAll<HTMLButtonElement>('button[data-action="open-game"]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const game = normalizeGameKey(btn.dataset.game ?? '');
            if (game === HIGHCARD_GAME_ID) {
                void startHighCardQuickplay();
                return;
            }

            navigate({
                view: 'room',
                game,
                room: state.route.room ?? 'ABC123',
                token: state.route.token ?? randomToken(),
                mock: true,
            });
        });
    });

    document.getElementById('loginBtn')?.addEventListener('click', () => {
        window.history.pushState({}, '', '/login');
        renderApp();
    });
    document.getElementById('signupBtn')?.addEventListener('click', () => alert('(Placeholder) Opret konto'));
    document.getElementById('profileBtn')?.addEventListener('click', () => alert('(Placeholder) Profil'));
}

function wireRoomEvents() {
    if (state.view !== 'room') return;

    if (!roomSession) return;

    document.querySelectorAll<HTMLButtonElement>('button[data-action="toggle-card"]').forEach((button) => {
        button.addEventListener('click', () => {
            const card = button.dataset.card;
            if (!card) return;
            roomSession?.toggleCard(card);
        });
    });

    const playButton = document.querySelector<HTMLButtonElement>('button[data-action="play-selected"]');
    playButton?.addEventListener('click', () => {
        const claimRankInput = document.getElementById('claimRankInput') as HTMLInputElement | null;
        const claimRank = claimRankInput?.value.trim().toUpperCase() || 'A';
        roomSession?.sendIntent({ type: 'PLAY_SELECTED', claimRank });
    });

    const callSnydButton = document.querySelector<HTMLButtonElement>('button[data-action="call-snyd"]');
    callSnydButton?.addEventListener('click', () => {
        roomSession?.sendIntent({ type: 'CALL_SNYD' });
    });
}

function navigate(patch: Partial<AppRoute>) {
    writeRoute(patch);
    syncStateFromRoute();
    renderApp();
}

function syncStateFromRoute() {
    state.route = readRoute();
    state.view = state.route.view;
}

function normalizeGameKey(game: string): string {
    if (game === 'game.cheat') return 'snyd';
    if (game === 'single.card.highest.wins') return HIGHCARD_GAME_ID;
    if (game === 'single-card-highest-wins') return HIGHCARD_GAME_ID;
    return game;
}

async function startHighCardQuickplay() {
    try {
        const token = randomToken();
        const playerId = token;

        const { roomCode } = await createRoom({ gameType: HIGHCARD_GAME_ID });
        const joined = await joinRoom({ roomCode, playerId, token });
        if (!joined.ok) {
            throw new Error('Join room returned not ok');
        }

        navigate({
            view: 'room',
            game: HIGHCARD_GAME_ID,
            room: roomCode,
            token,
            mock: false,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        alert(`Failed to start HighCard quickplay: ${message}`);
    }
}

function randomToken(): string {
    return `player-${Math.random().toString(36).slice(2, 8)}`;
}

window.addEventListener('popstate', () => {
    syncStateFromRoute();
    renderApp();
});

syncStateFromRoute();
renderApp();
