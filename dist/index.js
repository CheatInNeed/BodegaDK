import { getInitialLang } from './i18n.js';
import { supabase } from './supabase.js';
import { renderLogin } from './login.js';
const state = {
    lang: getInitialLang(),
    view: 'play',
    sidebarCollapsed: false,
};
function navigate(path) {
    window.history.pushState({}, '', path);
    renderApp();
}
/* =========================
   ROUTER
========================= */
function renderApp() {
    const path = window.location.pathname;
    if (path === '/login') {
        renderLogin();
        return;
    }
    renderShell();
}
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
        loginBtn.classList.add('hidden');
        signupBtn.classList.add('hidden');
        profileBtn.textContent = 'Logout';
        profileBtn.onclick = async () => {
            await supabase.auth.signOut();
            navigate('/');
        };
    }
    else {
        loginBtn.classList.remove('hidden');
        signupBtn.classList.remove('hidden');
        loginBtn.onclick = () => navigate('/login');
        signupBtn.onclick = async () => {
            const email = prompt("Email:");
            const password = prompt("Password:");
            if (!email || !password)
                return;
            const { error } = await supabase.auth.signUp({ email, password });
            if (error)
                alert(error.message);
            else
                alert("Account created.");
        };
        profileBtn.onclick = () => {
            alert('You are not logged in.');
        };
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
window.addEventListener('popstate', renderApp);
renderApp();
