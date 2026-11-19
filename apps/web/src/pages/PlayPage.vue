<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useMatchmakingStore } from '@/stores/matchmaking';
import { useAuthStore } from '@/stores/auth';
import GameCard from '@/components/GameCard.vue';
import { ref } from 'vue';

const { t } = useI18n();
const matchmaking = useMatchmakingStore();
const authStore = useAuthStore();
const selectedGame = ref<string | null>(null);

const games = [
  { id: 'snyd', titleKey: 'game.cheat', imageClass: 'game-card-snyd' },
  { id: 'krig', titleKey: 'game.krig', imageClass: 'game-card-krig' },
  { id: 'casino', titleKey: 'casino', imageClass: 'game-card-casino' },
  { id: 'highcard', titleKey: 'single.card.highest.wins', imageClass: 'game-card-highest-card' },
  { id: 'fem', titleKey: 'game.500', imageClass: 'game-card-500' },
];

function quickPlay(gameId: string) {
  selectedGame.value = gameId;
}

function chooseMode(mode: 'RANKED' | 'UNRANKED') {
  if (!selectedGame.value) return;
  const game = selectedGame.value;
  selectedGame.value = null;
  matchmaking.enqueue(game, mode, authStore.user?.username ?? undefined);
}
</script>

<template>
  <div>
    <h1 class="h1">{{ t('play.title') }}</h1>
    <p class="sub">{{ t('play.subtitle') }}</p>

    <div class="grid">
      <GameCard
        v-for="game in games"
        :key="game.id"
        :title-key="game.titleKey"
        :image-class="game.imageClass"
        :disabled="matchmaking.isActive"
        @select="quickPlay(game.id)"
      />
    </div>

    <div v-if="selectedGame" class="mode-dialog-backdrop" role="presentation" @click.self="selectedGame = null">
      <section class="mode-dialog card" role="dialog" aria-modal="true" :aria-label="t('play.mode.title')">
        <h2 class="card-title">{{ t('play.mode.title') }}</h2>
        <p class="sub">{{ t('play.mode.subtitle') }}</p>
        <div class="mode-dialog-actions">
          <button class="btn primary" type="button" @click="chooseMode('RANKED')">
            {{ t('play.mode.ranked') }}
          </button>
          <button class="btn" type="button" @click="chooseMode('UNRANKED')">
            {{ t('play.mode.unranked') }}
          </button>
          <button class="btn" type="button" @click="selectedGame = null">
            {{ t('play.mode.cancel') }}
          </button>
        </div>
      </section>
    </div>
  </div>
</template>
