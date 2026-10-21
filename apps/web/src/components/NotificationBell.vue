<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useNotificationsStore } from '@/stores/notifications';
import NotificationPanel from './NotificationPanel.vue';

const { t } = useI18n();
const notificationsStore = useNotificationsStore();
</script>

<template>
  <div class="notification-menu">
    <button
      class="btn notification-button"
      type="button"
      :aria-expanded="notificationsStore.open ? 'true' : 'false'"
      :aria-label="t('notifications.title')"
      @click="notificationsStore.toggle()"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
        <path d="M12 22a2.7 2.7 0 0 0 2.62-2h-5.24A2.7 2.7 0 0 0 12 22Zm7-6.4-1.55-1.74V9.6a5.46 5.46 0 0 0-4.2-5.33V3.6a1.25 1.25 0 1 0-2.5 0v.67a5.46 5.46 0 0 0-4.2 5.33v4.26L5 15.6V17h14v-1.4Z"></path>
      </svg>
      <span v-if="notificationsStore.unreadCount > 0" class="notification-badge">
        {{ notificationsStore.unreadCount > 99 ? '99+' : notificationsStore.unreadCount }}
      </span>
    </button>

    <NotificationPanel v-if="notificationsStore.open" />
  </div>
</template>
