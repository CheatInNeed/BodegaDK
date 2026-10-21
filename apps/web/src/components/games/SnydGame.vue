<script setup lang="ts">
import { ref, inject, type Ref } from 'vue';
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
const claimRank = ref('A');

const layout = createLayoutSpec({ maxPlayers: 8, preferredLayout: 'ring' });

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

function handCardsHtml(): string {
  const hand = props.viewModel?.hand ?? [];
  if (hand.length === 0) return '<span class="muted">Ingen kort</span>';
  return renderHandCards(hand);
}

function playCards() {
  if (props.state.selectedHandCards.length === 0) return;
  emit('send-intent', { type: 'PLAY_SELECTED', claimRank: claimRank.value });
}

function callSnyd() {
  emit('send-intent', { type: 'CALL_SNYD' });
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
</script>

<template>
  <section class="card room-card room-table-card room-snyd">
    <div class="room-header-row">
      <div class="pill room-header-pill">Room: {{ viewModel?.roomCode ?? state.roomCode }}</div>
      <div class="pill room-header-pill">Tur: {{ viewModel?.turnPlayerId ? viewModel.turnPlayerName : '-' }}</div>
      <div class="pill room-header-pill">N&aelig;ste: {{ viewModel?.nextPlayerId ? viewModel.nextPlayerName : '-' }}</div>
      <div class="pill room-header-pill">Bunke: {{ viewModel?.pileCount ?? 0 }}</div>
    </div>

    <div class="table-stage game-room-table game-room-table--ring table-snyd">
      <div class="table-bg-grain"></div>
      <div class="table-top">
        <div class="table-felt"></div>
        <div class="table-center-shell table-center-shell--focus">
          <div class="table-center-info">
            <div class="table-title">Snyd</div>
            <div class="table-center-stat-row">
              <span class="pill table-center-stat">Bunke {{ viewModel?.pileCount ?? 0 }}</span>
              <span class="pill table-center-stat">{{ viewModel?.isMyTurn ? 'Din tur' : 'Venter p&aring; tur' }}</span>
            </div>
            <div class="table-sub">{{ viewModel?.lastClaimText ?? '' }}</div>
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
      <div class="card-title">Din h&aring;nd</div>
      <div class="private-hand-row" @click="onHandCardClick" v-html="handCardsHtml()"></div>
      <div class="card-row room-actions">
        <label class="claim-label">Meldt rang
          <input class="claim-input" v-model="claimRank" maxlength="2" />
        </label>
        <button
          class="btn primary"
          :disabled="state.selectedHandCards.length === 0 || !viewModel?.isMyTurn || state.connection !== 'connected'"
          @click="playCards"
        >Spil valgte ({{ state.selectedHandCards.length }})</button>
        <button
          class="btn"
          :disabled="!viewModel?.isMyTurn || state.connection !== 'connected'"
          @click="callSnyd"
        >Kald Snyd</button>
      </div>
    </div>
  </section>

  <WinOverlay
    v-if="viewModel?.postGame || state.winnerPlayerId"
    :winner-label="viewModel?.postGame?.winnerLabel ?? 'Winner'"
    subtitle="Vinder!"
    @action="requestRematch"
  />
</template>
