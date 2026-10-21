<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useUiStore } from '@/stores/ui';
import TopBar from '@/components/TopBar.vue';
import SidebarNav from '@/components/SidebarNav.vue';
import ActiveQueueBar from '@/components/ActiveQueueBar.vue';

const route = useRoute();
const uiStore = useUiStore();

const isRoomMode = computed(() => route.path.startsWith('/room/'));
</script>

<template>
  <div
    class="shell"
    :class="{
      collapsed: uiStore.sidebarCollapsed,
      'shell-room-mode': isRoomMode,
    }"
    id="shell"
  >
    <TopBar />
    <SidebarNav />

    <main class="main" id="main">
      <RouterView />
    </main>

    <div id="activeQueueHost">
      <ActiveQueueBar />
    </div>
  </div>
</template>
