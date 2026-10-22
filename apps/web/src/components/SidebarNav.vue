<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { useUiStore } from '@/stores/ui';

const { t } = useI18n();
const route = useRoute();
const uiStore = useUiStore();

const navItems = [
  { to: '/play', label: 'nav.play', icon: 'M8 5v14l11-7z' },
  { to: '/lobbies', label: null, literal: 'Lobby', icon: 'M4 6h16v4H4zm0 8h10v4H4zm12 0h4v4h-4z' },
  { to: '/settings', label: 'nav.settings', icon: 'M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.1 7.1 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 13.9 1h-3.8a.5.5 0 0 0-.49.42l-.36 2.54c-.58.23-1.12.54-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 7.48a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.23.4.32.65.22l2.39-.96c.5.4 1.05.71 1.63.94l.36 2.54c.04.24.25.42.49.42h3.8c.24 0 .45-.18.49-.42l.36-2.54c.58-.23 1.12-.54 1.63-.94l2.39.96c.25.1.52.01.65-.22l1.92-3.32a.5.5 0 0 0-.12-.64zM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5z' },
  { to: '/help', label: 'nav.help', icon: 'M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14a4 4 0 0 0-4 4h2a2 2 0 1 1 2 2c-1.1 0-2 .9-2 2v1h2v-1c0-.55.45-1 1-1a4 4 0 0 0 0-8z' },
];

function isActive(to: string): boolean {
  if (to === '/lobbies') {
    return route.path === '/lobbies' || route.path.startsWith('/lobby/');
  }
  return route.path === to;
}
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar-header">
      <div class="sidebar-title pill">Menu</div>
      <button class="burger" @click="uiStore.toggleSidebar()" aria-label="Toggle menu">
        &#9776;
      </button>
    </div>

    <nav class="nav" aria-label="Main navigation">
      <router-link
        v-for="item in navItems"
        :key="item.to"
        :to="item.to"
        class="nav-item"
        :class="{ active: isActive(item.to) }"
        role="button"
      >
        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path fill="currentColor" :d="item.icon"></path>
        </svg>
        <span class="nav-label">
          {{ item.label ? t(item.label) : item.literal }}
        </span>
      </router-link>
    </nav>
  </aside>
</template>
