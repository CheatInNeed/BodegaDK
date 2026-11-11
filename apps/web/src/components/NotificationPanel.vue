<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useNotificationsStore } from '@/stores/notifications';
import type { NotificationSummary } from '@/lib/net/api';

const { t, te } = useI18n();
const router = useRouter();
const notificationsStore = useNotificationsStore();

function formatMessage(notification: NotificationSummary): string {
  const actorName = notification.actor?.username ?? notification.actor?.displayName ?? t('notifications.someone');
  const gameType = notification.payload?.gameType;
  const gameKeys: Record<string, string> = {
    snyd: 'game.cheat', highcard: 'game.highcard', krig: 'game.krig', casino: 'game.casino', fem: 'game.500',
  };
  const game = typeof gameType === 'string' ? (gameKeys[gameType] ? t(gameKeys[gameType]) : gameType) : '';

  const templates: Record<string, string> = {
    'friend.request.received': 'notifications.message.friendRequest',
    'friend.request.accepted': 'notifications.message.friendAccepted',
    'challenge.received': 'notifications.message.challengeReceived',
    'challenge.accepted': 'notifications.message.challengeAccepted',
    'challenge.declined': 'notifications.message.challengeDeclined',
  };

  return t(templates[notification.type] ?? 'notifications.message.generic', { actor: actorName, game });
}

function hasActions(notification: NotificationSummary): boolean {
  return notification.type === 'challenge.received'
    && typeof notification.payload?.challengeId === 'string'
    && !!notification.payload.challengeId.trim()
    && !notificationsStore.handledChallengeIds.has(notification.id);
}

async function respondToChallenge(notification: NotificationSummary, accept: boolean) {
  const room = await notificationsStore.respondToChallenge(notification, accept);
  if (room) openRoom(room.roomCode);
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
        :disabled="notificationsStore.readAllBusy || notificationsStore.busyId !== null"
        @click="notificationsStore.markAllRead()"
      >
        {{ t('notifications.readAll') }}
      </button>
    </div>

    <div v-if="notificationsStore.loading" class="notification-panel-body">
      <p class="card-desc">{{ t('notifications.loading') }}</p>
    </div>

    <div v-else-if="notificationsStore.errorMessage" class="notification-panel-body">
      <p class="card-desc" role="alert">{{ te(notificationsStore.errorMessage) ? t(notificationsStore.errorMessage) : notificationsStore.errorMessage }}</p>
    </div>

    <div v-if="!notificationsStore.loading && notificationsStore.items.length === 0" class="notification-panel-body">
      <p class="card-desc">{{ t('notifications.empty') }}</p>
    </div>

    <ul v-else-if="!notificationsStore.loading" class="notification-list">
      <li
        v-for="notification in notificationsStore.items"
        :key="notification.id"
        class="notification-row"
        :class="{ unread: !notification.readAt }"
      >
        <p class="notification-text">{{ formatMessage(notification) }}</p>

        <div v-if="hasActions(notification)" class="notification-actions">
          <button
            class="btn btn-sm primary"
            :disabled="notificationsStore.busyId !== null || notificationsStore.readAllBusy"
            @click="respondToChallenge(notification, true)"
          >
            {{ t('notifications.accept') }}
          </button>
          <button
            class="btn btn-sm"
            :disabled="notificationsStore.busyId !== null || notificationsStore.readAllBusy"
            @click="respondToChallenge(notification, false)"
          >
            {{ t('notifications.decline') }}
          </button>
        </div>

        <div v-else class="notification-actions">
          <button
            v-if="!notification.readAt"
            class="btn btn-sm"
            :disabled="notificationsStore.busyId !== null"
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
