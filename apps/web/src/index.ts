import { applyI18n, getInitialLang, setLang, t, type Lang } from './i18n.js';
import { readRoute, writeRoute, type AppRoute, type View } from './app/router.js';
import { renderLobbyBrowser, renderLobbyRoom, type LobbyRoomViewModel } from './app/lobby-view.js';
import { createGameRoomSession } from './game-room/session.js';
import type { GameAdapter } from './game-room/types.js';
import { createLayoutSpec } from './game-room/ui.js';
import { buildPlayerNameMap, formatPlayerDisplayName, resolvePlayerName } from './game-room/player-display.js';
import { renderRoomError, renderRoomFrame } from './game-room/view.js';
import { highcardAdapter } from './games/highcard/adapter.js';
import { krigAdapter } from './games/krig/adapter.js';
import { renderKrigRoom } from './games/krig/view.js';
import { renderSingleCardHighestWinsRoom } from './games/single-card-highest-wins/view.js';
import { snydAdapter } from './games/snyd/adapter.js';
import { renderSnydRoom } from './games/snyd/view.js';
import { casinoAdapter } from './games/casino/adapter.js';
import { renderCasinoRoom } from './games/casino/view.js';
import { femAdapter } from './games/fem-hundrede/adapter.js';
import { renderFemRoom, type FemViewModel } from './games/fem-hundrede/view.js';
import { renderLogin } from './login.js';
import { renderSignup } from './signUp.js';
import { renderCustom } from './custom.js';
import { loadProfileData, renderProfilePage } from './profile.js';
import { isSupabaseConfigured, supabase } from './supabase.js';
import {
    cancelMatchmakingTicket,
    createRoom,
    enqueueMatchmaking,
    getMatchmakingTicket,
    joinRoom,
    kickPlayer,
    leaveRoom,
    listRooms,
    type LobbyRoomSummary,
    type MatchmakingResponse,
} from './net/api.js';

type GenericAdapter = GameAdapter<Record<string, unknown>, Record<string, unknown>, unknown>;
const adapters: GenericAdapter[] = [
    snydAdapter as GenericAdapter,
    casinoAdapter as GenericAdapter,
    highcardAdapter as GenericAdapter,
    krigAdapter as GenericAdapter,
    femAdapter as GenericAdapter,
];

type ThemeId = 'bodega' | 'harbor' | 'parlor';

const THEME_STORAGE_KEY = 'ui-theme';
const ROOM_HEARTBEAT_INTERVAL_MS = 20_000;

const THEMES: Array<{ id: ThemeId; labelKey: string; toneKey: string }> = [
    { id: 'bodega', labelKey: 'theme.bodega.label', toneKey: 'theme.bodega.tone' },
    { id: 'harbor', labelKey: 'theme.harbor.label', toneKey: 'theme.harbor.tone' },
    { id: 'parlor', labelKey: 'theme.parlor.label', toneKey: 'theme.parlor.tone' },
];

const state = {
    lang: getInitialLang() as Lang,
    view: readRoute().view as View,
    sidebarCollapsed: false,
    route: readRoute() as AppRoute,
    theme: getInitialTheme() as ThemeId,
};

const lobbyBrowserState = {
    rooms: [] as LobbyRoomSummary[],
    loading: false,
    loaded: false,
    busy: false,
    errorMessage: null as string | null,
    joinCode: '',
    createGame: 'highcard',
    createPrivate: false,
};

const homeMatchmakingState = {
    joinCode: '',
    busy: false,
    errorMessage: null as string | null,
};

const quickPlayState = {
    loading: false,
    errorMessage: null as string | null,
    activeGame: null as string | null,
    ticket: null as MatchmakingResponse | null,
    startedAtMs: null as number | null,
    leaving: false,
    matchedCountdown: null as number | null,
};

const authUiState = {
    initialized: false,
    user: null as { id: string; username: string | null } | null,
    avatar: null as { color: string; shape: string } | null,
};

type ActiveSession = ReturnType<typeof createGameRoomSession<Record<string, unknown>, Record<string, unknown>, unknown>>;
const HIGHCARD_GAME_ID = 'highcard';
const KRIG_GAME_ID = 'krig';
const FALLBACK_LOBBY_GAME_ID = HIGHCARD_GAME_ID;

let roomSession: ActiveSession | null = null;
let roomSessionKey: string | null = null;
let unsubscribeRoomSession: (() => void) | null = null;
let highCardAutoStartKey: string | null = null;
let roomHandTrayOpen = false;
let quickPlayPollTimer: number | null = null;
let quickPlayRealtimeChannel: { unsubscribe: () => void } | null = null;
let quickPlayRealtimeRefreshTimer: number | null = null;
let activeQueueClockTimer: number | null = null;
let matchedCountdownTimer: number | null = null;
let quickPlayGeneration = 0;
let roomHeartbeatTimer: number | null = null;
let roomHeartbeatKey: string | null = null;
let roomHeartbeatInFlight = false;
let profileDataCache: Awaited<ReturnType<typeof loadProfileData>> | null = null;

function getInitialTheme(): ThemeId {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return THEMES.some((theme) => theme.id === stored) ? stored as ThemeId : 'bodega';
}

function setTheme(theme: ThemeId) {
    state.theme = theme;
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    applyTheme(theme);
}

function applyTheme(theme: ThemeId) {
    document.documentElement.dataset.theme = theme;
}
let casinoSelectedStackIds: string[] = [];

function supportsLobbyLifecycle(game: string | null | undefined): boolean {
    const normalized = (game ?? '').trim().toLowerCase();
    return normalized === HIGHCARD_GAME_ID || normalized === KRIG_GAME_ID || normalized === 'casino' || normalized === 'snyd' || normalized === 'fem';
}

function supportsRealtimeQuickPlay(game: string | null | undefined): boolean {
    const normalized = (game ?? '').trim().toLowerCase();
    return normalized === HIGHCARD_GAME_ID || normalized === KRIG_GAME_ID || normalized === 'casino' || normalized === 'snyd' || normalized === 'fem';
}

function clearQuickPlayPolling() {
    if (quickPlayPollTimer === null) return;
    window.clearTimeout(quickPlayPollTimer);
    quickPlayPollTimer = null;
}

function clearQuickPlayRealtime() {
    if (quickPlayRealtimeRefreshTimer !== null) {
        window.clearTimeout(quickPlayRealtimeRefreshTimer);
        quickPlayRealtimeRefreshTimer = null;
    }
    quickPlayRealtimeChannel?.unsubscribe();
    quickPlayRealtimeChannel = null;
}

function clearActiveQueueClock() {
    if (activeQueueClockTimer === null) return;
    window.clearInterval(activeQueueClockTimer);
    activeQueueClockTimer = null;
}

function clearMatchedCountdown() {
    if (matchedCountdownTimer === null) return;
    window.clearInterval(matchedCountdownTimer);
    matchedCountdownTimer = null;
}

function nextQuickPlayGeneration(): number {
    quickPlayGeneration += 1;
    return quickPlayGeneration;
}

function isCurrentQuickPlayGeneration(generation: number): boolean {
    return quickPlayGeneration === generation;
}

function resetQuickPlayState() {
    nextQuickPlayGeneration();
    clearQuickPlayPolling();
    clearQuickPlayRealtime();
    clearActiveQueueClock();
    clearMatchedCountdown();
    quickPlayState.loading = false;
    quickPlayState.errorMessage = null;
    quickPlayState.activeGame = null;
    quickPlayState.ticket = null;
    quickPlayState.startedAtMs = null;
    quickPlayState.leaving = false;
    quickPlayState.matchedCountdown = null;
}

function iconSvg(pathD: string) {
    return `
    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="${pathD}"></path>
    </svg>
  `;
}

function renderApp() {
    const path = window.location.pathname;
    applyTheme(state.theme);

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
    <div class="shell ${state.sidebarCollapsed ? 'collapsed' : ''} ${state.view === 'room' ? 'shell-room-mode' : ''}" id="shell">
      <header class="topbar">
        <a class="brand" href="#" id="goHome" aria-label="Gå til forsiden">
          <span class="logo" aria-hidden="true">
            <img class="logo-image" src="/images/brand/bodegadk-brand-mark.png" alt="" />
          </span>
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
      <div id="activeQueueHost">
        ${renderActiveQueueBar()}
      </div>
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
            createGame: lobbyBrowserState.createGame,
            createPrivate: lobbyBrowserState.createPrivate,
            busy: lobbyBrowserState.busy,
            gameLabel: t(state.lang, 'lobby.create.game'),
            visibilityLabel: t(state.lang, 'lobby.create.visibility'),
            joinLobbyLabel: t(state.lang, 'lobby.join.lobby'),
            joinRunningLabel: t(state.lang, 'lobby.join.running'),
        });
    } else if (state.view === 'lobby') {
        main.innerHTML = renderLobbyContent();
    } else if (state.view === 'settings') {
        cleanupRoomSession();
        main.innerHTML = `
      <h1 class="h1" data-i18n="nav.settings"></h1>
      <section class="settings-layout">
        <article class="card settings-card">
          <div class="settings-card-header">
            <div>
              <p class="home-eyebrow" data-i18n="settings.theme.kicker"></p>
              <div class="card-title" data-i18n="settings.theme.title"></div>
            </div>
            <span class="pill" data-i18n="settings.theme.badge"></span>
          </div>
          <p class="card-desc" data-i18n="settings.theme.desc"></p>
          <label class="settings-field" for="themeSelect">
            <span data-i18n="settings.theme.selectLabel"></span>
            <select class="select settings-select" id="themeSelect" aria-label="${t(state.lang, 'settings.theme.ariaLabel')}">
              ${THEMES.map((theme) => `
                <option value="${theme.id}" data-i18n="${theme.labelKey}"></option>
              `).join('')}
            </select>
          </label>
        </article>
        <article class="card settings-card">
          <div class="settings-card-header">
            <div>
              <p class="home-eyebrow" data-i18n="settings.preview.kicker"></p>
              <div class="card-title" data-i18n="settings.preview.title"></div>
            </div>
          </div>
          <div class="theme-preview-grid">
            ${THEMES.map((theme) => `
              <button class="theme-preview ${theme.id === state.theme ? 'active' : ''}" type="button" data-theme-preview="${theme.id}">
                <span class="theme-preview-swatches">
                  <span class="theme-swatch accent"></span>
                  <span class="theme-swatch secondary"></span>
                  <span class="theme-swatch tertiary"></span>
                  <span class="theme-swatch surface"></span>
                </span>
                <span class="theme-preview-copy">
                  <strong data-i18n="${theme.labelKey}"></strong>
                  <span data-i18n="${theme.toneKey}"></span>
                </span>
              </button>
            `).join('')}
          </div>
        </article>
      </section>
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
    } else if (state.view === 'profile') {
        cleanupRoomSession();
        main.innerHTML = renderProfileView();
    } else if (state.view === 'room') {
        main.innerHTML = renderRoomContent();
    }

    applyI18n(main, state.lang);
    applyAuthUI();
    wireViewEvents();
    wireRoomEvents();
    wireLobbyEvents();
}

function renderLobbyContent(): string {
    stopRoomHeartbeat();
    const route = state.route;
    if (!route.room || !route.token) {
        cleanupRoomSession();
        return renderRoomError('Missing query params. Required: view=lobby&room=ABC123&token=yourToken');
    }

    if (route.game && !supportsLobbyLifecycle(route.game)) {
        cleanupRoomSession();
        queueMicrotask(() => {
            navigate({
                view: 'room',
                game: route.game,
                room: route.room,
                token: route.token,
                mock: route.mock,
            });
        });
        return renderRoomError('Opening game room...');
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
        hostDisplayName: players.find((player) => player.playerId === hostPlayerId)?.username ?? formatPlayerDisplayName(hostPlayerId),
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
    const selfUsername = authUiState.user?.username?.trim() || null;
    const viewModel = session?.toViewModel({ selfUsername });

    if (!roomState || !viewModel) {
        stopRoomHeartbeat();
        return renderRoomError('Unable to initialize room session');
    }

    const roomPublicState = toRecord(roomState.publicState);
    const playerNames = buildPlayerNameMap(roomPublicState.players, {
        selfPlayerId: roomState.playerId,
        selfUsername,
    });
    const status = typeof roomPublicState.status === 'string' ? roomPublicState.status : null;
    const hostPlayerId = typeof roomPublicState.hostPlayerId === 'string' ? roomPublicState.hostPlayerId : null;
    const autoStartKey = `${route.room}|${route.token}|${route.game}`;
    const suppressWinnerBanner = adapter.id === krigAdapter.id && roomPublicState.gamePhase === 'GAME_OVER';
    const hasFinished = !!roomState.winnerPlayerId || status === 'FINISHED' || roomPublicState.gamePhase === 'GAME_OVER';

    if (status === 'IN_GAME' && !hasFinished) {
        startRoomHeartbeat(route.room, route.mock);
    } else {
        stopRoomHeartbeat();
    }

    if (status === 'LOBBY' && supportsLobbyLifecycle(route.game) && route.room && route.token) {
        queueMicrotask(() => {
            navigate({
                view: 'lobby',
                game: route.game,
                room: route.room,
                token: route.token,
                mock: route.mock,
            });
        });
        return renderRoomError('Opponent left the match. Returning to lobby...');
    }

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
    const layoutSpec = adapter.ui ?? createLayoutSpec({
        maxPlayers: 8,
        preferredLayout: 'ring',
    });
    let bodyHtml = '';

    if (adapter.id === femAdapter.id) {
        return renderFemRoom(viewModel as FemViewModel);
    }

    if (adapter.id === casinoAdapter.id) {
        const casinoViewModel = viewModel as Parameters<typeof renderCasinoRoom>[0];
        const validStackIds = new Set(casinoViewModel.tableStacks.map((stack) => stack.stackId));
        casinoSelectedStackIds = casinoSelectedStackIds.filter((stackId) => validStackIds.has(stackId));
        bodyHtml = renderCasinoRoom(casinoViewModel, {
            disablePlay: disableByConnection || !casinoViewModel.isMyTurn || !casinoViewModel.selectedHandCard,
            disableBuild: disableByConnection || !casinoViewModel.isMyTurn || !casinoViewModel.selectedHandCard || casinoSelectedStackIds.length !== 1,
            selectedStackIds: casinoSelectedStackIds,
        }, roomHandTrayOpen);
    } else if (adapter.id === highcardAdapter.id) {
        bodyHtml = renderSingleCardHighestWinsRoom(
            viewModel as Parameters<typeof renderSingleCardHighestWinsRoom>[0],
            layoutSpec,
            roomHandTrayOpen,
        );
    } else if (adapter.id === krigAdapter.id) {
        return renderKrigRoom(viewModel as Parameters<typeof renderKrigRoom>[0]);
    } else {
        bodyHtml = renderSnydRoom(
            viewModel as Parameters<typeof renderSnydRoom>[0],
            {
                disablePlay: disableByConnection
                    || !(viewModel as Parameters<typeof renderSnydRoom>[0]).isMyTurn
                    || (viewModel as Parameters<typeof renderSnydRoom>[0]).selectedCount === 0,
                disableCallSnyd: disableByConnection || !(viewModel as Parameters<typeof renderSnydRoom>[0]).isMyTurn,
            },
            layoutSpec,
            roomHandTrayOpen,
        );
    }

    return renderRoomFrame({
        connection: roomState.connection,
        gameTitle: route.game,
        errorMessage: roomState.lastError,
        winnerPlayerId: roomState.winnerPlayerId,
        winnerLabel: resolvePlayerName(playerNames, roomState.winnerPlayerId),
        handTrayOpen: roomHandTrayOpen,
        showHandToggle: adapter.id !== krigAdapter.id,
        bodyHtml,
        suppressWinnerBanner,
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
    stopRoomHeartbeat();
    unsubscribeRoomSession?.();
    unsubscribeRoomSession = null;
    roomSession?.stop();
    roomSession = null;
    roomSessionKey = null;
    highCardAutoStartKey = null;
    roomHandTrayOpen = false;
    casinoSelectedStackIds = [];
}

function startRoomHeartbeat(roomCode: string, useMock: boolean) {
    if (useMock || !supabase) {
        stopRoomHeartbeat();
        return;
    }

    const key = roomCode;
    if (roomHeartbeatTimer !== null && roomHeartbeatKey === key) {
        return;
    }

    stopRoomHeartbeat();
    roomHeartbeatKey = key;
    void sendRoomHeartbeat(roomCode);
    roomHeartbeatTimer = window.setInterval(() => {
        void sendRoomHeartbeat(roomCode);
    }, ROOM_HEARTBEAT_INTERVAL_MS);
}

function stopRoomHeartbeat() {
    if (roomHeartbeatTimer !== null) {
        window.clearInterval(roomHeartbeatTimer);
        roomHeartbeatTimer = null;
    }
    roomHeartbeatKey = null;
    roomHeartbeatInFlight = false;
}

async function sendRoomHeartbeat(roomCode: string) {
    if (!supabase || roomHeartbeatInFlight) return;
    roomHeartbeatInFlight = true;

    try {
        const { error } = await supabase.rpc('touch_room_heartbeat', {
            room_code_input: roomCode,
        });
        if (error) {
            console.warn('[room-heartbeat] failed to update room heartbeat', error);
        }
    } catch (error) {
        console.warn('[room-heartbeat] failed to update room heartbeat', error);
    } finally {
        roomHeartbeatInFlight = false;
    }
}

function resolveAdapter(game: string): GenericAdapter | undefined {
    return adapters.find((candidate) => candidate.canHandle(game));
}

function hasActiveQuickPlayQueue(): boolean {
    return quickPlayState.loading || quickPlayState.ticket !== null;
}

function playCards() {
    return `
    <div class="grid">
      ${imageGameCard('game.cheat', 'game-card-snyd')}
      ${imageGameCard('game.krig', 'game-card-krig')}
      ${imageGameCard('casino', 'game-card-casino')}
      ${imageGameCard('single.card.highest.wins', 'game-card-highest-card')}
      ${imageGameCard('game.500', 'game-card-500')}
    </div>
  `;
}

function renderActiveQueueBar() {
    const ticket = quickPlayState.ticket;
    if (!ticket || (ticket.status !== 'WAITING' && ticket.status !== 'MATCHED')) {
        if (quickPlayState.errorMessage) {
            return `<section class="active-queue-bar active-queue-bar-error" aria-live="polite">
      <div class="active-queue-copy">
        <span class="active-queue-error">${quickPlayState.errorMessage}</span>
      </div>
    </section>`;
        }
        if (quickPlayState.loading) {
            return `<section class="active-queue-bar" aria-live="polite">
      <div class="active-queue-copy">
        <span data-i18n="queue.bar.joining"></span>
      </div>
    </section>`;
        }
        return '';
    }

    const targetPlayers = Math.max(ticket.minPlayers, ticket.queuedPlayers);
    const elapsedSeconds = quickPlayState.startedAtMs
        ? Math.max(Math.floor((Date.now() - quickPlayState.startedAtMs) / 1000), 0)
        : 0;
    const isMatched = ticket.status === 'MATCHED';
    const countdown = quickPlayState.matchedCountdown ?? 0;
    const statusText = isMatched
        ? `${t(state.lang, countdown > 0 ? 'queue.bar.matchedCountdown' : 'queue.bar.matchedNow')} ${countdown > 0 ? countdown : ''}`.trim()
        : `${t(state.lang, 'queue.bar.players')}: ${ticket.queuedPlayers}/${targetPlayers}`;

    const error = quickPlayState.errorMessage
        ? `<span class="active-queue-error">${quickPlayState.errorMessage}</span>`
        : '';
    return `
    <section class="active-queue-bar ${isMatched ? 'matched' : ''}" aria-live="polite">
      <div class="active-queue-status" aria-hidden="true"></div>
      <div class="active-queue-copy">
        <div class="active-queue-heading">
          <span data-i18n="${isMatched ? 'queue.bar.matched' : 'queue.bar.title'}"></span>
          <strong>${formatGameName(ticket.gameType)}</strong>
        </div>
        <div class="active-queue-meta">
          <span>${statusText}</span>
          ${isMatched ? '' : `<span>${t(state.lang, 'queue.bar.wait')}: ${formatQueueDuration(ticket.estimatedWaitSeconds)}</span>`}
          <span>${t(state.lang, 'queue.bar.elapsed')}: ${formatQueueDuration(elapsedSeconds)}</span>
          ${error}
        </div>
      </div>
      ${isMatched
            ? `<span class="active-queue-ready" data-i18n="queue.bar.ready"></span>`
            : `<button class="btn active-queue-leave" type="button" data-action="active-queue-leave" ${quickPlayState.leaving ? 'disabled' : ''} data-i18n="queue.bar.leave"></button>`}
    </section>
  `;
}

function renderHomepageMatchmakingCard() {
    const errorBanner = homeMatchmakingState.errorMessage
        ? `<div class="room-banner room-banner-error">${homeMatchmakingState.errorMessage}</div>`
        : '';

    return `
    <article class="card home-card home-card-half home-matchmaking-card">
      <div class="home-card-header">
        <div>
          <div class="card-title home-card-title" data-i18n="home.card.quick.title"></div>
        </div>
      </div>

      ${errorBanner}

      <div class="home-matchmaking-grid">
        <div class="home-matchmaking-panel">
          <label class="home-matchmaking-label" for="homeJoinCodeInput" data-i18n="home.card.quick.join.label"></label>
          <div class="home-join-row">
            <input
              class="input home-join-input"
              id="homeJoinCodeInput"
              maxlength="6"
              inputmode="text"
              autocapitalize="characters"
              autocomplete="off"
              spellcheck="false"
              value="${homeMatchmakingState.joinCode}"
              placeholder="${t(state.lang, 'home.card.quick.join.placeholder')}"
              aria-label="${t(state.lang, 'home.card.quick.join.label')}"
            />
            <button class="btn primary" type="button" data-action="home-join-room" ${homeMatchmakingState.busy ? 'disabled' : ''} data-i18n="home.card.quick.join.action"></button>
          </div>
        </div>

        <div class="home-matchmaking-actions">
          <button class="btn primary full-width" type="button" data-action="home-create-lobby" ${homeMatchmakingState.busy ? 'disabled' : ''} data-i18n="home.card.quick.create.action"></button>
          <button class="btn full-width" type="button" data-action="open-lobby-browser" ${homeMatchmakingState.busy ? 'disabled' : ''} data-i18n="home.card.quick.browse.action"></button>
        </div>
      </div>
    </article>
  `;
}

function renderHomepage() {
    return `
    <section class="home-layout">
      <section class="card home-hero">
        <div class="home-hero-copy">
          <h1 class="home-hero-title" data-i18n="home.title"></h1>
        </div>
      </section>

      <section class="home-actions" aria-label="Homepage action cards">
        ${renderHomepagePlaceholderCard({
            titleKey: 'home.card.continue.title',
            className: 'home-card-half',
        })}
        ${renderHomepageMatchmakingCard()}
      </section>

      <section class="home-content-grid" aria-label="Homepage content cards">
        <article class="card home-card home-card-wide">
          <div class="home-card-header">
            <div>
              <p class="home-eyebrow" data-i18n="home.section.games.kicker"></p>
              <div class="card-title home-card-title" data-i18n="home.section.games.title"></div>
            </div>
          </div>

          ${playCards()}
        </article>

        ${renderHomepagePlaceholderCard({
            titleKey: 'home.section.leaderboard.title',
            className: 'home-card-narrow',
        })}
        ${renderHomepagePlaceholderCard({
            titleKey: 'home.section.profile.title',
            className: 'home-card-narrow',
        })}
        ${renderHomepagePlaceholderCard({
            titleKey: 'home.section.friends.title',
            className: 'home-card-narrow',
        })}
        ${renderHomepagePlaceholderCard({
            titleKey: 'home.section.stats.title',
            className: 'home-card-narrow',
        })}
      </section>
    </section>
  `;
}

function renderProfileView(): string {
    if (profileDataCache) {
        return renderProfilePage(state.lang, profileDataCache);
    }

    // Load async, then re-render
    void loadProfileData().then((data) => {
        profileDataCache = data;
        renderView();
    });

    return `
    <h1 class="h1" data-i18n="profile.title"></h1>
    <p class="sub">${state.lang === 'en' ? 'Loading...' : 'Indlæser...'}</p>
  `;
}

function renderHomepagePlaceholderCard(input: {
    titleKey: string;
    className?: string;
}): string {
    return `
    <article class="card home-card home-placeholder-card ${input.className ?? ''}" aria-disabled="true">
      <div class="home-card-header">
        <div>
          <div class="card-title home-card-title" data-i18n="${input.titleKey}"></div>
        </div>
        <span class="home-placeholder-tag" data-i18n="home.action.comingSoon"></span>
      </div>
    </article>
  `;
}

function imageGameCard(titleKey: string, imageClass: string) {
    const disabled = hasActiveQuickPlayQueue() ? 'disabled aria-disabled="true"' : '';
    return `
    <button class="card game-card ${imageClass}" type="button" data-action="open-game" data-game="${titleKey}" ${disabled}>
      <span class="game-card-title card-title" data-i18n="${titleKey}"></span>
    </button>
  `;
}

function wireViewEvents() {
    const themeSelect = document.getElementById('themeSelect') as HTMLSelectElement | null;
    if (themeSelect) {
        themeSelect.value = state.theme;
        themeSelect.addEventListener('change', () => {
            const nextTheme = themeSelect.value;
            if (!THEMES.some((theme) => theme.id === nextTheme)) {
                themeSelect.value = state.theme;
                return;
            }
            setTheme(nextTheme as ThemeId);
            renderApp();
        });
    }

    document.querySelectorAll<HTMLButtonElement>('[data-theme-preview]').forEach((button) => {
        button.addEventListener('click', () => {
            const nextTheme = button.dataset.themePreview;
            if (!nextTheme || !THEMES.some((theme) => theme.id === nextTheme)) {
                return;
            }
            setTheme(nextTheme as ThemeId);
            renderApp();
        });
    });

    document.querySelectorAll<HTMLElement>('[data-action="open-game"]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            const game = normalizeGameKey(btn.dataset.game ?? '');
            if (supportsRealtimeQuickPlay(game) && !(e as MouseEvent).shiftKey) {
                void handleQuickPlay(game);
                return;
            }

            navigate({
                view: 'room',
                game,
                room: `DEV-${game}`,
                token: state.route.token ?? randomToken(),
                mock: true,
            });
        });
    });

    document.querySelector<HTMLButtonElement>('button[data-action="active-queue-leave"]')?.addEventListener('click', () => {
        void cancelQuickPlay();
    });

    document.querySelectorAll<HTMLButtonElement>('button[data-action="open-lobby-browser"]').forEach((button) => {
        button.addEventListener('click', () => {
            navigate({ view: 'lobby-browser', room: null, token: null, game: null, mock: false });
        });
    });

    const homeJoinCodeInput = document.getElementById('homeJoinCodeInput') as HTMLInputElement | null;
    homeJoinCodeInput?.addEventListener('input', () => {
        homeMatchmakingState.joinCode = sanitizeRoomCode(homeJoinCodeInput.value);
        homeJoinCodeInput.value = homeMatchmakingState.joinCode;
    });
    homeJoinCodeInput?.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') {
            return;
        }
        event.preventDefault();
        void handleHomepageJoin();
    });

    document.querySelector<HTMLButtonElement>('button[data-action="home-join-room"]')?.addEventListener('click', () => {
        void handleHomepageJoin();
    });

    document.querySelector<HTMLButtonElement>('button[data-action="home-create-lobby"]')?.addEventListener('click', () => {
        void handleHomepageCreateLobby();
    });

    document.querySelector<HTMLButtonElement>('button[data-action="profile-customize"]')?.addEventListener('click', () => {
        navigate('/custom');
    });

    document.querySelector<HTMLButtonElement>('button[data-action="profile-logout"]')?.addEventListener('click', async () => {
        if (!supabase) return;
        await supabase.auth.signOut();
        profileDataCache = null;
        navigate({ view: 'home' });
    });
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
        profileBtn.onclick = () => navigate({ view: 'profile' });
    }
}

function wireRoomEvents() {
    if (state.view !== 'room') return;
    if (!roomSession) return;

    document.querySelector<HTMLButtonElement>('button[data-action="toggle-room-hand"]')?.addEventListener('click', () => {
        roomHandTrayOpen = !roomHandTrayOpen;
        renderView();
    });

    document.querySelectorAll<HTMLButtonElement>('button[data-action="leave-table"]').forEach((button) => {
        button.addEventListener('click', () => {
            void handleLeaveActiveRoom();
        });
    });

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

    const flipButton = document.querySelector<HTMLButtonElement>('button[data-action="flip-card"]');
    flipButton?.addEventListener('click', () => {
        roomSession?.sendIntent({ type: 'FLIP_CARD' });
    });

    const callSnydButton = document.querySelector<HTMLButtonElement>('button[data-action="call-snyd"]');
    callSnydButton?.addEventListener('click', () => {
        roomSession?.sendIntent({ type: 'CALL_SNYD' });
    });

    document.querySelector<HTMLButtonElement>('button[data-action="request-rematch"]')?.addEventListener('click', () => {
        roomSession?.sendIntent({ type: 'REQUEST_REMATCH' });
    });

    document.querySelectorAll<HTMLButtonElement>('button[data-action="casino-toggle-table"]').forEach((button) => {
        button.addEventListener('click', () => {
            const stackId = button.dataset.stackId;
            if (!stackId) return;
            if (casinoSelectedStackIds.includes(stackId)) {
                casinoSelectedStackIds = casinoSelectedStackIds.filter((id) => id !== stackId);
            } else {
                casinoSelectedStackIds = [...casinoSelectedStackIds, stackId];
            }
            renderView();
        });
    });

    document.querySelector<HTMLButtonElement>('button[data-action="casino-play"]')?.addEventListener('click', () => {
        const casinoViewModel = roomSession?.toViewModel() as { selectedHandCard?: string | null } | undefined;
        const handCard = casinoViewModel?.selectedHandCard;
        if (!handCard) return;
        roomSession?.sendIntent({
            type: 'CASINO_PLAY_MOVE',
            handCard,
            captureStackIds: casinoSelectedStackIds,
        });
        casinoSelectedStackIds = [];
    });

    document.querySelector<HTMLButtonElement>('button[data-action="casino-build"]')?.addEventListener('click', () => {
        const casinoViewModel = roomSession?.toViewModel() as { selectedHandCard?: string | null } | undefined;
        const handCard = casinoViewModel?.selectedHandCard;
        const targetStackId = casinoSelectedStackIds[0];
        if (!handCard || !targetStackId) return;
        roomSession?.sendIntent({
            type: 'CASINO_BUILD_STACK',
            handCard,
            targetStackId,
        });
        casinoSelectedStackIds = [];
    });

    triggerCasinoQuickMerge();

    document.querySelectorAll<HTMLElement>('[data-action="fem-draw-stock"]').forEach((el) => {
        el.addEventListener('click', () => roomSession?.sendIntent({ type: 'FEM_DRAW_FROM_STOCK' }));
    });
    document.querySelectorAll<HTMLElement>('[data-action="fem-draw-discard"]').forEach((el) => {
        el.addEventListener('click', () => roomSession?.sendIntent({ type: 'FEM_DRAW_FROM_DISCARD' }));
    });
    document.querySelectorAll<HTMLElement>('[data-action="fem-take-pile"]').forEach((el) => {
        el.addEventListener('click', () => roomSession?.sendIntent({ type: 'FEM_TAKE_DISCARD_PILE' }));
    });
    document.querySelectorAll<HTMLElement>('[data-action="fem-lay-meld"]').forEach((el) => {
        el.addEventListener('click', () => roomSession?.sendIntent({ type: 'FEM_LAY_MELD' }));
    });
    document.querySelectorAll<HTMLElement>('[data-action="fem-discard"]').forEach((el) => {
        el.addEventListener('click', () => roomSession?.sendIntent({ type: 'FEM_DISCARD' }));
    });
    document.querySelectorAll<HTMLElement>('[data-action="fem-pass-grab"]').forEach((el) => {
        el.addEventListener('click', () => roomSession?.sendIntent({ type: 'FEM_PASS_GRAB' }));
    });
    document.querySelectorAll<HTMLElement>('[data-action="fem-extend-meld"]').forEach((el) => {
        el.addEventListener('click', () => {
            const meldId = el.dataset.meldId;
            if (!meldId) return;
            roomSession?.sendIntent({ type: 'FEM_EXTEND_MELD', meldId });
        });
    });
    document.querySelectorAll<HTMLElement>('[data-action="fem-claim-discard"]').forEach((el) => {
        el.addEventListener('click', () => {
            const meldId = el.dataset.meldId;
            if (!meldId) return;
            roomSession?.sendIntent({ type: 'FEM_CLAIM_DISCARD', meldId });
        });
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

        const createGameInput = document.getElementById('createGameInput') as HTMLSelectElement | null;
        createGameInput?.addEventListener('change', () => {
            lobbyBrowserState.createGame = normalizeGameKey(createGameInput.value);
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
    homeMatchmakingState.errorMessage = null;
    lobbyBrowserState.busy = true;
    lobbyBrowserState.errorMessage = null;
    renderView();

    try {
        const playerIdentity = getLobbyIdentity();
        const created = await createRoom({
            gameType: lobbyBrowserState.createGame,
            isPrivate: lobbyBrowserState.createPrivate,
            playerId: playerIdentity.playerId,
            username: playerIdentity.username ?? undefined,
            token: playerIdentity.token,
        });

        navigate({
            view: supportsLobbyLifecycle(created.selectedGame) ? 'lobby' : 'room',
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
        const playerIdentity = getLobbyIdentity();
        const joined = await joinRoom({
            roomCode,
            playerId: playerIdentity.playerId,
            username: playerIdentity.username ?? undefined,
            token: playerIdentity.token,
        });

        navigate({
            view: supportsLobbyLifecycle(joined.selectedGame) ? 'lobby' : 'room',
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

async function handleHomepageCreateLobby() {
    homeMatchmakingState.busy = true;
    homeMatchmakingState.errorMessage = null;
    renderView();

    try {
        const playerIdentity = getLobbyIdentity();
        const created = await createRoom({
            gameType: FALLBACK_LOBBY_GAME_ID,
            isPrivate: false,
            playerId: playerIdentity.playerId,
            username: playerIdentity.username ?? undefined,
            token: playerIdentity.token,
        });

        navigate({
            view: supportsLobbyLifecycle(created.selectedGame) ? 'lobby' : 'room',
            game: created.selectedGame,
            room: created.roomCode,
            token: created.token,
            mock: false,
        });
    } catch (error) {
        homeMatchmakingState.errorMessage = toErrorMessage(error, 'Failed to create lobby');
        renderView();
    } finally {
        homeMatchmakingState.busy = false;
        if (state.view === 'home') {
            renderView();
        }
    }
}

async function handleHomepageJoin() {
    const roomCode = sanitizeRoomCode(homeMatchmakingState.joinCode);
    if (!roomCode) {
        homeMatchmakingState.errorMessage = 'Enter a valid room code';
        renderView();
        return;
    }

    homeMatchmakingState.busy = true;
    homeMatchmakingState.errorMessage = null;
    homeMatchmakingState.joinCode = roomCode;
    renderView();

    try {
        const playerIdentity = getLobbyIdentity();
        const joined = await joinRoom({
            roomCode,
            playerId: playerIdentity.playerId,
            username: playerIdentity.username ?? undefined,
            token: playerIdentity.token,
        });

        navigate({
            view: supportsLobbyLifecycle(joined.selectedGame) ? 'lobby' : 'room',
            game: joined.selectedGame,
            room: joined.roomCode,
            token: joined.token,
            mock: false,
        });
    } catch (error) {
        homeMatchmakingState.errorMessage = toErrorMessage(error, 'Failed to join lobby');
        renderView();
    } finally {
        homeMatchmakingState.busy = false;
        if (state.view === 'home') {
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

async function handleLeaveActiveRoom() {
    const route = state.route;
    cleanupRoomSession();

    if (!route.room || !route.token || route.mock) {
        navigate({ view: 'home', room: null, token: null, game: null, mock: false });
        return;
    }

    try {
        await leaveRoom({ roomCode: route.room, token: route.token });
    } catch (error) {
        alert(toErrorMessage(error, 'Failed to leave table'));
    } finally {
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
        profileBtn.onclick = () => navigate({ view: 'profile' });

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
    profileBtn.textContent = state.lang === 'en' ? 'Profile' : 'Profil';
    profileBtn.onclick = () => navigate({ view: 'profile' });

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
    if (!supabase) {
        authUiState.initialized = true;
        authUiState.user = null;
        authUiState.avatar = null;
        if (renderAfter) {
            renderApp();
        }
        return;
    }

    try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
            throw error;
        }
        const user = data.session?.user ?? null;

        authUiState.initialized = true;
        if (user) {
            await upsertProfileFromAuth(user);
        }
        authUiState.user = user
            ? { id: user.id, username: await loadProfileUsername(user.id, user.user_metadata?.username) }
            : null;
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
    if (!supabase) {
        return null;
    }

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

async function loadProfileUsername(userId: string, fallbackUsername?: string | null): Promise<string | null> {
    if (!supabase) {
        return normalizeUsernameValue(fallbackUsername);
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', userId)
        .single();

    return normalizeUsernameValue(profile?.username) ?? normalizeUsernameValue(fallbackUsername);
}

async function upsertProfileFromAuth(user: {
    id: string;
    user_metadata?: { username?: string | null; country?: string | null } | null;
}): Promise<void> {
    if (!supabase) {
        return;
    }

    const username = normalizeUsernameValue(user.user_metadata?.username);
    const country = normalizeUsernameValue(user.user_metadata?.country);
    if (!username && !country) {
        return;
    }

    await supabase.from('profiles').upsert({
        id: user.id,
        username,
        country,
    });
}

function normalizeUsernameValue(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
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
    if (game === 'game.krig') return KRIG_GAME_ID;
    if (game === 'casino') return 'casino';
    if (game === 'single.card.highest.wins') return HIGHCARD_GAME_ID;
    if (game === 'game.500') return 'fem';
    if (game === 'single-card-highest-wins') return HIGHCARD_GAME_ID;
    return game;
}

async function startRealtimeRoom(gameType: string) {
    try {
        const token = randomToken();
        const playerId = token;
        const created = await createRoom({
            gameType,
            playerId,
            token,
        });

        navigate({
            view: 'room',
            game: gameType,
            room: created.roomCode,
            token: created.token,
            mock: false,
        });
    } catch (error) {
        const message = toErrorMessage(error, `Failed to start ${gameType} room`);
        alert(message);
    }
}

async function handleQuickPlay(gameType: string) {
    if (hasActiveQuickPlayQueue()) {
        return;
    }

    if (!supportsRealtimeQuickPlay(gameType)) {
        quickPlayState.errorMessage = t(state.lang, 'play.queue.unsupported');
        renderView();
        return;
    }

    const generation = nextQuickPlayGeneration();
    clearQuickPlayPolling();
    clearQuickPlayRealtime();
    clearActiveQueueClock();
    clearMatchedCountdown();
    quickPlayState.loading = true;
    quickPlayState.errorMessage = null;
    quickPlayState.activeGame = gameType;
    quickPlayState.ticket = null;
    quickPlayState.startedAtMs = null;
    quickPlayState.leaving = false;
    quickPlayState.matchedCountdown = null;
    renderView();
    updateActiveQueueBar();

    try {
        const identity = getLobbyIdentity();
        const ticket = await enqueueMatchmaking({
            gameType,
            playerId: identity.playerId,
            username: identity.username ?? undefined,
            token: identity.token,
        });
        if (!isCurrentQuickPlayGeneration(generation)) {
            return;
        }
        quickPlayState.ticket = ticket;
        quickPlayState.loading = false;
        quickPlayState.startedAtMs = Date.now();
        renderView();
        handleQuickPlayTicketUpdate(ticket, generation);
    } catch (error) {
        if (!isCurrentQuickPlayGeneration(generation)) {
            return;
        }
        const message = toErrorMessage(error, 'Failed to join matchmaking queue');
        resetQuickPlayState();
        quickPlayState.errorMessage = message;
        renderView();
        updateActiveQueueBar();
    }
}

function handleQuickPlayTicketUpdate(ticket: MatchmakingResponse, generation = quickPlayGeneration) {
    if (!isCurrentQuickPlayGeneration(generation)) {
        return;
    }
    if (quickPlayState.ticket && quickPlayState.ticket.ticketId !== ticket.ticketId) {
        return;
    }

    const wasNewQueue = quickPlayState.ticket?.ticketId !== ticket.ticketId || !quickPlayState.startedAtMs;
    quickPlayState.ticket = ticket;
    quickPlayState.activeGame = ticket.gameType;
    if (wasNewQueue && ticket.status === 'WAITING') {
        quickPlayState.startedAtMs = Date.now();
    }
    if (ticket.status === 'MATCHED' && ticket.roomCode) {
        startMatchedCountdown(ticket, generation);
        return;
    }
    if (ticket.status !== 'WAITING') {
        clearQuickPlayPolling();
        clearQuickPlayRealtime();
        clearActiveQueueClock();
        renderView();
        updateActiveQueueBar();
        return;
    }
    subscribeQuickPlayRealtime(ticket.gameType, ticket.ticketId, generation);
    startActiveQueueClock();
    updateActiveQueueBar();
    scheduleQuickPlayPoll(ticket.ticketId, generation);
}

function scheduleQuickPlayPoll(ticketId: string, generation = quickPlayGeneration) {
    clearQuickPlayPolling();
    quickPlayPollTimer = window.setTimeout(async () => {
        if (!isCurrentQuickPlayGeneration(generation)) {
            return;
        }
        try {
            const nextTicket = await getMatchmakingTicket(ticketId);
            if (!isCurrentQuickPlayGeneration(generation) || quickPlayState.ticket?.ticketId !== ticketId) {
                return;
            }
            handleQuickPlayTicketUpdate(nextTicket, generation);
            renderView();
        } catch (error) {
            if (!isCurrentQuickPlayGeneration(generation) || quickPlayState.ticket?.ticketId !== ticketId) {
                return;
            }
            quickPlayState.errorMessage = toErrorMessage(error, 'Failed to refresh matchmaking queue');
            clearQuickPlayPolling();
            renderView();
            updateActiveQueueBar();
        }
    }, 1500);
}

function startMatchedCountdown(ticket: MatchmakingResponse, generation = quickPlayGeneration) {
    if (!ticket.roomCode) {
        return;
    }

    clearQuickPlayPolling();
    clearQuickPlayRealtime();
    clearActiveQueueClock();

    quickPlayState.ticket = ticket;
    quickPlayState.activeGame = ticket.gameType;
    quickPlayState.leaving = false;
    quickPlayState.errorMessage = null;
    if (matchedCountdownTimer !== null) {
        updateActiveQueueBar();
        return;
    }

    quickPlayState.matchedCountdown = 3;
    updateActiveQueueBar();

    matchedCountdownTimer = window.setInterval(() => {
        if (!isCurrentQuickPlayGeneration(generation) || quickPlayState.ticket?.ticketId !== ticket.ticketId) {
            clearMatchedCountdown();
            return;
        }

        const next = (quickPlayState.matchedCountdown ?? 0) - 1;
        quickPlayState.matchedCountdown = Math.max(next, 0);
        updateActiveQueueBar();

        if (next > 0) {
            return;
        }

        clearMatchedCountdown();
        resetQuickPlayState();
        navigate({
            view: 'room',
            game: ticket.gameType,
            room: ticket.roomCode,
            token: ticket.token,
            mock: false,
        });
    }, 1000);
}

async function cancelQuickPlay() {
    const ticket = quickPlayState.ticket;
    if (!ticket) {
        resetQuickPlayState();
        renderView();
        updateActiveQueueBar();
        return;
    }

    quickPlayState.leaving = true;
    quickPlayState.errorMessage = null;
    updateActiveQueueBar();

    try {
        await cancelMatchmakingTicket(ticket.ticketId);
    } catch (error) {
        quickPlayState.leaving = false;
        quickPlayState.errorMessage = toErrorMessage(error, 'Failed to cancel matchmaking queue');
        renderView();
        updateActiveQueueBar();
        return;
    }

    resetQuickPlayState();
    renderView();
    updateActiveQueueBar();
    void cancelQuickPlayWithSupabase(ticket);
}

async function cancelQuickPlayWithSupabase(ticket: MatchmakingResponse): Promise<boolean> {
    if (!supabase) {
        return false;
    }

    try {
        const { data, error } = await supabase.rpc('cancel_matchmaking_ticket', {
            ticket_id_input: ticket.ticketId,
            session_token_input: ticket.token,
        });

        if (error) {
            console.warn('Supabase matchmaking cancel failed after API cancel', error);
            return false;
        }

        return data === true;
    } catch (error) {
        console.warn('Supabase matchmaking cancel threw after API cancel', error);
        return false;
    }
}

function subscribeQuickPlayRealtime(gameType: string, ticketId: string, generation = quickPlayGeneration) {
    if (!supabase || quickPlayRealtimeChannel) {
        return;
    }

    quickPlayRealtimeChannel = supabase
        .channel(`matchmaking-ticket-${ticketId}`)
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'matchmaking_tickets',
                filter: `game_type=eq.${gameType}`,
            },
            () => {
                scheduleRealtimeTicketRefresh(ticketId, generation);
            }
        )
        .subscribe();
}

function scheduleRealtimeTicketRefresh(ticketId: string, generation = quickPlayGeneration) {
    if (!isCurrentQuickPlayGeneration(generation) || quickPlayState.ticket?.ticketId !== ticketId) {
        return;
    }
    if (quickPlayRealtimeRefreshTimer !== null) {
        window.clearTimeout(quickPlayRealtimeRefreshTimer);
    }
    quickPlayRealtimeRefreshTimer = window.setTimeout(async () => {
        quickPlayRealtimeRefreshTimer = null;
        if (!isCurrentQuickPlayGeneration(generation)) {
            return;
        }
        try {
            const nextTicket = await getMatchmakingTicket(ticketId);
            if (!isCurrentQuickPlayGeneration(generation) || quickPlayState.ticket?.ticketId !== ticketId) {
                return;
            }
            handleQuickPlayTicketUpdate(nextTicket, generation);
        } catch (error) {
            if (!isCurrentQuickPlayGeneration(generation) || quickPlayState.ticket?.ticketId !== ticketId) {
                return;
            }
            quickPlayState.errorMessage = toErrorMessage(error, 'Failed to refresh matchmaking queue');
            updateActiveQueueBar();
        }
    }, 250);
}

function startActiveQueueClock() {
    if (activeQueueClockTimer !== null) return;
    activeQueueClockTimer = window.setInterval(() => {
        updateActiveQueueBar();
    }, 1000);
}

function updateActiveQueueBar() {
    const host = document.getElementById('activeQueueHost');
    if (!host) return;
    host.innerHTML = renderActiveQueueBar();
    applyI18n(host, state.lang);
    document.querySelector<HTMLButtonElement>('button[data-action="active-queue-leave"]')?.addEventListener('click', () => {
        void cancelQuickPlay();
    });
}

function triggerCasinoQuickMerge() {
    if (!roomSession) return;
    const roomState = roomSession.getState();
    if (roomState.game.toLowerCase() !== 'casino') return;
    if (roomState.selectedHandCards.length > 0) return;
    if (casinoSelectedStackIds.length < 2) return;

    const casinoViewModel = roomSession.toViewModel() as {
        hand?: Array<{ card: string }>;
        tableStacks?: Array<{ stackId: string; total: number }>;
    };
    const selectedStacks = (casinoViewModel.tableStacks ?? []).filter((stack) => casinoSelectedStackIds.includes(stack.stackId));
    if (selectedStacks.length !== casinoSelectedStackIds.length) return;

    const total = selectedStacks.reduce((sum, stack) => sum + stack.total, 0);
    const valueMap = readCasinoValueMap(roomState.publicState);
    const hasMatchingHandCard = (casinoViewModel.hand ?? []).some(({ card }) => matchesCasinoTotal(card, total, valueMap));
    if (!hasMatchingHandCard) return;

    roomSession.sendIntent({
        type: 'CASINO_MERGE_STACKS',
        stackIds: casinoSelectedStackIds,
    });
    casinoSelectedStackIds = [];
}

function matchesCasinoTotal(cardCode: string, total: number, valueMap: Record<string, number[]> | null): boolean {
    const configured = valueMap?.[cardCode];
    if (Array.isArray(configured) && configured.every((value) => typeof value === 'number')) {
        return configured.includes(total);
    }

    const rank = cardCode.slice(1).toUpperCase();
    if (rank === 'A') return total === 1 || total === 14;
    if (rank === 'J') return total === 11;
    if (rank === 'Q') return total === 12;
    if (rank === 'K') return total === 13;
    return Number(rank) === total;
}

function readCasinoValueMap(publicState: Record<string, unknown> | null): Record<string, number[]> | null {
    const rules = publicState?.rules;
    if (!rules || typeof rules !== 'object') return null;
    const valueMap = (rules as { valueMap?: unknown }).valueMap;
    if (!valueMap || typeof valueMap !== 'object') return null;
    return valueMap as Record<string, number[]>;
}

function randomToken(): string {
    return `player-${Math.random().toString(36).slice(2, 8)}`;
}

function formatQueueDuration(seconds: number): string {
    const safeSeconds = Math.max(Math.floor(seconds), 0);
    const minutes = Math.floor(safeSeconds / 60);
    const remainder = safeSeconds % 60;
    return `${minutes}:${remainder.toString().padStart(2, '0')}`;
}

function formatGameName(gameType: string): string {
    if (gameType === 'snyd') return t(state.lang, 'game.cheat');
    if (gameType === KRIG_GAME_ID) return t(state.lang, 'game.krig');
    if (gameType === 'casino') return t(state.lang, 'game.casino');
    if (gameType === HIGHCARD_GAME_ID) return t(state.lang, 'game.highcard');
    return gameType;
}

function getLobbyIdentity() {
    const authenticatedUserId = authUiState.user?.id?.trim();
    return {
        playerId: authenticatedUserId || randomToken(),
        username: authUiState.user?.username?.trim() || null,
        token: randomToken(),
    };
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
                return {
                    playerId: entry,
                    username: formatPlayerDisplayName(entry),
                };
            }
            const record = toRecord(entry);
            if (typeof record.playerId !== 'string') {
                return null;
            }
            return {
                playerId: record.playerId,
                username: typeof record.username === 'string' && record.username.trim()
                    ? record.username.trim()
                    : (record.playerId === selfPlayerId && authUiState.user?.username?.trim()
                        ? authUiState.user.username.trim()
                    : formatPlayerDisplayName(record.playerId)),
            };
        })
        .filter((player): player is { playerId: string; username: string } => player !== null)
        .map((player) => ({
            playerId: player.playerId,
            username: player.username || player.playerId,
            isHost: player.playerId === hostPlayerId,
            isSelf: player.playerId === selfPlayerId,
        }));
}

window.addEventListener('popstate', () => {
    syncStateFromRoute();
    renderApp();
});

if (isSupabaseConfigured && supabase) {
    supabase.auth.onAuthStateChange((_event: unknown, session: unknown) => {
        type AuthSession = {
            user?: {
                id: string;
                user_metadata?: { username?: string | null; country?: string | null } | null;
            } | null;
        } | null;
        const currentSession = session as AuthSession;
        authUiState.initialized = true;
        authUiState.user = currentSession?.user ? { id: currentSession.user.id, username: null } : null;
        if (!currentSession?.user) {
            authUiState.avatar = null;
            renderApp();
            return;
        }

        void Promise.all([
            upsertProfileFromAuth(currentSession.user),
            loadAvatarData(currentSession.user.id),
        ])
            .then(async ([, avatar]) => {
                const username = await loadProfileUsername(
                    currentSession.user!.id,
                    currentSession.user?.user_metadata?.username
                );
                authUiState.user = { id: currentSession.user!.id, username };
                authUiState.avatar = avatar;
                renderApp();
            })
            .catch(() => {
                authUiState.user = { id: currentSession.user!.id, username: null };
                authUiState.avatar = null;
                renderApp();
            });
    });
}
void syncAuthState();

syncStateFromRoute();
renderApp();
