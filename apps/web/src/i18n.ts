import { createI18n } from 'vue-i18n';
import da from './locales/da.json';
import en from './locales/en.json';

const savedLang = localStorage.getItem('lang');

export const i18n = createI18n({
  legacy: false,
  locale: savedLang === 'en' ? 'en' : 'da',
  fallbackLocale: 'da',
  messages: { da, en },
});

/** Translate outside of components (e.g. game adapters). */
export const t = i18n.global.t;
