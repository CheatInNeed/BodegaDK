import { createApp, watch } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import App from './App.vue';
import router from './router';
import da from './locales/da.json';
import en from './locales/en.json';
import { useAuthStore } from './stores/auth';
import { useUiStore } from './stores/ui';
import { registerPwaServiceWorker } from './lib/pwa';

const savedLang = localStorage.getItem('lang');
const locale = savedLang === 'en' ? 'en' : 'da';

const i18n = createI18n({
  legacy: false,
  locale,
  fallbackLocale: 'da',
  messages: { da, en },
});

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);
app.use(i18n);

// Sync theme and language to the document (runs before mount so no FOUC)
const uiStore = useUiStore();
watch(
  () => uiStore.theme,
  (theme) => { document.documentElement.dataset.theme = theme; },
  { immediate: true },
);
watch(
  () => uiStore.lang,
  (lang) => {
    i18n.global.locale.value = lang;
    document.documentElement.lang = lang;
  },
  { immediate: true },
);

// Kick off auth initialization (the router guard awaits it for protected routes)
const authStore = useAuthStore();
authStore.init();

app.mount('#app');

// Register service worker for PWA
registerPwaServiceWorker();
