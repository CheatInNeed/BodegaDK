<script setup lang="ts">
import { inject, type Ref } from 'vue';
import type { RoomSessionState } from '@/lib/game-room/types';
import { renderCard, renderHandCards, arrangeSeats, createLayoutSpec } from '@/lib/game-room/ui';
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

const layout = createLayoutSpec({ maxPlayers: 2, preferredLayout: 'duel' });

function getSeats() {
  return arrangeSeats(props.viewModel?.seats ?? [], layout);
}

function seatBadgeClass(seat: any): string {
  return seat.isSelf ? 'seat-badge self' : 'seat-badge';
}

function seatToneClass(seat: any): string {
  return seat.stateTone && seat.stateTone !== 'default' ? ` table-seat-panel-${seat.stateTone}` : '';
}

function renderSeatCard(seat: any): string {
  if (seat.tableCard) {
    return renderCard(seat.tableCard);
  }
  if (typeof seat.stackCount === 'number') {
    return renderCard({ kind: 'stack', count: seat.stackCount });
  }
  return '';
}

function centerCardHtml(): string {
  const cardCode = props.viewModel?.middleCard;
  if (!cardCode) return '';
  return renderCard({ kind: 'face', cardCode, size: 'lg' });
}

function handCardsHtml(): string {
  const hand = props.viewModel?.hand ?? [];
  if (hand.length === 0) return '';
  return renderHandCards(hand);
}

function playSelected() {
  if (props.state.selectedHandCards.length === 0) return;
  emit('send-intent', { type: 'PLAY_SELECTED', claimRank: '' });
}

function requestRematch() {
  emit('send-intent', { type: 'REQUEST_REMATCH' });
}

function onHandCardClick(e: Event) {
  const target = (e.target as HTMLElement).closest('[data-action="toggle-card"]') as HTMLElement | null;
  if (target?.dataset.card) {
    emit('toggle-card', target.dataset.card);
  }
}

function onPlayClick(e: Event) {
  const target = (e.target as HTMLElement).closest('[data-action="play-selected"]') as HTMLElement | null;
  if (target) {
    playSelected();
  }
}
</script>

<template>
  <section class="card room-card room-table-card room-highcard">
    <div class="room-header-row">
      <div class="pill room-header-pill">Room: {{ viewModel?.roomCode ?? state.roomCode }}</div>
      <div class="pill room-header-pill">Game: Single Card Highest Wins</div>
      <div class="pill room-header-pill">Score: You {{ viewModel?.scoreYou ?? 0 }} - {{ viewModel?.scoreDealer ?? 0 }} Dealer</div>
    </div>

    <div class="table-stage game-room-table game-room-table--duel table-highcard">
      <div class="table-bg-grain"></div>
      <div class="table-top">
        <div class="table-felt"></div>
        <div class="table-center-shell table-center-shell--focus">
          <div class="table-center-info game-room-center-card">
            <div class="table-title">Middle card</div>
            <div class="single-card-center-card" v-html="centerCardHtml()"></div>
            <p class="card-desc">Play a card with a higher value.</p>
            <p class="card-desc">{{ viewModel?.feedbackText ?? '' }}</p>
            <p class="card-desc">Last round: {{ viewModel?.lastPlayerCard ?? '-' }} vs {{ viewModel?.lastDealerCard ?? '-' }}</p>
          </div>
        </div>
      </div>

      <div
        v-for="seat in getSeats()"
        :key="seat.playerId"
        class="table-seat"
        :class="seat.positionClass ?? 'seat-top'"
      >
        <div
          class="table-seat-panel"
          :class="[
            seat.isCurrentTurn ? 'current-turn' : '',
            seatToneClass(seat),
          ]"
        >
          <div class="table-seat-badge-row">
            <div :class="seatBadgeClass(seat)">{{ seat.label }}</div>
            <span v-for="badge in (seat.badges ?? [])" :key="badge" class="table-seat-tag">{{ badge }}</span>
            <span v-if="seat.isCurrentTurn" class="table-seat-tag">Current turn</span>
          </div>
          <div v-if="seat.meta" class="table-seat-meta">{{ seat.meta }}</div>
          <div v-if="seat.tableCard || typeof seat.stackCount === 'number'" class="table-seat-card" v-html="renderSeatCard(seat)"></div>
          <div v-if="seat.callout" class="table-seat-callout">{{ seat.callout }}</div>
        </div>
      </div>
    </div>

    <div
      class="private-panel room-hand-tray"
      :class="{ 'is-open': handTrayOpen }"
      data-room-hand-tray
      :aria-hidden="handTrayOpen ? 'false' : 'true'"
    >
      <div class="card-title">Your hand (7 cards)</div>
      <div class="private-hand-row" @click="onHandCardClick" v-html="handCardsHtml()"></div>
      <div class="card-row room-actions">
        <span class="pill">Selected: {{ state.selectedHandCards[0] ?? '-' }}</span>
        <button
          class="btn primary"
          :disabled="state.selectedHandCards.length === 0 || state.connection !== 'connected'"
          @click="playSelected"
        >Play selected card</button>
      </div>
    </div>
  </section>

  <WinOverlay
    v-if="viewModel?.postGame || state.winnerPlayerId"
    :winner-label="viewModel?.postGame?.winnerLabel ?? 'Winner'"
    subtitle="Winner!"
    :button-label="'Rematch'"
    @action="requestRematch"
  />
</template>
