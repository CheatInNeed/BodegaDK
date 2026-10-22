<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useLobbyStore } from '@/stores/lobby';
import { useAuthStore } from '@/stores/auth';

const { t } = useI18n();
const router = useRouter();
const lobbyStore = useLobbyStore();
const authStore = useAuthStore();

const joinCode = ref('');
const createPrivate = ref(false);

onMounted(() => {
  if (!lobbyStore.loaded) {
    lobbyStore.loadRooms();
  }
});

async function createRoom() {
  try {
    const result = await lobbyStore.createRoom({
      isPrivate: createPrivate.value,
      username: authStore.user?.username ?? undefined,
    });
    router.push(`/lobby/${result.roomCode}`);
  } catch {
    // Error shown in store
  }
}

async function joinRoom(roomCode: string) {
  try {
    await lobbyStore.joinRoom({
      roomCode,
      username: authStore.user?.username ?? undefined,
    });
    router.push(`/lobby/${roomCode}`);
  } catch {
    // Error shown in store
  }
}

async function joinByCode() {
  const code = joinCode.value.trim();
  if (!code) return;
  await joinRoom(code);
}

function refresh() {
  lobbyStore.loadRooms();
}

function hostName(room: any): string {
  const host = room.participants?.find((p: any) => p.playerId === room.hostPlayerId);
  return host?.username ?? room.hostPlayerId ?? '---';
}
</script>

<template>
  <section class="lobby-browser">
    <div class="lobby-hero card">
      <div>
        <h1 class="h1">Lobby Browser</h1>
        <p class="sub">Create a room, then pick the game inside the lobby.</p>
      </div>
      <div class="lobby-hero-actions">
        <span class="pill">{{ lobbyStore.loading ? 'Refreshing lobbies...' : 'Public lobbies' }}</span>
        <button class="btn" :disabled="lobbyStore.busy" @click="refresh">Refresh</button>
      </div>
    </div>

    <div v-if="lobbyStore.errorMessage" class="room-banner room-banner-error">{{ lobbyStore.errorMessage }}</div>

    <section class="lobby-browser-grid">
      <div class="lobby-primary-column">
        <div class="lobby-section-heading">
          <h2 class="card-title">Open Tables</h2>
          <span class="pill">{{ lobbyStore.rooms.length }} listed</span>
        </div>
        <div class="lobby-room-list">
          <div v-if="lobbyStore.rooms.length === 0" class="card lobby-empty">
            <div class="card-title">No public lobbies</div>
            <p class="card-desc">Create one below or join via code.</p>
          </div>

          <article v-for="room in lobbyStore.rooms" :key="room.roomCode" class="card lobby-list-card">
            <div class="lobby-list-header">
              <div>
                <div class="card-title">Room {{ room.roomCode }}</div>
                <p class="card-desc">Host: {{ hostName(room) }} &middot; Game: {{ room.selectedGame }}</p>
              </div>
              <div class="lobby-badges">
                <span class="pill">{{ room.playerCount }} players</span>
              </div>
            </div>
            <div class="lobby-player-strip">
              <span v-for="p in room.participants" :key="p.playerId" class="pill">{{ p.username ?? p.playerId }}</span>
            </div>
            <div class="card-row">
              <button class="btn primary" :disabled="lobbyStore.busy" @click="joinRoom(room.roomCode)">
                {{ room.status === 'IN_GAME' ? t('lobby.join.running') : t('lobby.join.lobby') }}
              </button>
            </div>
          </article>
        </div>
      </div>

      <aside class="lobby-side-column">
        <div class="card lobby-panel">
          <div class="card-title">Create Lobby</div>
          <p class="card-desc">Start a fresh lobby and choose the game after you enter.</p>
          <label class="lobby-toggle">
            <input type="checkbox" v-model="createPrivate" />
            <span>{{ t('lobby.create.visibility') }}</span>
          </label>
          <button class="btn primary full-width" :disabled="lobbyStore.busy" @click="createRoom">Create Lobby</button>
        </div>

        <div class="card lobby-panel">
          <div class="card-title">Join Via Code</div>
          <p class="card-desc">Paste a 6-letter room code from a friend.</p>
          <input
            v-model="joinCode"
            class="input"
            maxlength="6"
            placeholder="ABC123"
            @keydown.enter="joinByCode"
          />
          <button class="btn primary full-width" :disabled="lobbyStore.busy || !joinCode.trim()" @click="joinByCode">Join Lobby</button>
        </div>
      </aside>
    </section>
  </section>
</template>
