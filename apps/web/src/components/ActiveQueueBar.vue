<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMatchmakingStore } from '@/stores/matchmaking';

const { t } = useI18n();
const matchmaking = useMatchmakingStore();

const elapsedSeconds = computed(() => {
  if (!matchmaking.startedAtMs) return 0;
  return Math.max(Math.floor((Date.now() - matchmaking.startedAtMs) / 1000), 0);
});

const isMatched = computed(() => matchmaking.isMatched);

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}
</script>

<template>
  <!-- Error-only state -->
  <section
    v-if="!matchmaking.isActive && !matchmaking.loading && matchmaking.errorMessage"
    class="active-queue-bar active-queue-bar-error"
    aria-live="polite"
  >
    <div class="active-queue-copy">
      <span class="active-queue-error">{{ matchmaking.errorMessage }}</span>
    </div>
  </section>

  <!-- Loading state -->
  <section
    v-else-if="matchmaking.loading && !matchmaking.isActive"
    class="active-queue-bar"
    aria-live="polite"
  >
    <div class="active-queue-copy">
      <span>{{ t('queue.bar.joining') }}</span>
    </div>
  </section>

  <!-- Active queue state -->
  <section
    v-else-if="matchmaking.isActive"
    class="active-queue-bar"
    :class="{ matched: isMatched }"
    aria-live="polite"
  >
    <div class="active-queue-status" aria-hidden="true"></div>
    <div class="active-queue-copy">
      <div class="active-queue-heading">
        <span>{{ t(isMatched ? 'queue.bar.matched' : 'queue.bar.title') }}</span>
      </div>
      <div class="active-queue-meta">
        <template v-if="isMatched">
          <span v-if="matchmaking.matchedCountdown !== null && matchmaking.matchedCountdown > 0">
            {{ t('queue.bar.matchedCountdown') }} {{ matchmaking.matchedCountdown }}
          </span>
          <span v-else>{{ t('queue.bar.matchedNow') }}</span>
        </template>
        <template v-else>
          <span v-if="matchmaking.ticket">
            {{ t('queue.bar.players') }}: {{ matchmaking.ticket.queuedPlayers }}/{{ matchmaking.ticket.minPlayers }}
          </span>
          <span>{{ t('queue.bar.elapsed') }}: {{ formatDuration(elapsedSeconds) }}</span>
        </template>
        <span v-if="matchmaking.errorMessage" class="active-queue-error">{{ matchmaking.errorMessage }}</span>
      </div>
    </div>
    <span v-if="isMatched" class="active-queue-ready">{{ t('queue.bar.ready') }}</span>
    <button
      v-else
      class="btn active-queue-leave"
      type="button"
      :disabled="matchmaking.leaving"
      @click="matchmaking.leave()"
    >{{ t('queue.bar.leave') }}</button>
  </section>
</template>
