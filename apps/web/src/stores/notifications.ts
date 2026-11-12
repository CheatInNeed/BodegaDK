import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useApi } from '@/composables/useApi';
import type { CreateRoomResponse, NotificationSummary } from '@/lib/net/api';

export const useNotificationsStore = defineStore('notifications', () => {
  const api = useApi();

  const open = ref(false);
  const loading = ref(false);
  const items = ref<NotificationSummary[]>([]);
  const unreadCount = ref(0);
  const errorMessage = ref<string | null>(null);
  const busyId = ref<string | null>(null);
  const readAllBusy = ref(false);
  const handledChallengeIds = ref(new Set<string>());

  const hasUnread = computed(() => unreadCount.value > 0);

  function toggle() {
    open.value = !open.value;
    if (open.value) {
      load();
    }
  }

  function close() {
    open.value = false;
  }

  async function load() {
    loading.value = true;
    errorMessage.value = null;
    try {
      const data = await api.getNotifications({ limit: 30 });
      items.value = data.items;
      unreadCount.value = data.unreadCount;
    } catch (e) {
      errorMessage.value = e instanceof Error ? e.message : 'Failed to load notifications';
    } finally {
      loading.value = false;
    }
  }

  async function markRead(id: string) {
    busyId.value = id;
    try {
      await api.markNotificationRead(id);
      const wasUnread = items.value.some((i) => i.id === id && !i.readAt);
      items.value = items.value.map((i) =>
        i.id === id ? { ...i, readAt: new Date().toISOString() } : i,
      );
      if (wasUnread) unreadCount.value = Math.max(0, unreadCount.value - 1);
    } catch (e) {
      errorMessage.value = e instanceof Error ? e.message : 'Failed to mark notification';
    } finally {
      busyId.value = null;
    }
  }

  async function respondToChallenge(notification: NotificationSummary, accept: boolean) {
    const challengeId = notification.payload?.challengeId;
    if (busyId.value !== null || readAllBusy.value || handledChallengeIds.value.has(notification.id)) return;
    errorMessage.value = null;
    if (notification.type !== 'challenge.received' || typeof challengeId !== 'string' || !challengeId.trim()) {
      errorMessage.value = 'notifications.actionError';
      return;
    }

    busyId.value = notification.id;
    try {
      let room: CreateRoomResponse | undefined;
      if (accept) {
        room = (await api.acceptChallenge(challengeId)).room;
      } else {
        await api.declineChallenge(challengeId);
      }
      handledChallengeIds.value.add(notification.id);
      // Reading is secondary: a successful acceptance must still open the lobby
      // if updating the notification fails.
      await markRead(notification.id);
      return room;
    } catch (e) {
      errorMessage.value = e instanceof Error ? e.message : 'notifications.actionError';
    } finally {
      busyId.value = null;
    }
  }

  async function markAllRead() {
    readAllBusy.value = true;
    try {
      await api.markAllNotificationsRead();
      items.value = items.value.map((i) => ({
        ...i,
        readAt: i.readAt ?? new Date().toISOString(),
      }));
      unreadCount.value = 0;
    } catch (e) {
      errorMessage.value = e instanceof Error ? e.message : 'Failed to mark all read';
    } finally {
      readAllBusy.value = false;
    }
  }

  function clear() {
    items.value = [];
    unreadCount.value = 0;
    errorMessage.value = null;
    loading.value = false;
    open.value = false;
    handledChallengeIds.value.clear();
  }

  return {
    open,
    loading,
    items,
    unreadCount,
    errorMessage,
    busyId,
    readAllBusy,
    hasUnread,
    handledChallengeIds,
    toggle,
    close,
    load,
    markRead,
    respondToChallenge,
    markAllRead,
    clear,
  };
});
