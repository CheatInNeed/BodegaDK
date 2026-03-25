import { applyI18n, getInitialLang, setLang, type Lang } from './i18n.js';
import { readRoute, writeRoute, type AppRoute, type View } from './app/router.js';
import { renderLobbyBrowser, renderLobbyRoom, type LobbyRoomViewModel } from './app/lobby-view.js';
import { createGameRoomSession } from './game-room/session.js';
import type { GameAdapter } from './game-room/types.js';
import { renderRoomError, renderRoomFrame } from './game-room/view.js';
import { highcardAdapter } from './games/highcard/adapter.js';
import { krigAdapter } from './games/krig/adapter.js';
import { renderKrigRoom } from './games/krig/view.js';
import { renderSingleCardHighestWinsRoom } from './games/single-card-highest-wins/view.js';
import { snydAdapter } from './games/snyd/adapter.js';
import { renderSnydRoom } from './games/snyd/view.js';
import { renderLogin } from './login.js';
import { renderSignup } from './signUp.js';
import { renderCustom } from './custom.js';
import { supabase } from './supabase.js';
import {
    createRoom,
    joinRoom,
    kickPlayer,
    leaveRoom,
    listRooms,
    type LobbyRoomSummary,
} from './net/api.js';

type GenericAdapter = GameAdapter<Record<string, unknown>, Record<string, unknown>, unknown>;
const adapters: GenericAdapter[] = [
    snydAdapter as GenericAdapter,
    highcardAdapter as GenericAdapter,
    krigAdapter as GenericAdapter,
];

const state = {
    lang: getInitialLang() as Lang,
    view: readRoute().view as View,
    sidebarCollapsed: false,
    route: readRoute() as AppRoute,
};

const lobbyBrowserState = {
    rooms: [] as LobbyRoomSummary[],
    loading: false,
    loaded: false,
    busy: false,
    errorMessage: null as string | null,
    joinCode: '',
    createPrivate: false,
};

const authUiState = {
    initialized: false,
    user: null as { id: string } | null,
    avatar: null as { color: string; shape: string } | null,
};

type ActiveSession = ReturnType<typeof createGameRoomSession<Record<string, unknown>, Record<string, unknown>, unknown>>;
const HIGHCARD_GAME_ID = 'highcard';
const FALLBACK_LOBBY_GAME_ID = HIGHCARD_GAME_ID;

let roomSession: ActiveSession | null = null;
let roomSessionKey: string | null = null;
let unsubscribeRoomSession: (() => void) | null = null;
let highCardAutoStartKey: string | null = null;

function iconSvg(pathD: string) {
    return `
    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="${pathD}"></path>
    </svg>
  `;
}

function renderApp() {
    const path = window.location.pathname;

    if (path === '/login') {
        renderLogin();
        return;
    }
    if (path === '/signup') {
        renderSignup();
        return;
    }
    if (path === '/custom') {
        renderCustom();
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

          <div id="avatarDisplay" class="avatar hidden" aria-hidden="true"></div>
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
          ${navItem('lobby-browser', null, iconSvg('M4 6h16v4H4zm0 8h10v4H4zm12 0h4v4h-4z'), 'Lobby')}
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
    applyAuthUI();
}

function navItem(view: View, i18nKey: string | null, icon: string, literalLabel?: string) {
    const active = state.view === view || (view === 'lobby-browser' && state.view === 'lobby') ? 'active' : '';
    const labelHtml = i18nKey
        ? `<span class="nav-label" data-i18n="${i18nKey}"></span>`
        : `<span class="nav-label">${literalLabel ?? ''}</span>`;
    return `
    <div class="nav-item ${active}" role="button" tabindex="0" data-view="${view}">
      ${icon}
      ${labelHtml}
    </div>
  `;
}

function renderView() {
    const main = document.getElementById('main');
    if (!main) return;

    if (state.view === 'home') {
        cleanupRoomSession();
        main.innerHTML = renderHomepage();
    } else if (state.view === 'play') {
        cleanupRoomSession();
        main.innerHTML = `
      <h1 class="h1" data-i18n="play.title"></h1>
      <p class="sub" data-i18n="play.subtitle"></p>
      ${playCards()}
    `;
    } else if (state.view === 'lobby-browser') {
        cleanupRoomSession();
        ensureLobbyBrowserLoaded();
        main.innerHTML = renderLobbyBrowser({
            rooms: lobbyBrowserState.rooms,
            loading: lobbyBrowserState.loading,
            errorMessage: lobbyBrowserState.errorMessage,
            joinCode: lobbyBrowserState.joinCode,
            createPrivate: lobbyBrowserState.createPrivate,
            busy: lobbyBrowserState.busy,
        });
    } else if (state.view === 'lobby') {
        main.innerHTML = renderLobbyContent();
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

    applyI18n(main, state.lang);
    applyAuthUI();
    wireRoomEvents();
    wireLobbyEvents();
}

function renderLobbyContent(): string {
    const route = state.route;
    if (!route.room || !route.token) {
        cleanupRoomSession();
        return renderRoomError('Missing query params. Required: view=lobby&room=ABC123&token=yourToken');
    }

    const session = ensureRoomSession(route.game ?? FALLBACK_LOBBY_GAME_ID, route.room, route.token, route.mock);
    const roomState = session?.getState();
    const publicState = toRecord(roomState?.publicState);
    const hostPlayerId = typeof publicState.hostPlayerId === 'string' ? publicState.hostPlayerId : null;
    const selectedGame = typeof publicState.selectedGame === 'string' ? publicState.selectedGame : (route.game ?? FALLBACK_LOBBY_GAME_ID);
    const status = typeof publicState.status === 'string' ? publicState.status : 'LOBBY';
    const isPrivate = publicState.isPrivate === true;
    const players = readLobbyPlayers(publicState.players, hostPlayerId, roomState?.playerId ?? null);

    if (status === 'IN_GAME' && route.room && route.token) {
        queueMicrotask(() => {
            navigate({
                view: 'room',
                game: selectedGame,
                room: route.room,
                token: route.token,
                mock: route.mock,
            });
        });
    }

    const viewModel: LobbyRoomViewModel = {
        roomCode: route.room,
        connectionLabel: roomState?.connection ?? 'connecting',
        hostPlayerId,
        selfPlayerId: roomState?.playerId ?? null,
        selectedGame,
        status,
        isPrivate,
        canManage: !!roomState?.playerId && roomState.playerId === hostPlayerId,
        players,
        errorMessage: roomState?.lastError ?? null,
    };

    return renderLobbyRoom(viewModel);
}

function renderRoomContent(): string {
    const route = state.route;
    if (!route.room || !route.token || !route.game) {
        cleanupRoomSession();
        return renderRoomError('Missing query params. Required: view=room&game=highcard&room=ABC123&token=yourToken');
    }

    const adapter = resolveAdapter(route.game);
    if (!adapter) {
        cleanupRoomSession();
        return renderRoomError(`Unsupported game mode: ${route.game}`);
    }

    const session = ensureRoomSession(route.game, route.room, route.token, route.mock, adapter);
    const roomState = session?.getState();
    const viewModel = session?.toViewModel();

    if (!roomState || !viewModel) {
        return renderRoomError('Unable to initialize room session');
    }

    const roomPublicState = toRecord(roomState.publicState);
    const status = typeof roomPublicState.status === 'string' ? roomPublicState.status : null;
    const hostPlayerId = typeof roomPublicState.hostPlayerId === 'string' ? roomPublicState.hostPlayerId : null;
    const autoStartKey = `${route.room}|${route.token}|${route.game}`;

    if (
        route.game === HIGHCARD_GAME_ID
        && status === 'LOBBY'
        && roomState.connection === 'connected'
        && roomState.playerId
        && roomState.playerId === hostPlayerId
        && highCardAutoStartKey !== autoStartKey
    ) {
        highCardAutoStartKey = autoStartKey;
        queueMicrotask(() => {
            roomSession?.sendMessage({
                type: 'START_GAME',
                payload: {},
            });
        });
    }

    const disableByConnection = roomState.connection !== 'connected' || !!roomState.winnerPlayerId;
    let bodyHtml = '';

    if (adapter.id === highcardAdapter.id) {
        bodyHtml = renderSingleCardHighestWinsRoom(viewModel as Parameters<typeof renderSingleCardHighestWinsRoom>[0]);
    } else if (adapter.id === krigAdapter.id) {
        bodyHtml = renderKrigRoom(viewModel as Parameters<typeof renderKrigRoom>[0]);
    } else {
        bodyHtml = renderSnydRoom(viewModel as Parameters<typeof renderSnydRoom>[0], {
            disablePlay: disableByConnection
                || !(viewModel as Parameters<typeof renderSnydRoom>[0]).isMyTurn
                || (viewModel as Parameters<typeof renderSnydRoom>[0]).selectedCount === 0,
            disableCallSnyd: disableByConnection || !(viewModel as Parameters<typeof renderSnydRoom>[0]).isMyTurn,
        });
    }

    return renderRoomFrame({
        connection: roomState.connection,
        gameTitle: route.game,
        errorMessage: roomState.lastError,
        winnerPlayerId: roomState.winnerPlayerId,
        bodyHtml,
    });
}

function ensureRoomSession(
    game: string,
    roomCode: string,
    token: string,
    useMock: boolean,
    explicitAdapter?: GenericAdapter,
): ActiveSession | null {
    const adapter = explicitAdapter ?? resolveAdapter(game) ?? adapters[0];
    const key = `${game}|${roomCode}|${token}|${useMock ? 'mock' : 'ws'}`;

    if (!roomSession || roomSessionKey !== key) {
        cleanupRoomSession();
        roomSessionKey = key;
        roomSession = createGameRoomSession({
            bootstrap: {
                game,
                roomCode,
                token,
                useMock,
            },
            adapter,
        });

        unsubscribeRoomSession = roomSession.subscribe(() => {
            if (state.view === 'room' || state.view === 'lobby') {
                renderView();
            }
        });

        roomSession.start();
    }

    return roomSession;
}

function cleanupRoomSession() {
    unsubscribeRoomSession?.();
    unsubscribeRoomSession = null;
    roomSession?.stop();
    roomSession = null;
    roomSessionKey = null;
    highCardAutoStartKey = null;
}

function resolveAdapter(game: string): GenericAdapter | undefined {
    return adapters.find((candidate) => candidate.canHandle(game));
}

function playCards() {
    return `
    <div class="lobby-entry-banner card">
      <div>
        <div class="card-title">Multiplayer Lobby System</div>
        <p class="card-desc">Browse public lobbies, create private tables, and move from waiting room to live match.</p>
      </div>
      <button class="btn primary" data-action="open-lobby-browser">Open Lobby Browser</button>
    </div>
    <div class="grid">
      ${gameCard('game.cheat', 'Et klassisk bluff-spil (Snyd).', 'action.open')}
      ${gameCard('single.card.highest.wins', 'Backend-ready: single player vs dealer high-card game.', 'action.open')}
      ${gameCard('game.500', 'Kortspil med stik og meldinger (placeholder).', 'action.open')}
      ${gameCard('game.dice', 'Terningebaseret spil (placeholder).', 'action.open')}
      ${gameCard('game.more', 'Flere spil bliver tilføjet løbende.', 'action.play')}
    </div>
  `;
}

function renderHomepage() {
    return `
    <section class="home-layout">
      <section class="card home-hero">
        <div class="home-hero-copy">
          <span class="pill home-kicker" data-i18n="home.hero.kicker"></span>
          <h1 class="home-hero-title" data-i18n="home.title"></h1>
          <p class="sub home-hero-subtitle" data-i18n="home.subtitle"></p>
        </div>

        <aside class="home-hero-note">
          <span class="pill home-pill-real" data-i18n="home.status.real"></span>
          <p class="card-desc home-note-text" data-i18n="home.hero.note"></p>
        </aside>
      </section>

      <section class="home-actions" aria-label="Homepage action cards">
        ${renderHomepagePlaceholderCard({
            titleKey: 'home.card.continue.title',
            descKey: 'home.card.continue.desc',
            className: 'home-card-half',
        })}
        ${renderHomepagePlaceholderCard({
            titleKey: 'home.card.quick.title',
            descKey: 'home.card.quick.desc',
            className: 'home-card-half',
            chipKeys: [
                'home.card.quick.item.quick',
                'home.card.quick.item.create',
                'home.card.quick.item.join',
            ],
        })}
      </section>

      <section class="home-content-grid" aria-label="Homepage content cards">
        <article class="card home-card home-card-wide">
          <div class="home-card-header">
            <div>
              <p class="home-eyebrow" data-i18n="home.section.games.kicker"></p>
              <div class="card-title home-card-title" data-i18n="home.section.games.title"></div>
            </div>
            <span class="pill home-pill-real" data-i18n="home.status.real"></span>
          </div>

          <p class="card-desc home-card-desc" data-i18n="home.section.games.desc"></p>
          ${playCards()}
        </article>

        ${renderHomepagePlaceholderCard({
            titleKey: 'home.section.leaderboard.title',
            descKey: 'home.section.leaderboard.desc',
            className: 'home-card-narrow',
        })}
        ${renderHomepagePlaceholderCard({
            titleKey: 'home.section.profile.title',
            descKey: 'home.section.profile.desc',
            className: 'home-card-narrow',
        })}
        ${renderHomepagePlaceholderCard({
            titleKey: 'home.section.friends.title',
            descKey: 'home.section.friends.desc',
            className: 'home-card-narrow',
        })}
        ${renderHomepagePlaceholderCard({
            titleKey: 'home.section.stats.title',
            descKey: 'home.section.stats.desc',
            className: 'home-card-narrow',
        })}
      </section>
    </section>
  `;
}

function renderHomepagePlaceholderCard(input: {
    titleKey: string;
    descKey: string;
    className?: string;
    chipKeys?: string[];
}): string {
    const chips = (input.chipKeys ?? []).map((key) => `
      <span class="pill home-chip" data-i18n="${key}"></span>
    `).join('');

    const chipRow = chips
        ? `<div class="home-chip-row">${chips}</div>`
        : '';

    return `
    <article class="card home-card home-placeholder-card ${input.className ?? ''}">
      <div class="home-card-header">
        <div>
          <div class="card-title home-card-title" data-i18n="${input.titleKey}"></div>
        </div>
        <span class="pill home-pill-placeholder" data-i18n="home.status.placeholder"></span>
      </div>

      <p class="card-desc home-card-desc" data-i18n="${input.descKey}"></p>
      ${chipRow}

      <div class="home-placeholder-footer">
        <button class="btn home-placeholder-btn" type="button" disabled data-i18n="home.action.comingSoon"></button>
      </div>
    </article>
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

    document.querySelectorAll<HTMLButtonElement>('button[data-action="open-lobby-browser"]').forEach((button) => {
        button.addEventListener('click', () => {
            navigate({ view: 'lobby-browser', room: null, token: null, game: null, mock: false });
        });
    });

    const loginBtn = document.getElementById('loginBtn') as HTMLButtonElement | null;
    if (loginBtn) {
        loginBtn.onclick = () => navigate('/login');
    }

    const signupBtn = document.getElementById('signupBtn') as HTMLButtonElement | null;
    if (signupBtn) {
        signupBtn.onclick = () => navigate('/signup');
    }

    const profileBtn = document.getElementById('profileBtn') as HTMLButtonElement | null;
    if (profileBtn) {
        profileBtn.onclick = () => alert('You are not logged in.');
    }
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

function wireLobbyEvents() {
    if (state.view === 'lobby-browser') {
        const joinCodeInput = document.getElementById('joinCodeInput') as HTMLInputElement | null;
        joinCodeInput?.addEventListener('input', () => {
            lobbyBrowserState.joinCode = sanitizeRoomCode(joinCodeInput.value);
            joinCodeInput.value = lobbyBrowserState.joinCode;
        });

        const createPrivateToggle = document.getElementById('createPrivateToggle') as HTMLInputElement | null;
        createPrivateToggle?.addEventListener('change', () => {
            lobbyBrowserState.createPrivate = createPrivateToggle.checked;
        });

        document.querySelector<HTMLButtonElement>('button[data-action="refresh-lobbies"]')?.addEventListener('click', () => {
            void refreshLobbyBrowser();
        });

        document.querySelector<HTMLButtonElement>('button[data-action="create-lobby"]')?.addEventListener('click', () => {
            void handleCreateLobby();
        });

        document.querySelector<HTMLButtonElement>('button[data-action="join-by-code"]')?.addEventListener('click', () => {
            void handleJoinByCode(lobbyBrowserState.joinCode);
        });

        document.querySelectorAll<HTMLButtonElement>('button[data-action="join-public-room"]').forEach((button) => {
            button.addEventListener('click', () => {
                const roomCode = button.dataset.roomCode;
                if (!roomCode) return;
                void handleJoinByCode(roomCode);
            });
        });
    }

    if (state.view === 'lobby' && roomSession && state.route.room && state.route.token) {
        const selectedGameInput = document.getElementById('selectedGameInput') as HTMLSelectElement | null;
        selectedGameInput?.addEventListener('change', () => {
            roomSession?.sendMessage({
                type: 'SELECT_GAME',
                payload: { game: selectedGameInput.value },
            });
        });

        document.querySelector<HTMLButtonElement>('button[data-action="start-lobby-game"]')?.addEventListener('click', () => {
            roomSession?.sendMessage({
                type: 'START_GAME',
                payload: {},
            });
        });

        document.querySelector<HTMLButtonElement>('button[data-action="leave-lobby"]')?.addEventListener('click', () => {
            void handleLeaveLobby(state.route.room!, state.route.token!);
        });

        document.querySelectorAll<HTMLButtonElement>('button[data-action="kick-player"]').forEach((button) => {
            button.addEventListener('click', () => {
                const playerId = button.dataset.playerId;
                if (!playerId) return;
                void handleKickPlayer(state.route.room!, state.route.token!, playerId);
            });
        });
    }
}

function ensureLobbyBrowserLoaded() {
    if (lobbyBrowserState.loading || lobbyBrowserState.loaded) {
        return;
    }
    void refreshLobbyBrowser();
}

async function refreshLobbyBrowser() {
    lobbyBrowserState.loading = true;
    lobbyBrowserState.errorMessage = null;
    renderView();

    try {
        lobbyBrowserState.rooms = await listRooms();
        lobbyBrowserState.loaded = true;
    } catch (error) {
        lobbyBrowserState.errorMessage = toErrorMessage(error, 'Failed to load lobbies');
        lobbyBrowserState.loaded = true;
    } finally {
        lobbyBrowserState.loading = false;
        renderView();
    }
}

async function handleCreateLobby() {
    lobbyBrowserState.busy = true;
    lobbyBrowserState.errorMessage = null;
    renderView();

    try {
        const created = await createRoom({
            gameType: FALLBACK_LOBBY_GAME_ID,
            isPrivate: lobbyBrowserState.createPrivate,
            playerId: randomToken(),
            token: randomToken(),
        });

        navigate({
            view: 'lobby',
            game: created.selectedGame,
            room: created.roomCode,
            token: created.token,
            mock: false,
        });
    } catch (error) {
        lobbyBrowserState.errorMessage = toErrorMessage(error, 'Failed to create lobby');
        renderView();
    } finally {
        lobbyBrowserState.busy = false;
        if (state.view === 'lobby-browser') {
            renderView();
        }
    }
}

async function handleJoinByCode(rawRoomCode: string) {
    const roomCode = sanitizeRoomCode(rawRoomCode);
    if (!roomCode) {
        lobbyBrowserState.errorMessage = 'Enter a valid room code';
        renderView();
        return;
    }

    lobbyBrowserState.busy = true;
    lobbyBrowserState.errorMessage = null;
    lobbyBrowserState.joinCode = roomCode;
    renderView();

    try {
        const joined = await joinRoom({
            roomCode,
            playerId: randomToken(),
            token: randomToken(),
        });

        navigate({
            view: 'lobby',
            game: joined.selectedGame,
            room: joined.roomCode,
            token: joined.token,
            mock: false,
        });
    } catch (error) {
        lobbyBrowserState.errorMessage = toErrorMessage(error, 'Failed to join lobby');
        renderView();
    } finally {
        lobbyBrowserState.busy = false;
        if (state.view === 'lobby-browser') {
            renderView();
        }
    }
}

async function handleLeaveLobby(roomCode: string, token: string) {
    try {
        await leaveRoom({ roomCode, token });
    } catch (error) {
        alert(toErrorMessage(error, 'Failed to leave lobby'));
    } finally {
        cleanupRoomSession();
        lobbyBrowserState.loaded = false;
        navigate({ view: 'lobby-browser', room: null, token: null, game: null, mock: false });
        void refreshLobbyBrowser();
    }
}

async function handleKickPlayer(roomCode: string, actorToken: string, targetPlayerId: string) {
    try {
        await kickPlayer({ roomCode, actorToken, targetPlayerId });
    } catch (error) {
        alert(toErrorMessage(error, 'Failed to kick player'));
        renderView();
    }
}

function applyAuthUI() {
    const loginBtn = document.getElementById('loginBtn') as HTMLButtonElement | null;
    const signupBtn = document.getElementById('signupBtn') as HTMLButtonElement | null;
    const profileBtn = document.getElementById('profileBtn') as HTMLButtonElement | null;
    const avatarDisplay = document.getElementById('avatarDisplay') as HTMLDivElement | null;

    if (!loginBtn || !signupBtn || !profileBtn) return;

    if (!authUiState.initialized) {
        loginBtn.classList.add('hidden');
        loginBtn.dataset.i18n = 'top.login';
        signupBtn.removeAttribute('data-i18n');
        profileBtn.removeAttribute('data-i18n');
        signupBtn.textContent = state.lang === 'en' ? 'Loading...' : 'Indlæser...';
        signupBtn.onclick = null;
        profileBtn.textContent = state.lang === 'en' ? 'Loading...' : 'Indlæser...';
        profileBtn.onclick = null;
        avatarDisplay?.classList.add('hidden');
        return;
    }

    if (!authUiState.user) {
        loginBtn.classList.remove('hidden');
        loginBtn.dataset.i18n = 'top.login';
        signupBtn.dataset.i18n = 'top.signup';
        profileBtn.dataset.i18n = 'top.profile';
        signupBtn.textContent = state.lang === 'en' ? 'Create account' : 'Opret konto';
        signupBtn.onclick = () => navigate('/signup');
        profileBtn.textContent = state.lang === 'en' ? 'Profile' : 'Profil';
        profileBtn.onclick = () => alert('You are not logged in.');

        if (avatarDisplay) {
            avatarDisplay.classList.add('hidden');
            avatarDisplay.style.background = '';
        }
        return;
    }

    loginBtn.classList.add('hidden');
    loginBtn.dataset.i18n = 'top.login';
    signupBtn.removeAttribute('data-i18n');
    profileBtn.removeAttribute('data-i18n');
    signupBtn.textContent = 'Customize player';
    signupBtn.onclick = () => navigate('/custom');
    profileBtn.textContent = 'Logout';
    profileBtn.onclick = async () => {
        await supabase.auth.signOut();
        navigate('/');
    };

    if (!avatarDisplay) return;
    if (!authUiState.avatar) {
        avatarDisplay.classList.add('hidden');
        avatarDisplay.style.background = '';
        return;
    }

    avatarDisplay.classList.remove('hidden');
    avatarDisplay.style.background = authUiState.avatar.color;
    avatarDisplay.style.borderRadius = authUiState.avatar.shape === 'circle' ? '50%' : '8px';
    avatarDisplay.style.cursor = 'default';
}

async function syncAuthState(renderAfter = true) {
    try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
            throw error;
        }
        const user = data.session?.user ?? null;

        authUiState.initialized = true;
        authUiState.user = user ? { id: user.id } : null;
        authUiState.avatar = user ? await loadAvatarData(user.id) : null;
    } catch (error) {
        console.error('Failed to sync auth UI', error);
        authUiState.initialized = true;
        authUiState.user = null;
        authUiState.avatar = null;
    }

    if (renderAfter) {
        renderApp();
    }
}

async function loadAvatarData(userId: string): Promise<{ color: string; shape: string } | null> {
    const { data: avatar } = await supabase
        .from('avatars')
        .select('*')
        .eq('user_id', userId)
        .single();

    if (!avatar) {
        return null;
    }

    return {
        color: avatar.avatar_color ?? '',
        shape: avatar.avatar_shape ?? 'square',
    };
}

export function navigate(target: Partial<AppRoute> | string) {
    if (typeof target === 'string') {
        window.history.pushState({}, '', target);
    } else {
        writeRoute(target);
    }

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
        const playerId = randomToken();
        const token = randomToken();
        const created = await createRoom({
            gameType: HIGHCARD_GAME_ID,
            playerId,
            token,
        });

        navigate({
            view: 'room',
            game: HIGHCARD_GAME_ID,
            room: created.roomCode,
            token: created.token,
            mock: false,
        });
    } catch (error) {
        const message = toErrorMessage(error, 'Failed to start HighCard quickplay');
        alert(message);
    }
}

function randomToken(): string {
    return `player-${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeRoomCode(value: string): string {
    return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

function toErrorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
}

function toRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function readLobbyPlayers(value: unknown, hostPlayerId: string | null, selfPlayerId: string | null) {
    if (!Array.isArray(value)) {
        return [] as LobbyRoomViewModel['players'];
    }

    return value
        .map((entry) => {
            if (typeof entry === 'string') {
                return entry;
            }
            const record = toRecord(entry);
            return typeof record.playerId === 'string' ? record.playerId : null;
        })
        .filter((playerId): playerId is string => typeof playerId === 'string')
        .map((playerId) => ({
            playerId,
            isHost: playerId === hostPlayerId,
            isSelf: playerId === selfPlayerId,
        }));
}

window.addEventListener('popstate', () => {
    syncStateFromRoute();
    renderApp();
});

supabase.auth.onAuthStateChange((_event: unknown, session: unknown) => {
    type AuthSession = { user?: { id: string } | null } | null;
    const currentSession = session as AuthSession;
    authUiState.initialized = true;
    authUiState.user = currentSession?.user ? { id: currentSession.user.id } : null;
    if (!currentSession?.user) {
        authUiState.avatar = null;
        renderApp();
        return;
    }

    void loadAvatarData(currentSession.user.id)
        .then((avatar) => {
            authUiState.avatar = avatar;
            renderApp();
        })
        .catch(() => {
            authUiState.avatar = null;
            renderApp();
        });
});
void syncAuthState();

syncStateFromRoute();
renderApp();
