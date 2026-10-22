<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useGameSession } from '@/composables/useGameSession';
import GameRoomFrame from '@/components/game-room/GameRoomFrame.vue';
import HighCardGame from '@/components/games/HighCardGame.vue';
import SnydGame from '@/components/games/SnydGame.vue';
import CasinoGame from '@/components/games/CasinoGame.vue';
import FemHundredeGame from '@/components/games/FemHundredeGame.vue';
import KrigGame from '@/components/games/KrigGame.vue';
import { highcardAdapter } from '@/lib/games/highcard/adapter';
import { snydAdapter } from '@/lib/games/snyd/adapter';
import { casinoAdapter } from '@/lib/games/casino/adapter';
import { femAdapter } from '@/lib/games/fem-hundrede/adapter';
import { krigAdapter } from '@/lib/games/krig/adapter';
import type { GameAdapter, RoomBootstrap } from '@/lib/game-room/types';

const props = defineProps<{
  game: string;
  roomCode: string;
}>();

const route = useRoute();
const authStore = useAuthStore();
const useMock = computed(() => route.query.mock === '1');

function resolveAdapter(game: string): GameAdapter<any, any, any> | null {
  const lower = game.toLowerCase();
  if (highcardAdapter.canHandle(lower)) return highcardAdapter;
  if (snydAdapter.canHandle(lower)) return snydAdapter;
  if (casinoAdapter.canHandle(lower)) return casinoAdapter;
  if (femAdapter.canHandle(lower)) return femAdapter;
  if (krigAdapter.canHandle(lower)) return krigAdapter;
  return null;
}

const adapter = resolveAdapter(props.game);
const gameComponent = computed(() => {
  const lower = props.game.toLowerCase();
  if (lower === 'highcard' || lower === 'single-card-highest-wins') return HighCardGame;
  if (lower === 'snyd' || lower === 'cheat') return SnydGame;
  if (lower === 'casino') return CasinoGame;
  if (lower === 'fem' || lower === 'fem-hundrede' || lower === '500') return FemHundredeGame;
  if (lower === 'krig') return KrigGame;
  return null;
});

const bootstrap: RoomBootstrap = {
  roomCode: props.roomCode,
  game: props.game,
  useMock: useMock.value,
  getAccessToken: () => authStore.getAccessToken(),
};

const session = adapter
  ? useGameSession(bootstrap, adapter)
  : null;

onMounted(() => {
  session?.start();
});
</script>

<template>
  <div v-if="!adapter || !session" class="card">
    <div class="card-title">Cannot open room</div>
    <p class="card-desc">Unsupported game mode: {{ game }}</p>
  </div>

  <GameRoomFrame
    v-else
    :state="session.state.value"
    :game-title="game"
  >
    <component
      :is="gameComponent"
      v-if="gameComponent"
      :state="session.state.value"
      :view-model="session.viewModel.value"
      @toggle-card="session.toggleCard"
      @send-intent="session.sendIntent"
      @send-message="session.sendMessage"
    />
  </GameRoomFrame>
</template>
