<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';

const { t } = useI18n();
const authStore = useAuthStore();
</script>

<template>
  <article class="card profile-section-card">
    <div class="profile-section-header">
      <p class="home-eyebrow">{{ t('profile.section.info') }}</p>
      <div class="card-title">{{ t('profile.section.infoTitle') }}</div>
    </div>
    <div v-if="authStore.user" class="profile-fields">
      <div class="profile-field">
        <span class="profile-label">{{ t('auth.field.username') }}</span>
        <span class="profile-value">{{ authStore.user.username ?? '---' }}</span>
      </div>
      <div class="profile-field">
        <span class="profile-label">{{ t('auth.field.email') }}</span>
        <span class="profile-value">{{ authStore.user.email ?? '---' }}</span>
      </div>
      <div class="profile-field">
        <span class="profile-label">{{ t('auth.field.country') }}</span>
        <span class="profile-value">{{ authStore.user.country ?? '---' }}</span>
      </div>
    </div>
  </article>
</template>
