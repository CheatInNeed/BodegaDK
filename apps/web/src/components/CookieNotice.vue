<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const storageKey = 'bodegadk:cookie-notice:v1';

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(storageKey) === 'dismissed';
  } catch {
    return false;
  }
}

const visible = ref(!wasDismissed());

function dismiss() {
  visible.value = false;
  try {
    localStorage.setItem(storageKey, 'dismissed');
  } catch {
    // The notice can still be dismissed for this visit if storage is unavailable.
  }
}
</script>

<template>
  <aside v-if="visible" class="cookie-notice" aria-labelledby="cookie-notice-title">
    <div class="cookie-notice-copy">
      <h2 id="cookie-notice-title">{{ t('cookies.title') }}</h2>
      <p>{{ t('cookies.summary') }}</p>
    </div>
    <div class="cookie-notice-actions">
      <button class="btn primary" type="button" @click="dismiss">
        {{ t('cookies.dismiss') }}
      </button>
    </div>
  </aside>
</template>
