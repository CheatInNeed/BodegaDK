<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  winnerLabel: string;
  subtitle?: string;
  quip?: string;
  isVictory?: boolean;
  buttonLabel?: string;
  buttonDisabled?: boolean;
}>();

const emit = defineEmits<{
  action: [];
}>();

const router = useRouter();
const { t } = useI18n();

function leaveTable() {
  router.push('/lobbies');
}
</script>

<template>
  <div class="win-overlay" :class="isVictory === false ? 'win-overlay--defeat' : ''">
    <div class="win-overlay-icon" aria-hidden="true">
      {{ isVictory === false ? '✕' : '♛' }}
    </div>
    <div class="win-overlay-title">
      {{ isVictory === false ? t('room.win.defeat') : t('room.win.victory') }}
    </div>
    <div class="win-overlay-sub">{{ winnerLabel }}</div>
    <div v-if="subtitle" class="win-overlay-sub">{{ subtitle }}</div>
    <div v-if="quip" class="win-overlay-quip">{{ quip }}</div>
    <slot />
    <div class="win-overlay-actions">
      <button
        class="win-overlay-btn"
        :disabled="buttonDisabled"
        @click="emit('action')"
      >{{ buttonLabel ?? t('room.win.rematch') }}</button>
      <button
        class="win-overlay-btn win-overlay-btn--leave"
        type="button"
        @click="leaveTable"
      >{{ t('room.win.leaveTable') }}</button>
    </div>
  </div>
</template>
