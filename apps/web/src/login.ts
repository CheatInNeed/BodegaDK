import { getInitialLang, t } from './i18n.js';
import { navigate } from './index.js';
import { consumeSignupRedirectMessage } from './signUp.js';
import { isSupabaseConfigured, supabase, supabaseUnavailableMessage } from './supabase.js';

export function renderLogin() {
    const app = document.getElementById('app');
    if (!app) return;

    const lang = getInitialLang();
    const unavailableHtml = !isSupabaseConfigured
        ? `<p class="card-desc">${supabaseUnavailableMessage}</p>`
        : '';
    const redirectMessage = consumeSignupRedirectMessage();

    app.innerHTML = `
      <div class="auth-page">
        <div class="auth-card auth-card-premium">
          <div class="auth-card-header">
            <p class="auth-kicker">BodegaDK</p>
            <h1 class="card-title" data-i18n="auth.login.title">${t(lang, 'auth.login.title')}</h1>
            ${unavailableHtml}
          </div>

          <div class="auth-fields">
            <label class="auth-field">
              <input id="emailInput" class="input auth-input" type="email" autocomplete="email" placeholder=" " />
              <span class="auth-floating-label" data-i18n="auth.field.email">${t(lang, 'auth.field.email')}</span>
            </label>

            <label class="auth-field">
              <input id="passwordInput" class="input auth-input" type="password" autocomplete="current-password" placeholder=" " />
              <span class="auth-floating-label" data-i18n="auth.field.password">${t(lang, 'auth.field.password')}</span>
            </label>
          </div>

          <div id="authMessage" class="auth-message ${redirectMessage ? 'success' : 'hidden'}" aria-live="polite">${redirectMessage ?? ''}</div>

          <button id="loginSubmit" class="btn primary full auth-submit" ${!isSupabaseConfigured ? 'disabled' : ''}>
            <span data-i18n="auth.login.submit">${t(lang, 'auth.login.submit')}</span>
          </button>
        </div>
      </div>
    `;

    document.getElementById('loginSubmit')?.addEventListener('click', async () => {
        if (!supabase) {
            alert(supabaseUnavailableMessage);
            return;
        }

        const messageEl = document.getElementById('authMessage');
        const email = (document.getElementById('emailInput') as HTMLInputElement).value.trim();
        const password = (document.getElementById('passwordInput') as HTMLInputElement).value;

        const { error } = await supabase.auth.signInWithPassword({ email, password });

        if (error) {
            if (messageEl) {
                messageEl.textContent = error.message;
                messageEl.classList.remove('hidden', 'success');
                messageEl.classList.add('error');
            }
            return;
        }

        navigate('/');
    });
}
