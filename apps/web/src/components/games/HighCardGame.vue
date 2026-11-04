<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { RoomSessionState } from '@/lib/game-room/types';
import { renderCardFront, renderHandFan } from '@/lib/games/shared/game-cards';
import GameTable from '@/components/game-room/GameTable.vue';
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

const CW = 78, CH = 109;

function centerCardHtml(): string {
  const cardCode = props.viewModel?.middleCard;
  if (!cardCode) return '';
  return renderCardFront(cardCode, 96, 134);
}

function handCardsHtml(): string {
  const hand: Array<{ card: string; selected: boolean }> = props.viewModel?.hand ?? [];
  if (hand.length === 0) return '';
  const codes = hand.map((h) => h.card);
  const selected = new Set(props.state.selectedHandCards);
  return renderHandFan(codes, selected, true, true, CW, CH);
}

function playSelected() {
  if (props.state.selectedHandCards.length === 0) return;
  emit('send-intent', { type: 'PLAY_SELECTED', claimRank: '' });
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
  <GameTable :state="state" layout="duel" :game-title="t('game.highcard')" :history-entries="viewModel?.history">
    <!-- Topbar -->
    <template #topbar>
      <span class="gt-connection-pill">{{ t('room.highcard.score', { you: viewModel?.scoreYou ?? 0, dealer: viewModel?.scoreDealer ?? 0 }) }}</span>
    </template>

    <!-- Center: middle card -->
    <template #center>
      <div v-html="centerCardHtml()"></div>
    </template>

    <!-- Actions -->
    <template #actions>
      <button
        class="gt-btn"
        :disabled="state.selectedHandCards.length === 0 || state.connection !== 'connected'"
        @click="playSelected"
      >{{ t('room.highcard.play') }}</button>
    </template>

    <!-- Hand -->
    <template #hand>
      <div @click="onHandClick" v-html="handCardsHtml()"></div>
    </template>

    <!-- Overlay -->
    <template #overlay>
      <WinOverlay
        v-if="viewModel?.isFinished"
        :winner-label="viewModel.didWin ? t('room.win.youWon') : t('room.highcard.dealerWon')"
        :subtitle="t('room.highcard.finalScore', { you: viewModel?.scoreYou ?? 0, dealer: viewModel?.scoreDealer ?? 0 })"
        :is-victory="viewModel.didWin"
        @action="requestRematch"
      />
    </template>
  </GameTable>
</template>
