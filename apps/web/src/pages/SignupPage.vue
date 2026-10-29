<script setup lang="ts">
import { ref, reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { isSupabaseConfigured, supabaseUnavailableMessage } from '@/lib/supabase';

const { t } = useI18n();
const router = useRouter();
const authStore = useAuthStore();

const MIN_PASSWORD_LENGTH = 8;
const MIN_USERNAME_LENGTH = 2;

const form = reactive({ email: '', password: '', username: '', country: '' });
const touched = reactive({ email: false, password: false, username: false, country: false });
const showPassword = ref(false);
const errorMessage = ref<string | null>(null);
const successMessage = ref<string | null>(null);
const submitting = ref(false);

function emailError(): string | null {
  if (!touched.email) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) ? null : t('auth.validation.email');
}

function passwordError(): string | null {
  if (!touched.password) return null;
  return form.password.length >= MIN_PASSWORD_LENGTH ? null : t('auth.validation.password');
}

function usernameError(): string | null {
  if (!touched.username) return null;
  return form.username.trim().length >= MIN_USERNAME_LENGTH ? null : t('auth.validation.username');
}

function countryError(): string | null {
  if (!touched.country) return null;
  return form.country.trim() ? null : t('auth.validation.country');
}

const isValid = () =>
  !emailError() && !passwordError() && !usernameError() && !countryError() &&
  form.email.trim() && form.password && form.username.trim() && form.country.trim();

async function submit() {
  touched.email = true;
  touched.password = true;
  touched.username = true;
  touched.country = true;
  if (!isValid()) return;

  submitting.value = true;
  errorMessage.value = null;
  successMessage.value = null;

  try {
    await authStore.signUp({
      email: form.email.trim(),
      password: form.password,
      username: form.username.trim(),
      country: form.country.trim(),
    });
    successMessage.value = t('auth.signup.success');
    setTimeout(() => router.push('/'), 500);
  } catch (e: any) {
    errorMessage.value = e.message ?? 'Signup failed';
  } finally {
    submitting.value = false;
  }
}

const countries = [
  { value: 'DK', label: 'auth.country.denmark' },
  { value: 'SE', label: 'auth.country.sweden' },
  { value: 'NO', label: 'auth.country.norway' },
  { value: 'DE', label: 'auth.country.germany' },
  { value: 'US', label: 'auth.country.unitedStates' },
];
</script>

<template>
  <div class="auth-page auth-page-signup">
    <div class="auth-card auth-card-premium">
      <div class="auth-card-header">
        <p class="auth-kicker">BodegaDK</p>
        <h1 class="card-title">{{ t('auth.signup.title') }}</h1>
        <p class="auth-lead">{{ t('auth.signup.subtitle') }}</p>
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
              autocomplete="new-password"
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

          <label class="auth-field" :class="{ 'is-invalid': usernameError() }">
            <input
              v-model="form.username"
              class="input auth-input"
              type="text"
              autocomplete="nickname"
              placeholder=" "
              @blur="touched.username = true"
            />
            <span class="auth-floating-label">{{ t('auth.field.username') }}</span>
          </label>
          <p v-if="usernameError()" class="auth-field-hint is-visible">{{ usernameError() }}</p>

          <label
            class="auth-field auth-select-field"
            :class="{ 'is-invalid': countryError() }"
            :data-empty="!form.country"
          >
            <select
              v-model="form.country"
              class="input auth-input auth-select"
              autocomplete="country-name"
              @change="touched.country = true"
            >
              <option value="">{{ t('auth.country.placeholder') }}</option>
              <option v-for="c in countries" :key="c.value" :value="c.value">
                {{ t(c.label) }}
              </option>
            </select>
            <span class="auth-floating-label">{{ t('auth.field.country') }}</span>
          </label>
          <p v-if="countryError()" class="auth-field-hint is-visible">{{ countryError() }}</p>
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
          <span>{{ t('auth.signup.submit') }}</span>
        </button>

        <p class="auth-switch">
          <span>{{ t('auth.signup.helperPrefix') }}</span>
          <button class="auth-link-button" type="button" @click="router.push('/login')">
            {{ t('auth.signup.helperAction') }}
          </button>
        </p>
      </form>
    </div>
  </div>
</template>
