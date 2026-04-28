import { isSupabaseConfigured, supabase } from './supabase.js';
import { t, type Lang } from './i18n.js';
import { getMyMatches, type MyMatchSummary } from './net/api.js';

interface ProfileData {
    username: string;
    email: string;
    country: string;
    avatarColor: string;
    avatarShape: string;
    isLive: boolean;
    recentMatches: MyMatchSummary[];
    historyError: boolean;
}

const placeholderProfile: ProfileData = {
    username: 'BodegaSpiller',
    email: 'spiller@bodegadk.dk',
    country: 'Danmark',
    avatarColor: '#ffb300',
    avatarShape: 'circle',
    isLive: false,
    recentMatches: [],
    historyError: false,
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
        .eq('user_id', user.id)
        .single();

    const { data: avatar } = await supabase
        .from('user_avatars')
        .select('color, avatar_defs(shape)')
        .eq('user_id', user.id)
        .single();

    let recentMatches: MyMatchSummary[] = [];
    let historyError = false;
    try {
        recentMatches = (await getMyMatches({ limit: 20 })).items;
    } catch (error) {
        historyError = true;
        console.warn('[profile] failed to load match history', error);
    }

    return {
        username: profile?.username ?? '---',
        email: user.email ?? '---',
        country: profile?.country ?? '---',
        avatarColor: avatar?.color ?? '',
        avatarShape: avatar?.avatar_defs?.shape ?? 'square',
        isLive: true,
        recentMatches,
        historyError,
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

        <article class="card profile-section-card">
          <div class="profile-section-header">
            <div>
              <div class="card-title" data-i18n="profile.section.historyTitle"></div>
            </div>
          </div>
          ${renderRecentMatches(lang, data)}
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

function renderRecentMatches(lang: Lang, data: ProfileData): string {
    if (data.historyError) {
        return `<p class="card-desc" data-i18n="profile.section.historyError"></p>`;
    }

    if (data.recentMatches.length === 0) {
        return `<p class="card-desc" data-i18n="profile.section.historyEmpty"></p>`;
    }

    return `
    <div class="profile-match-list">
      ${data.recentMatches.map((match) => renderMatchRow(lang, match)).join('')}
    </div>
  `;
}

function renderMatchRow(lang: Lang, match: MyMatchSummary): string {
    const result = match.currentUser.result ?? match.resultType ?? 'DRAW';
    const resultClass = result.toLowerCase();
    const scoreText = typeof match.currentUser.score === 'number'
        ? `<span>${escapeHtml(t(lang, 'profile.match.score'))}: ${match.currentUser.score}</span>`
        : '';
    const opponents = match.players
        .filter((player) => player.userId !== match.currentUser.userId)
        .map((player) => player.username || player.userId)
        .join(', ');
    const opponentText = opponents || t(lang, 'profile.match.noOpponent');
    const dateText = formatMatchDate(lang, match.endedAt ?? match.startedAt);

    return `
    <div class="profile-match-row">
      <div>
        <div class="profile-match-title">${escapeHtml(match.game.title || match.game.slug)}</div>
        <div class="profile-match-meta">${escapeHtml(dateText)} - ${escapeHtml(opponentText)}</div>
      </div>
      <div class="profile-match-result">
        <span class="profile-match-badge profile-match-badge-${escapeHtml(resultClass)}">${escapeHtml(formatResult(lang, result))}</span>
        ${scoreText}
      </div>
    </div>
  `;
}

function formatResult(lang: Lang, result: string): string {
    const key = `profile.match.result.${result.toLowerCase()}`;
    return t(lang, key);
}

function formatMatchDate(lang: Lang, value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return new Intl.DateTimeFormat(lang === 'da' ? 'da-DK' : 'en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    }).format(date);
}

function escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
