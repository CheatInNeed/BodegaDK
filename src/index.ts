import { applyI18n, getInitialLang, setLang, type Lang } from './i18n.js';

type View = 'home' | 'play' | 'settings' | 'help';

const state = {
    lang: getInitialLang() as Lang,
    view: 'play' as View,
    sidebarCollapsed: false,
};

function iconSvg(pathD: string) {
    return `
    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="${pathD}"></path>
    </svg>
  `;
}

function renderApp() {
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

    // Set language select UI
    const langSelect = document.getElementById('langSelect') as HTMLSelectElement | null;
    if (langSelect) langSelect.value = state.lang;

    // Apply translations
    applyI18n(app, state.lang);

    // Render view content
    renderView();

    // Wire events
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
        main.innerHTML = `
      <h1 class="h1" data-i18n="home.title"></h1>
      <p class="sub" data-i18n="home.subtitle"></p>
      ${playCards()}
    `;
    } else if (state.view === 'play') {
        main.innerHTML = `
      <h1 class="h1" data-i18n="play.title"></h1>
      <p class="sub" data-i18n="play.subtitle"></p>
      ${playCards()}
    `;
    } else if (state.view === 'settings') {
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
        main.innerHTML = `
      <h1 class="h1" data-i18n="nav.help"></h1>
      <div class="card">
        <p class="card-desc">
          (Placeholder) FAQ, regler for spil, kontakt, rapportér fejl osv.
        </p>
      </div>
    `;
    }

    applyI18n(document, state.lang);
}

function playCards() {
    return `
    <div class="grid">
      ${gameCard('game.cheat', 'Et klassisk bluff-spil (placeholder).', 'action.open')}
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
    // Burger
    const burgerBtn = document.getElementById('burgerBtn');
    burgerBtn?.addEventListener('click', () => {
        state.sidebarCollapsed = !state.sidebarCollapsed;
        renderApp();
    });

    // Nav items
    document.querySelectorAll<HTMLElement>('.nav-item').forEach((el) => {
        const view = el.dataset.view as View | undefined;
        if (!view) return;

        const go = () => {
            state.view = view;
            renderApp();
        };

        el.addEventListener('click', go);
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                go();
            }
        });
    });

    // Brand -> home
    const goHome = document.getElementById('goHome');
    goHome?.addEventListener('click', (e) => {
        e.preventDefault();
        state.view = 'home';
        renderApp();
    });

    // Language
    const langSelect = document.getElementById('langSelect') as HTMLSelectElement | null;
    langSelect?.addEventListener('change', () => {
        const next = langSelect.value === 'en' ? 'en' : 'da';
        state.lang = next;
        setLang(next);
        renderApp();
    });

    // Placeholder actions
    document.querySelectorAll<HTMLButtonElement>('button[data-action="open-game"]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const game = btn.dataset.game ?? 'unknown';
            alert(`(Placeholder) Åbner spil: ${game}`);
        });
    });

    document.getElementById('loginBtn')?.addEventListener('click', () => alert('(Placeholder) Login'));
    document.getElementById('signupBtn')?.addEventListener('click', () => alert('(Placeholder) Opret konto'));
    document.getElementById('profileBtn')?.addEventListener('click', () => alert('(Placeholder) Profil'));
}

renderApp();
