import type { ConnectionStatus } from './types.js';

export function renderRoomFrame(params: {
    connection: ConnectionStatus;
    gameTitle: string;
    errorMessage: string | null;
    winnerPlayerId: string | null;
    bodyHtml: string;
}): string {
    const errorBanner = params.errorMessage
        ? `<div class="room-banner room-banner-error">${params.errorMessage}</div>`
        : '';

    const winnerBanner = params.winnerPlayerId
        ? `<div class="room-banner room-banner-win">Game finished. Winner: ${params.winnerPlayerId}</div>`
        : '';

    return `
    <h1 class="h1">Game Room · ${params.gameTitle}</h1>
    <p class="sub">Connection: <span class="pill">${params.connection}</span></p>
    ${errorBanner}
    ${winnerBanner}
    <div class="room-layout">${params.bodyHtml}</div>
  `;
}

export function renderRoomError(message: string): string {
    return `
    <h1 class="h1">Game Room</h1>
    <div class="card room-card">
      <div class="card-title">Cannot open room</div>
      <p class="card-desc">${message}</p>
    </div>
  `;
}
