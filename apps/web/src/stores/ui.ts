import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

export type ThemeId = 'bodega' | 'harbor' | 'parlor';
export type Lang = 'da' | 'en';

function getInitialTheme(): ThemeId {
  const stored = localStorage.getItem('theme');
  if (stored === 'bodega' || stored === 'harbor' || stored === 'parlor') return stored;
  return 'bodega';
}

function getInitialLang(): Lang {
  const stored = localStorage.getItem('lang');
  if (stored === 'da' || stored === 'en') return stored;
  return 'da';
}

export const useUiStore = defineStore('ui', () => {
  const theme = ref<ThemeId>(getInitialTheme());
  const lang = ref<Lang>(getInitialLang());
  const sidebarCollapsed = ref(false);

  watch(theme, (value) => {
    localStorage.setItem('theme', value);
  });

  watch(lang, (value) => {
    localStorage.setItem('lang', value);
  });

  function setTheme(value: ThemeId) {
    theme.value = value;
  }

  function setLang(value: Lang) {
    lang.value = value;
  }

  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value;
  }

  return {
    theme,
    lang,
    sidebarCollapsed,
    setTheme,
    setLang,
    toggleSidebar,
  };
});
