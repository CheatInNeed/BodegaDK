import { navigate } from './index.js';
import { isSupabaseConfigured, supabase, supabaseUnavailableMessage } from './supabase.js';
import { applyI18n, getInitialLang, t, type Lang } from './i18n.js';

export async function renderProfile() {
    const app = document.getElementById('app');
    if (!app) return;

    const lang = getInitialLang();

    if (!isSupabaseConfigured || !supabase) {
        app.innerHTML = `
        <div class="auth-page">
          <div class="card auth-card">
            <h1 class="card-title" data-i18n="profile.title">${t(lang, 'profile.title')}</h1>
            <p class="card-desc">${supabaseUnavailableMessage}</p>
            <button class="btn primary full" id="profileBackBtn" data-i18n="profile.back">${t(lang, 'profile.back')}</button>
          </div>
        </div>`;
        document.getElementById('profileBackBtn')?.addEventListener('click', () => navigate('/'));
        return;
    }

    const { data } = await supabase.auth.getUser();
    const user = data.user;

    if (!user) {
        app.innerHTML = `
        <div class="auth-page">
          <div class="card auth-card">
            <h1 class="card-title" data-i18n="profile.title">${t(lang, 'profile.title')}</h1>
            <p class="card-desc" data-i18n="profile.notLoggedIn">${t(lang, 'profile.notLoggedIn')}</p>
            <div class="profile-actions">
              <button class="btn primary" id="profileLoginBtn" data-i18n="top.login">${t(lang, 'top.login')}</button>
              <button class="btn" id="profileBackBtn" data-i18n="profile.back">${t(lang, 'profile.back')}</button>
            </div>
          </div>
        </div>`;
        document.getElementById('profileLoginBtn')?.addEventListener('click', () => navigate('/login'));
        document.getElementById('profileBackBtn')?.addEventListener('click', () => navigate('/'));
        return;
    }

    // Load profile data
    const { data: profile } = await supabase
        .from('profiles')
        .select('username, country')
        .eq('id', user.id)
        .single();

    const { data: avatar } = await supabase
        .from('avatars')
        .select('avatar_color, avatar_shape')
        .eq('user_id', user.id)
        .single();

    const username = profile?.username ?? '—';
    const country = profile?.country ?? '—';
    const email = user.email ?? '—';
    const avatarColor = avatar?.avatar_color ?? '';
    const avatarShape = avatar?.avatar_shape ?? 'square';
    const borderRadius = avatarShape === 'circle' ? '50%' : '8px';

    app.innerHTML = `
    <div class="auth-page">
      <div class="card auth-card profile-card">
        <div class="profile-header">
          ${avatarColor
              ? `<div class="avatar profile-avatar" style="background:${avatarColor};border-radius:${borderRadius}"></div>`
              : `<div class="avatar profile-avatar profile-avatar-empty"></div>`
          }
          <h1 class="card-title">${escapeHtml(username)}</h1>
        </div>

        <div class="profile-fields">
          <div class="profile-field">
            <span class="profile-label" data-i18n="auth.field.email">${t(lang, 'auth.field.email')}</span>
            <span class="profile-value">${escapeHtml(email)}</span>
          </div>
          <div class="profile-field">
            <span class="profile-label" data-i18n="auth.field.username">${t(lang, 'auth.field.username')}</span>
            <span class="profile-value">${escapeHtml(username)}</span>
          </div>
          <div class="profile-field">
            <span class="profile-label" data-i18n="auth.field.country">${t(lang, 'auth.field.country')}</span>
            <span class="profile-value">${escapeHtml(country)}</span>
          </div>
        </div>

        <div class="profile-actions">
          <button class="btn" id="profileCustomizeBtn" data-i18n="profile.customize">${t(lang, 'profile.customize')}</button>
          <button class="btn danger" id="profileLogoutBtn" data-i18n="profile.logout">${t(lang, 'profile.logout')}</button>
          <button class="btn" id="profileBackBtn" data-i18n="profile.back">${t(lang, 'profile.back')}</button>
        </div>
      </div>
    </div>`;

    applyI18n(app, lang);
    wireProfileEvents();
}

function wireProfileEvents() {
    document.getElementById('profileCustomizeBtn')?.addEventListener('click', () => navigate('/custom'));
    document.getElementById('profileLogoutBtn')?.addEventListener('click', async () => {
        if (!supabase) return;
        await supabase.auth.signOut();
        navigate('/');
    });
    document.getElementById('profileBackBtn')?.addEventListener('click', () => navigate('/'));
}

function escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}