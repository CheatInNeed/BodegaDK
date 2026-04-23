import { navigate } from './index.js';
import { isSupabaseConfigured, supabase } from './supabase.js';
import { applyI18n, getInitialLang, t } from './i18n.js';

export async function renderProfile() {
    const app = document.getElementById('app');
    if (!app) return;

    const lang = getInitialLang();

    let username = 'BodegaSpiller';
    let email = 'spiller@bodegadk.dk';
    let country = 'Danmark';
    let avatarColor = '#ffb300';
    let avatarShape = 'circle';
    let isLive = false;

    if (isSupabaseConfigured && supabase) {
        const { data } = await supabase.auth.getUser();
        const user = data.user;

        if (user) {
            isLive = true;

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

            username = profile?.username ?? '—';
            country = profile?.country ?? '—';
            email = user.email ?? '—';
            avatarColor = avatar?.avatar_color ?? '';
            avatarShape = avatar?.avatar_shape ?? 'square';
        }
    }

    const borderRadius = avatarShape === 'circle' ? '50%' : '8px';

    app.innerHTML = `
    <div class="auth-page">
      <div class="card auth-card profile-card">
        ${!isLive ? `<div class="profile-demo-badge" data-i18n="profile.demo">${t(lang, 'profile.demo')}</div>` : ''}
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
          ${isLive ? `<button class="btn danger" id="profileLogoutBtn" data-i18n="profile.logout">${t(lang, 'profile.logout')}</button>` : ''}
          <button class="btn" id="profileBackBtn" data-i18n="profile.back">${t(lang, 'profile.back')}</button>
        </div>
      </div>
    </div>`;

    applyI18n(app, lang);
    wireProfileEvents(isLive);
}

function wireProfileEvents(isLive: boolean) {
    document.getElementById('profileCustomizeBtn')?.addEventListener('click', () => navigate('/custom'));
    if (isLive) {
        document.getElementById('profileLogoutBtn')?.addEventListener('click', async () => {
            if (!supabase) return;
            await supabase.auth.signOut();
            navigate('/');
        });
    }
    document.getElementById('profileBackBtn')?.addEventListener('click', () => navigate('/'));
}

function escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}