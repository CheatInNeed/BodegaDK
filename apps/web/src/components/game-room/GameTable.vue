<script setup lang="ts">
import { ref, provide, useSlots } from 'vue';
import { useRouter } from 'vue-router';
import type { RoomSessionState } from '@/lib/game-room/types';

const props = defineProps<{
  state: RoomSessionState;
  layout: 'duel' | 'ring';
  gameTitle: string;
  /** Turn-based games only; omit for games without turns. */
  isMyTurn?: boolean;
}>();

const router = useRouter();
const slots = useSlots();

const handTrayOpen = ref(true);
provide('handTrayOpen', handTrayOpen);
provide('toggleHandTray', () => { handTrayOpen.value = !handTrayOpen.value; });

function leaveTable() {
  if (props.state.connection === 'connected') {
    if (!confirm(`Forlad ${props.gameTitle}?`)) return;
  }
  router.push('/lobbies');
}
</script>

<template>
  <div class="gt-root">
    <div class="gt-table">
      <!-- Topbar -->
      <div class="gt-topbar">
        <button class="gt-leave-btn" type="button" @click="leaveTable">&larr; Forlad</button>
        <div class="gt-topbar-center">
          <slot name="topbar" />
        </div>
        <span
          class="gt-connection-pill gt-connection-pill--status"
          :data-status="state.connection"
        >{{ state.connection }}</span>
      </div>

      <!-- Error banner -->
      <div v-if="state.lastError" class="gt-error-banner">
        {{ state.lastError }}
      </div>

      <!-- Opponents -->
      <div
        class="gt-opponents"
        :class="layout === 'ring' ? 'gt-opponents--ring' : 'gt-opponents--duel'"
      >
        <slot name="opponents" />
      </div>

      <!-- Center -->
      <div class="gt-center">
        <slot name="center" />
      </div>

      <!-- Self display -->
      <div v-if="slots['self-display']" class="gt-self-zone">
        <slot name="self-display" />
      </div>

      <!-- Your-turn pill (row keeps its height so the layout doesn't jump) -->
      <div v-if="isMyTurn !== undefined" class="gt-turn-pill-row">
        <Transition name="gt-turn-pill">
          <div v-if="isMyTurn && !state.winnerPlayerId" class="gt-turn-pill">
            <div class="gt-turn-dot"></div>
            <span>Din tur</span>
          </div>
        </Transition>
      </div>

      <!-- Actions -->
      <div v-if="slots.actions" class="gt-actions">
        <slot name="actions" />
      </div>

      <!-- Hand tray -->
      <div v-if="slots.hand" class="gt-hand">
        <slot name="hand" />
      </div>

      <!-- Overlay (win screen, etc) -->
      <slot name="overlay" />
    </div>
  </div>
</template>
