<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useNotificationsStore } from '@/stores/notifications';
import type { NotificationSummary } from '@/lib/net/api';

const { t } = useI18n();
const router = useRouter();
const notificationsStore = useNotificationsStore();

function formatMessage(notification: NotificationSummary): string {
  const actorName = notification.actor?.username ?? notification.actor?.displayName ?? t('notifications.someone');
  const game = (notification.payload?.game as string) ?? '';

  const templates: Record<string, string> = {
    FRIEND_REQUEST: t('notifications.message.friendRequest'),
    FRIEND_ACCEPTED: t('notifications.message.friendAccepted'),
    CHALLENGE_RECEIVED: t('notifications.message.challengeReceived'),
    CHALLENGE_ACCEPTED: t('notifications.message.challengeAccepted'),
    CHALLENGE_DECLINED: t('notifications.message.challengeDeclined'),
  };

  const template = templates[notification.type] ?? t('notifications.message.generic');
  return template.replace('{actor}', actorName).replace('{game}', game);
}

function hasActions(notification: NotificationSummary): boolean {
  return notification.type === 'FRIEND_REQUEST' || notification.type === 'CHALLENGE_RECEIVED';
}

function openRoom(roomCode: string) {
  notificationsStore.close();
  router.push(`/lobby/${roomCode}`);
}
</script>

<template>
  <div class="notification-panel">
    <div class="notification-panel-header">
      <h3 class="notification-panel-title">{{ t('notifications.title') }}</h3>
      <button
        v-if="notificationsStore.items.length > 0"
        class="btn btn-sm"
        :disabled="notificationsStore.readAllBusy"
        @click="notificationsStore.markAllRead()"
      >
        {{ t('notifications.readAll') }}
      </button>
    </div>

    <div v-if="notificationsStore.loading" class="notification-panel-body">
      <p class="card-desc">{{ t('notifications.loading') }}</p>
    </div>

    <div v-else-if="notificationsStore.errorMessage" class="notification-panel-body">
      <p class="card-desc">{{ notificationsStore.errorMessage }}</p>
    </div>

    <div v-else-if="notificationsStore.items.length === 0" class="notification-panel-body">
      <p class="card-desc">{{ t('notifications.empty') }}</p>
    </div>

    <ul v-else class="notification-list">
      <li
        v-for="notification in notificationsStore.items"
        :key="notification.id"
        class="notification-row"
        :class="{ unread: !notification.readAt }"
      >
        <p class="notification-text">{{ formatMessage(notification) }}</p>

        <div v-if="hasActions(notification)" class="notification-actions">
          <template v-if="notification.type === 'FRIEND_REQUEST'">
            <button
              class="btn btn-sm primary"
              :disabled="notificationsStore.busyId === notification.id"
              @click="notificationsStore.markRead(notification.id)"
            >
              {{ t('notifications.accept') }}
            </button>
            <button
              class="btn btn-sm"
              :disabled="notificationsStore.busyId === notification.id"
              @click="notificationsStore.markRead(notification.id)"
            >
              {{ t('notifications.decline') }}
            </button>
          </template>

          <template v-if="notification.type === 'CHALLENGE_RECEIVED'">
            <button
              class="btn btn-sm primary"
              :disabled="notificationsStore.busyId === notification.id"
              @click="notificationsStore.markRead(notification.id)"
            >
              {{ t('notifications.accept') }}
            </button>
            <button
              class="btn btn-sm"
              :disabled="notificationsStore.busyId === notification.id"
              @click="notificationsStore.markRead(notification.id)"
            >
              {{ t('notifications.decline') }}
            </button>
          </template>
        </div>

        <div v-else class="notification-actions">
          <button
            v-if="!notification.readAt"
            class="btn btn-sm"
            :disabled="notificationsStore.busyId === notification.id"
            @click="notificationsStore.markRead(notification.id)"
          >
            {{ t('notifications.markRead') }}
          </button>
          <button
            v-if="notification.payload?.roomCode"
            class="btn btn-sm"
            @click="openRoom(notification.payload.roomCode as string)"
          >
            {{ t('notifications.openRoom') }}
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>
