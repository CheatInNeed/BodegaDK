<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useMatchmakingStore } from '@/stores/matchmaking';
import { useAuthStore } from '@/stores/auth';
import GameCard from '@/components/GameCard.vue';

const { t } = useI18n();
const matchmaking = useMatchmakingStore();
const authStore = useAuthStore();

const games = [
  { id: 'snyd', titleKey: 'game.cheat', imageClass: 'game-card-snyd' },
  { id: 'krig', titleKey: 'game.krig', imageClass: 'game-card-krig' },
  { id: 'casino', titleKey: 'casino', imageClass: 'game-card-casino' },
  { id: 'highcard', titleKey: 'single.card.highest.wins', imageClass: 'game-card-highest-card' },
  { id: 'fem', titleKey: 'game.500', imageClass: 'game-card-500' },
];

function quickPlay(gameId: string) {
  matchmaking.enqueue(gameId, authStore.user?.username ?? undefined);
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
  </div>
</template>
