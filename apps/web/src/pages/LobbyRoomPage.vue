<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useApi } from '@/composables/useApi';
import { useGameSession } from '@/composables/useGameSession';
import { buildPlayerNameMap, formatPlayerDisplayName } from '@/lib/game-room/player-display';
import type { RoomBootstrap } from '@/lib/game-room/types';
import { highcardAdapter } from '@/lib/games/highcard/adapter';

const props = defineProps<{ roomCode: string }>();

const { t } = useI18n();
const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const api = useApi();

const useMock = computed(() => route.query.mock === '1');
const copiedCode = ref(false);

type LobbyGameMeta = {
  id: string;
  titleKey: string;
  durationKey: string;
  summaryKey: string;
  imageSrc: string;
  minPlayers: number;
  maxPlayers: number;
};

const LOBBY_GAMES: LobbyGameMeta[] = [
  { id: 'snyd', titleKey: 'game.cheat', durationKey: 'lobby.game.snyd.eta', summaryKey: 'lobby.game.snyd.summary', imageSrc: '/images/game-cards/snyd_cover.png', minPlayers: 2, maxPlayers: 8 },
  { id: 'highcard', titleKey: 'game.highcard', durationKey: 'lobby.game.highcard.eta', summaryKey: 'lobby.game.highcard.summary', imageSrc: '/images/game-cards/highestcard_cover.png', minPlayers: 1, maxPlayers: 1 },
  { id: 'krig', titleKey: 'game.krig', durationKey: 'lobby.game.krig.eta', summaryKey: 'lobby.game.krig.summary', imageSrc: '/images/game-cards/krig_cover.png', minPlayers: 2, maxPlayers: 2 },
  { id: 'casino', titleKey: 'game.casino', durationKey: 'lobby.game.casino.eta', summaryKey: 'lobby.game.casino.summary', imageSrc: '/images/game-cards/casino_cover.png', minPlayers: 2, maxPlayers: 2 },
  { id: 'fem', titleKey: 'game.500', durationKey: 'lobby.game.fem.eta', summaryKey: 'lobby.game.fem.summary', imageSrc: '/images/game-cards/500_cover.png', minPlayers: 2, maxPlayers: 6 },
];

const bootstrap: RoomBootstrap = {
  roomCode: props.roomCode,
  game: 'highcard',
  useMock: useMock.value,
  getAccessToken: () => authStore.getAccessToken(),
};

const { state, start, sendMessage } = useGameSession(bootstrap, highcardAdapter);

onMounted(() => { start(); });

const publicState = computed(() => (state.value.publicState ?? {}) as Record<string, unknown>);
const hostPlayerId = computed(() => { const v = publicState.value.hostPlayerId; return typeof v === 'string' ? v : null; });
const roomSelectedGame = computed(() => { const v = publicState.value.selectedGame; return typeof v === 'string' ? v : 'highcard'; });
const isHost = computed(() => !!state.value.playerId && state.value.playerId === hostPlayerId.value);
const isPrivate = computed(() => publicState.value.isPrivate === true);

const selectedGameMeta = computed(() => LOBBY_GAMES.find((g) => g.id === roomSelectedGame.value) ?? LOBBY_GAMES[0]);

const players = computed(() => {
  const raw = publicState.value.players;
  if (!Array.isArray(raw)) return [];
  const names = buildPlayerNameMap(raw, {
    selfPlayerId: state.value.playerId,
    selfUsername: authStore.user?.username ?? null,
  });
  return raw.map((entry: any) => {
    const playerId = typeof entry === 'string' ? entry : entry?.playerId;
    const username = typeof entry === 'string' ? (names[entry] ?? entry) : (entry?.username ?? names[playerId] ?? playerId);
    return {
      playerId,
      username: names[playerId] ?? formatPlayerDisplayName(playerId),
      label: names[playerId] ?? formatPlayerDisplayName(playerId),
      isHost: playerId === hostPlayerId.value,
      isSelf: playerId === state.value.playerId,
    };
  });
});

const seatedPlayers = computed(() => players.value.slice(0, selectedGameMeta.value.maxPlayers));
const overflowPlayers = computed(() => players.value.slice(selectedGameMeta.value.maxPlayers));
const canStart = computed(() => players.value.length >= selectedGameMeta.value.minPlayers && players.value.length <= selectedGameMeta.value.maxPlayers);
const hostDisplayName = computed(() => {
  const host = players.value.find((p) => p.isHost);
  return host?.label ?? '---';
});

watch(() => publicState.value.status, (status) => {
  if (status === 'IN_GAME') {
    router.push(`/room/${roomSelectedGame.value}/${props.roomCode}${useMock.value ? '?mock=1' : ''}`);
  }
});

function selectGame(gameId: string) {
  sendMessage({ type: 'SELECT_GAME', payload: { game: gameId } });
}

function startGame() {
  sendMessage({ type: 'START_GAME', payload: {} });
}

async function copyCode() {
  try {
    await navigator.clipboard.writeText(props.roomCode);
    copiedCode.value = true;
    setTimeout(() => { copiedCode.value = false; }, 2000);
  } catch { /* clipboard not available */ }
}

function setVisibility(isPrivateVal: boolean) {
  sendMessage({ type: 'SET_VISIBILITY', payload: { isPrivate: isPrivateVal } } as any);
}

async function leaveLobby() {
  try { await api.leaveRoom({ roomCode: props.roomCode }); } catch { /* ignore */ }
  router.push('/lobbies');
}

function kickPlayer(playerId: string) {
  sendMessage({ type: 'KICK_PLAYER', payload: { playerId } } as any);
}

function positionsForSeatCount(count: number): string[] {
  if (count <= 1) return ['south'];
  if (count === 2) return ['north', 'south'];
  if (count === 3) return ['north', 'east', 'south'];
  if (count === 4) return ['north', 'east', 'south', 'west'];
  return ['northwest', 'north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west'].slice(0, count);
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join('') || '?';
}

function formatPlayerRange(game: LobbyGameMeta): string {
  if (game.minPlayers === game.maxPlayers) {
    return `${game.maxPlayers} ${t(game.maxPlayers === 1 ? 'lobby.players.single' : 'lobby.players.plural')}`;
  }
  return `${game.minPlayers}-${game.maxPlayers} ${t('lobby.players.plural')}`;
}

function startHint(): string {
  if (!isHost.value) return t('lobby.start.waiting');
  if (overflowPlayers.value.length > 0) return t('lobby.start.tooMany');
  return t(canStart.value ? 'lobby.start.ready' : 'lobby.start.needPlayers');
}
</script>

<template>
  <section class="lobby-room">
    <div class="lobby-hero card lobby-room-hero">
      <h1 class="h1">Lobby {{ roomCode }}</h1>
    </div>

    <div v-if="state.lastError" class="room-banner room-banner-error">{{ state.lastError }}</div>

    <section class="lobby-browser-grid">
      <div class="lobby-primary-column">
        <!-- Game Selection -->
        <div class="card lobby-stage-card">
          <div class="lobby-stage-header">
            <div class="card-title">{{ t('lobby.selection.title') }}</div>
            <span class="pill">{{ seatedPlayers.length }}/{{ selectedGameMeta.maxPlayers }}</span>
          </div>

          <div class="lobby-game-card-grid" role="radiogroup" :aria-label="t('lobby.selection.aria')">
            <component
              v-for="game in LOBBY_GAMES"
              :key="game.id"
              :is="isHost ? 'button' : 'article'"
              :class="['lobby-game-card', { active: roomSelectedGame === game.id, passive: !isHost }]"
              :type="isHost ? 'button' : undefined"
              :role="isHost ? 'radio' : 'presentation'"
              :aria-checked="isHost ? (roomSelectedGame === game.id ? 'true' : 'false') : undefined"
              @click="isHost ? selectGame(game.id) : undefined"
            >
              <img class="lobby-game-card-image" :src="game.imageSrc" :alt="t(game.titleKey)" />
              <div class="lobby-game-card-body">
                <span class="lobby-game-card-title">{{ t(game.titleKey) }}</span>
                <span class="lobby-game-card-meta">{{ t(game.durationKey) }}</span>
                <span class="lobby-game-card-copy">{{ t(game.summaryKey) }}</span>
              </div>
            </component>
          </div>

          <div class="lobby-game-preview">
            <div class="lobby-game-preview-top">
              <div class="card-title">{{ t(selectedGameMeta.titleKey) }}</div>
              <span class="pill">{{ formatPlayerRange(selectedGameMeta) }}</span>
            </div>
            <div class="lobby-preview-stats">
              <div class="lobby-preview-stat">
                <span class="lobby-preview-label">{{ t('lobby.preview.eta') }}</span>
                <strong>{{ t(selectedGameMeta.durationKey) }}</strong>
              </div>
              <div class="lobby-preview-stat">
                <span class="lobby-preview-label">{{ t('lobby.preview.rules') }}</span>
                <strong>{{ t(selectedGameMeta.summaryKey) }}</strong>
              </div>
            </div>
          </div>
        </div>

        <!-- Seat Table -->
        <div class="card lobby-seats-card">
          <div class="lobby-section-heading">
            <h2 class="card-title">{{ t('lobby.players.title') }}</h2>
            <span class="pill">{{ players.length }}</span>
          </div>

          <div :class="['lobby-seat-table', `lobby-seat-table-${selectedGameMeta.maxPlayers}`]">
            <div class="lobby-table-center">
              <div class="lobby-table-center-top">{{ t('lobby.table.title') }}</div>
              <div class="lobby-table-center-game">{{ t(selectedGameMeta.titleKey) }}</div>
              <div class="lobby-table-center-host">{{ hostDisplayName }}</div>
            </div>

            <div
              v-for="(position, index) in positionsForSeatCount(selectedGameMeta.maxPlayers)"
              :key="position"
              class="lobby-seat"
              :class="position"
            >
              <!-- Empty seat -->
              <div v-if="!seatedPlayers[index]" class="lobby-seat-card empty">
                <div class="lobby-seat-avatar placeholder">+</div>
                <div>
                  <div class="card-title">{{ t('lobby.seat.emptyTitle') }}</div>
                </div>
              </div>

              <!-- Occupied seat -->
              <div v-else class="lobby-seat-card" :class="{ self: seatedPlayers[index].isSelf }">
                <div class="lobby-seat-avatar">{{ initialsFor(seatedPlayers[index].username) }}</div>
                <div class="lobby-seat-copy">
                  <div class="card-title">{{ seatedPlayers[index].username }}</div>
                  <div class="lobby-seat-badges">
                    <span class="pill">{{ t(seatedPlayers[index].isHost ? 'lobby.badge.host' : 'lobby.badge.player') }}</span>
                    <span v-if="seatedPlayers[index].isSelf" class="pill">{{ t('lobby.badge.you') }}</span>
                  </div>
                </div>
                <button
                  v-if="isHost && !seatedPlayers[index].isSelf"
                  class="btn lobby-kick-button"
                  @click="kickPlayer(seatedPlayers[index].playerId)"
                >{{ t('lobby.kick') }}</button>
              </div>
            </div>
          </div>

          <!-- Bench -->
          <div v-if="overflowPlayers.length > 0" class="lobby-bench">
            <div class="lobby-bench-header">
              <div class="card-title">{{ t('lobby.bench.title') }}</div>
              <span class="pill">{{ overflowPlayers.length }}</span>
            </div>
            <div class="lobby-bench-list">
              <div v-for="player in overflowPlayers" :key="player.playerId" class="lobby-bench-card">
                <div class="lobby-seat-avatar">{{ initialsFor(player.username) }}</div>
                <div class="lobby-bench-copy">
                  <div class="card-title">{{ player.username }}</div>
                  <p class="card-desc">{{ t('lobby.bench.desc') }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Side Panel -->
      <aside class="lobby-side-column">
        <div class="card lobby-panel">
          <div class="card-title">{{ t('lobby.host.title') }}</div>
          <button
            class="btn primary full-width lobby-start-button"
            :disabled="!isHost || !canStart"
            @click="startGame"
          >{{ t('lobby.start') }}</button>
          <p class="card-desc lobby-start-hint">{{ startHint() }}</p>
        </div>

        <div class="card lobby-panel">
          <div class="card-title">{{ t('lobby.actions.title') }}</div>
          <div class="lobby-code-wrap">
            <div class="lobby-code-block">
              <span class="lobby-code-label">{{ t('lobby.actions.roomCode') }}</span>
              <div class="lobby-code">{{ roomCode }}</div>
            </div>
            <button class="btn lobby-copy-button" type="button" :aria-label="t('lobby.actions.copy')" @click="copyCode">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M9 3h6a2 2 0 0 1 2 2v1h1a2 2 0 0 1 2 2v10a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V8a2 2 0 0 1 2-2h1V5a2 2 0 0 1 2-2Zm0 3h6V5H9Zm-2 2v10a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V8h-1v1a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V8Z" fill="currentColor"></path>
              </svg>
              <span>{{ copiedCode ? t('lobby.actions.copied') : t('lobby.actions.copy') }}</span>
            </button>
          </div>
          <div class="lobby-copy-feedback" aria-live="polite">{{ copiedCode ? t('lobby.actions.copiedHint') : '&nbsp;' }}</div>
          <div class="lobby-visibility-toggle" role="group" :aria-label="t('lobby.visibility.title')">
            <button
              class="btn lobby-visibility-button"
              :class="{ active: !isPrivate }"
              type="button"
              :disabled="!isHost"
              @click="setVisibility(false)"
            >{{ t('lobby.visibility.public') }}</button>
            <button
              class="btn lobby-visibility-button"
              :class="{ active: isPrivate }"
              type="button"
              :disabled="!isHost"
              @click="setVisibility(true)"
            >{{ t('lobby.visibility.private') }}</button>
          </div>
          <button class="btn full-width" @click="leaveLobby">{{ t('lobby.leave') }}</button>
        </div>
      </aside>
    </section>
  </section>
</template>
