<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useLobbyStore } from '@/stores/lobby';
import GameCard from '@/components/GameCard.vue';

const { t } = useI18n();
const router = useRouter();
const authStore = useAuthStore();
const lobbyStore = useLobbyStore();

const joinCode = ref('');
const errorMessage = ref('');
const busy = ref(false);

const games = [
  { id: 'snyd', titleKey: 'game.cheat', imageClass: 'game-card-snyd' },
  { id: 'krig', titleKey: 'game.krig', imageClass: 'game-card-krig' },
  { id: 'casino', titleKey: 'casino', imageClass: 'game-card-casino' },
  { id: 'highcard', titleKey: 'single.card.highest.wins', imageClass: 'game-card-highest-card' },
  { id: 'fem', titleKey: 'game.500', imageClass: 'game-card-500' },
];

async function joinRoom() {
  const code = joinCode.value.trim();
  if (!code) return;

  busy.value = true;
  errorMessage.value = '';
  try {
    await lobbyStore.joinRoom({ roomCode: code });
    router.push(`/lobby/${code}`);
  } catch (e: any) {
    errorMessage.value = e.message ?? 'Failed to join room';
  } finally {
    busy.value = false;
  }
}

async function createLobby() {
  busy.value = true;
  errorMessage.value = '';
  try {
    const room = await lobbyStore.createRoom({});
    router.push(`/lobby/${room.roomCode}`);
  } catch (e: any) {
    errorMessage.value = e.message ?? 'Failed to create room';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="home-layout">
    <section class="card home-hero">
      <div class="home-hero-copy">
        <h1 class="home-hero-title">{{ t('home.title') }}</h1>
      </div>
    </section>

    <section class="home-actions" aria-label="Homepage action cards">
      <article class="card home-card home-card-half home-placeholder-card" aria-disabled="true">
        <div class="home-card-header">
          <div>
            <div class="card-title home-card-title">{{ t('home.card.continue.title') }}</div>
          </div>
          <span class="home-placeholder-tag">{{ t('home.action.comingSoon') }}</span>
        </div>
      </article>

      <article class="card home-card home-card-half home-matchmaking-card">
        <div class="home-card-header">
          <div>
            <div class="card-title home-card-title">{{ t('home.card.quick.title') }}</div>
          </div>
        </div>

        <div v-if="errorMessage" class="room-banner room-banner-error">{{ errorMessage }}</div>

        <div class="home-matchmaking-grid">
          <div class="home-matchmaking-panel">
            <label class="home-matchmaking-label" for="homeJoinCodeInput">{{ t('home.card.quick.join.label') }}</label>
            <div class="home-join-row">
              <input
                v-model="joinCode"
                class="input home-join-input"
                id="homeJoinCodeInput"
                maxlength="6"
                inputmode="text"
                autocapitalize="characters"
                autocomplete="off"
                spellcheck="false"
                :placeholder="t('home.card.quick.join.placeholder')"
                :aria-label="t('home.card.quick.join.label')"
                @keydown.enter="joinRoom"
              />
              <button class="btn primary" type="button" :disabled="busy" @click="joinRoom">{{ t('home.card.quick.join.action') }}</button>
            </div>
          </div>

          <div class="home-matchmaking-actions">
            <button class="btn primary full-width" type="button" :disabled="busy" @click="createLobby">{{ t('home.card.quick.create.action') }}</button>
            <button class="btn full-width" type="button" :disabled="busy" @click="router.push('/lobbies')">{{ t('home.card.quick.browse.action') }}</button>
          </div>
        </div>
      </article>
    </section>

    <section class="home-content-grid" aria-label="Homepage content cards">
      <article class="card home-card home-card-wide">
        <div class="home-card-header">
          <div>
            <p class="home-eyebrow">{{ t('home.section.games.kicker') }}</p>
            <div class="card-title home-card-title">{{ t('home.section.games.title') }}</div>
          </div>
        </div>

        <div class="grid">
          <GameCard
            v-for="game in games"
            :key="game.id"
            :title-key="game.titleKey"
            :image-class="game.imageClass"
            @select="router.push('/play')"
          />
        </div>
      </article>

      <article class="card home-card home-card-narrow">
        <div class="home-card-header">
          <div>
            <div class="card-title home-card-title">{{ t('home.section.leaderboard.title') }}</div>
          </div>
        </div>
        <p class="card-desc">{{ t('home.section.leaderboard.desc') }}</p>
        <button class="btn full-width" type="button" @click="router.push('/leaderboard')">{{ t('action.open') }}</button>
      </article>

      <article class="card home-card home-card-narrow home-placeholder-card" aria-disabled="true">
        <div class="home-card-header">
          <div>
            <div class="card-title home-card-title">{{ t('home.section.profile.title') }}</div>
          </div>
          <span class="home-placeholder-tag">{{ t('home.action.comingSoon') }}</span>
        </div>
      </article>

      <article class="card home-card home-card-narrow home-placeholder-card" aria-disabled="true">
        <div class="home-card-header">
          <div>
            <div class="card-title home-card-title">{{ t('home.section.friends.title') }}</div>
          </div>
          <span class="home-placeholder-tag">{{ t('home.action.comingSoon') }}</span>
        </div>
      </article>

      <article class="card home-card home-card-narrow home-placeholder-card" aria-disabled="true">
        <div class="home-card-header">
          <div>
            <div class="card-title home-card-title">{{ t('home.section.stats.title') }}</div>
          </div>
          <span class="home-placeholder-tag">{{ t('home.action.comingSoon') }}</span>
        </div>
      </article>
    </section>
  </section>
</template>
