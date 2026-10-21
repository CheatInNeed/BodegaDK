<script setup lang="ts">
defineProps<{
  winnerLabel: string;
  subtitle: string;
  quip?: string;
  buttonLabel?: string;
  buttonDisabled?: boolean;
}>();

const emit = defineEmits<{
  action: [];
}>();
</script>

<template>
  <div class="win-overlay">
    <div class="win-overlay-title">{{ winnerLabel }}</div>
    <div class="win-overlay-sub">{{ subtitle }}</div>
    <div v-if="quip" class="win-overlay-quip">{{ quip }}</div>
    <slot />
    <button
      class="win-overlay-btn"
      :disabled="buttonDisabled"
      @click="emit('action')"
    >{{ buttonLabel ?? 'Rematch' }}</button>
  </div>
</template>
