<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { RoomSessionState } from '@/lib/game-room/types';
import { renderHandFan, renderCardStack, HAND_CARD_W, HAND_CARD_H } from '@/lib/games/shared/game-cards';
import { arrangeSeats, createLayoutSpec } from '@/lib/game-room/ui';
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

const claimRank = ref('A');

const layout = createLayoutSpec({ maxPlayers: 8, preferredLayout: 'ring' });

function getOpponentSeats() {
  const seats = arrangeSeats(props.viewModel?.seats ?? [], layout);
  return seats.filter((s: any) => !s.isSelf);
}

function handCardsHtml(): string {
  const hand: Array<{ card: string; selected: boolean }> = props.viewModel?.hand ?? [];
  if (hand.length === 0) return `<span style="font-size:12px;color:rgba(255,255,255,0.25);font-style:italic;">${t('room.snyd.noCards')}</span>`;
  const codes = hand.map((h) => h.card);
  const selected = new Set(props.state.selectedHandCards);
  return renderHandFan(codes, selected, true, true, HAND_CARD_W, HAND_CARD_H);
}

function seatStackHtml(seat: any): string {
  if (typeof seat.stackCount === 'number' && seat.stackCount > 0) {
    return renderCardStack(seat.stackCount, 42, 59, `snyd-${seat.playerId}`);
  }
  return '';
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

function onHandClick(e: Event) {
  const target = (e.target as HTMLElement).closest('[data-action="toggle-card"]') as HTMLElement | null;
  if (target?.dataset.card) {
    emit('toggle-card', target.dataset.card);
  }
}
</script>

<template>
  <GameTable :state="state" layout="ring" :game-title="t('game.cheat')" :is-my-turn="!!viewModel?.isMyTurn">
    <!-- Topbar -->
    <template #topbar>
      <span class="gt-connection-pill">{{ t('room.snyd.pile', { count: viewModel?.pileCount ?? 0 }) }}</span>
    </template>

    <!-- Opponents: ring seats -->
    <template #opponents>
      <div
        v-for="seat in getOpponentSeats()"
        :key="seat.playerId"
        style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:8px 14px;"
      >
        <PlayerBadge
          :name="seat.label"
          :is-current-turn="seat.isCurrentTurn"
        />
        <div v-if="typeof seat.stackCount === 'number'" v-html="seatStackHtml(seat)"></div>
        <div v-if="seat.callout" style="font-size:11px;color:var(--gt-gold);margin-top:4px;">{{ seat.callout }}</div>
      </div>
    </template>

    <!-- Center: last claim -->
    <template #center>
      <div v-if="viewModel?.lastClaimText" style="font-size:13px;color:rgba(255,255,255,0.45);text-align:center;">
        {{ viewModel.lastClaimText }}
      </div>
    </template>

    <!-- Actions -->
    <template #actions>
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--gt-text-muted);">
        {{ t('room.snyd.claimRank') }}
        <input
          v-model="claimRank"
          maxlength="2"
          style="width:40px;background:rgba(255,255,255,0.08);border:1px solid var(--gt-border-accent);border-radius:6px;color:var(--gt-text-primary);font-size:14px;padding:4px 8px;text-align:center;"
        />
      </label>
      <button
        class="gt-btn"
        :disabled="state.selectedHandCards.length === 0 || !viewModel?.isMyTurn || state.connection !== 'connected'"
        @click="playCards"
      >{{ t('room.snyd.play', { count: state.selectedHandCards.length }) }}</button>
      <button
        class="gt-btn gt-btn--secondary"
        :disabled="!viewModel?.isMyTurn || state.connection !== 'connected'"
        @click="callSnyd"
      >{{ t('room.snyd.call') }}</button>
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
        :subtitle="t('room.win.roundOver')"
        :is-victory="!!state.winnerPlayerId && state.winnerPlayerId === state.playerId"
        @action="requestRematch"
      />
    </template>
  </GameTable>
</template>
