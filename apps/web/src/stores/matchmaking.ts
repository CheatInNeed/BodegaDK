import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import router from '@/router';
import { useApi } from '@/composables/useApi';
import type { MatchmakingResponse } from '@/lib/net/api';

export const useMatchmakingStore = defineStore('matchmaking', () => {
  const api = useApi();

  const loading = ref(false);
  const errorMessage = ref<string | null>(null);
  const activeGame = ref<string | null>(null);
  const ticket = ref<MatchmakingResponse | null>(null);
  const startedAtMs = ref<number | null>(null);
  const leaving = ref(false);
  const matchedCountdown = ref<number | null>(null);

  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let countdownTimer: ReturnType<typeof setInterval> | null = null;
  let generation = 0;

  const isActive = computed(() => ticket.value !== null && !leaving.value);
  const isMatched = computed(() => ticket.value?.status === 'MATCHED');

  async function enqueue(gameType: string, username?: string) {
    const gen = ++generation;
    loading.value = true;
    errorMessage.value = null;
    activeGame.value = gameType;
    ticket.value = null;
    startedAtMs.value = null;
    leaving.value = false;
    matchedCountdown.value = null;

    try {
      const result = await api.enqueueMatchmaking({ gameType, username });
      if (gen !== generation) return;

      ticket.value = result;
      startedAtMs.value = Date.now();
      loading.value = false;

      if (result.status === 'MATCHED') {
        handleMatched(gen, result);
      } else {
        startPolling(gen);
      }
    } catch (e) {
      if (gen !== generation) return;
      errorMessage.value = e instanceof Error ? e.message : 'Failed to join queue';
      loading.value = false;
    }
  }

  function startPolling(gen: number) {
    stopPolling();
    pollTimer = setInterval(async () => {
      if (gen !== generation || !ticket.value) {
        stopPolling();
        return;
      }
      try {
        const updated = await api.getMatchmakingTicket(ticket.value.ticketId);
        if (gen !== generation) return;
        ticket.value = updated;
        activeGame.value = updated.gameType;

        if (updated.status === 'MATCHED') {
          stopPolling();
          handleMatched(gen, updated);
        } else if (updated.status === 'CANCELLED' || updated.status === 'EXPIRED') {
          reset();
        }
      } catch {
        // Ignore poll errors, will retry
      }
    }, 3000);
  }

  function handleMatched(gen: number, result: MatchmakingResponse) {
    matchedCountdown.value = 3;
    countdownTimer = setInterval(() => {
      if (gen !== generation) {
        clearInterval(countdownTimer!);
        return;
      }
      matchedCountdown.value = (matchedCountdown.value ?? 1) - 1;
      if (matchedCountdown.value! <= 0) {
        clearInterval(countdownTimer!);
        if (result.roomCode && result.gameType) {
          router.push(`/room/${result.gameType}/${result.roomCode}`);
        }
        reset();
      }
    }, 1000);
  }

  async function leave() {
    if (!ticket.value) return;
    leaving.value = true;
    try {
      await api.cancelMatchmakingTicket(ticket.value.ticketId);
    } catch {
      // Ignore cancel errors
    }
    reset();
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function reset() {
    generation++;
    stopPolling();
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
    loading.value = false;
    errorMessage.value = null;
    activeGame.value = null;
    ticket.value = null;
    startedAtMs.value = null;
    leaving.value = false;
    matchedCountdown.value = null;
  }

  return {
    loading,
    errorMessage,
    activeGame,
    ticket,
    startedAtMs,
    leaving,
    matchedCountdown,
    isActive,
    isMatched,
    enqueue,
    leave,
    reset,
  };
});
