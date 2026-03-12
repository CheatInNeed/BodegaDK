import type { LobbyRoom } from '../api/lobbies.js';

export type LobbyScreenModel = {
    room: LobbyRoom | null;
    selfPlayerId: string | null;
    error: string | null;
    busy: boolean;
    isGuest: boolean;
};

export function renderLobbyView(model: LobbyScreenModel): string {
    if (!model.room) {
        return `
        <section class="card room-card">
          <div class="card-title">Lobby not found</div>
          <p class="card-desc">Use an invite code or create a new room from the Play screen.</p>
        </section>
      `;
    }

    const room = model.room;
    const self = model.selfPlayerId ? room.players.find((player) => player.playerId === model.selfPlayerId) ?? null : null;
    const isHost = !!self && self.host;
    const canStart = isHost && room.status === 'WAITING' && room.currentPlayers >= room.minPlayers;
    const inviteUrl = `${window.location.origin}${window.location.pathname}?view=lobby&game=${encodeURIComponent(room.gameId)}&room=${encodeURIComponent(room.roomCode)}`;
    const actionLabel = room.status === 'PLAYING' ? 'Enter Game Board' : self ? 'Stay In Lobby' : 'Join Lobby';
    const canManageVisibility = isHost && !model.isGuest;

    return `
      <section class="lobby-hero card room-card">
        <div>
          <p class="eyebrow">Bodega Lobby</p>
          <h1 class="h1">Room ${room.roomCode}</h1>
          <p class="sub">${capitalize(room.gameId)} · ${room.currentPlayers}/${room.maxPlayers} players · ${room.isPublic ? 'Public' : 'Private'}</p>
        </div>
        <div class="lobby-hero-actions">
          <span class="pill">Status: ${room.status}</span>
          ${model.isGuest ? '' : `<button class="btn" data-action="copy-invite" data-link="${escapeHtml(inviteUrl)}">Copy Invite Link</button>`}
          ${canManageVisibility ? `<button class="btn" data-action="toggle-visibility">${room.isPublic ? 'Make Private' : 'Make Public'}</button>` : ''}
          ${room.status === 'PLAYING' && self ? `<button class="btn primary" data-action="enter-game">Enter Game</button>` : ''}
        </div>
      </section>

      ${model.error ? `<div class="room-banner room-banner-error">${escapeHtml(model.error)}</div>` : ''}

      <section class="grid lobby-grid">
        <article class="card room-card">
          <div class="card-title">Players</div>
          <div class="card-desc">Need ${room.minPlayers}-${room.maxPlayers} players. Joining as an active player is blocked once the game starts.</div>
          <div class="lobby-player-list">
            ${room.players.map((player) => `
              <div class="lobby-player-row">
                <div>
                  <strong>${escapeHtml(player.displayName)}</strong>
                  <span class="lobby-player-meta">${player.host ? 'Party Leader' : player.playerId === model.selfPlayerId ? 'You' : 'Player'}</span>
                </div>
                <div class="lobby-player-actions">
                  ${player.host ? '<span class="lobby-crown" aria-hidden="true">♛</span>' : ''}
                  ${isHost && !player.host ? `<button class="btn danger" data-action="kick-player" data-player-id="${escapeHtml(player.playerId)}">X</button>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        </article>

        <article class="card room-card">
          <div class="card-title">Controls</div>
          <div class="card-desc">${model.isGuest ? 'Guest lobbies stay private and can only be shared with the six-character room code.' : 'Public rooms show up in the browser immediately. Private rooms are invite-only via room code or share link.'}</div>
          <div class="lobby-code-row">
            <span class="pill">Invite code: ${room.roomCode}</span>
            <span class="pill">${room.currentPlayers}/${room.maxPlayers} seats taken</span>
          </div>
          ${model.isGuest ? '' : `<p class="card-desc">Invite link: <span class="lobby-link">${escapeHtml(inviteUrl)}</span></p>`}
          <div class="card-row lobby-control-row">
            ${self ? '' : `<button class="btn primary" data-action="join-lobby">${actionLabel}</button>`}
            ${isHost ? `<button class="btn primary" data-action="start-game" ${canStart ? '' : 'disabled'}>${model.busy ? 'Working...' : 'Start Game'}</button>` : ''}
            ${!self && room.status === 'PLAYING' ? '<span class="room-banner room-banner-error">This game already started. New active players are blocked.</span>' : ''}
          </div>
        </article>
      </section>
    `;
}

function capitalize(value: string): string {
    return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);
}

function escapeHtml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}
