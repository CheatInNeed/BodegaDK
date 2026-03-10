import type { GameSummary, LobbySummary } from './api/lobbies.js';

export function renderLobbyBrowser(params: {
    rooms: LobbySummary[];
    games: GameSummary[];
    selectedGame: string | null;
    error: string | null;
    loading: boolean;
}): string {
    const filteredRooms = params.selectedGame
        ? params.rooms.filter((room) => room.gameId === params.selectedGame)
        : params.rooms;

    return `
      <section class="card room-card lobby-browser-hero">
        <div>
          <p class="eyebrow">Find A Table</p>
          <h1 class="h1">Public Lobby Browser</h1>
          <p class="sub">Browse active public lobbies, or create one from the Play screen and let people drift in from the bar.</p>
        </div>
        <div class="lobby-browser-filters">
          <label class="lobby-filter">
            <span>Game</span>
            <select id="browserGameFilter" class="select">
              <option value="">All games</option>
              ${params.games.map((game) => `
                <option value="${game.gameId}" ${params.selectedGame === game.gameId ? 'selected' : ''}>
                  ${game.gameId} (${game.minPlayers}-${game.maxPlayers})
                </option>
              `).join('')}
            </select>
          </label>
          <button class="btn" data-action="refresh-browser">${params.loading ? 'Refreshing...' : 'Refresh'}</button>
        </div>
      </section>

      ${params.error ? `<div class="room-banner room-banner-error">${params.error}</div>` : ''}

      <section class="grid lobby-browser-grid">
        ${filteredRooms.length === 0 ? `
          <article class="card room-card">
            <div class="card-title">No public lobbies</div>
            <p class="card-desc">Nothing is waiting right now. Start a fresh room and flip it public.</p>
          </article>
        ` : filteredRooms.map((room) => `
          <article class="card room-card">
            <div class="card-title">${room.gameId}</div>
            <div class="card-desc">Room ${room.roomCode} · ${room.currentPlayers}/${room.maxPlayers} players · host ${room.hostPlayerId}</div>
            <div class="card-row">
              <span class="pill">Needs ${Math.max(room.minPlayers - room.currentPlayers, 0)} more to start</span>
              <button class="btn primary" data-action="open-public-lobby" data-room="${room.roomCode}" data-game="${room.gameId}">Open Lobby</button>
            </div>
          </article>
        `).join('')}
      </section>
    `;
}
