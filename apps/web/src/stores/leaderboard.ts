import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useApi } from '@/composables/useApi';
import type { LeaderboardResponse } from '@/lib/net/api';

export const useLeaderboardStore = defineStore('leaderboard', () => {
  const api = useApi();

  const loading = ref(false);
  const errorMessage = ref<string | null>(null);
  const data = ref<LeaderboardResponse | null>(null);
  const game = ref('snyd');

  async function load() {
    loading.value = true;
    errorMessage.value = null;
    try {
      data.value = await api.getLeaderboard({ game: game.value });
    } catch (e) {
      errorMessage.value = e instanceof Error ? e.message : 'Failed to load leaderboard';
    } finally {
      loading.value = false;
    }
  }

  function setGame(value: string) {
    game.value = value;
    data.value = null;
    errorMessage.value = null;
    load();
  }

  return {
    loading,
    errorMessage,
    data,
    game,
    load,
    setGame,
  };
});
