<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
</script>

<template>
  <div>
    <h1 class="h1">{{ t('nav.help') }}</h1>
    <div class="card" id="help">
      <p class="card-desc">
        (Placeholder) FAQ, regler for spil, kontakt, rapporter fejl osv.
      </p>
      <p class="card-desc">{{ t('cookies.summary') }}</p>
    </div>
  </div>
</template>
