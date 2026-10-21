<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { useFriendsStore } from '@/stores/friends';

const { t } = useI18n();
const authStore = useAuthStore();
const friendsStore = useFriendsStore();

const addUsername = ref('');

async function sendRequest() {
  const username = addUsername.value.trim();
  if (!username) return;
  await friendsStore.sendRequest(username);
  addUsername.value = '';
}

function otherUser(friendship: any) {
  return friendship.requester.userId === authStore.user?.id
    ? friendship.addressee
    : friendship.requester;
}

function displayName(user: { username: string; displayName?: string | null }): string {
  return user.displayName || user.username;
}
</script>

<template>
  <article class="card profile-section-card profile-friends-card">
    <div class="profile-section-header">
      <div>
        <div class="card-title">{{ t('profile.friends.title') }}</div>
        <p class="card-desc">{{ t('profile.friends.desc') }}</p>
      </div>
    </div>

    <div v-if="!authStore.isAuthenticated">
      <p class="card-desc">{{ t('profile.friends.loginRequired') }}</p>
    </div>

    <template v-else>
      <form class="profile-friend-form" @submit.prevent="sendRequest">
        <label class="profile-friend-field" for="friendUsernameInput">
          <span>{{ t('profile.friends.addLabel') }}</span>
          <input
            id="friendUsernameInput"
            v-model="addUsername"
            class="input"
            type="text"
            autocomplete="off"
            :placeholder="t('profile.friends.addPlaceholder')"
            :disabled="friendsStore.sending"
          />
        </label>
        <button class="btn primary" type="submit" :disabled="friendsStore.sending || !addUsername.trim()">
          {{ t('profile.friends.addAction') }}
        </button>
      </form>

      <div v-if="friendsStore.errorMessage" class="profile-friends-error">
        {{ friendsStore.errorMessage }}
      </div>

      <div class="profile-friends-grid">
        <section class="profile-friends-panel">
          <h3>{{ t('profile.friends.listTitle') }}</h3>
          <div v-if="friendsStore.friends.length === 0">
            <p class="card-desc">{{ t('profile.friends.empty') }}</p>
          </div>
          <div v-else class="profile-friend-list">
            <div v-for="friendship in friendsStore.friends" :key="friendship.id" class="profile-friend-row">
              <div>
                <div class="profile-friend-name">{{ displayName(otherUser(friendship)) }}</div>
                <div class="profile-friend-meta">@{{ otherUser(friendship).username }}</div>
              </div>
              <div class="profile-friend-actions">
                <button
                  class="btn danger"
                  type="button"
                  :disabled="friendsStore.busyFriendshipId === friendship.id"
                  @click="friendsStore.removeFriend(friendship.id)"
                >{{ t('profile.friends.remove') }}</button>
              </div>
            </div>
          </div>
        </section>

        <section class="profile-friends-panel">
          <h3>{{ t('profile.friends.incomingTitle') }}</h3>
          <div v-if="!friendsStore.requests?.incoming?.length">
            <p class="card-desc">{{ t('profile.friends.incomingEmpty') }}</p>
          </div>
          <div v-else class="profile-friend-list">
            <div v-for="req in friendsStore.requests.incoming" :key="req.id" class="profile-friend-row">
              <div>
                <div class="profile-friend-name">{{ displayName(req.requester) }}</div>
                <div class="profile-friend-meta">@{{ req.requester.username }}</div>
              </div>
              <div class="profile-friend-actions">
                <button
                  class="btn primary"
                  type="button"
                  :disabled="friendsStore.busyFriendshipId === req.id"
                  @click="friendsStore.acceptRequest(req.id)"
                >{{ t('profile.friends.accept') }}</button>
                <button
                  class="btn"
                  type="button"
                  :disabled="friendsStore.busyFriendshipId === req.id"
                  @click="friendsStore.declineRequest(req.id)"
                >{{ t('profile.friends.decline') }}</button>
              </div>
            </div>
          </div>
        </section>

        <section class="profile-friends-panel">
          <h3>{{ t('profile.friends.outgoingTitle') }}</h3>
          <div v-if="!friendsStore.requests?.outgoing?.length">
            <p class="card-desc">{{ t('profile.friends.outgoingEmpty') }}</p>
          </div>
          <div v-else class="profile-friend-list">
            <div v-for="req in friendsStore.requests.outgoing" :key="req.id" class="profile-friend-row">
              <div>
                <div class="profile-friend-name">{{ displayName(req.addressee) }}</div>
                <div class="profile-friend-meta">@{{ req.addressee.username }} - {{ t('profile.friends.pending') }}</div>
              </div>
              <div class="profile-friend-actions">
                <button
                  class="btn"
                  type="button"
                  :disabled="friendsStore.busyFriendshipId === req.id"
                  @click="friendsStore.removeFriend(req.id)"
                >{{ t('profile.friends.cancel') }}</button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </template>
  </article>
</template>
