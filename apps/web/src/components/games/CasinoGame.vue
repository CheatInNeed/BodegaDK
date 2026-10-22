<script setup lang="ts">
import { ref, inject, type Ref } from 'vue';
import type { RoomSessionState } from '@/lib/game-room/types';
import { renderCard } from '@/lib/game-room/ui';
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

const handTrayOpen = inject<Ref<boolean>>('handTrayOpen', { value: true } as any);
const selectedStackIds = ref<string[]>([]);

function parseCardCode(cardCode: string): { rank: string; suit: string; suitColor: 'red' | 'black' } {
  const normalized = cardCode.trim().toUpperCase();
  const suitKey = normalized.charAt(0);
  const rank = normalized.slice(1) || '?';
  if (suitKey === 'H') return { rank, suit: '\u2665', suitColor: 'red' };
  if (suitKey === 'D') return { rank, suit: '\u2666', suitColor: 'red' };
  if (suitKey === 'S') return { rank, suit: '\u2660', suitColor: 'black' };
  if (suitKey === 'C') return { rank, suit: '\u2663', suitColor: 'black' };
  return { rank: normalized, suit: '\u2022', suitColor: 'black' };
}

function renderFaceCard(cardCode: string): string {
  const parsed = parseCardCode(cardCode);
  const colorClass = parsed.suitColor === 'red' ? 'red' : 'black';
  return `<span class="play-card-face ${colorClass}">
    <span class="play-card-corner">${parsed.rank}${parsed.suit}</span>
    <span class="play-card-center">${parsed.suit}</span>
    <span class="play-card-corner rotate">${parsed.rank}${parsed.suit}</span>
  </span>`;
}

function tableStacksHtml(): string {
  const stacks = props.viewModel?.tableStacks ?? [];
  if (stacks.length === 0) return '<span class="muted">No stacks on table</span>';
  const selectedSet = new Set(selectedStackIds.value);
  return stacks.map((stack: any) => {
    const selectedClass = selectedSet.has(stack.stackId) ? 'selected' : '';
    const lockText = stack.locked ? 'LOCKED' : 'OPEN';
    return `<button class="play-card table-card ${selectedClass}" data-action="casino-toggle-table" data-stack-id="${stack.stackId}">
      ${renderFaceCard(stack.topCard)}
      <span class="pill">Total: ${stack.total}</span>
      <span class="pill">${lockText}</span>
    </button>`;
  }).join('');
}

function handCardsHtml(): string {
  const hand = props.viewModel?.hand ?? [];
  if (hand.length === 0) return '<span class="muted">No cards in hand</span>';
  return hand.map((item: any, index: number) => {
    const card = typeof item === 'string' ? item : item.card;
    const selected = props.state.selectedHandCards.includes(card);
    return `<button class="play-card ${selected ? 'selected' : ''}" data-action="toggle-card" data-card="${card}" style="--card-offset:${index * 16}px">
      ${renderFaceCard(card)}
    </button>`;
  }).join('');
}

function playerRowsHtml(): string {
  const players = props.viewModel?.players ?? [];
  return players.map((player: any) => {
    const playerId = player.playerId;
    const captured = (props.viewModel?.capturedCounts ?? {})[playerId] ?? 0;
    const role = playerId === props.viewModel?.dealerPlayerId ? 'Dealer' : 'Non-dealer';
    const current = playerId === props.viewModel?.turnPlayerId ? ' \u00b7 Turn' : '';
    const you = playerId === props.viewModel?.selfPlayerId ? ' (You)' : '';
    return `<div class="pill">${player.displayName}${you} \u00b7 ${role} \u00b7 Captured: ${captured}${current}</div>`;
  }).join('');
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

function onHandCardClick(e: Event) {
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
  <section class="card room-card room-table-card">
    <div class="room-header-row">
      <div class="pill">Room: {{ viewModel?.roomCode ?? state.roomCode }}</div>
      <div class="pill">Game: Casino</div>
      <div class="pill">Deck left: {{ viewModel?.deckCount ?? 0 }}</div>
    </div>

    <div class="card-row" v-html="playerRowsHtml()"></div>

    <div class="card-row">
      <span class="pill">{{ viewModel?.turnPlayerId ? `Turn: ${viewModel.turnPlayerName}` : 'Waiting for turn' }}</span>
    </div>

    <div class="private-panel">
      <div class="card-title">Table stacks</div>
      <div class="private-hand-row" @click="onTableStackClick" v-html="tableStacksHtml()"></div>
    </div>

    <div
      class="private-panel room-hand-tray"
      :class="{ 'is-open': handTrayOpen }"
      data-room-hand-tray
      :aria-hidden="handTrayOpen ? 'false' : 'true'"
    >
      <div class="card-title">Your hand</div>
      <div class="private-hand-row" @click="onHandCardClick" v-html="handCardsHtml()"></div>
    </div>

    <div class="card-row room-actions">
      <button
        class="btn primary"
        :disabled="!viewModel?.isMyTurn || !state.selectedHandCards.length || state.connection !== 'connected'"
        @click="playMove"
      >Capture / Trail</button>
      <button
        class="btn"
        :disabled="!viewModel?.isMyTurn || !state.selectedHandCards.length || selectedStackIds.length !== 1 || state.connection !== 'connected'"
        @click="buildStack"
      >Build stack</button>
    </div>

    <p v-if="!viewModel?.started" class="card-desc">Waiting for 2 players to connect.</p>
  </section>

  <WinOverlay
    v-if="viewModel?.postGame || state.winnerPlayerId"
    :winner-label="viewModel?.postGame?.winnerLabel ?? 'Winner'"
    subtitle="Winner!"
    @action="requestRematch"
  />
</template>
