<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useFriendsStore } from '@/stores/friends';
import { DEFAULT_AVATAR } from '@/lib/image';
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

const fileInput = ref<HTMLInputElement | null>(null);
const pictureBusy = ref(false);
const pictureError = ref('');

async function changePicture(action: () => Promise<void>) {
  pictureBusy.value = true;
  pictureError.value = '';
  try {
    await action();
  } catch {
    pictureError.value = t('profile.picture.error');
  } finally {
    pictureBusy.value = false;
  }
}

async function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (file) await changePicture(() => authStore.uploadAvatar(file));
}

function removePicture() {
  return changePicture(() => authStore.removeAvatar());
}

</script>

<template>
  <section class="profile-layout">
    <section class="card profile-hero-card">
      <div class="profile-hero">
        <img
          class="profile-hero-avatar profile-hero-picture"
          :src="authStore.avatarUrl ?? DEFAULT_AVATAR"
          alt=""
        />
        <div class="profile-hero-info">
          <h1 class="profile-hero-name">{{ authStore.user?.username ?? '---' }}</h1>
          <p class="profile-hero-sub">{{ authStore.user?.email ?? '---' }}</p>
        </div>
      </div>
      <div class="profile-hero-actions">
        <input ref="fileInput" type="file" accept="image/*" hidden @change="onFileChange" />
        <button class="btn" :disabled="pictureBusy" @click="fileInput?.click()">
          {{ authStore.avatarUrl ? t('profile.picture.change') : t('profile.picture.upload') }}
        </button>
        <button v-if="authStore.avatarUrl" class="btn" :disabled="pictureBusy" @click="removePicture">
          {{ t('profile.picture.remove') }}
        </button>
        <button class="btn danger" data-action="profile-logout" @click="logout">{{ t('profile.logout') }}</button>
        <p v-if="pictureError" class="card-desc" role="alert">{{ pictureError }}</p>
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
