import { getInitialLang } from './i18n.js';
import { supabase } from './supabase.js';
import { renderLogin } from './login.js';
import { renderSignup } from './signUp.js';
import { renderCustom } from './custom.js';
const state = {
    lang: getInitialLang(),
    view: 'play',
    sidebarCollapsed: false,
};
export function navigate(path) {
    window.location.hash = path;
    renderApp();
}
/* =========================
   ROUTER
========================= */
function renderApp() {
    const path = window.location.hash.replace('#', '') || '/';
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
    renderShell();
}
window.addEventListener('hashchange', renderApp);
/* =========================
   SHELL (header + sidebar)
========================= */
async function renderShell() {
    const app = document.getElementById('app');
    if (!app)
        return;
    app.innerHTML = `
    <div class="shell ${state.sidebarCollapsed ? 'collapsed' : ''}">
      <header class="topbar">
        <a class="brand" href="/" id="goHome">
          <div class="logo"></div>
          <span>BOGEDADK</span>
        </a>

        <div class="topbar-right">
          <select class="select" id="langSelect">
            <option value="da">DA</option>
            <option value="en">EN</option>
          </select>
          
          <div id="avatarDisplay" class="avatar small"></div>

          <button class="btn" id="loginBtn">Log ind</button>
          <button class="btn primary" id="signupBtn">Opret konto</button>
          <button class="btn" id="profileBtn">Profile</button>
        </div>
      </header>

      <aside class="sidebar">
        <div class="sidebar-header">
          <div class="sidebar-title pill">Menu</div>
          <button class="burger" id="burgerBtn">☰</button>
        </div>

        <nav class="nav">
          ${navItem('play', 'Spil')}
          ${navItem('settings', 'Indstillinger')}
          ${navItem('help', 'Hjælp')}
        </nav>
      </aside>

      <main class="main" id="main"></main>
    </div>
  `;
    renderView();
    wireEvents();
    updateAuthUI();
}
/* =========================
   VIEW RENDERING
========================= */
function renderView() {
    const main = document.getElementById('main');
    if (!main)
        return;
    main.innerHTML = `
        <h1 class="h1">PLAY</h1>
        ${playCards()}
    `;
}
function playCards() {
    return `
    <div class="grid">
      ${gameCard('Cheat')}
      ${gameCard('500')}
      ${gameCard('Dice')}
      ${gameCard('More')}
    </div>
  `;
}
function gameCard(title) {
    return `
    <div class="card">
      <div class="card-title">${title}</div>
      <div class="card-row">
        <span class="pill">Placeholder</span>
        <button class="btn primary">Open</button>
      </div>
    </div>
  `;
}
/* =========================
   AUTH UI
========================= */
async function updateAuthUI() {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    const loginBtn = document.getElementById('loginBtn');
    const signupBtn = document.getElementById('signupBtn');
    const profileBtn = document.getElementById('profileBtn');
    if (!loginBtn || !signupBtn || !profileBtn)
        return;
    if (user) {
        // 🔥 LOGGED IN
        loginBtn.classList.add('hidden');
        signupBtn.textContent = 'Customize player';
        signupBtn.onclick = () => navigate('/custom');
        profileBtn.textContent = 'Logout';
        profileBtn.onclick = async () => {
            await supabase.auth.signOut();
            navigate('/');
        };
        // 🔥 LOAD AVATAR
        loadAvatar();
    }
    else {
        // 🔥 LOGGED OUT
        loginBtn.classList.remove('hidden');
        loginBtn.onclick = () => navigate('/login');
        signupBtn.textContent = 'Opret konto';
        signupBtn.onclick = () => navigate('/signup');
        profileBtn.textContent = 'Profile';
        profileBtn.onclick = () => {
            alert('You are not logged in.');
        };
    }
}
/* =========================
   LOAD AVATAR
========================= */
async function loadAvatar() {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user)
        return;
    const { data: avatar } = await supabase
        .from('avatars')
        .select('*')
        .eq('user_id', user.id)
        .single();
    if (!avatar)
        return;
    const el = document.getElementById('avatarDisplay');
    if (!el)
        return;
    el.style.background = avatar.avatar_color;
    if (avatar.avatar_shape === 'circle') {
        el.style.borderRadius = '50%';
    }
    else {
        el.style.borderRadius = '6px';
    }
}
/* =========================
   EVENTS
========================= */
function wireEvents() {
    document.getElementById('burgerBtn')?.addEventListener('click', () => {
        state.sidebarCollapsed = !state.sidebarCollapsed;
        renderShell();
    });
    document.getElementById('goHome')?.addEventListener('click', (e) => {
        e.preventDefault();
        navigate('/');
    });
}
function navItem(view, label) {
    return `<div class="nav-item">${label}</div>`;
}
renderApp();
