<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  cards: Array<string | { card: string; selected?: boolean }>;
  selected: string[];
}>();

const emit = defineEmits<{
  toggle: [card: string];
}>();

const normalizedCards = computed(() =>
  props.cards.map((item) =>
    typeof item === 'string' ? item : item.card
  )
);

function parseCard(code: string): { rank: string; suit: string; red: boolean } {
  const normalized = code.trim().toUpperCase();
  const suitKey = normalized.charAt(0);
  const rank = normalized.slice(1) || '?';
  if (suitKey === 'H') return { rank, suit: '♥', red: true };
  if (suitKey === 'D') return { rank, suit: '♦', red: true };
  if (suitKey === 'S') return { rank, suit: '♠', red: false };
  if (suitKey === 'C') return { rank, suit: '♣', red: false };
  return { rank: normalized, suit: '•', red: false };
}
</script>

<template>
  <div class="private-panel room-hand-tray is-open">
    <div class="private-hand-row">
      <button
        v-for="(card, index) in normalizedCards"
        :key="card"
        class="play-card"
        :class="{ selected: selected.includes(card) }"
        :style="{ '--card-offset': index * 16 + 'px' }"
        @click="emit('toggle', card)"
      >
        <span
          class="play-card-face"
          :class="[
            parseCard(card).red ? 'red' : 'black',
            selected.includes(card) ? 'selected' : '',
          ]"
        >
          <span class="play-card-corner">{{ parseCard(card).rank }}{{ parseCard(card).suit }}</span>
          <span class="play-card-center">{{ parseCard(card).suit }}</span>
          <span class="play-card-corner rotate">{{ parseCard(card).rank }}{{ parseCard(card).suit }}</span>
        </span>
      </button>
    </div>
  </div>
</template>
