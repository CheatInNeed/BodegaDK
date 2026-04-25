import { CARD_THEMES, renderGCardBack, renderGPlayingCard, type CardTheme } from '../shared/game-cards.js';

export type KrigViewModel = {
    roomCode: string;
    trickNumber: number;
    selfPlayerId: string | null;
    statusText: string;
    canFlip: boolean;
    warActive: boolean;
    warDepth: number;
    warPileSize: number;
    centerPileSize: number;
    players: Array<{
        playerId: string;
        displayName: string;
        pileCount: number;
        stakeCount: number;
        tableCard: { kind: 'face' | 'back' | 'stack' | 'empty'; cardCode?: string; size?: string };
        isSelf: boolean;
        isReady: boolean;
        isRoundWinner: boolean;
        isRoundLoser: boolean;
        callout: string | null;
    }>;
    isGameOver: boolean;
    postGame: {
        winnerLabel: string;
        isTie: boolean;
        rematchButtonLabel: string;
        rematchDisabled: boolean;
        rematchStatusText: string;
        piles: Array<{ playerId: string; displayName: string; pileCount: number }>;
    } | null;
};

const TABLE_THEME = CARD_THEMES.nordisk;
const CARD_WIDTH = 80;
const CARD_HEIGHT = 112;
const STACK_WIDTH = 58;
const STACK_HEIGHT = 81;
const TOTAL_CARDS = 52;

export function renderKrigRoom(vm: KrigViewModel): string {
    const { topPlayer, bottomPlayer } = resolveSeatPlayers(vm);
    const topPilePercent = topPlayer ? (topPlayer.pileCount / TOTAL_CARDS) * 100 : 0;
    const bottomPilePercent = bottomPlayer ? (bottomPlayer.pileCount / TOTAL_CARDS) * 100 : 0;
    const winnerName = vm.postGame?.winnerLabel ?? 'Ingen';

    return `<div id="krig-root">
  <div class="kg-table">
    <div class="player-zone ${topPlayer?.isReady ? 'player-zone-ready' : ''}">
      <div class="krig-player-meta">
        ${readyPips(topPlayer?.isReady ?? false)}
        <div class="player-name">${escapeHtml(topPlayer?.displayName ?? 'Guest')}</div>
        <div class="player-count">${topPlayer?.pileCount ?? 0} kort</div>
      </div>
      ${cardStack(topPlayer?.pileCount ?? 0, TABLE_THEME, 'top', topPlayer?.isReady ?? false)}
    </div>

    <div class="battle-zone">
      <div class="krig-seat-anchor krig-seat-anchor-top ${topPlayer?.isReady ? 'krig-seat-anchor-ready' : ''}">
        ${tableCard(topPlayer, TABLE_THEME, true)}
      </div>

      <div style="display:flex;flex-direction:column;align-items:center;gap:14px;z-index:10;pointer-events:auto">
        ${vm.warActive ? `
        <div style="text-align:center;margin-bottom:4px">
          <div class="krig-word">KRIG!</div>
          <div class="krig-sub">Krig er erklæret</div>
        </div>` : `
        <div style="text-align:center">
          <div class="score-bar">
            <div class="score-fill p2" style="width:${topPilePercent}%"></div>
            <div class="score-fill p1" style="width:${bottomPilePercent}%"></div>
          </div>
          <div class="score-labels">
            <span>${escapeHtml(bottomPlayer?.displayName ?? 'Guest')}</span>: ${bottomPlayer?.pileCount ?? 0} &nbsp;
            <span>${escapeHtml(topPlayer?.displayName ?? 'Guest')}</span>: ${topPlayer?.pileCount ?? 0}
          </div>
        </div>`}

        <button class="flip-btn" data-action="flip-card" ${vm.canFlip ? '' : 'disabled'}>Vend!</button>

        ${vm.centerPileSize > 0 ? `<div class="pot-label">${vm.centerPileSize} kort i potten</div>` : ''}
        <div class="status-msg">${escapeHtml(vm.statusText)}</div>
      </div>

      <div class="krig-seat-anchor krig-seat-anchor-bottom ${bottomPlayer?.isReady ? 'krig-seat-anchor-ready' : ''}">
        ${tableCard(bottomPlayer, TABLE_THEME, false)}
      </div>
    </div>

    <div class="player-zone ${bottomPlayer?.isReady ? 'player-zone-ready' : ''}">
      ${cardStack(bottomPlayer?.pileCount ?? 0, TABLE_THEME, 'bottom', bottomPlayer?.isReady ?? false)}
      <div class="krig-player-meta">
        ${readyPips(bottomPlayer?.isReady ?? false)}
        <div class="player-name">${escapeHtml(bottomPlayer?.displayName ?? 'Guest')}</div>
        <div class="player-count">${bottomPlayer?.pileCount ?? 0} kort</div>
      </div>
    </div>

    ${vm.postGame ? `
    <div class="overlay">
      <div class="overlay-title">${escapeHtml(winnerName)}</div>
      <div class="overlay-sub">${vm.postGame.isTie ? 'Uafgjort' : 'Vinder af krig!'}</div>
      <div class="bodega-quip">${escapeHtml(vm.postGame.rematchStatusText)}</div>
      <button class="new-game-btn" data-action="request-rematch" ${vm.postGame.rematchDisabled ? 'disabled' : ''}>${escapeHtml(vm.postGame.rematchButtonLabel)}</button>
    </div>` : ''}

    <button class="game-room-leave-btn kg-leave-btn" data-action="leave-table">← Forlad</button>
  </div>
</div>`;
}

function tableCard(
    player: KrigViewModel['players'][number] | null,
    theme: CardTheme,
    fromTop: boolean,
): string {
    if (!player) {
        return emptyCardSlot();
    }

    if (player.stakeCount > 0) {
        return warHand(player.stakeCount, player.tableCard.kind === 'face' ? player.tableCard.cardCode ?? null : null, theme, player.isRoundWinner, player.isRoundLoser, fromTop);
    }

    if (player.tableCard.kind === 'face' && player.tableCard.cardCode) {
        return battleCard(player.tableCard.cardCode, theme, player.isRoundWinner, player.isRoundLoser, player.isSelf ? 'self-card' : 'opponent-card');
    }

    if (player.tableCard.kind === 'back') {
        return renderGCardBack(CARD_WIDTH, CARD_HEIGHT, theme, `${player.playerId}-${fromTop ? 'top' : 'bottom'}`);
    }

    return emptyCardSlot();
}

function emptyCardSlot(): string {
    return `<div style="width:${CARD_WIDTH}px;height:${CARD_HEIGHT}px;border-radius:6px;border:1.5px dashed rgba(212,175,106,0.1)"></div>`;
}

function cardStack(count: number, theme: CardTheme, uid: string, ready: boolean): string {
    const layers = Math.min(count, 4);
    if (layers === 0) {
        return `<div class="krig-stack-shell ${ready ? 'krig-stack-shell-ready' : ''}" style="width:${STACK_WIDTH}px;height:${STACK_HEIGHT}px;border-radius:${theme.cardRadius}px;border:2px dashed rgba(212,175,106,0.12);display:flex;align-items:center;justify-content:center"><span style="color:rgba(212,175,106,0.18);font-size:18px">∅</span></div>`;
    }

    const cards = Array.from({ length: layers }, (_, index) => {
        const offset = (layers - 1 - index) * 2;
        return `<div style="position:absolute;top:${offset}px;left:${offset}px;opacity:${index === layers - 1 ? 1 : 0.65}">${renderGCardBack(STACK_WIDTH, STACK_HEIGHT, theme, `${uid}-${index}`)}</div>`;
    }).join('');

    return `<div class="krig-stack-shell ${ready ? 'krig-stack-shell-ready' : ''}" style="width:${STACK_WIDTH + 8}px;height:${STACK_HEIGHT + 8}px;position:relative;flex-shrink:0">${cards}</div>`;
}

function battleCard(cardCode: string, theme: CardTheme, win: boolean, lose: boolean, role: string): string {
    const card = parseCardCode(cardCode);
    if (!card) {
        return emptyCardSlot();
    }

    const classes = ['card-flip', win ? 'card-win' : '', lose ? 'card-lose' : ''].filter(Boolean).join(' ');
    return `<div class="${classes}" data-role="${role}">${renderGPlayingCard(card, theme, CARD_WIDTH, CARD_HEIGHT)}</div>`;
}

function warHand(
    stakeCount: number,
    faceUpCardCode: string | null,
    theme: CardTheme,
    win: boolean,
    lose: boolean,
    fromTop: boolean,
): string {
    const animation = fromTop ? 'slide-down' : 'slide-up';
    const downCards = Array.from({ length: stakeCount }, (_, index) =>
        `<div style="margin-left:${index > 0 ? -16 : 0}px;animation:${animation} ${0.18 + index * 0.09}s ease both">${renderGCardBack(50, 70, theme, `war-${fromTop ? 'top' : 'bottom'}-${index}`)}</div>`
    ).join('');
    const faceUpCard = faceUpCardCode ? battleCard(faceUpCardCode, theme, win, lose, fromTop ? 'top-war-card' : 'bottom-war-card') : '';
    const divider = downCards && faceUpCard ? `<div style="width:1px;height:55px;background:rgba(212,175,106,0.18);flex-shrink:0"></div>` : '';

    return `<div style="display:flex;align-items:center;gap:8px"><div style="display:flex">${downCards}</div>${divider}${faceUpCard}</div>`;
}

function parseCardCode(cardCode: string): { rank: string; suit: { s: string; red: boolean } } | null {
    const normalized = cardCode.trim().toUpperCase();
    if (normalized.length < 2) {
        return null;
    }

    const suit = normalized[0];
    const rank = normalized.slice(1);
    if (!['H', 'D', 'C', 'S'].includes(suit)) {
        return null;
    }
    if (!['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'].includes(rank)) {
        return null;
    }

    return {
        rank,
        suit: suit === 'H'
            ? { s: '♥', red: true }
            : suit === 'D'
                ? { s: '♦', red: true }
                : suit === 'C'
                    ? { s: '♣', red: false }
                    : { s: '♠', red: false },
    };
}

function escapeHtml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}

function resolveSeatPlayers(vm: KrigViewModel): {
    topPlayer: KrigViewModel['players'][number] | null;
    bottomPlayer: KrigViewModel['players'][number] | null;
} {
    const selfPlayer = vm.players.find((player) => player.isSelf) ?? null;
    const opponentPlayer = vm.players.find((player) => !player.isSelf) ?? null;

    if (selfPlayer) {
        return {
            topPlayer: opponentPlayer,
            bottomPlayer: selfPlayer,
        };
    }

    return {
        topPlayer: vm.players[1] ?? null,
        bottomPlayer: vm.players[0] ?? null,
    };
}

function readyPips(isReady: boolean): string {
    return `<div class="krig-ready-pips ${isReady ? 'krig-ready-pips-active' : ''}" aria-hidden="true">
  <span></span>
  <span></span>
  <span></span>
</div>`;
}
