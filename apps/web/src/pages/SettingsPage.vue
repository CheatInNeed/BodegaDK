<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useUiStore, type ThemeId } from '@/stores/ui';
import { usePush } from '@/composables/usePush';

const { t } = useI18n();
const uiStore = useUiStore();
const push = usePush();

const themes: { id: ThemeId; labelKey: string; toneKey: string }[] = [
  { id: 'bodega', labelKey: 'theme.bodega.label', toneKey: 'theme.bodega.tone' },
  { id: 'harbor', labelKey: 'theme.harbor.label', toneKey: 'theme.harbor.tone' },
  { id: 'parlor', labelKey: 'theme.parlor.label', toneKey: 'theme.parlor.tone' },
];

function changeTheme(event: Event) {
  const select = event.target as HTMLSelectElement;
  uiStore.setTheme(select.value as ThemeId);
}

function pushStatusKey(): string {
  if (!push.status.value) return 'settings.push.status.checking';
  if (!push.status.value.supported) return 'settings.push.status.unsupported';
  if (!push.status.value.secureContext) return 'settings.push.status.insecure';
  if (!push.status.value.configured) return 'settings.push.status.notConfigured';
  if (push.status.value.permission === 'denied') return 'settings.push.status.denied';
  if (push.status.value.subscribed) return 'settings.push.status.enabled';
  return 'settings.push.status.ready';
}

function pushStatusBodyKey(): string {
  return pushStatusKey() + 'Body';
}
</script>

<template>
  <div>
    <h1 class="h1">{{ t('nav.settings') }}</h1>

    <section class="settings-layout">
      <article class="card settings-card">
        <div class="settings-card-header">
          <div>
            <p class="home-eyebrow">{{ t('settings.theme.kicker') }}</p>
            <div class="card-title">{{ t('settings.theme.title') }}</div>
          </div>
          <span class="pill">{{ t('settings.theme.badge') }}</span>
        </div>
        <p class="card-desc">{{ t('settings.theme.desc') }}</p>
        <label class="settings-field">
          <span>{{ t('settings.theme.selectLabel') }}</span>
          <select
            class="select settings-select"
            :value="uiStore.theme"
            @change="changeTheme"
            :aria-label="t('settings.theme.ariaLabel')"
          >
            <option v-for="theme in themes" :key="theme.id" :value="theme.id">
              {{ t(theme.labelKey) }}
            </option>
          </select>
        </label>
      </article>

      <article class="card settings-card">
        <div class="settings-card-header">
          <div>
            <p class="home-eyebrow">{{ t('settings.preview.kicker') }}</p>
            <div class="card-title">{{ t('settings.preview.title') }}</div>
          </div>
        </div>
        <div class="theme-preview-grid">
          <button
            v-for="theme in themes"
            :key="theme.id"
            class="theme-preview"
            :class="{ active: theme.id === uiStore.theme }"
            :data-theme-preview="theme.id"
            type="button"
            @click="uiStore.setTheme(theme.id)"
          >
            <span class="theme-preview-swatches">
              <span class="theme-swatch accent"></span>
              <span class="theme-swatch secondary"></span>
              <span class="theme-swatch tertiary"></span>
              <span class="theme-swatch surface"></span>
            </span>
            <span class="theme-preview-copy">
              <strong>{{ t(theme.labelKey) }}</strong>
              <span>{{ t(theme.toneKey) }}</span>
            </span>
          </button>
        </div>
      </article>

      <article class="card settings-card">
        <div class="settings-card-header">
          <div>
            <p class="home-eyebrow">{{ t('settings.push.kicker') }}</p>
            <div class="card-title">{{ t('settings.push.title') }}</div>
          </div>
          <span class="pill">
            {{ push.status.value?.platformLabel ?? t('settings.push.deviceChecking') }}
          </span>
        </div>
        <p class="card-desc">{{ t('settings.push.desc') }}</p>

        <div class="push-status-panel">
          <div class="push-status-copy">
            <strong>{{ t(pushStatusKey()) }}</strong>
            <span>{{ t(pushStatusBodyKey()) }}</span>
          </div>
          <div class="push-actions">
            <button
              v-if="push.status.value && push.status.value.supported && !push.status.value.subscribed"
              class="btn primary"
              @click="push.enable()"
            >
              {{ t('settings.push.enable') }}
            </button>
            <button
              v-if="push.status.value?.subscribed"
              class="btn"
              @click="push.test()"
            >
              {{ t('settings.push.test') }}
            </button>
            <button
              v-if="push.status.value?.subscribed"
              class="btn"
              @click="push.disable()"
            >
              {{ t('settings.push.disable') }}
            </button>
          </div>
        </div>

        <p v-if="push.feedback.value" class="card-desc push-feedback" :class="push.feedbackType.value" aria-live="polite">
          {{ push.feedback.value }}
        </p>
      </article>
    </section>
  </div>
</template>
