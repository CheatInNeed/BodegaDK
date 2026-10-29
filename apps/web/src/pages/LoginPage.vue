<script setup lang="ts">
import { ref, reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { isSupabaseConfigured, supabaseUnavailableMessage } from '@/lib/supabase';

const { t } = useI18n();
const router = useRouter();
const authStore = useAuthStore();

const form = reactive({ email: '', password: '' });
const touched = reactive({ email: false, password: false });
const showPassword = ref(false);
const errorMessage = ref<string | null>(null);
const successMessage = ref<string | null>(null);
const submitting = ref(false);

// Consume signup redirect message
const redirectMsg = sessionStorage.getItem('auth:login-message');
if (redirectMsg) {
  successMessage.value = redirectMsg;
  sessionStorage.removeItem('auth:login-message');
}

function emailError(): string | null {
  if (!touched.email) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) ? null : t('auth.validation.email');
}

function passwordError(): string | null {
  if (!touched.password) return null;
  return form.password.length > 0 ? null : t('auth.validation.passwordRequired');
}

const isValid = () => !emailError() && !passwordError() && form.email.trim() && form.password;

async function submit() {
  touched.email = true;
  touched.password = true;
  if (!isValid()) return;

  submitting.value = true;
  errorMessage.value = null;
  successMessage.value = null;

  try {
    await authStore.signIn(form.email.trim(), form.password);
    router.push('/');
  } catch (e: any) {
    errorMessage.value = e.message ?? 'Login failed';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="auth-page">
    <div class="auth-card auth-card-premium">
      <div class="auth-card-header">
        <p class="auth-kicker">BodegaDK</p>
        <h1 class="card-title">{{ t('auth.login.title') }}</h1>
        <p v-if="!isSupabaseConfigured" class="card-desc">{{ supabaseUnavailableMessage }}</p>
      </div>

      <form class="auth-form" novalidate @submit.prevent="submit">
        <div class="auth-fields">
          <label class="auth-field" :class="{ 'is-invalid': emailError() }">
            <input
              v-model="form.email"
              class="input auth-input"
              type="email"
              autocomplete="email"
              placeholder=" "
              @blur="touched.email = true"
            />
            <span class="auth-floating-label">{{ t('auth.field.email') }}</span>
          </label>
          <p v-if="emailError()" class="auth-field-hint is-visible">{{ emailError() }}</p>

          <label class="auth-field auth-field-password" :class="{ 'is-invalid': passwordError() }">
            <input
              v-model="form.password"
              class="input auth-input auth-input-password"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
              placeholder=" "
              @blur="touched.password = true"
            />
            <span class="auth-floating-label">{{ t('auth.field.password') }}</span>
            <button
              class="auth-password-toggle"
              :class="{ 'is-visible': showPassword }"
              type="button"
              :aria-label="t(showPassword ? 'auth.password.hide' : 'auth.password.show')"
              @click="showPassword = !showPassword"
            >
              <span class="auth-password-toggle-show" :class="{ hidden: showPassword }" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false">
                  <path d="M12 5C6.5 5 2.1 8.4 1 12c1.1 3.6 5.5 7 11 7s9.9-3.4 11-7c-1.1-3.6-5.5-7-11-7Zm0 11.2A4.2 4.2 0 1 1 12 7.8a4.2 4.2 0 0 1 0 8.4Zm0-6.6a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8Z"></path>
                </svg>
              </span>
              <span class="auth-password-toggle-hide" :class="{ hidden: !showPassword }" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false">
                  <path d="m3.3 2 18.7 18.7-1.3 1.3-3.3-3.3A11.8 11.8 0 0 1 12 20c-5.5 0-9.9-3.4-11-7 .6-2 2.2-3.9 4.4-5.2L2 3.3 3.3 2Zm6 7.3 5.4 5.4a4.2 4.2 0 0 1-5.4-5.4Zm2.7-4.3c5.5 0 9.9 3.4 11 7-.5 1.7-1.7 3.3-3.4 4.5l-2-2A6 6 0 0 0 12 8.2c-.5 0-1 .1-1.5.2L7.8 5.8A12.5 12.5 0 0 1 12 5Z"></path>
                </svg>
              </span>
            </button>
          </label>
          <p v-if="passwordError()" class="auth-field-hint is-visible">{{ passwordError() }}</p>
        </div>

        <div
          v-if="errorMessage || successMessage"
          class="auth-message"
          :class="{ error: errorMessage, success: successMessage }"
          aria-live="polite"
        >
          {{ errorMessage ?? successMessage }}
        </div>

        <button
          class="btn primary full auth-submit"
          type="submit"
          :disabled="!isSupabaseConfigured || submitting"
        >
          <span>{{ t('auth.login.submit') }}</span>
        </button>

        <p class="auth-switch">
          <span>{{ t('auth.login.helperPrefix') }}</span>
          <button class="auth-link-button" type="button" @click="router.push('/signup')">
            {{ t('auth.login.helperAction') }}
          </button>
        </p>
      </form>
    </div>
  </div>
</template>
