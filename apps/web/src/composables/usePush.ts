import { ref, onMounted } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useApi } from '@/composables/useApi';
import {
  readPushStatus,
  enablePushNotifications,
  disablePushNotifications,
  sendTestPush,
  type PushStatus,
} from '@/lib/pwa';

export function usePush() {
  const authStore = useAuthStore();
  const api = useApi();

  const status = ref<PushStatus | null>(null);
  const loading = ref(true);
  const feedback = ref<string | null>(null);
  const feedbackType = ref<'success' | 'error'>('success');

  function createAuthFetch(): typeof fetch {
    return async (input: RequestInfo | URL, init?: RequestInit) => {
      const token = await authStore.getAccessToken();
      const headers = new Headers(init?.headers);
      headers.set('Authorization', `Bearer ${token}`);
      return fetch(input, { ...init, headers });
    };
  }

  async function refresh() {
    loading.value = true;
    try {
      status.value = await readPushStatus();
    } catch {
      // ignore
    } finally {
      loading.value = false;
    }
  }

  async function enable() {
    feedback.value = null;
    try {
      status.value = await enablePushNotifications(
        { userId: authStore.user?.id, username: authStore.user?.username },
        createAuthFetch(),
      );
      feedback.value = 'Notifications are enabled on this device.';
      feedbackType.value = 'success';
    } catch (e) {
      feedback.value = e instanceof Error ? e.message : 'Failed to enable notifications.';
      feedbackType.value = 'error';
    }
  }

  async function disable() {
    feedback.value = null;
    try {
      status.value = await disablePushNotifications(createAuthFetch());
      feedback.value = 'Notifications are disabled on this device.';
      feedbackType.value = 'success';
    } catch (e) {
      feedback.value = e instanceof Error ? e.message : 'Failed to disable notifications.';
      feedbackType.value = 'error';
    }
  }

  async function test() {
    feedback.value = null;
    try {
      await sendTestPush(createAuthFetch());
      feedback.value = 'Test notification sent.';
      feedbackType.value = 'success';
    } catch (e) {
      feedback.value = e instanceof Error ? e.message : 'Failed to send test notification.';
      feedbackType.value = 'error';
    }
  }

  onMounted(refresh);

  return {
    status,
    loading,
    feedback,
    feedbackType,
    refresh,
    enable,
    disable,
    test,
  };
}
