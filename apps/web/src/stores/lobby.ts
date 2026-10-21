import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useApi } from '@/composables/useApi';
import type { LobbyRoomSummary } from '@/lib/net/api';

export const useLobbyStore = defineStore('lobby', () => {
  const api = useApi();

  const rooms = ref<LobbyRoomSummary[]>([]);
  const loading = ref(false);
  const loaded = ref(false);
  const busy = ref(false);
  const errorMessage = ref<string | null>(null);
  const joinCode = ref('');
  const createPrivate = ref(false);

  async function loadRooms() {
    loading.value = true;
    errorMessage.value = null;
    try {
      rooms.value = await api.listRooms();
      loaded.value = true;
    } catch (e) {
      errorMessage.value = e instanceof Error ? e.message : 'Failed to load rooms';
    } finally {
      loading.value = false;
    }
  }

  async function createRoom(input: { gameType?: string; isPrivate?: boolean; username?: string }) {
    busy.value = true;
    errorMessage.value = null;
    try {
      return await api.createRoom(input);
    } catch (e) {
      errorMessage.value = e instanceof Error ? e.message : 'Failed to create room';
      throw e;
    } finally {
      busy.value = false;
    }
  }

  async function joinRoom(input: { roomCode: string; username?: string }) {
    busy.value = true;
    errorMessage.value = null;
    try {
      return await api.joinRoom(input);
    } catch (e) {
      errorMessage.value = e instanceof Error ? e.message : 'Failed to join room';
      throw e;
    } finally {
      busy.value = false;
    }
  }

  function resetLoaded() {
    loaded.value = false;
  }

  return {
    rooms,
    loading,
    loaded,
    busy,
    errorMessage,
    joinCode,
    createPrivate,
    loadRooms,
    createRoom,
    joinRoom,
    resetLoaded,
  };
});
