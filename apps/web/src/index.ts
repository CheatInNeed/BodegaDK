import { applyI18n, getInitialLang, setLang, type Lang } from './i18n.js';
import { readRoute, writeRoute, type AppRoute, type View } from './app/router.js';
import { createGameRoomSession } from './game-room/session.js';
import type { GameAdapter } from './game-room/types.js';
import { renderRoomError, renderRoomFrame } from './game-room/view.js';
import { snydAdapter } from './games/snyd/adapter.js';
import { renderSnydRoom } from './games/snyd/view.js';
import { casinoAdapter } from './games/casino/adapter.js';
import { renderCasinoRoom } from './games/casino/view.js';
import { highcardAdapter } from './games/highcard/adapter.js';
import { renderLogin } from './login.js';
import { renderSignup } from './signUp.js';
import { renderCustom } from './custom.js';
import { supabase } from './supabase.js';
import { renderSingleCardHighestWinsRoom } from './games/single-card-highest-wins/view.js';
import { createRoom, joinRoom } from './net/api.js';

type GenericAdapter = GameAdapter<Record<string, unknown>, Record<string, unknown>, unknown>;
const adapters: GenericAdapter[] = [snydAdapter as GenericAdapter, casinoAdapter as GenericAdapter, highcardAdapter as GenericAdapter];

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
let casinoSelectedStackIds: string[] = [];

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
    void updateAuthUI();
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
    let bodyHtml = '';
    if (adapter.id === casinoAdapter.id) {
        const casinoViewModel = viewModel as Parameters<typeof renderCasinoRoom>[0];
        const validStackIds = new Set(casinoViewModel.tableStacks.map((stack) => stack.stackId));
        casinoSelectedStackIds = casinoSelectedStackIds.filter((stackId) => validStackIds.has(stackId));
        bodyHtml = renderCasinoRoom(casinoViewModel, {
            disablePlay: disableByConnection || !casinoViewModel.isMyTurn || !casinoViewModel.selectedHandCard,
            disableBuild: disableByConnection || !casinoViewModel.isMyTurn || !casinoViewModel.selectedHandCard || casinoSelectedStackIds.length !== 1,
            selectedStackIds: casinoSelectedStackIds,
        });
    } else if (adapter.id === highcardAdapter.id) {
        bodyHtml = renderSingleCardHighestWinsRoom(viewModel as Parameters<typeof renderSingleCardHighestWinsRoom>[0]);
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

function cleanupRoomSession() {
    unsubscribeRoomSession?.();
    unsubscribeRoomSession = null;
    roomSession?.stop();
    roomSession = null;
    roomSessionKey = null;
    casinoSelectedStackIds = [];
}

function playCards() {
    return `
    <div class="grid">
      ${gameCard('game.cheat', 'Et klassisk bluff-spil (Snyd).', 'action.open')}
      ${gameCard('casino', '2-player Casino with capture sums and full deck.', 'action.open')}
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
            if (game === HIGHCARD_GAME_ID || game === 'casino') {
                void startRealtimeRoom(game);
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
}

async function updateAuthUI() {
    const loginBtn = document.getElementById('loginBtn') as HTMLButtonElement | null;
    const signupBtn = document.getElementById('signupBtn') as HTMLButtonElement | null;
    const profileBtn = document.getElementById('profileBtn') as HTMLButtonElement | null;
    const avatarDisplay = document.getElementById('avatarDisplay') as HTMLDivElement | null;

    if (!loginBtn || !signupBtn || !profileBtn) return;

    try {
        const { data } = await supabase.auth.getUser();
        const user = data.user;

        if (!user) {
            loginBtn.classList.remove('hidden');
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
        signupBtn.textContent = 'Customize player';
        signupBtn.onclick = () => navigate('/custom');
        profileBtn.textContent = 'Logout';
        profileBtn.onclick = async () => {
            await supabase.auth.signOut();
            navigate('/');
        };

        await loadAvatar(user.id, avatarDisplay);
    } catch (error) {
        console.error('Failed to sync auth UI', error);
    }
}

async function loadAvatar(userId: string, avatarDisplay: HTMLDivElement | null) {
    if (!avatarDisplay) return;

    const { data: avatar } = await supabase
        .from('avatars')
        .select('*')
        .eq('user_id', userId)
        .single();

    if (!avatar) {
        avatarDisplay.classList.add('hidden');
        avatarDisplay.style.background = '';
        return;
    }

    avatarDisplay.classList.remove('hidden');
    avatarDisplay.style.background = avatar.avatar_color ?? '';
    avatarDisplay.style.borderRadius = avatar.avatar_shape === 'circle' ? '50%' : '8px';
    avatarDisplay.style.cursor = 'default';
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
    if (game === 'casino') return 'casino';
    if (game === 'single.card.highest.wins') return HIGHCARD_GAME_ID;
    if (game === 'single-card-highest-wins') return HIGHCARD_GAME_ID;
    return game;
}

async function startRealtimeRoom(gameType: string) {
    try {
        const token = randomToken();
        const playerId = token;

        const { roomCode } = await createRoom({ gameType });
        const joined = await joinRoom({ roomCode, playerId, token });
        if (!joined.ok) {
            throw new Error('Join room returned not ok');
        }

        navigate({
            view: 'room',
            game: gameType,
            room: roomCode,
            token,
            mock: false,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        alert(`Failed to start ${gameType} room: ${message}`);
    }
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

window.addEventListener('popstate', () => {
    syncStateFromRoute();
    renderApp();
});

syncStateFromRoute();
renderApp();
