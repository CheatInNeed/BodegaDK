<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { RoomSessionState } from '@/lib/game-room/types';
import { renderCardFront, renderHandFan, HAND_CARD_W, HAND_CARD_H } from '@/lib/games/shared/game-cards';
import GameTable from '@/components/game-room/GameTable.vue';
import PlayerBadge from '@/components/game-room/PlayerBadge.vue';
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

const { t } = useI18n();

const selectedStackIds = ref<string[]>([]);
const CW = 64, CH = 90;

function tableStacksHtml(): string {
  const stacks = props.viewModel?.tableStacks ?? [];
  if (stacks.length === 0) return '';
  const selectedSet = new Set(selectedStackIds.value);
  return stacks.map((stack: any) => {
    const isSel = selectedSet.has(stack.stackId);
    const borderStyle = isSel ? 'border:2px solid #ffb300;' : 'border:2px solid transparent;';
    const lockText = stack.locked ? t('room.casino.locked') : t('room.casino.open');
    return `<button data-action="casino-toggle-table" data-stack-id="${stack.stackId}"
      style="background:rgba(255,255,255,0.05);border-radius:12px;${borderStyle}padding:8px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px;">
      ${renderCardFront(stack.topCard, CW, CH)}
      <span style="font-size:10px;color:var(--gt-text-muted);">${t('room.casino.total', { total: stack.total })}</span>
      <span style="font-size:9px;color:rgba(255,255,255,0.3);">${lockText}</span>
    </button>`;
  }).join('');
}

function handCardsHtml(): string {
  const hand = props.viewModel?.hand ?? [];
  if (hand.length === 0) return '';
  const codes = hand.map((item: any) => typeof item === 'string' ? item : item.card);
  const selected = new Set(props.state.selectedHandCards);
  return renderHandFan(codes, selected, true, true, HAND_CARD_W, HAND_CARD_H);
}

function onTableStackClick(e: Event) {
  const target = (e.target as HTMLElement).closest('[data-action="casino-toggle-table"]') as HTMLElement | null;
  if (target?.dataset.stackId) {
    const stackId = target.dataset.stackId;
    const idx = selectedStackIds.value.indexOf(stackId);
    if (idx >= 0) {
      selectedStackIds.value.splice(idx, 1);
    } else {
      selectedStackIds.value.push(stackId);
    }
  }
}

function onHandClick(e: Event) {
  const target = (e.target as HTMLElement).closest('[data-action="toggle-card"]') as HTMLElement | null;
  if (target?.dataset.card) {
    emit('toggle-card', target.dataset.card);
  }
}

function playMove() {
  const handCard = props.state.selectedHandCards[0];
  if (!handCard) return;
  emit('send-intent', {
    type: 'CASINO_PLAY_MOVE',
    handCard,
    captureStackIds: selectedStackIds.value,
  });
  selectedStackIds.value = [];
}

function buildStack() {
  const handCard = props.state.selectedHandCards[0];
  if (!handCard || selectedStackIds.value.length !== 1) return;
  emit('send-intent', {
    type: 'CASINO_BUILD_STACK',
    handCard,
    targetStackId: selectedStackIds.value[0],
  });
  selectedStackIds.value = [];
}

function requestRematch() {
  emit('send-intent', { type: 'REQUEST_REMATCH' });
}
</script>

<template>
  <GameTable :state="state" layout="duel" :game-title="t('game.casino')" :is-my-turn="!!viewModel?.isMyTurn">
    <!-- Topbar -->
    <template #topbar>
      <span class="gt-connection-pill">{{ t('room.casino.deck', { count: viewModel?.deckCount ?? 0 }) }}</span>
    </template>

    <!-- Opponents -->
    <template #opponents>
      <div
        v-for="player in (viewModel?.players ?? []).filter((p: any) => p.playerId !== viewModel?.selfPlayerId)"
        :key="player.playerId"
        style="display:flex;align-items:center;gap:12px;"
      >
        <PlayerBadge
          :name="player.displayName"
          :score="t('room.casino.captured', { count: (viewModel?.capturedCounts ?? {})[player.playerId] ?? 0 })"
          :is-current-turn="player.playerId === viewModel?.turnPlayerId"
        />
      </div>
    </template>

    <!-- Center: table stacks -->
    <template #center>
      <div style="display:flex;flex-direction:column;align-items:center;gap:14px;">
        <div style="display:flex;flex-wrap:wrap;justify-content:center;gap:10px;" @click="onTableStackClick" v-html="tableStacksHtml()"></div>
      </div>
    </template>

    <!-- Actions -->
    <template #actions>
      <button
        class="gt-btn"
        :disabled="!viewModel?.isMyTurn || !state.selectedHandCards.length || state.connection !== 'connected'"
        @click="playMove"
      >{{ t('room.casino.capture') }}</button>
      <button
        class="gt-btn gt-btn--secondary"
        :disabled="!viewModel?.isMyTurn || !state.selectedHandCards.length || selectedStackIds.length !== 1 || state.connection !== 'connected'"
        @click="buildStack"
      >{{ t('room.casino.build') }}</button>
    </template>

    <!-- Hand -->
    <template #hand>
      <div @click="onHandClick" v-html="handCardsHtml()"></div>
    </template>

    <!-- Overlay -->
    <template #overlay>
      <WinOverlay
        v-if="viewModel?.postGame || state.winnerPlayerId"
        :winner-label="state.winnerPlayerId === state.playerId ? t('room.win.youWon') : t('room.win.youLost')"
        :subtitle="t('room.win.gameOver')"
        :is-victory="!!state.winnerPlayerId && state.winnerPlayerId === state.playerId"
        @action="requestRematch"
      />
    </template>
  </GameTable>
</template>
