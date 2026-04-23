import { isSupabaseConfigured, supabase } from './supabase.js';
import { t, type Lang } from './i18n.js';

interface ProfileData {
    username: string;
    email: string;
    country: string;
    avatarColor: string;
    avatarShape: string;
    isLive: boolean;
}

const placeholderProfile: ProfileData = {
    username: 'BodegaSpiller',
    email: 'spiller@bodegadk.dk',
    country: 'Danmark',
    avatarColor: '#ffb300',
    avatarShape: 'circle',
    isLive: false,
};

export async function loadProfileData(): Promise<ProfileData> {
    if (!isSupabaseConfigured || !supabase) {
        return placeholderProfile;
    }

    const { data } = await supabase.auth.getUser();
    const user = data.user;

    if (!user) {
        return placeholderProfile;
    }

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

    return {
        username: profile?.username ?? '—',
        email: user.email ?? '—',
        country: profile?.country ?? '—',
        avatarColor: avatar?.avatar_color ?? '',
        avatarShape: avatar?.avatar_shape ?? 'square',
        isLive: true,
    };
}

export function renderProfilePage(lang: Lang, data: ProfileData): string {
    const borderRadius = data.avatarShape === 'circle' ? '50%' : '8px';
    const avatarHtml = data.avatarColor
        ? `<div class="avatar profile-hero-avatar" style="background:${data.avatarColor};border-radius:${borderRadius}"></div>`
        : `<div class="avatar profile-hero-avatar profile-avatar-empty"></div>`;

    return `
    <section class="profile-layout">
      ${!data.isLive ? `<div class="profile-demo-badge" data-i18n="profile.demo"></div>` : ''}

      <section class="card profile-hero-card">
        <div class="profile-hero">
          ${avatarHtml}
          <div class="profile-hero-info">
            <h1 class="profile-hero-name">${escapeHtml(data.username)}</h1>
            <p class="profile-hero-sub">${escapeHtml(data.email)}</p>
          </div>
        </div>
        <div class="profile-hero-actions">
          <button class="btn primary" data-action="profile-customize" data-i18n="profile.customize"></button>
          ${data.isLive ? `<button class="btn danger" data-action="profile-logout" data-i18n="profile.logout"></button>` : ''}
        </div>
      </section>

      <section class="profile-content-grid">
        <article class="card profile-section-card">
          <div class="profile-section-header">
            <p class="home-eyebrow" data-i18n="profile.section.info"></p>
            <div class="card-title" data-i18n="profile.section.infoTitle"></div>
          </div>
          <div class="profile-fields">
            <div class="profile-field">
              <span class="profile-label" data-i18n="auth.field.username"></span>
              <span class="profile-value">${escapeHtml(data.username)}</span>
            </div>
            <div class="profile-field">
              <span class="profile-label" data-i18n="auth.field.email"></span>
              <span class="profile-value">${escapeHtml(data.email)}</span>
            </div>
            <div class="profile-field">
              <span class="profile-label" data-i18n="auth.field.country"></span>
              <span class="profile-value">${escapeHtml(data.country)}</span>
            </div>
          </div>
        </article>

        <article class="card profile-section-card profile-placeholder-card" aria-disabled="true">
          <div class="profile-section-header">
            <div>
              <div class="card-title" data-i18n="profile.section.statsTitle"></div>
            </div>
            <span class="home-placeholder-tag" data-i18n="home.action.comingSoon"></span>
          </div>
          <p class="card-desc" data-i18n="profile.section.statsDesc"></p>
        </article>

        <article class="card profile-section-card profile-placeholder-card" aria-disabled="true">
          <div class="profile-section-header">
            <div>
              <div class="card-title" data-i18n="profile.section.historyTitle"></div>
            </div>
            <span class="home-placeholder-tag" data-i18n="home.action.comingSoon"></span>
          </div>
          <p class="card-desc" data-i18n="profile.section.historyDesc"></p>
        </article>

        <article class="card profile-section-card profile-placeholder-card" aria-disabled="true">
          <div class="profile-section-header">
            <div>
              <div class="card-title" data-i18n="profile.section.achievementsTitle"></div>
            </div>
            <span class="home-placeholder-tag" data-i18n="home.action.comingSoon"></span>
          </div>
          <p class="card-desc" data-i18n="profile.section.achievementsDesc"></p>
        </article>
      </section>
    </section>
  `;
}

function escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}