<script setup lang="ts">
import { onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useLeaderboardStore } from '@/stores/leaderboard';

const { t } = useI18n();
const leaderboardStore = useLeaderboardStore();

const games = [
  { id: 'snyd', label: 'Snyd' },
];

onMounted(() => {
  if (!leaderboardStore.data) {
    leaderboardStore.load();
  }
});

function avatarStyle(avatar: { color?: string | null; shape?: string | null } | undefined): string {
  if (!avatar?.color) return '';
  const radius = avatar.shape === 'circle' ? '50%' : '8px';
  return `background:${avatar.color};border-radius:${radius}`;
}
</script>

<template>
  <section class="leaderboard-layout">
    <section class="card leaderboard-hero">
      <div>
        <p class="home-eyebrow">{{ t('leaderboard.kicker') }}</p>
        <h1 class="h1">{{ t('leaderboard.title') }}</h1>
        <p class="sub">{{ t('leaderboard.subtitle') }}</p>
      </div>
      <label class="leaderboard-filter" for="leaderboardGameSelect">
        <span>{{ t('leaderboard.game') }}</span>
        <select
          class="select"
          id="leaderboardGameSelect"
          :value="leaderboardStore.game"
          @change="leaderboardStore.setGame(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="g in games" :key="g.id" :value="g.id" :selected="leaderboardStore.game === g.id">
            {{ g.label }}
          </option>
        </select>
      </label>
    </section>

    <section class="card leaderboard-card">
      <div class="leaderboard-card-header">
        <div>
          <div class="card-title">{{ leaderboardStore.game }}</div>
          <p class="card-desc">{{ t('leaderboard.scoreHelp') }}</p>
        </div>
        <p v-if="leaderboardStore.data?.currentUser" class="leaderboard-current">
          {{ t('leaderboard.currentUser') }}: #{{ leaderboardStore.data.currentUser.rank }}
          ({{ leaderboardStore.data.currentUser.score }} {{ t('leaderboard.scoreLabel') }})
        </p>
      </div>

      <div v-if="leaderboardStore.loading" class="leaderboard-loading">
        <p class="card-desc">{{ t('leaderboard.loading') }}</p>
      </div>

      <div v-else-if="leaderboardStore.errorMessage" class="leaderboard-error">
        <p class="card-desc">{{ leaderboardStore.errorMessage }}</p>
      </div>

      <div v-else-if="!leaderboardStore.data || leaderboardStore.data.items.length === 0" class="leaderboard-empty">
        <p class="card-desc">{{ t('leaderboard.empty') }}</p>
      </div>

      <div v-else class="leaderboard-list">
        <div v-for="entry in leaderboardStore.data.items" :key="entry.userId" class="leaderboard-row">
          <div class="leaderboard-rank">#{{ entry.rank }}</div>
          <div class="avatar leaderboard-avatar" :style="avatarStyle(entry.avatar)"></div>
          <div class="leaderboard-player">
            <div class="leaderboard-name">{{ entry.displayName || entry.username || entry.userId }}</div>
            <div class="leaderboard-username">{{ entry.username || entry.userId }}</div>
          </div>
          <div class="leaderboard-score">
            <span>{{ entry.score }}</span>
            <small>{{ t('leaderboard.scoreLabel') }}</small>
          </div>
        </div>
      </div>
    </section>
  </section>
</template>
