import type { LobbyRoomSummary } from '../net/api.js';
import { formatPlayerDisplayName } from '../game-room/player-display.js';
import { t, type Lang } from '../i18n.js';

export type LobbyPlayerSeat = {
    playerId: string;
    username: string;
    isHost: boolean;
    isSelf: boolean;
};

export type LobbyRoomViewModel = {
    lang: Lang;
    roomCode: string;
    hostPlayerId: string | null;
    hostDisplayName: string;
    selectedGame: string;
    isPrivate: boolean;
    canManage: boolean;
    canStart: boolean;
    players: LobbyPlayerSeat[];
    errorMessage: string | null;
    copiedShareValue: boolean;
    shareValue: string;
};

type LobbyGameMeta = {
    id: string;
    titleKey: string;
    durationKey: string;
    summaryKey: string;
    imageSrc: string;
    minPlayers: number;
    maxPlayers: number;
};

const LOBBY_GAMES: LobbyGameMeta[] = [
    {
        id: 'snyd',
        titleKey: 'game.cheat',
        durationKey: 'lobby.game.snyd.eta',
        summaryKey: 'lobby.game.snyd.summary',
        imageSrc: '/images/game-cards/snyd_cover.png',
        minPlayers: 2,
        maxPlayers: 8,
    },
    {
        id: 'highcard',
        titleKey: 'game.highcard',
        durationKey: 'lobby.game.highcard.eta',
        summaryKey: 'lobby.game.highcard.summary',
        imageSrc: '/images/game-cards/highestcard_cover.png',
        minPlayers: 1,
        maxPlayers: 1,
    },
    {
        id: 'krig',
        titleKey: 'game.krig',
        durationKey: 'lobby.game.krig.eta',
        summaryKey: 'lobby.game.krig.summary',
        imageSrc: '/images/game-cards/krig_cover.png',
        minPlayers: 2,
        maxPlayers: 2,
    },
    {
        id: 'casino',
        titleKey: 'game.casino',
        durationKey: 'lobby.game.casino.eta',
        summaryKey: 'lobby.game.casino.summary',
        imageSrc: '/images/game-cards/casino_cover.png',
        minPlayers: 2,
        maxPlayers: 2,
    },
    {
        id: 'fem',
        titleKey: 'game.500',
        durationKey: 'lobby.game.fem.eta',
        summaryKey: 'lobby.game.fem.summary',
        imageSrc: '/images/game-cards/500_cover.png',
        minPlayers: 2,
        maxPlayers: 6,
    },
];

export function renderLobbyBrowser(params: {
    rooms: LobbyRoomSummary[];
    loading: boolean;
    errorMessage: string | null;
    joinCode: string;
    createPrivate: boolean;
    busy: boolean;
    visibilityLabel: string;
    joinLobbyLabel: string;
    joinRunningLabel: string;
}): string {
    const roomsHtml = params.rooms.length === 0
        ? `<div class="card lobby-empty"><div class="card-title">No public lobbies</div><p class="card-desc">Create one below or join via code.</p></div>`
        : params.rooms.map((room) => `
            <article class="card lobby-list-card">
              <div class="lobby-list-header">
                <div>
                  <div class="card-title">Room ${room.roomCode}</div>
                  <p class="card-desc">Host: ${escapeHtml(resolveLobbyParticipantName(room, room.hostPlayerId))} · Game: ${room.selectedGame}</p>
                </div>
                <div class="lobby-badges">
                  <span class="pill">${room.playerCount} players</span>
                </div>
              </div>
              <div class="lobby-player-strip">
                ${room.participants.map((player) => `<span class="pill">${escapeHtml(player.username ?? player.playerId)}</span>`).join('')}
              </div>
              <div class="card-row">
                <button class="btn primary" data-action="join-public-room" data-room-code="${room.roomCode}">${room.status === 'IN_GAME' ? params.joinRunningLabel : params.joinLobbyLabel}</button>
              </div>
            </article>
        `).join('');

    const status = params.loading
        ? '<span class="pill">Refreshing lobbies...</span>'
        : '<span class="pill">Public lobbies</span>';
    const errorBanner = params.errorMessage
        ? `<div class="room-banner room-banner-error">${params.errorMessage}</div>`
        : '';

    return `
    <section class="lobby-browser">
      <div class="lobby-hero card">
        <div>
          <h1 class="h1">Lobby Browser</h1>
          <p class="sub">Create a room, then pick the game inside the lobby.</p>
        </div>
        <div class="lobby-hero-actions">
          ${status}
          <button class="btn" data-action="refresh-lobbies" ${params.busy ? 'disabled' : ''}>Refresh</button>
        </div>
      </div>

      ${errorBanner}

      <section class="lobby-browser-grid">
        <div class="lobby-primary-column">
          <div class="lobby-section-heading">
            <h2 class="card-title">Open Tables</h2>
            <span class="pill">${params.rooms.length} listed</span>
          </div>
          <div class="lobby-room-list">
            ${roomsHtml}
          </div>
        </div>

        <aside class="lobby-side-column">
          <div class="card lobby-panel">
            <div class="card-title">Create Lobby</div>
            <p class="card-desc">Start a fresh lobby and choose the game after you enter.</p>
            <label class="lobby-toggle">
              <input type="checkbox" id="createPrivateToggle" ${params.createPrivate ? 'checked' : ''} />
              <span>${escapeHtml(params.visibilityLabel)}</span>
            </label>
            <button class="btn primary full-width" data-action="create-lobby" ${params.busy ? 'disabled' : ''}>Create Lobby</button>
          </div>

          <div class="card lobby-panel">
            <div class="card-title">Join Via Code</div>
            <p class="card-desc">Paste a 6-letter room code from a friend.</p>
            <input class="input" id="joinCodeInput" maxlength="6" value="${escapeAttr(params.joinCode)}" placeholder="ABC123" />
            <button class="btn primary full-width" data-action="join-by-code" ${params.busy ? 'disabled' : ''}>Join Lobby</button>
          </div>
        </aside>
      </section>
    </section>
  `;
}

export function renderLobbyRoom(viewModel: LobbyRoomViewModel): string {
    const selectedGame = resolveLobbyGame(viewModel.selectedGame);
    const seatedPlayers = viewModel.players.slice(0, selectedGame.maxPlayers);
    const overflowPlayers = viewModel.players.slice(selectedGame.maxPlayers);
    const errorBanner = viewModel.errorMessage
        ? `<div class="room-banner room-banner-error">${viewModel.errorMessage}</div>`
        : '';

    return `
    <section class="lobby-room">
      <div class="lobby-hero card lobby-room-hero">
        <h1 class="h1">Lobby ${viewModel.roomCode}</h1>
      </div>

      ${errorBanner}

      <section class="lobby-browser-grid">
        <div class="lobby-primary-column">
          <div class="card lobby-stage-card">
            <div class="lobby-stage-header">
              <div class="card-title">${escapeHtml(t(viewModel.lang, 'lobby.selection.title'))}</div>
              <span class="pill">${seatedPlayers.length}/${selectedGame.maxPlayers}</span>
            </div>

            <div class="lobby-game-card-grid" role="radiogroup" aria-label="${escapeAttr(t(viewModel.lang, 'lobby.selection.aria'))}">
              ${LOBBY_GAMES.map((game) => renderGameCard(game, viewModel)).join('')}
            </div>

            <div class="lobby-game-preview">
              <div class="lobby-game-preview-top">
                <div class="card-title">${escapeHtml(t(viewModel.lang, selectedGame.titleKey))}</div>
                <span class="pill">${formatPlayerRange(viewModel.lang, selectedGame)}</span>
              </div>
              <div class="lobby-preview-stats">
                <div class="lobby-preview-stat">
                  <span class="lobby-preview-label">${escapeHtml(t(viewModel.lang, 'lobby.preview.eta'))}</span>
                  <strong>${escapeHtml(t(viewModel.lang, selectedGame.durationKey))}</strong>
                </div>
                <div class="lobby-preview-stat">
                  <span class="lobby-preview-label">${escapeHtml(t(viewModel.lang, 'lobby.preview.rules'))}</span>
                  <strong>${escapeHtml(t(viewModel.lang, selectedGame.summaryKey))}</strong>
                </div>
              </div>
            </div>
          </div>

          <div class="card lobby-seats-card">
            <div class="lobby-section-heading">
              <h2 class="card-title">${escapeHtml(t(viewModel.lang, 'lobby.players.title'))}</h2>
              <span class="pill">${viewModel.players.length}</span>
            </div>
            ${renderSeatTable(viewModel, selectedGame, seatedPlayers)}
            ${overflowPlayers.length > 0 ? renderBench(viewModel, overflowPlayers) : ''}
          </div>
        </div>

        <aside class="lobby-side-column">
          <div class="card lobby-panel">
            <div class="card-title">${escapeHtml(t(viewModel.lang, 'lobby.host.title'))}</div>
            <button class="btn primary full-width lobby-start-button" data-action="start-lobby-game" ${viewModel.canManage && viewModel.canStart ? '' : 'disabled'}>${escapeHtml(t(viewModel.lang, 'lobby.start'))}</button>
            <p class="card-desc lobby-start-hint">${escapeHtml(startHintKey(viewModel, overflowPlayers.length > 0))}</p>
          </div>

          <div class="card lobby-panel">
            <div class="card-title">${escapeHtml(t(viewModel.lang, 'lobby.actions.title'))}</div>
            <div class="lobby-code-wrap">
              <div class="lobby-code-block">
                <span class="lobby-code-label">${escapeHtml(t(viewModel.lang, 'lobby.actions.roomCode'))}</span>
                <div class="lobby-code">${viewModel.roomCode}</div>
              </div>
              <button class="btn lobby-copy-button" type="button" data-action="copy-lobby-share" data-share-value="${escapeAttr(viewModel.shareValue)}" aria-label="${escapeAttr(t(viewModel.lang, 'lobby.actions.copy'))}">
                ${clipboardIcon()}
                <span>${escapeHtml(viewModel.copiedShareValue ? t(viewModel.lang, 'lobby.actions.copied') : t(viewModel.lang, 'lobby.actions.copy'))}</span>
              </button>
            </div>
            <div class="lobby-copy-feedback" aria-live="polite">${viewModel.copiedShareValue ? escapeHtml(t(viewModel.lang, 'lobby.actions.copiedHint')) : '&nbsp;'}</div>
            <div class="lobby-visibility-toggle" role="group" aria-label="${escapeAttr(t(viewModel.lang, 'lobby.visibility.title'))}">
              ${renderVisibilityButton(viewModel, false)}
              ${renderVisibilityButton(viewModel, true)}
            </div>
            <button class="btn full-width" data-action="leave-lobby">${escapeHtml(t(viewModel.lang, 'lobby.leave'))}</button>
          </div>
        </aside>
      </section>
    </section>
  `;
}

function renderGameCard(game: LobbyGameMeta, viewModel: LobbyRoomViewModel): string {
    const isActive = game.id === viewModel.selectedGame;
    const title = t(viewModel.lang, game.titleKey);
    const summary = t(viewModel.lang, game.summaryKey);
    const baseClass = `lobby-game-card ${isActive ? 'active' : ''}`;

    if (viewModel.canManage) {
        return `
          <button class="${baseClass}" type="button" data-action="select-lobby-game" data-game="${game.id}" role="radio" aria-checked="${isActive ? 'true' : 'false'}">
            <img class="lobby-game-card-image" src="${game.imageSrc}" alt="${escapeAttr(title)}" />
            <div class="lobby-game-card-body">
              <span class="lobby-game-card-title">${escapeHtml(title)}</span>
              <span class="lobby-game-card-meta">${escapeHtml(t(viewModel.lang, game.durationKey))}</span>
              <span class="lobby-game-card-copy">${escapeHtml(summary)}</span>
            </div>
          </button>
        `;
    }

    return `
      <article class="${baseClass} passive" role="presentation">
        <img class="lobby-game-card-image" src="${game.imageSrc}" alt="${escapeAttr(title)}" />
        <div class="lobby-game-card-body">
          <span class="lobby-game-card-title">${escapeHtml(title)}</span>
          <span class="lobby-game-card-meta">${escapeHtml(t(viewModel.lang, game.durationKey))}</span>
          <span class="lobby-game-card-copy">${escapeHtml(summary)}</span>
        </div>
      </article>
    `;
}

function renderSeatTable(viewModel: LobbyRoomViewModel, game: LobbyGameMeta, seatedPlayers: LobbyPlayerSeat[]): string {
    const positions = positionsForSeatCount(game.maxPlayers);
    const seatsHtml = positions.map((position, index) => {
        const player = seatedPlayers[index] ?? null;
        if (!player) {
            return `
              <div class="lobby-seat ${position}">
                <div class="lobby-seat-card empty">
                  <div class="lobby-seat-avatar placeholder">+</div>
                  <div>
                    <div class="card-title">${escapeHtml(t(viewModel.lang, 'lobby.seat.emptyTitle'))}</div>
                  </div>
                </div>
              </div>
            `;
        }

        return `
          <div class="lobby-seat ${position}">
            <div class="lobby-seat-card ${player.isSelf ? 'self' : ''}">
              <div class="lobby-seat-avatar">${escapeHtml(initialsFor(player.username))}</div>
              <div class="lobby-seat-copy">
                <div class="card-title">${escapeHtml(player.username)}</div>
                <div class="lobby-seat-badges">
                  <span class="pill">${escapeHtml(player.isHost ? t(viewModel.lang, 'lobby.badge.host') : t(viewModel.lang, 'lobby.badge.player'))}</span>
                  ${player.isSelf ? `<span class="pill">${escapeHtml(t(viewModel.lang, 'lobby.badge.you'))}</span>` : ''}
                </div>
              </div>
              ${viewModel.canManage && !player.isSelf ? `<button class="btn lobby-kick-button" data-action="kick-player" data-player-id="${player.playerId}">${escapeHtml(t(viewModel.lang, 'lobby.kick'))}</button>` : ''}
            </div>
          </div>
        `;
    }).join('');

    return `
      <div class="lobby-seat-table lobby-seat-table-${game.maxPlayers}">
        <div class="lobby-table-center">
          <div class="lobby-table-center-top">${escapeHtml(t(viewModel.lang, 'lobby.table.title'))}</div>
          <div class="lobby-table-center-game">${escapeHtml(t(viewModel.lang, game.titleKey))}</div>
          <div class="lobby-table-center-host">${escapeHtml(viewModel.hostDisplayName)}</div>
        </div>
        ${seatsHtml}
      </div>
    `;
}

function renderBench(viewModel: LobbyRoomViewModel, overflowPlayers: LobbyPlayerSeat[]): string {
    return `
      <div class="lobby-bench">
        <div class="lobby-bench-header">
          <div class="card-title">${escapeHtml(t(viewModel.lang, 'lobby.bench.title'))}</div>
          <span class="pill">${overflowPlayers.length}</span>
        </div>
        <div class="lobby-bench-list">
          ${overflowPlayers.map((player) => `
            <div class="lobby-bench-card">
              <div class="lobby-seat-avatar">${escapeHtml(initialsFor(player.username))}</div>
              <div class="lobby-bench-copy">
                <div class="card-title">${escapeHtml(player.username)}</div>
                <p class="card-desc">${escapeHtml(t(viewModel.lang, 'lobby.bench.desc'))}</p>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
}

function renderVisibilityButton(viewModel: LobbyRoomViewModel, isPrivate: boolean): string {
    const isActive = viewModel.isPrivate === isPrivate;
    const key = isPrivate ? 'lobby.visibility.private' : 'lobby.visibility.public';
    return `
      <button
        class="btn lobby-visibility-button ${isActive ? 'active' : ''}"
        type="button"
        data-action="set-room-visibility"
        data-private="${isPrivate ? 'true' : 'false'}"
        ${viewModel.canManage ? '' : 'disabled'}
      >${escapeHtml(t(viewModel.lang, key))}</button>
    `;
}

function startHintKey(viewModel: LobbyRoomViewModel, hasBench: boolean): string {
    if (!viewModel.canManage) return t(viewModel.lang, 'lobby.start.waiting');
    if (hasBench) return t(viewModel.lang, 'lobby.start.tooMany');
    return t(viewModel.lang, viewModel.canStart ? 'lobby.start.ready' : 'lobby.start.needPlayers');
}

function formatPlayerRange(lang: Lang, game: LobbyGameMeta): string {
    if (game.minPlayers === game.maxPlayers) {
        return `${game.maxPlayers} ${t(lang, game.maxPlayers === 1 ? 'lobby.players.single' : 'lobby.players.plural')}`;
    }
    return `${game.minPlayers}-${game.maxPlayers} ${t(lang, 'lobby.players.plural')}`;
}

function positionsForSeatCount(count: number): string[] {
    if (count <= 1) return ['south'];
    if (count === 2) return ['north', 'south'];
    if (count === 3) return ['north', 'east', 'south'];
    if (count === 4) return ['north', 'east', 'south', 'west'];
    return ['northwest', 'north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west'].slice(0, count);
}

function initialsFor(name: string): string {
    const parts = name.trim().split(/\s+/).slice(0, 2);
    const initials = parts.map((part) => part.charAt(0).toUpperCase()).join('');
    return initials || '?';
}

function resolveLobbyGame(gameId: string): LobbyGameMeta {
    return LOBBY_GAMES.find((game) => game.id === gameId) ?? LOBBY_GAMES[0];
}

function resolveLobbyParticipantName(room: LobbyRoomSummary, playerId: string): string {
    const participant = room.participants.find((player) => player.playerId === playerId);
    return formatPlayerDisplayName(playerId, participant?.username ?? null);
}

function clipboardIcon(): string {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M9 3h6a2 2 0 0 1 2 2v1h1a2 2 0 0 1 2 2v10a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V8a2 2 0 0 1 2-2h1V5a2 2 0 0 1 2-2Zm0 3h6V5H9Zm-2 2v10a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V8h-1v1a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V8Z" fill="currentColor"></path>
      </svg>
    `;
}

function escapeAttr(value: string): string {
    return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
}

function escapeHtml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}
