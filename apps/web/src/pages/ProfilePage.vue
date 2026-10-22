<script setup lang="ts">
import { onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useFriendsStore } from '@/stores/friends';
import ProfileInfo from '@/components/profile/ProfileInfo.vue';
import ProfileStats from '@/components/profile/ProfileStats.vue';
import MatchHistory from '@/components/profile/MatchHistory.vue';
import FriendsPanel from '@/components/profile/FriendsPanel.vue';

const { t } = useI18n();
const router = useRouter();
const authStore = useAuthStore();
const friendsStore = useFriendsStore();

onMounted(() => {
  if (authStore.isAuthenticated) {
    friendsStore.loadFriends();
    friendsStore.loadRequests();
  }
});

async function logout() {
  await authStore.signOut();
  router.push('/login');
}

const avatarStyle = () => {
  if (!authStore.avatar?.color) return '';
  const radius = authStore.avatar.shape === 'circle' ? '50%' : '8px';
  return `background:${authStore.avatar.color};border-radius:${radius}`;
};
</script>

<template>
  <section class="profile-layout">
    <section class="card profile-hero-card">
      <div class="profile-hero">
        <div
          v-if="authStore.avatar?.color"
          class="avatar profile-hero-avatar"
          :style="avatarStyle()"
        ></div>
        <div v-else class="avatar profile-hero-avatar profile-avatar-empty"></div>
        <div class="profile-hero-info">
          <h1 class="profile-hero-name">{{ authStore.user?.username ?? '---' }}</h1>
          <p class="profile-hero-sub">{{ authStore.user?.email ?? '---' }}</p>
        </div>
      </div>
      <div class="profile-hero-actions">
        <button class="btn primary" data-action="profile-customize" @click="router.push('/custom')">{{ t('profile.customize') }}</button>
        <button class="btn danger" data-action="profile-logout" @click="logout">{{ t('profile.logout') }}</button>
      </div>
    </section>

    <section class="profile-content-grid">
      <ProfileInfo />
      <FriendsPanel />
      <ProfileStats />
      <MatchHistory />

      <article class="card profile-section-card profile-placeholder-card" aria-disabled="true">
        <div class="profile-section-header">
          <div>
            <div class="card-title">{{ t('profile.section.achievementsTitle') }}</div>
          </div>
          <span class="home-placeholder-tag">{{ t('home.action.comingSoon') }}</span>
        </div>
        <p class="card-desc">{{ t('profile.section.achievementsDesc') }}</p>
      </article>
    </section>
  </section>
</template>
