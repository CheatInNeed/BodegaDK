import { isSupabaseConfigured, supabase } from './supabase.js';
import { t, type Lang } from './i18n.js';
import {
    getFriendRequests,
    getFriends,
    getMyMatches,
    getMyStats,
    type FriendRequestsResponse,
    type FriendshipSummary,
    type MyGameStatsSummary,
    type MyMatchSummary,
} from './net/api.js';

interface ProfileData {
    userId: string | null;
    username: string;
    email: string;
    country: string;
    avatarColor: string;
    avatarShape: string;
    isLive: boolean;
    gameStats: MyGameStatsSummary[];
    statsError: boolean;
    recentMatches: MyMatchSummary[];
    historyError: boolean;
    friends: FriendshipSummary[];
    friendRequests: FriendRequestsResponse;
    friendsError: boolean;
}

const placeholderProfile: ProfileData = {
    userId: null,
    username: 'BodegaSpiller',
    email: 'spiller@bodegadk.dk',
    country: 'Danmark',
    avatarColor: '#ffb300',
    avatarShape: 'circle',
    isLive: false,
    gameStats: [],
    statsError: false,
    recentMatches: [],
    historyError: false,
    friends: [],
    friendRequests: { incoming: [], outgoing: [] },
    friendsError: false,
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

    let gameStats: MyGameStatsSummary[] = [];
    let statsError = false;
    try {
        gameStats = (await getMyStats()).items;
    } catch (error) {
        statsError = true;
        console.warn('[profile] failed to load game stats', error);
    }

    let recentMatches: MyMatchSummary[] = [];
    let historyError = false;
    try {
        recentMatches = (await getMyMatches({ limit: 20 })).items;
    } catch (error) {
        historyError = true;
        console.warn('[profile] failed to load match history', error);
    }

    let friends: FriendshipSummary[] = [];
    let friendRequests: FriendRequestsResponse = { incoming: [], outgoing: [] };
    let friendsError = false;
    try {
        [friends, friendRequests] = await Promise.all([
            getFriends(),
            getFriendRequests(),
        ]);
    } catch (error) {
        friendsError = true;
        console.warn('[profile] failed to load friends', error);
    }

    return {
        userId: user.id,
        username: profile?.username ?? '---',
        email: user.email ?? '---',
        country: profile?.country ?? '---',
        avatarColor: avatar?.color ?? '',
        avatarShape: avatar?.avatar_defs?.shape ?? 'square',
        isLive: true,
        gameStats,
        statsError,
        recentMatches,
        historyError,
        friends,
        friendRequests,
        friendsError,
    };
}

export type ProfileFriendUiState = {
    addUsername: string;
    sending: boolean;
    busyFriendshipId: string | null;
    busyChallengeUserId: string | null;
    errorMessage: string | null;
};

export function renderProfilePage(lang: Lang, data: ProfileData, friendUiState: ProfileFriendUiState = {
    addUsername: '',
    sending: false,
    busyFriendshipId: null,
    busyChallengeUserId: null,
    errorMessage: null,
}): string {
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

        <article class="card profile-section-card profile-friends-card">
          <div class="profile-section-header">
            <div>
              <div class="card-title" data-i18n="profile.friends.title"></div>
              <p class="card-desc" data-i18n="profile.friends.desc"></p>
            </div>
          </div>
          ${renderFriendsSection(lang, data, friendUiState)}
        </article>

        <article class="card profile-section-card">
          <div class="profile-section-header">
            <div>
              <div class="card-title" data-i18n="profile.section.statsTitle"></div>
            </div>
          </div>
          ${renderGameStats(lang, data)}
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

function renderFriendsSection(lang: Lang, data: ProfileData, friendUiState: ProfileFriendUiState): string {
    if (!data.isLive) {
        return `<p class="card-desc" data-i18n="profile.friends.loginRequired"></p>`;
    }

    const error = friendUiState.errorMessage
        ? `<div class="profile-friends-error">${escapeHtml(friendUiState.errorMessage)}</div>`
        : '';

    if (data.friendsError) {
        return `
      ${renderFriendRequestForm(lang, friendUiState)}
      ${error}
      <p class="card-desc" data-i18n="profile.friends.error"></p>
    `;
    }

    return `
    ${renderFriendRequestForm(lang, friendUiState)}
    ${error}
    <div class="profile-friends-grid">
      <section class="profile-friends-panel">
        <h3 data-i18n="profile.friends.listTitle"></h3>
        ${renderFriendList(lang, data, data.friends, friendUiState)}
      </section>
      <section class="profile-friends-panel">
        <h3 data-i18n="profile.friends.incomingTitle"></h3>
        ${renderIncomingRequests(lang, data.friendRequests.incoming, friendUiState)}
      </section>
      <section class="profile-friends-panel">
        <h3 data-i18n="profile.friends.outgoingTitle"></h3>
        ${renderOutgoingRequests(lang, data.friendRequests.outgoing, friendUiState)}
      </section>
    </div>
  `;
}

function renderFriendRequestForm(lang: Lang, state: ProfileFriendUiState): string {
    return `
    <form class="profile-friend-form" id="friendRequestForm">
      <label class="profile-friend-field" for="friendUsernameInput">
        <span data-i18n="profile.friends.addLabel"></span>
        <input
          id="friendUsernameInput"
          class="input"
          type="text"
          autocomplete="off"
          value="${escapeHtml(state.addUsername)}"
          placeholder="${escapeHtml(t(lang, 'profile.friends.addPlaceholder'))}"
          ${state.sending ? 'disabled' : ''}
        />
      </label>
      <button class="btn primary" type="submit" ${state.sending ? 'disabled' : ''} data-i18n="profile.friends.addAction"></button>
    </form>
  `;
}

function renderFriendList(lang: Lang, data: ProfileData, friends: FriendshipSummary[], state: ProfileFriendUiState): string {
    if (friends.length === 0) {
        return `<p class="card-desc" data-i18n="profile.friends.empty"></p>`;
    }

    return `
    <div class="profile-friend-list">
      ${friends.map((friendship) => {
        const friend = otherUser(data.userId, friendship);
        return renderFriendRow({
            title: displayFriendName(friend),
            subtitle: `@${friend.username}`,
            actions: `
              <button class="btn primary" type="button" data-action="friend-challenge" data-username="${escapeHtml(friend.username)}" data-user-id="${escapeHtml(friend.userId)}" ${isChallengeBusy(state, friend.userId)} data-i18n="profile.friends.challenge"></button>
              <button class="btn danger" type="button" data-action="friend-remove" data-friendship-id="${escapeHtml(friendship.id)}" ${isBusy(state, friendship.id)} data-i18n="profile.friends.remove"></button>
            `,
        });
    }).join('')}
    </div>
  `;
}

function renderIncomingRequests(lang: Lang, requests: FriendshipSummary[], state: ProfileFriendUiState): string {
    if (requests.length === 0) {
        return `<p class="card-desc" data-i18n="profile.friends.incomingEmpty"></p>`;
    }

    return `
    <div class="profile-friend-list">
      ${requests.map((request) => renderFriendRow({
        title: displayFriendName(request.requester),
        subtitle: `@${request.requester.username}`,
        actions: `
          <button class="btn primary" type="button" data-action="friend-accept" data-friendship-id="${escapeHtml(request.id)}" ${isBusy(state, request.id)} data-i18n="profile.friends.accept"></button>
          <button class="btn" type="button" data-action="friend-decline" data-friendship-id="${escapeHtml(request.id)}" ${isBusy(state, request.id)} data-i18n="profile.friends.decline"></button>
        `,
    })).join('')}
    </div>
  `;
}

function renderOutgoingRequests(lang: Lang, requests: FriendshipSummary[], state: ProfileFriendUiState): string {
    if (requests.length === 0) {
        return `<p class="card-desc" data-i18n="profile.friends.outgoingEmpty"></p>`;
    }

    return `
    <div class="profile-friend-list">
      ${requests.map((request) => renderFriendRow({
        title: displayFriendName(request.addressee),
        subtitle: `@${request.addressee.username} - ${t(lang, 'profile.friends.pending')}`,
        actions: `<button class="btn" type="button" data-action="friend-remove" data-friendship-id="${escapeHtml(request.id)}" ${isBusy(state, request.id)} data-i18n="profile.friends.cancel"></button>`,
    })).join('')}
    </div>
  `;
}

function renderFriendRow(input: { title: string; subtitle: string; actions: string }): string {
    return `
    <div class="profile-friend-row">
      <div>
        <div class="profile-friend-name">${escapeHtml(input.title)}</div>
        <div class="profile-friend-meta">${escapeHtml(input.subtitle)}</div>
      </div>
      <div class="profile-friend-actions">${input.actions}</div>
    </div>
  `;
}

function otherUser(currentUserId: string | null, friendship: FriendshipSummary) {
    return friendship.requester.userId === currentUserId ? friendship.addressee : friendship.requester;
}

function displayFriendName(user: { username: string; displayName: string | null }): string {
    return user.displayName || user.username;
}

function isBusy(state: ProfileFriendUiState, friendshipId: string): string {
    return state.busyFriendshipId === friendshipId ? 'disabled' : '';
}

function isChallengeBusy(state: ProfileFriendUiState, userId: string): string {
    return state.busyChallengeUserId === userId ? 'disabled' : '';
}

function renderGameStats(lang: Lang, data: ProfileData): string {
    if (data.statsError) {
        return `<p class="card-desc" data-i18n="profile.section.statsError"></p>`;
    }

    const playedStats = data.gameStats.filter((stats) => stats.gamesPlayed > 0);
    if (playedStats.length === 0) {
        return `<p class="card-desc" data-i18n="profile.section.statsEmpty"></p>`;
    }

    return `
    <div class="profile-stats-list">
      ${playedStats.map((stats) => renderStatsRow(lang, stats)).join('')}
    </div>
  `;
}

function renderStatsRow(lang: Lang, stats: MyGameStatsSummary): string {
    const winRate = stats.gamesPlayed > 0
        ? Math.round((stats.wins / stats.gamesPlayed) * 100)
        : 0;
    const values = [
        [t(lang, 'profile.stats.played'), stats.gamesPlayed],
        [t(lang, 'profile.stats.wins'), stats.wins],
        [t(lang, 'profile.stats.losses'), stats.losses],
        ...(stats.draws > 0 ? [[t(lang, 'profile.stats.draws'), stats.draws] as [string, number]] : []),
        [t(lang, 'profile.stats.winRate'), `${winRate}%`],
        [t(lang, 'profile.stats.currentStreak'), stats.currentStreak],
        [t(lang, 'profile.stats.bestStreak'), stats.bestStreak],
        [t(lang, 'profile.stats.highScore'), stats.highScore],
    ];

    return `
    <section class="profile-stats-game">
      <div class="profile-stats-game-title">${escapeHtml(stats.game.title || stats.game.slug)}</div>
      <div class="profile-stats-grid">
        ${values.map(([label, value]) => `
          <div class="profile-stat-cell">
            <span class="profile-stat-label">${escapeHtml(String(label))}</span>
            <span class="profile-stat-value">${escapeHtml(String(value))}</span>
          </div>
        `).join('')}
      </div>
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
