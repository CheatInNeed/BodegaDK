<script setup lang="ts">
import { useRouter } from 'vue-router';
import type { RoomSessionState } from '@/lib/game-room/types';
import { CARD_THEMES, renderGCardBack, renderGPlayingCard } from '@/lib/games/shared/game-cards';
import WinOverlay from '@/components/game-room/WinOverlay.vue';

const props = defineProps<{
  state: RoomSessionState;
  viewModel: any;
}>();

const emit = defineEmits<{
  'toggle-card': [card: string];
  'send-intent': [intent: any];
  'send-message': [message: any];
}>();

const router = useRouter();
const TABLE_THEME = CARD_THEMES.nordisk;
const CARD_WIDTH = 80;
const CARD_HEIGHT = 112;
const STACK_WIDTH = 58;
const STACK_HEIGHT = 81;
const TOTAL_CARDS = 52;

type KrigPlayer = {
  playerId: string;
  displayName: string;
  pileCount: number;
  stakeCount: number;
  tableCard: { kind: string; cardCode?: string; label?: string };
  isSelf: boolean;
  isReady: boolean;
  isRoundWinner: boolean;
  isRoundLoser: boolean;
  callout: string | null;
};

function resolveSeatPlayers(): { topPlayer: KrigPlayer | null; bottomPlayer: KrigPlayer | null } {
  const players: KrigPlayer[] = props.viewModel?.players ?? [];
  const selfPlayer = players.find((p) => p.isSelf) ?? null;
  const opponentPlayer = players.find((p) => !p.isSelf) ?? null;
  if (selfPlayer) {
    return { topPlayer: opponentPlayer, bottomPlayer: selfPlayer };
  }
  return { topPlayer: players[1] ?? null, bottomPlayer: players[0] ?? null };
}

function parseCardCode(cardCode: string): { rank: string; suit: { s: string; red: boolean } } | null {
  const normalized = cardCode.trim().toUpperCase();
  if (normalized.length < 2) return null;
  const suit = normalized[0];
  const rank = normalized.slice(1);
  if (!['H', 'D', 'C', 'S'].includes(suit)) return null;
  if (!['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'].includes(rank)) return null;
  return {
    rank,
    suit: suit === 'H' ? { s: '\u2665', red: true }
      : suit === 'D' ? { s: '\u2666', red: true }
      : suit === 'C' ? { s: '\u2663', red: false }
      : { s: '\u2660', red: false },
  };
}

function emptyCardSlotHtml(): string {
  return `<div style="width:${CARD_WIDTH}px;height:${CARD_HEIGHT}px;border-radius:6px;border:1.5px dashed rgba(212,175,106,0.1)"></div>`;
}

function cardStackHtml(count: number, uid: string, ready: boolean): string {
  const layers = Math.min(count, 4);
  if (layers === 0) {
    return `<div class="krig-stack-shell ${ready ? 'krig-stack-shell-ready' : ''}" style="width:${STACK_WIDTH}px;height:${STACK_HEIGHT}px;border-radius:${TABLE_THEME.cardRadius}px;border:2px dashed rgba(212,175,106,0.12);display:flex;align-items:center;justify-content:center"><span style="color:rgba(212,175,106,0.18);font-size:18px">\u2205</span></div>`;
  }
  const cards = Array.from({ length: layers }, (_, index) => {
    const offset = (layers - 1 - index) * 2;
    return `<div style="position:absolute;top:${offset}px;left:${offset}px;opacity:${index === layers - 1 ? 1 : 0.65}">${renderGCardBack(STACK_WIDTH, STACK_HEIGHT, TABLE_THEME, `${uid}-${index}`)}</div>`;
  }).join('');
  return `<div class="krig-stack-shell ${ready ? 'krig-stack-shell-ready' : ''}" style="width:${STACK_WIDTH + 8}px;height:${STACK_HEIGHT + 8}px;position:relative;flex-shrink:0">${cards}</div>`;
}

function battleCardHtml(cardCode: string, win: boolean, lose: boolean, role: string, warReveal: boolean): string {
  const card = parseCardCode(cardCode);
  if (!card) return emptyCardSlotHtml();
  const flipClass = warReveal ? 'card-war-reveal' : 'card-flip';
  const classes = [flipClass, win ? 'card-win' : '', lose ? 'card-lose' : ''].filter(Boolean).join(' ');
  return `<div class="${classes}" data-role="${role}">${renderGPlayingCard(card, TABLE_THEME, CARD_WIDTH, CARD_HEIGHT)}</div>`;
}

function warHandHtml(stakeCount: number, faceUpCardCode: string | null, win: boolean, lose: boolean, fromTop: boolean, warReveal: boolean): string {
  const animation = fromTop ? 'slide-down' : 'slide-up';
  const downCards = Array.from({ length: stakeCount }, (_, index) =>
    `<div style="margin-left:${index > 0 ? -16 : 0}px;animation:${animation} ${0.18 + index * 0.09}s ease both">${renderGCardBack(50, 70, TABLE_THEME, `war-${fromTop ? 'top' : 'bottom'}-${index}`)}</div>`
  ).join('');
  const faceUpCard = faceUpCardCode ? battleCardHtml(faceUpCardCode, win, lose, fromTop ? 'top-war-card' : 'bottom-war-card', warReveal) : '';
  const divider = downCards && faceUpCard ? `<div style="width:1px;height:55px;background:rgba(212,175,106,0.18);flex-shrink:0"></div>` : '';
  return `<div style="display:flex;align-items:center;gap:8px"><div style="display:flex">${downCards}</div>${divider}${faceUpCard}</div>`;
}

function tableCardHtml(player: KrigPlayer | null, fromTop: boolean, isWarReveal: boolean): string {
  if (!player) return emptyCardSlotHtml();
  if (player.stakeCount > 0) {
    return warHandHtml(
      player.stakeCount,
      player.tableCard.kind === 'face' ? player.tableCard.cardCode ?? null : null,
      player.isRoundWinner,
      player.isRoundLoser,
      fromTop,
      isWarReveal,
    );
  }
  if (player.tableCard.kind === 'face' && player.tableCard.cardCode) {
    return battleCardHtml(player.tableCard.cardCode, player.isRoundWinner, player.isRoundLoser, player.isSelf ? 'self-card' : 'opponent-card', isWarReveal);
  }
  if (player.tableCard.kind === 'back') {
    return renderGCardBack(CARD_WIDTH, CARD_HEIGHT, TABLE_THEME, `${player.playerId}-${fromTop ? 'top' : 'bottom'}`);
  }
  return emptyCardSlotHtml();
}

function flipCard() {
  emit('send-intent', { type: 'FLIP_CARD' });
}

function requestRematch() {
  emit('send-intent', { type: 'REQUEST_REMATCH' });
}

function leaveTable() {
  router.push('/lobbies');
}
</script>

<template>
  <div id="krig-root">
    <div class="kg-table">
      <!-- Top player (opponent) -->
      <div
        class="player-zone"
        :class="{ 'player-zone-ready': resolveSeatPlayers().topPlayer?.isReady }"
      >
        <div class="krig-player-meta">
          <div
            class="krig-ready-pips"
            :class="{ 'krig-ready-pips-active': resolveSeatPlayers().topPlayer?.isReady }"
            aria-hidden="true"
          >
            <span></span><span></span><span></span>
          </div>
          <div class="player-name">{{ resolveSeatPlayers().topPlayer?.displayName ?? 'Guest' }}</div>
          <div class="player-count">{{ resolveSeatPlayers().topPlayer?.pileCount ?? 0 }} kort</div>
        </div>
        <div v-html="cardStackHtml(resolveSeatPlayers().topPlayer?.pileCount ?? 0, 'top', resolveSeatPlayers().topPlayer?.isReady ?? false)"></div>
      </div>

      <!-- Battle zone -->
      <div class="battle-zone">
        <!-- Top player's card -->
        <div
          class="krig-seat-anchor krig-seat-anchor-top"
          :class="{ 'krig-seat-anchor-ready': resolveSeatPlayers().topPlayer?.isReady }"
          v-html="tableCardHtml(resolveSeatPlayers().topPlayer, true, viewModel?.isWarReveal ?? false)"
        ></div>

        <!-- Center area -->
        <div style="display:flex;flex-direction:column;align-items:center;gap:14px;z-index:10;pointer-events:auto">
          <div v-if="viewModel?.warActive" style="text-align:center;margin-bottom:4px">
            <div class="krig-word" :class="{ 'krig-word--new': viewModel?.warJustDeclared }">KRIG!</div>
            <div class="krig-sub">Krig er erkl&aelig;ret</div>
          </div>
          <div v-else style="text-align:center">
            <div class="score-bar">
              <div class="score-fill p2" :style="{ width: ((resolveSeatPlayers().topPlayer?.pileCount ?? 0) / TOTAL_CARDS * 100) + '%' }"></div>
              <div class="score-fill p1" :style="{ width: ((resolveSeatPlayers().bottomPlayer?.pileCount ?? 0) / TOTAL_CARDS * 100) + '%' }"></div>
            </div>
            <div class="score-labels">
              <span>{{ resolveSeatPlayers().bottomPlayer?.displayName ?? 'Guest' }}</span>: {{ resolveSeatPlayers().bottomPlayer?.pileCount ?? 0 }}
              &nbsp;
              <span>{{ resolveSeatPlayers().topPlayer?.displayName ?? 'Guest' }}</span>: {{ resolveSeatPlayers().topPlayer?.pileCount ?? 0 }}
            </div>
          </div>

          <button class="flip-btn" :disabled="!viewModel?.canFlip" @click="flipCard">Vend!</button>

          <div v-if="viewModel?.centerPileSize > 0" class="pot-label">{{ viewModel.centerPileSize }} kort i potten</div>
        </div>

        <!-- Bottom player's card -->
        <div
          class="krig-seat-anchor krig-seat-anchor-bottom"
          :class="{ 'krig-seat-anchor-ready': resolveSeatPlayers().bottomPlayer?.isReady }"
          v-html="tableCardHtml(resolveSeatPlayers().bottomPlayer, false, viewModel?.isWarReveal ?? false)"
        ></div>
      </div>

      <!-- Bottom player (self) -->
      <div
        class="player-zone"
        :class="{ 'player-zone-ready': resolveSeatPlayers().bottomPlayer?.isReady }"
      >
        <div v-html="cardStackHtml(resolveSeatPlayers().bottomPlayer?.pileCount ?? 0, 'bottom', resolveSeatPlayers().bottomPlayer?.isReady ?? false)"></div>
        <div class="krig-player-meta">
          <div
            class="krig-ready-pips"
            :class="{ 'krig-ready-pips-active': resolveSeatPlayers().bottomPlayer?.isReady }"
            aria-hidden="true"
          >
            <span></span><span></span><span></span>
          </div>
          <div class="player-name">{{ resolveSeatPlayers().bottomPlayer?.displayName ?? 'Guest' }}</div>
          <div class="player-count">{{ resolveSeatPlayers().bottomPlayer?.pileCount ?? 0 }} kort</div>
        </div>
      </div>

      <!-- Post-game overlay -->
      <WinOverlay
        v-if="viewModel?.postGame"
        :winner-label="viewModel.postGame.winnerLabel ?? 'Ingen'"
        :subtitle="viewModel.postGame.isTie ? 'Uafgjort' : 'Vinder af krig!'"
        :quip="viewModel.postGame.rematchStatusText"
        :button-label="viewModel.postGame.rematchButtonLabel"
        :button-disabled="viewModel.postGame.rematchDisabled"
        @action="requestRematch"
      />

      <button class="game-room-leave-btn kg-leave-btn" @click="leaveTable">&larr; Forlad</button>
    </div>
  </div>
</template>
