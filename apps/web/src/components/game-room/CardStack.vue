<script setup lang="ts">
import { renderCardStack, renderEmptySlot } from '@/lib/games/shared/game-cards';

const props = defineProps<{
  count: number;
  width?: number;
  height?: number;
  uid: string;
  label?: string;
}>();

function html(): string {
  const cw = props.width ?? 58;
  const ch = props.height ?? 81;
  if (props.count === 0) return renderEmptySlot(cw, ch);
  return renderCardStack(props.count, cw, ch, props.uid);
}
</script>

<template>
  <div style="display:flex;flex-direction:column;align-items:center;gap:6px;">
    <div v-html="html()"></div>
    <div v-if="label" class="gt-player-meta">{{ label }}</div>
  </div>
</template>
