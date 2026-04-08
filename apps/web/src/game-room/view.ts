import type { ConnectionStatus } from './types.js';

export function renderRoomFrame(params: {
    connection: ConnectionStatus;
    gameTitle: string;
    errorMessage: string | null;
    winnerPlayerId: string | null;
    bodyHtml: string;
}): string {
    const notices = [
        params.errorMessage
            ? `<div class="room-banner room-banner-error">${params.errorMessage}</div>`
            : '',
        params.winnerPlayerId
            ? `<div class="room-banner room-banner-win">Game finished. Winner: ${params.winnerPlayerId}</div>`
            : '',
    ].join('');

    const logItems = [
        {
            label: 'SYSTEM',
            className: 'system',
            text: `Connected to ${params.gameTitle}. Table state is synced over ${params.connection}.`,
        },
        {
            label: 'TABLE',
            className: 'primary',
            text: params.winnerPlayerId
                ? `Round complete. Winner: ${params.winnerPlayerId}.`
                : 'Cards are live. Choose a card from your hand to make your move.',
        },
        {
            label: 'STATUS',
            className: 'secondary',
            text: params.errorMessage
                ? 'A room notice needs attention before the next action.'
                : 'Rules and chat stay visible here while the table remains in focus.',
        },
    ].map((item) => `
      <div class="game-room-log-item">
        <span class="game-room-log-label ${item.className}">${item.label}</span>
        <p class="game-room-log-text">${item.text}</p>
      </div>
    `).join('');

    return `
    <section class="game-room-shell">
      <div class="game-room-main">
        <header class="game-room-topbar">
          <div class="game-room-brand-block">
            <span class="game-room-brand" data-i18n="room.brand"></span>
            <div class="game-room-title-group">
              <h1 class="game-room-title">${params.gameTitle}</h1>
              <p class="game-room-subtitle" data-i18n="room.subtitle"></p>
            </div>
          </div>

          <div class="game-room-top-actions">
            <span class="game-room-connection-pill">${params.connection}</span>
            <button class="game-room-icon-button" type="button" aria-label="Table settings">+</button>
            <button class="btn primary game-room-leave" type="button" data-action="leave-table">Leave Table</button>
          </div>
        </header>

        <div class="game-room-stage">
          <div class="game-room-table-shell">
            <div class="game-room-table-glow"></div>
            <div class="game-room-table-felt"></div>
            <div class="game-room-table-content">
              ${notices}
              <div class="room-layout">${params.bodyHtml}</div>
            </div>
          </div>
        </div>

        <div class="game-room-bottom-nav" aria-label="Room navigation">
          <button class="game-room-bottom-pill active" type="button">Hand</button>
          <button class="game-room-bottom-pill" type="button">Board</button>
          <button class="game-room-bottom-pill" type="button">Social</button>
          <button class="game-room-bottom-pill" type="button">Menu</button>
        </div>
      </div>

      <aside class="game-room-sidebar">
        <div class="game-room-sidebar-header">
          <h2 class="game-room-sidebar-title" data-i18n="room.feed.title"></h2>
          <p class="game-room-sidebar-subtitle" data-i18n="room.feed.subtitle"></p>
        </div>

        <nav class="game-room-sidebar-tabs" aria-label="Room side tabs">
          <button class="game-room-sidebar-tab active" type="button" data-i18n="room.feed.tab.log"></button>
          <button class="game-room-sidebar-tab" type="button" data-i18n="room.feed.tab.chat"></button>
          <button class="game-room-sidebar-tab" type="button" data-i18n="room.feed.tab.players"></button>
        </nav>

        <div class="game-room-log-list">
          ${logItems}
        </div>

        <div class="game-room-sidebar-footer">
          <button class="btn game-room-invite" type="button">Invite Friends</button>
        </div>
      </aside>
    </section>
  `;
}

export function renderRoomError(message: string): string {
    return `
    <section class="game-room-shell game-room-shell-error">
      <div class="game-room-main">
        <div class="game-room-error-card">
          <div class="card-title">Cannot open room</div>
          <p class="card-desc">${message}</p>
        </div>
      </div>
    </section>
  `;
}
