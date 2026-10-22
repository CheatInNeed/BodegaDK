<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import NotificationBell from './NotificationBell.vue';

const { t } = useI18n();
const router = useRouter();
const authStore = useAuthStore();
const uiStore = useUiStore();

function goHome() {
  router.push('/');
}

function changeLang(event: Event) {
  const select = event.target as HTMLSelectElement;
  uiStore.setLang(select.value as 'da' | 'en');
}
</script>

<template>
  <header class="topbar">
    <a class="brand" href="#" @click.prevent="goHome" aria-label="Go to home">
      <span class="logo" aria-hidden="true">
        <img class="logo-image" src="/images/brand/bodegadk-brand-mark.png" alt="" />
      </span>
      <span>{{ t('app.name') }}</span>
    </a>

    <div class="topbar-right">
      <select
        class="select"
        :value="uiStore.lang"
        @change="changeLang"
        aria-label="Language"
      >
        <option value="da">DA</option>
        <option value="en">EN</option>
      </select>

      <NotificationBell v-if="authStore.isAuthenticated" />

      <div
        v-if="authStore.isAuthenticated && authStore.avatar"
        class="avatar"
        :data-color="authStore.avatar.color"
        :data-shape="authStore.avatar.shape"
      ></div>

      <template v-if="!authStore.isAuthenticated">
        <button class="btn" @click="router.push('/login')">{{ t('top.login') }}</button>
        <button class="btn primary" @click="router.push('/signup')">{{ t('top.signup') }}</button>
      </template>
      <template v-else>
        <button class="btn" @click="router.push('/profile')">{{ t('top.profile') }}</button>
      </template>
    </div>
  </header>
</template>
