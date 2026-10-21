<script setup lang="ts">
import { watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useUiStore } from './stores/ui';

const { locale } = useI18n();
const uiStore = useUiStore();

// Sync theme to document
watch(
  () => uiStore.theme,
  (theme) => {
    document.documentElement.dataset.theme = theme;
  },
  { immediate: true },
);

// Sync language to vue-i18n and <html lang>
watch(
  () => uiStore.lang,
  (lang) => {
    locale.value = lang;
    document.documentElement.lang = lang;
  },
  { immediate: true },
);
</script>

<template>
  <RouterView />
</template>
