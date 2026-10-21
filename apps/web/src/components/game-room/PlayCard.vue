<script setup lang="ts">
const props = defineProps<{
  cardCode: string;
  selected?: boolean;
  size?: 'sm' | 'md' | 'lg';
}>();

function parseCard(cardCode: string): { rank: string; suit: string; suitColor: 'red' | 'black' } {
  const normalized = cardCode.trim().toUpperCase();
  const suitKey = normalized.charAt(0);
  const rank = normalized.slice(1) || '?';
  if (suitKey === 'H') return { rank, suit: '♥', suitColor: 'red' };
  if (suitKey === 'D') return { rank, suit: '♦', suitColor: 'red' };
  if (suitKey === 'S') return { rank, suit: '♠', suitColor: 'black' };
  if (suitKey === 'C') return { rank, suit: '♣', suitColor: 'black' };
  return { rank: normalized, suit: '•', suitColor: 'black' };
}

function sizeClass(size?: string): string {
  if (size === 'sm') return 'play-card-face-sm';
  if (size === 'lg') return 'play-card-face-lg';
  return '';
}
</script>

<template>
  <span
    class="play-card-face"
    :class="[
      parseCard(cardCode).suitColor === 'red' ? 'red' : 'black',
      sizeClass(size),
      selected ? 'selected' : '',
    ]"
  >
    <span class="play-card-corner">{{ parseCard(cardCode).rank }}{{ parseCard(cardCode).suit }}</span>
    <span class="play-card-center">{{ parseCard(cardCode).suit }}</span>
    <span class="play-card-corner rotate">{{ parseCard(cardCode).rank }}{{ parseCard(cardCode).suit }}</span>
  </span>
</template>
