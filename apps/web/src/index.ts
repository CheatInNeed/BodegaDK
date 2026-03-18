import { applyI18n, getInitialLang, setLang, type Lang } from './i18n.js';
import { readRoute, writeRoute, type AppRoute, type View } from './app/router.js';
import { createGameRoomSession } from './game-room/session.js';
import type { GameAdapter } from './game-room/types.js';
import { renderRoomError, renderRoomFrame } from './game-room/view.js';
import { renderLobbyView } from './game-room/lobby-view.js';
import { snydAdapter } from './games/snyd/adapter.js';
import { renderSnydRoom } from './games/snyd/view.js';
import { highcardAdapter } from './games/highcard/adapter.js';
import { renderLogin } from './login.js';
import { renderSingleCardHighestWinsRoom } from './games/single-card-highest-wins/view.js';
import { createLobby, getLobby, joinLobby, listGames, listPublicLobbies, startLobby, updateLobby, type GameSummary, type LobbyRoom, type LobbySummary } from './api/lobbies.js';
import { renderLobbyBrowser } from './lobby-browser.js';
import { supabase } from './supabase.js';
import { createRoom, joinRoom } from './net/api.js';

type GenericAdapter = GameAdapter<Record<string, unknown>, Record<string, unknown>, unknown>;
const adapters: GenericAdapter[] = [snydAdapter as GenericAdapter, highcardAdapter as GenericAdapter];
const HIGHCARD_GAME_ID = 'highcard';
const LOBBY_POLL_MS = 5000;

type ActiveSession = ReturnType<typeof createGameRoomSession<Record<string, unknown>, Record<string, unknown>, unknown>>;
type AuthUser = {
    playerId: string;
    displayName: string;
    email: string | null;
};

type PlayerIdentity = {
    playerId: string;
    displayName: string;
    email: string | null;
    isGuest: boolean;
};

const GUEST_STORAGE_KEY = 'bodegadk.guestProfile';

const state = {
    lang: getInitialLang() as Lang,
    view: 'play' as View,
    sidebarCollapsed: false,
    route: readRoute() as AppRoute,
    authLoading: true,
    authUser: null as AuthUser | null,
    lobbyRoom: null as LobbyRoom | null,
    lobbyBrowser: [] as LobbySummary[],
    lobbyGames: [] as GameSummary[],
    lobbyLoading: false,
    browserLoading: false,
    lobbyBusy: false,
    lobbyError: null as string | null,
};

let roomSession: ActiveSession | null = null;
let roomSessionKey: string | null = null;
let unsubscribeRoomSession: (() => void) | null = null;
let pollingHandle: number | null = null;

void refreshAuthUser();
void ensureGameCatalog();
void refreshDataForRoute();

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

    const activePlayer = getActivePlayer();

    app.innerHTML = `
    <div class="shell ${state.sidebarCollapsed ? 'collapsed' : ''}" id="shell">
      <header class="topbar">
        <a class="brand" href="#" id="goHome" aria-label="Gå til forsiden">
          <div class="logo" aria-hidden="true"></div>
          <span data-i18n="app.name"></span>
        </a>

        <div class="topbar-right">
          <span class="pill">${activePlayer ? escapeHtml(activePlayer.displayName) : state.authLoading ? 'Checking login...' : 'Guest'}</span>
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
          ${activePlayer?.isGuest ? '' : navItem('lobby-browser', 'nav.play', iconSvg('M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z'))}
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
    syncPolling();
}

function navItem(view: View, key: string, icon: string) {
    const active = state.view === view ? 'active' : '';
    const label = view === 'lobby-browser' ? 'Lobby Browser' : '';
    return `
    <div class="nav-item ${active}" role="button" tabindex="0" data-view="${view}">
      ${icon}
      <span class="nav-label" ${label ? '' : `data-i18n="${key}"`}>${label}</span>
    </div>
  `;
}

function renderView() {
    const main = document.getElementById('main');
    if (!main) return;
    const activePlayer = getActivePlayer();

    if (state.view === 'home' || state.view === 'play') {
        cleanupRoomSession();
        main.innerHTML = `
      <h1 class="h1" data-i18n="${state.view === 'home' ? 'home.title' : 'play.title'}"></h1>
      <p class="sub">${activePlayer ? `${activePlayer.isGuest ? 'Playing as' : 'Logged in as'} ${escapeHtml(activePlayer.displayName)}.` : 'Continue as guest or log in with Supabase to access all lobby features.'}</p>
      ${state.lobbyError ? `<div class="room-banner room-banner-error">${escapeHtml(state.lobbyError)}</div>` : ''}
      ${playCards()}
    `;
    } else if (state.view === 'settings') {
        cleanupRoomSession();
        main.innerHTML = `
      <h1 class="h1" data-i18n="nav.settings"></h1>
      <div class="card">
        <p class="card-desc">(Placeholder) Her kan I senere have lyd, tema, sprog, kontoindstillinger osv.</p>
      </div>
    `;
    } else if (state.view === 'help') {
        cleanupRoomSession();
        main.innerHTML = `
      <h1 class="h1" data-i18n="nav.help"></h1>
      <div class="card">
        <p class="card-desc">Use a private lobby for invite-only games, or the public browser to find open tables.</p>
      </div>
    `;
    } else if (state.view === 'lobby') {
        cleanupRoomSession();
        main.innerHTML = renderLobbyView({
            room: state.lobbyRoom,
            selfPlayerId: activePlayer?.playerId ?? null,
            error: state.lobbyError,
            busy: state.lobbyBusy,
            isGuest: activePlayer?.isGuest ?? false,
        });
    } else if (state.view === 'lobby-browser') {
        cleanupRoomSession();
        main.innerHTML = renderLobbyBrowser({
            rooms: state.lobbyBrowser,
            games: state.lobbyGames,
            selectedGame: state.route.game,
            error: state.lobbyError,
            loading: state.browserLoading,
        });
    } else if (state.view === 'room') {
        main.innerHTML = renderRoomContent();
    }

    applyI18n(document, state.lang);
}

function renderRoomContent(): string {
    const route = state.route;
    const activePlayer = getActivePlayer();
    const token = route.token ?? activePlayer?.playerId ?? null;
    if (!route.room || !token || !route.game) {
        cleanupRoomSession();
        return renderRoomError('Missing query params. Required: view=room&game=snyd&room=ABC123&token=yourToken');
    }

    const adapter = adapters.find((candidate) => candidate.canHandle(route.game ?? ''));
    if (!adapter) {
        cleanupRoomSession();
        return renderRoomError(`Unsupported game mode: ${route.game}`);
    }

    const key = `${route.game}|${route.room}|${token}|${route.mock ? 'mock' : 'ws'}`;
    if (!roomSession || roomSessionKey !== key) {
        cleanupRoomSession();
        roomSessionKey = key;
        roomSession = createGameRoomSession({
            bootstrap: {
                game: route.game,
                roomCode: route.room,
                token,
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
    const activePlayer = getActivePlayer();
    const guestRestricted = activePlayer?.isGuest ?? !state.authUser;
    const publicDisabled = guestRestricted ? 'disabled' : '';
    return `
    <div class="grid">
      <div class="card">
        <div class="card-title">Snyd</div>
        <div class="card-desc">Create a pre-game lobby, invite friends with a room code, then let the host start when enough players are seated.</div>
        <div class="card-row lobby-launch-row">
          <button class="btn primary" data-action="create-lobby" data-game="snyd" data-public="0">Create Private Lobby</button>
          <button class="btn" data-action="create-lobby" data-game="snyd" data-public="1" ${publicDisabled}>Create Public Lobby</button>
          <button class="btn" data-action="browse-lobbies" data-game="snyd" ${publicDisabled}>Find Public Game</button>
        </div>
        ${guestRestricted ? '<div class="card-desc">Guest players can create and join private lobbies with room codes. Public lobby discovery requires login.</div>' : ''}
      </div>
      <div class="card">
        <div class="card-title">Join By Code</div>
        <div class="card-desc">Paste a six-character invite code from the party leader.</div>
        <div class="card-row lobby-join-row">
          <input class="input" id="joinCodeInput" maxlength="6" placeholder="ABC123" />
          <button class="btn primary" data-action="join-by-code">Join Lobby</button>
        </div>
      </div>
      ${gameCard('single.card.highest.wins', 'Backend-ready quickplay for the High Card prototype.', 'action.open')}
    </div>
  `;
}

function gameCard(titleKey: string, desc: string, actionKey: string) {
    return `
    <div class="card">
      <div class="card-title" data-i18n="${titleKey}"></div>
      <div class="card-desc">${desc}</div>
      <div class="card-row">
        <span class="pill">Status: Prototype</span>
        <button class="btn primary" data-i18n="${actionKey}" data-action="open-game" data-game="${titleKey}"></button>
      </div>
    </div>
  `;
}

function wireEvents() {
    document.getElementById('burgerBtn')?.addEventListener('click', () => {
        state.sidebarCollapsed = !state.sidebarCollapsed;
        renderApp();
    });

    document.querySelectorAll<HTMLElement>('.nav-item').forEach((el) => {
        const view = el.dataset.view as View | undefined;
        if (!view) return;

        const go = () => {
            navigate({ view, ...(view !== 'lobby' ? { room: null } : {}) });
        };

        el.addEventListener('click', go);
        el.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                go();
            }
        });
    });

    document.getElementById('goHome')?.addEventListener('click', (event) => {
        event.preventDefault();
        navigate({ view: 'home', room: null, game: null });
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
                token: getOrCreateGuestPlayer().playerId,
                mock: true,
            });
        });
    });

    document.querySelectorAll<HTMLButtonElement>('button[data-action="create-lobby"]').forEach((btn) => {
        btn.addEventListener('click', () => {
            void handleCreateLobby(btn.dataset.game ?? 'snyd', btn.dataset.public === '1');
        });
    });

    document.querySelector('button[data-action="browse-lobbies"]')?.addEventListener('click', () => {
        const player = getActivePlayer();
        if (player?.isGuest) {
            state.lobbyError = 'Guests can only join private lobbies by room code.';
            renderApp();
            return;
        }
        navigate({ view: 'lobby-browser', game: 'snyd', room: null, token: player?.playerId ?? null, mock: false });
    });

    document.querySelector('button[data-action="join-by-code"]')?.addEventListener('click', () => {
        const joinCodeInput = document.getElementById('joinCodeInput') as HTMLInputElement | null;
        void handleJoinByCode(joinCodeInput?.value ?? '');
    });

    document.getElementById('loginBtn')?.addEventListener('click', () => {
        window.history.pushState({}, '', '/login');
        renderApp();
    });

    document.getElementById('signupBtn')?.addEventListener('click', () => alert('(Placeholder) Opret konto'));
    document.getElementById('profileBtn')?.addEventListener('click', () => {
        const player = getActivePlayer();
        alert(player ? `${player.displayName}\n${player.email ?? (player.isGuest ? 'Guest account' : '')}` : 'Not logged in');
    });

    wireLobbyEvents();
}

function wireLobbyEvents() {
    if (state.view === 'lobby') {
        document.querySelector('button[data-action="copy-invite"]')?.addEventListener('click', async () => {
            const button = document.querySelector<HTMLButtonElement>('button[data-action="copy-invite"]');
            const link = button?.dataset.link;
            if (!link) return;
            await navigator.clipboard.writeText(link);
        });

        document.querySelector('button[data-action="join-lobby"]')?.addEventListener('click', () => {
            if (!state.lobbyRoom) return;
            void handleJoinByCode(state.lobbyRoom.roomCode);
        });

        document.querySelector('button[data-action="toggle-visibility"]')?.addEventListener('click', () => {
            void mutateLobby(async () => {
                const player = getActivePlayer();
                if (!player || !state.lobbyRoom || player.isGuest) return null;
                return updateLobby(state.lobbyRoom.roomCode, {
                    actorPlayerId: player.playerId,
                    isPublic: !state.lobbyRoom.isPublic,
                });
            });
        });

        document.querySelector('button[data-action="start-game"]')?.addEventListener('click', () => {
            void handleStartGame();
        });

        document.querySelector('button[data-action="enter-game"]')?.addEventListener('click', () => {
            enterGameBoard();
        });

        document.querySelectorAll<HTMLButtonElement>('button[data-action="kick-player"]').forEach((button) => {
            button.addEventListener('click', () => {
                const playerId = button.dataset.playerId;
                if (!playerId) return;
                void mutateLobby(async () => {
                    const player = getActivePlayer();
                    if (!player || !state.lobbyRoom) return null;
                    return updateLobby(state.lobbyRoom.roomCode, {
                        actorPlayerId: player.playerId,
                        kickPlayerId: playerId,
                    });
                });
            });
        });
    }

    if (state.view === 'lobby-browser') {
        document.getElementById('browserGameFilter')?.addEventListener('change', (event) => {
            const target = event.target as HTMLSelectElement;
            navigate({ view: 'lobby-browser', game: target.value || null, room: null });
        });

        document.querySelector('button[data-action="refresh-browser"]')?.addEventListener('click', () => {
            void loadLobbyBrowser();
        });

        document.querySelectorAll<HTMLButtonElement>('button[data-action="open-public-lobby"]').forEach((button) => {
            button.addEventListener('click', () => {
                navigate({
                    view: 'lobby',
                    room: button.dataset.room ?? null,
                    game: button.dataset.game ?? null,
                    token: getActivePlayer()?.playerId ?? null,
                    mock: false,
                });
            });
        });
    }

    if (state.view !== 'room') return;

    if (!roomSession) return;

    document.querySelectorAll<HTMLButtonElement>('button[data-action="toggle-card"]').forEach((button) => {
        button.addEventListener('click', () => {
            const card = button.dataset.card;
            if (!card) return;
            roomSession?.toggleCard(card);
        });
    });

    document.querySelector<HTMLButtonElement>('button[data-action="play-selected"]')?.addEventListener('click', () => {
        const claimRankInput = document.getElementById('claimRankInput') as HTMLInputElement | null;
        const claimRank = claimRankInput?.value.trim().toUpperCase() || 'A';
        roomSession?.sendIntent({ type: 'PLAY_SELECTED', claimRank });
    });

    document.querySelector<HTMLButtonElement>('button[data-action="call-snyd"]')?.addEventListener('click', () => {
        roomSession?.sendIntent({ type: 'CALL_SNYD' });
    });
}

async function handleCreateLobby(gameId: string, isPublic: boolean) {
    const user = await ensurePlayerIdentity();
    if (!user) return;

    await mutateLobby(async () => {
        const room = await createLobby({
            playerId: user.playerId,
            displayName: user.displayName,
            gameId,
            isPublic: user.isGuest ? false : isPublic,
        });
        navigate({
            view: 'lobby',
            room: room.roomCode,
            game: room.gameId,
            token: user.playerId,
            mock: room.mock ?? false,
        });
        return room;
    });
}

async function handleJoinByCode(roomCode: string) {
    const user = await ensurePlayerIdentity();
    if (!user) return;

    const normalizedCode = roomCode.trim().toUpperCase();
    if (!normalizedCode) {
        state.lobbyError = 'Enter a room code first.';
        renderApp();
        return;
    }

    await mutateLobby(async () => {
        const room = await joinLobby(normalizedCode, {
            playerId: user.playerId,
            displayName: user.displayName,
        });
        navigate({
            view: 'lobby',
            room: room.roomCode,
            game: room.gameId,
            token: user.playerId,
            mock: room.mock ?? false,
        });
        return room;
    });
}

async function handleStartGame() {
    const user = await ensurePlayerIdentity();
    if (!user || !state.lobbyRoom) return;

    await mutateLobby(async () => {
        const room = await startLobby(state.lobbyRoom?.roomCode ?? '', user.playerId);
        state.lobbyRoom = room;
        enterGameBoard();
        return room;
    });
}

function enterGameBoard() {
    if (!state.lobbyRoom) return;
    navigate({
        view: 'room',
        room: state.lobbyRoom.roomCode,
        game: state.lobbyRoom.gameId,
        token: getActivePlayer()?.playerId ?? null,
        mock: state.lobbyRoom.mock ?? false,
    });
}

async function mutateLobby(run: () => Promise<LobbyRoom | null>) {
    state.lobbyBusy = true;
    state.lobbyError = null;
    renderApp();

    try {
        const room = await run();
        if (room) {
            state.lobbyRoom = room;
        }
    } catch (error) {
        state.lobbyError = toMessage(error);
    } finally {
        state.lobbyBusy = false;
        renderApp();
    }
}

async function refreshAuthUser() {
    state.authLoading = true;
    renderApp();

    const { data } = await supabase.auth.getUser();
    const user = data.user;

    if (!user) {
        state.authUser = null;
        state.authLoading = false;
        renderApp();
        return;
    }

    const displayName = readDisplayName(user);
    state.authUser = {
        playerId: user.id,
        displayName,
        email: user.email ?? null,
    };
    state.authLoading = false;
    renderApp();
}

async function ensurePlayerIdentity(): Promise<PlayerIdentity | null> {
    if (state.authLoading) {
        await refreshAuthUser();
    }
    return getOrCreateGuestPlayer();
}

async function ensureGameCatalog() {
    if (state.lobbyGames.length > 0) return;
    try {
        state.lobbyGames = await listGames();
        renderApp();
    } catch (error) {
        state.lobbyError = toMessage(error);
        renderApp();
    }
}

async function refreshDataForRoute() {
    await ensureGameCatalog();

    if (state.view === 'lobby' && state.route.room) {
        await loadLobby(state.route.room);
        return;
    }

    if (state.view === 'lobby-browser') {
        await loadLobbyBrowser();
    }
}

async function loadLobby(roomCode: string) {
    state.lobbyLoading = true;
    state.lobbyError = null;
    renderApp();

    try {
        state.lobbyRoom = await getLobby(roomCode);
    } catch (error) {
        state.lobbyRoom = null;
        state.lobbyError = toMessage(error);
    } finally {
        state.lobbyLoading = false;
        renderApp();
    }
}

async function loadLobbyBrowser() {
    state.browserLoading = true;
    state.lobbyError = null;
    renderApp();

    try {
        state.lobbyBrowser = await listPublicLobbies();
    } catch (error) {
        state.lobbyError = toMessage(error);
    } finally {
        state.browserLoading = false;
        renderApp();
    }
}

export function navigate(patch: Partial<AppRoute> | string) {
    if (typeof patch === 'string') {
        window.history.pushState({}, '', patch);
        syncStateFromRoute();
        void refreshDataForRoute();
        renderApp();
        return;
    }

    writeRoute(patch);
    syncStateFromRoute();
    void refreshDataForRoute();
    renderApp();
}

function syncStateFromRoute() {
    state.route = readRoute();
    state.view = state.route.view;
}

function syncPolling() {
    if (pollingHandle !== null) {
        window.clearInterval(pollingHandle);
        pollingHandle = null;
    }

    if (state.view === 'lobby' && state.route.room) {
        pollingHandle = window.setInterval(() => {
            void loadLobby(state.route.room ?? '');
        }, LOBBY_POLL_MS);
    } else if (state.view === 'lobby-browser') {
        pollingHandle = window.setInterval(() => {
            void loadLobbyBrowser();
        }, LOBBY_POLL_MS);
    }
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

function getActivePlayer(): PlayerIdentity | null {
    if (state.authUser) {
        return {
            ...state.authUser,
            isGuest: false,
        };
    }

    return readGuestPlayer();
}

function getOrCreateGuestPlayer(): PlayerIdentity {
    const existing = getActivePlayer();
    if (existing) {
        return existing;
    }

    const guestId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? `guest-${crypto.randomUUID()}`
        : `guest-${randomToken()}`;
    const suffix = guestId.slice(-4).toUpperCase();
    const guest: PlayerIdentity = {
        playerId: guestId,
        displayName: `Guest ${suffix}`,
        email: null,
        isGuest: true,
    };
    localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(guest));
    return guest;
}

function readGuestPlayer(): PlayerIdentity | null {
    const raw = localStorage.getItem(GUEST_STORAGE_KEY);
    if (!raw) {
        return null;
    }

    try {
        const parsed = JSON.parse(raw) as Partial<PlayerIdentity>;
        if (typeof parsed.playerId !== 'string' || typeof parsed.displayName !== 'string') {
            return null;
        }
        return {
            playerId: parsed.playerId,
            displayName: parsed.displayName,
            email: null,
            isGuest: true,
        };
    } catch {
        return null;
    }
}

function readDisplayName(user: { email?: string | null; user_metadata?: { [key: string]: unknown } }): string {
    const meta = user.user_metadata ?? {};
    const fromMeta = meta.full_name ?? meta.name ?? meta.username;
    if (typeof fromMeta === 'string' && fromMeta.trim().length > 0) {
        return fromMeta.trim();
    }
    if (typeof user.email === 'string' && user.email.length > 0) {
        return user.email;
    }
    return 'Anonymous Player';
}

function toMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return 'Something went wrong.';
}

function escapeHtml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

window.addEventListener('popstate', () => {
    syncStateFromRoute();
    void refreshDataForRoute();
    renderApp();
});

syncStateFromRoute();
renderApp();
