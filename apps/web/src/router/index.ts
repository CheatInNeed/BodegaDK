import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const routes: RouteRecordRaw[] = [
  // Auth pages (no layout)
  {
    path: '/login',
    name: 'login',
    component: () => import('@/pages/LoginPage.vue'),
    meta: { requiresAuth: false },
  },
  {
    path: '/signup',
    name: 'signup',
    component: () => import('@/pages/SignupPage.vue'),
    meta: { requiresAuth: false },
  },
  {
    path: '/custom',
    name: 'custom',
    component: () => import('@/pages/AvatarCustomizePage.vue'),
    meta: { requiresAuth: true },
  },

  // App shell pages (with layout)
  {
    path: '/',
    component: () => import('@/layouts/AppLayout.vue'),
    children: [
      {
        path: '',
        name: 'home',
        component: () => import('@/pages/HomePage.vue'),
        meta: { requiresAuth: false },
      },
      {
        path: 'play',
        name: 'play',
        component: () => import('@/pages/PlayPage.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'settings',
        name: 'settings',
        component: () => import('@/pages/SettingsPage.vue'),
        meta: { requiresAuth: false },
      },
      {
        path: 'help',
        name: 'help',
        component: () => import('@/pages/HelpPage.vue'),
        meta: { requiresAuth: false },
      },
      {
        path: 'lobbies',
        name: 'lobby-browser',
        component: () => import('@/pages/LobbyBrowserPage.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'lobby/:roomCode',
        name: 'lobby',
        component: () => import('@/pages/LobbyRoomPage.vue'),
        meta: { requiresAuth: true },
        props: true,
      },
      {
        path: 'room/:game/:roomCode',
        name: 'room',
        component: () => import('@/pages/GameRoomPage.vue'),
        meta: { requiresAuth: true },
        props: true,
      },
      {
        path: 'profile',
        name: 'profile',
        component: () => import('@/pages/ProfilePage.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'leaderboard',
        name: 'leaderboard',
        component: () => import('@/pages/LeaderboardPage.vue'),
        meta: { requiresAuth: false },
      },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// Legacy ?view=X compatibility redirects
const viewToPath: Record<string, string> = {
  home: '/',
  play: '/play',
  settings: '/settings',
  help: '/help',
  'lobby-browser': '/lobbies',
  profile: '/profile',
  leaderboard: '/leaderboard',
};

router.beforeEach(async (to) => {
  // Handle legacy query-based routing
  const view = to.query.view as string | undefined;
  if (view) {
    if (view === 'lobby' && to.query.room) {
      return { path: `/lobby/${to.query.room}`, query: { mock: to.query.mock } };
    }
    if (view === 'room' && to.query.game && to.query.room) {
      return {
        path: `/room/${to.query.game}/${to.query.room}`,
        query: { mock: to.query.mock },
      };
    }
    const mapped = viewToPath[view];
    if (mapped) {
      return { path: mapped };
    }
  }

  // Auth guard — wait for the auth store to finish loading the session
  if (to.meta.requiresAuth) {
    const authStore = useAuthStore();
    if (!authStore.initialized) {
      await authStore.init();
    }
    if (!authStore.isAuthenticated) {
      return { name: 'login' };
    }
  }
});

export default router;
