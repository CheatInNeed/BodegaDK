import type { LobbyRoomSummary } from '../net/api.js';
import { formatPlayerDisplayName } from '../game-room/player-display.js';

export type LobbyPlayerSeat = {
    playerId: string;
    username: string;
    isHost: boolean;
    isSelf: boolean;
};

export type LobbyRoomViewModel = {
    roomCode: string;
    connectionLabel: string;
    hostPlayerId: string | null;
    hostDisplayName: string;
    selfPlayerId: string | null;
    selectedGame: string;
    status: string;
    isPrivate: boolean;
    canManage: boolean;
    players: LobbyPlayerSeat[];
    errorMessage: string | null;
};

export function renderLobbyBrowser(params: {
    rooms: LobbyRoomSummary[];
    loading: boolean;
    errorMessage: string | null;
    joinCode: string;
    createPrivate: boolean;
    createGame: string;
    busy: boolean;
    gameLabel: string;
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
                  <span class="pill">${room.status}</span>
                  <span class="pill">${room.playerCount} players</span>
                </div>
              </div>
              <div class="lobby-player-strip">
                ${room.participants.map((player) => `<span class="pill">${escapeHtml(player.username ?? player.playerId)}</span>`).join('')}
              </div>
              <div class="card-row">
                <span class="pill">Public lobby</span>
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
          <p class="sub">Find an open bodega table, spin up a private room, or jump in with a room code.</p>
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
            <p class="card-desc">Start a new room and become the host right away.</p>
            <label class="claim-label" for="createGameInput">
              ${escapeHtml(params.gameLabel)}
              <select class="select" id="createGameInput">
                ${gameOption('highcard', params.createGame)}
                ${gameOption('krig', params.createGame)}
                ${gameOption('casino', params.createGame)}
              </select>
            </label>
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
    const hostControls = viewModel.canManage
        ? `
          <div class="card lobby-panel">
            <div class="card-title">Host Controls</div>
            <p class="card-desc">Choose the next game and launch when everyone is ready.</p>
            <label class="claim-label" for="selectedGameInput">
              Game
              <select class="select" id="selectedGameInput">
                ${gameOption('highcard', viewModel.selectedGame)}
                ${gameOption('krig', viewModel.selectedGame)}
                ${gameOption('casino', viewModel.selectedGame)}
              </select>
            </label>
            <button class="btn primary full-width" data-action="start-lobby-game">Start Game</button>
          </div>
        `
        : `
          <div class="card lobby-panel">
            <div class="card-title">Waiting On Host</div>
            <p class="card-desc">The host will choose a game and start the table when everyone is in.</p>
          </div>
        `;

    const errorBanner = viewModel.errorMessage
        ? `<div class="room-banner room-banner-error">${viewModel.errorMessage}</div>`
        : '';

    const playersHtml = viewModel.players.map((player) => `
      <div class="card lobby-player-card">
        <div>
          <div class="card-title">${escapeHtml(player.username)}</div>
          <p class="card-desc">${player.isHost ? 'Lobby host' : 'Participant'}${player.isSelf ? ' · You' : ''}</p>
        </div>
        <div class="card-row">
          <span class="pill">${player.isHost ? 'Host' : 'Player'}</span>
          ${viewModel.canManage && !player.isSelf ? `<button class="btn" data-action="kick-player" data-player-id="${player.playerId}">Kick</button>` : ''}
        </div>
      </div>
    `).join('');

    return `
    <section class="lobby-room">
      <div class="lobby-hero card">
        <div>
          <h1 class="h1">Lobby ${viewModel.roomCode}</h1>
          <p class="sub">Stay here while the table fills up. The server keeps this roster authoritative in real time.</p>
        </div>
        <div class="lobby-hero-actions">
          <span class="pill">${viewModel.connectionLabel}</span>
          <span class="pill">${viewModel.isPrivate ? 'Private' : 'Public'}</span>
          <span class="pill">${viewModel.status}</span>
        </div>
      </div>

      ${errorBanner}

      <section class="lobby-browser-grid">
        <div class="lobby-primary-column">
          <div class="card lobby-room-summary">
            <div class="lobby-summary-grid">
              <div>
                <div class="card-title">Selected Game</div>
                <p class="card-desc">${viewModel.selectedGame}</p>
              </div>
              <div>
                <div class="card-title">Host</div>
                <p class="card-desc">${escapeHtml(viewModel.hostDisplayName)}</p>
              </div>
              <div>
                <div class="card-title">Players</div>
                <p class="card-desc">${viewModel.players.length}</p>
              </div>
            </div>
          </div>

          <div class="lobby-section-heading">
            <h2 class="card-title">Players In Lobby</h2>
            <span class="pill">${viewModel.players.length} seated</span>
          </div>
          <div class="lobby-player-list">
            ${playersHtml}
          </div>
        </div>

        <aside class="lobby-side-column">
          ${hostControls}
          <div class="card lobby-panel">
            <div class="card-title">Room Actions</div>
            <p class="card-desc">Share the room code with friends or leave the lobby safely.</p>
            <div class="lobby-code">${viewModel.roomCode}</div>
            <button class="btn full-width" data-action="leave-lobby">Leave Lobby</button>
          </div>
        </aside>
      </section>
    </section>
  `;
}

function gameOption(value: string, current: string): string {
    return `<option value="${value}" ${value === current ? 'selected' : ''}>${value}</option>`;
}

function resolveLobbyParticipantName(room: LobbyRoomSummary, playerId: string): string {
    const participant = room.participants.find((player) => player.playerId === playerId);
    return formatPlayerDisplayName(playerId, participant?.username ?? null);
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
