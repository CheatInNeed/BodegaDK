<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  titleKey: string;
  imageClass: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  select: [];
}>();

const { t } = useI18n();
</script>

<template>
  <button
    class="card game-card"
    :class="imageClass"
    type="button"
    :disabled="disabled"
    :aria-disabled="disabled || undefined"
    @click="emit('select')"
  >
    <span class="game-card-title card-title">{{ t(titleKey) }}</span>
  </button>
</template>
