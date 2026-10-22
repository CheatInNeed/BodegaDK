<script setup lang="ts">
import { ref, provide } from 'vue';
import { useRouter } from 'vue-router';
import type { RoomSessionState } from '@/lib/game-room/types';

const props = defineProps<{
  state: RoomSessionState;
  gameTitle: string;
  showHandToggle?: boolean;
  suppressWinnerBanner?: boolean;
}>();

const router = useRouter();
const handTrayOpen = ref(true);

function toggleHandTray() {
  handTrayOpen.value = !handTrayOpen.value;
}

provide('handTrayOpen', handTrayOpen);
provide('toggleHandTray', toggleHandTray);

function leaveTable() {
  router.push('/lobbies');
}

const logItems = [
  { label: 'SYSTEM', className: 'system', text: '' },
  { label: 'TABLE', className: 'primary', text: '' },
  { label: 'STATUS', className: 'secondary', text: '' },
];
</script>

<template>
  <section class="game-room-shell">
    <div class="game-room-main">
      <header class="game-room-topbar">
        <div class="game-room-brand-block">
          <span class="game-room-brand">The Digital Bodega</span>
          <div class="game-room-title-group">
            <h1 class="game-room-title">{{ gameTitle }}</h1>
            <p class="game-room-subtitle">Immersive table view for live multiplayer play.</p>
          </div>
        </div>

        <div class="game-room-top-actions">
          <span class="game-room-connection-pill">{{ state.connection }}</span>
          <button class="game-room-icon-button" type="button" aria-label="Table settings">+</button>
          <button class="btn primary game-room-leave" type="button" @click="leaveTable">Leave Table</button>
        </div>
      </header>

      <div class="game-room-stage">
        <div class="game-room-table-shell">
          <div class="game-room-table-glow"></div>
          <div class="game-room-table-felt"></div>
          <div class="game-room-table-content">
            <div v-if="state.lastError" class="room-banner room-banner-error">
              {{ state.lastError }}
            </div>
            <div v-if="state.winnerPlayerId && !suppressWinnerBanner" class="room-banner room-banner-win">
              Game finished. Winner determined.
            </div>

            <div class="room-layout">
              <slot />
            </div>
          </div>
        </div>
      </div>

      <template v-if="showHandToggle !== false">
        <button
          class="game-room-hand-toggle"
          :class="{ active: handTrayOpen }"
          type="button"
          :aria-pressed="handTrayOpen ? 'true' : 'false'"
          @click="toggleHandTray"
        >
          {{ handTrayOpen ? 'Hide Hand' : 'Show Hand' }}
        </button>

        <div class="game-room-bottom-nav" aria-label="Room navigation">
          <button
            class="game-room-bottom-pill"
            :class="{ active: handTrayOpen }"
            type="button"
            :aria-pressed="handTrayOpen ? 'true' : 'false'"
            @click="toggleHandTray"
          >Hand</button>
          <button class="game-room-bottom-pill" type="button">Board</button>
          <button class="game-room-bottom-pill" type="button">Social</button>
          <button class="game-room-bottom-pill" type="button">Menu</button>
        </div>
      </template>
    </div>

    <aside class="game-room-sidebar">
      <div class="game-room-sidebar-header">
        <h2 class="game-room-sidebar-title">Table Log</h2>
        <p class="game-room-sidebar-subtitle">Live feed and rules sidebar</p>
      </div>

      <nav class="game-room-sidebar-tabs" aria-label="Room side tabs">
        <button class="game-room-sidebar-tab active" type="button">Chat</button>
        <button class="game-room-sidebar-tab" type="button">Rules</button>
      </nav>

      <div class="game-room-log-list">
        <div class="game-room-log-item">
          <span class="game-room-log-label system">SYSTEM</span>
          <p class="game-room-log-text">Connected to {{ gameTitle }}. Table state is synced over {{ state.connection }}.</p>
        </div>
        <div class="game-room-log-item">
          <span class="game-room-log-label primary">TABLE</span>
          <p class="game-room-log-text">
            {{ state.winnerPlayerId
              ? 'Round complete.'
              : 'Cards are live. Choose a card from your hand to make your move.' }}
          </p>
        </div>
        <div class="game-room-log-item">
          <span class="game-room-log-label secondary">STATUS</span>
          <p class="game-room-log-text">
            {{ state.lastError
              ? 'A room notice needs attention before the next action.'
              : 'Rules and chat stay visible here while the table remains in focus.' }}
          </p>
        </div>
      </div>

      <div class="game-room-sidebar-footer">
        <button class="btn game-room-invite" type="button">Invite Friends</button>
      </div>
    </aside>
  </section>
</template>
