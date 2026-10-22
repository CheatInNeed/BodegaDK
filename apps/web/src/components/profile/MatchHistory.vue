<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useApi } from '@/composables/useApi';
import type { MyMatchSummary } from '@/lib/net/api';

const { t, locale } = useI18n();
const api = useApi();

const matches = ref<MyMatchSummary[]>([]);
const loading = ref(true);
const errorMessage = ref<string | null>(null);

onMounted(async () => {
  try {
    const result = await api.getMyMatches({ limit: 20 });
    matches.value = result.items;
  } catch (e: any) {
    errorMessage.value = e.message ?? t('profile.section.historyError');
  } finally {
    loading.value = false;
  }
});

function resultClass(match: MyMatchSummary): string {
  const result = match.currentUser.result ?? match.resultType ?? 'DRAW';
  return result.toLowerCase();
}

function resultText(match: MyMatchSummary): string {
  const result = match.currentUser.result ?? match.resultType ?? 'DRAW';
  return t(`profile.match.result.${result.toLowerCase()}`);
}

function opponents(match: MyMatchSummary): string {
  return match.players
    .filter((p) => p.userId !== match.currentUser.userId)
    .map((p) => p.username || p.userId)
    .join(', ') || t('profile.match.noOpponent');
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale.value === 'da' ? 'da-DK' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}
</script>

<template>
  <article class="card profile-section-card">
    <div class="profile-section-header">
      <div>
        <div class="card-title">{{ t('profile.section.historyTitle') }}</div>
      </div>
    </div>

    <div v-if="loading">
      <p class="card-desc">Loading...</p>
    </div>

    <div v-else-if="errorMessage">
      <p class="card-desc">{{ t('profile.section.historyError') }}</p>
      <p class="profile-error-detail">{{ errorMessage }}</p>
    </div>

    <div v-else-if="matches.length === 0">
      <p class="card-desc">{{ t('profile.section.historyEmpty') }}</p>
    </div>

    <div v-else class="profile-match-list">
      <div v-for="match in matches" :key="match.matchId" class="profile-match-row">
        <div>
          <div class="profile-match-title">{{ match.game.title || match.game.slug }}</div>
          <div class="profile-match-meta">{{ formatDate(match.endedAt ?? match.startedAt) }} - {{ opponents(match) }}</div>
        </div>
        <div class="profile-match-result">
          <span :class="['profile-match-badge', `profile-match-badge-${resultClass(match)}`]">{{ resultText(match) }}</span>
          <span v-if="match.currentUser.score !== null">{{ t('profile.match.score') }}: {{ match.currentUser.score }}</span>
        </div>
      </div>
    </div>
  </article>
</template>
