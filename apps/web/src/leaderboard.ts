import { t, type Lang } from './i18n.js';
import type { LeaderboardResponse } from './net/api.js';

export type LeaderboardViewState = {
    loading: boolean;
    errorMessage: string | null;
    data: LeaderboardResponse | null;
    game: string;
};

export function renderLeaderboardPage(lang: Lang, state: LeaderboardViewState): string {
    const gameTitle = state.data?.game.title ?? 'Snyd';
    const currentUser = state.data?.currentUser
        ? `<p class="leaderboard-current">${escapeHtml(t(lang, 'leaderboard.currentUser'))}: #${state.data.currentUser.rank} - ${state.data.currentUser.score}</p>`
        : '';

    return `
    <section class="leaderboard-layout">
      <section class="card leaderboard-hero">
        <div>
          <p class="home-eyebrow" data-i18n="leaderboard.kicker"></p>
          <h1 class="h1" data-i18n="leaderboard.title"></h1>
          <p class="sub" data-i18n="leaderboard.subtitle"></p>
        </div>
        <label class="leaderboard-filter" for="leaderboardGameSelect">
          <span data-i18n="leaderboard.game"></span>
          <select class="select" id="leaderboardGameSelect">
            <option value="snyd" ${state.game === 'snyd' ? 'selected' : ''}>Snyd</option>
          </select>
        </label>
      </section>

      <section class="card leaderboard-card">
        <div class="leaderboard-card-header">
          <div>
            <div class="card-title">${escapeHtml(gameTitle)}</div>
            <p class="card-desc" data-i18n="leaderboard.scoreHelp"></p>
          </div>
          ${currentUser}
        </div>
        ${renderLeaderboardBody(lang, state)}
      </section>
    </section>
  `;
}

function renderLeaderboardBody(lang: Lang, state: LeaderboardViewState): string {
    if (state.loading) {
        return `<p class="card-desc" data-i18n="leaderboard.loading"></p>`;
    }

    if (state.errorMessage) {
        return `<p class="card-desc leaderboard-error">${escapeHtml(state.errorMessage)}</p>`;
    }

    if (!state.data || state.data.items.length === 0) {
        return `<p class="card-desc" data-i18n="leaderboard.empty"></p>`;
    }

    return `
    <div class="leaderboard-list">
      ${state.data.items.map((entry) => {
        const avatarStyle = entry.avatar.color
            ? `style="background:${escapeHtml(entry.avatar.color)};border-radius:${entry.avatar.shape === 'circle' ? '50%' : '8px'}"`
            : '';
        return `
        <div class="leaderboard-row">
          <div class="leaderboard-rank">#${entry.rank}</div>
          <div class="avatar leaderboard-avatar" ${avatarStyle}></div>
          <div class="leaderboard-player">
            <div class="leaderboard-name">${escapeHtml(entry.displayName || entry.username || entry.userId)}</div>
            <div class="leaderboard-username">${escapeHtml(entry.username || entry.userId)}</div>
          </div>
          <div class="leaderboard-score">
            <span>${entry.score}</span>
            <small data-i18n="leaderboard.scoreLabel"></small>
          </div>
        </div>
      `;
    }).join('')}
    </div>
  `;
}

function escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
