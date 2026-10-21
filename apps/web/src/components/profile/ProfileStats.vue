<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useApi } from '@/composables/useApi';
import type { MyGameStatsSummary } from '@/lib/net/api';

const { t } = useI18n();
const api = useApi();

const stats = ref<MyGameStatsSummary[]>([]);
const loading = ref(true);
const errorMessage = ref<string | null>(null);

const playedStats = computed(() => stats.value.filter((s) => s.gamesPlayed > 0));

onMounted(async () => {
  try {
    const result = await api.getMyStats();
    stats.value = result.items;
  } catch (e: any) {
    errorMessage.value = e.message ?? t('profile.section.statsError');
  } finally {
    loading.value = false;
  }
});

function winRate(s: MyGameStatsSummary): string {
  return s.gamesPlayed > 0 ? `${Math.round((s.wins / s.gamesPlayed) * 100)}%` : '0%';
}

function statCells(s: MyGameStatsSummary): Array<[string, string | number]> {
  const cells: Array<[string, string | number]> = [
    [t('profile.stats.played'), s.gamesPlayed],
    [t('profile.stats.wins'), s.wins],
    [t('profile.stats.losses'), s.losses],
  ];
  if (s.draws > 0) cells.push([t('profile.stats.draws'), s.draws]);
  cells.push(
    [t('profile.stats.winRate'), winRate(s)],
    [t('profile.stats.currentStreak'), s.currentStreak],
    [t('profile.stats.bestStreak'), s.bestStreak],
    [t('profile.stats.highScore'), s.highScore],
  );
  return cells;
}
</script>

<template>
  <article class="card profile-section-card">
    <div class="profile-section-header">
      <div>
        <div class="card-title">{{ t('profile.section.statsTitle') }}</div>
      </div>
    </div>

    <div v-if="loading">
      <p class="card-desc">Loading...</p>
    </div>

    <div v-else-if="errorMessage">
      <p class="card-desc">{{ t('profile.section.statsError') }}</p>
      <p class="profile-error-detail">{{ errorMessage }}</p>
    </div>

    <div v-else-if="playedStats.length === 0">
      <p class="card-desc">{{ t('profile.section.statsEmpty') }}</p>
    </div>

    <div v-else class="profile-stats-list">
      <section v-for="s in playedStats" :key="s.game.id" class="profile-stats-game">
        <div class="profile-stats-game-title">{{ s.game.title || s.game.slug }}</div>
        <div class="profile-stats-grid">
          <div v-for="([label, value], idx) in statCells(s)" :key="idx" class="profile-stat-cell">
            <span class="profile-stat-label">{{ label }}</span>
            <span class="profile-stat-value">{{ value }}</span>
          </div>
        </div>
      </section>
    </div>
  </article>
</template>
