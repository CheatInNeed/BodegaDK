import { createI18n } from 'vue-i18n';
import da from './locales/da.json';
import en from './locales/en.json';

// Shared cookie statement copy, alongside the existing locale catalogs.
export const cookieMessages = {
  "da": {
    "cookies.title": "Cookies",
    "cookies.summary": "BodegaDK bruger cookies.",
    "cookies.dismiss": "Forstået"
  },
  "en": {
    "cookies.title": "Cookies",
    "cookies.summary": "BodegaDK uses cookies.",
    "cookies.dismiss": "Got it"
  }
} as const;

const savedLang = localStorage.getItem('lang');

export const i18n = createI18n({
  legacy: false,
  locale: savedLang === 'en' ? 'en' : 'da',
  fallbackLocale: 'da',
  messages: { da: { ...da, ...cookieMessages.da }, en: { ...en, ...cookieMessages.en } },
});

/** Translate outside of components (e.g. game adapters). */
export const t = i18n.global.t;
