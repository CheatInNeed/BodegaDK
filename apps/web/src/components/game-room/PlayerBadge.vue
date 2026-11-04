<script setup lang="ts">
defineProps<{
  name: string;
  score?: string;
  isCurrentTurn?: boolean;
  reverse?: boolean;
}>();
</script>

<template>
  <div
    class="gt-player-badge"
    :class="{
      'gt-player-badge--active': isCurrentTurn,
      'gt-player-badge--reverse': reverse,
    }"
  >
    <div class="gt-player-avatar">{{ (name || '?')[0].toUpperCase() }}</div>
    <div>
      <div class="gt-player-name">{{ name }}</div>
      <div v-if="score" class="gt-player-meta">{{ score }}</div>
    </div>
    <div v-if="isCurrentTurn" class="gt-turn-indicator">
      <div class="gt-turn-dot"></div>
      <span>Tur</span>
    </div>
  </div>
</template>
