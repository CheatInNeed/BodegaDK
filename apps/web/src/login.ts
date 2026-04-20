import { getInitialLang, t } from './i18n.js';
import { navigate } from './index.js';
import { consumeSignupRedirectMessage } from './signUp.js';
import { isSupabaseConfigured, supabase, supabaseUnavailableMessage } from './supabase.js';

type FieldName = 'email' | 'password';
type ValidationState = Record<FieldName, string | null>;
type TouchedState = Record<FieldName, boolean>;

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

          <form id="loginForm" class="auth-form" novalidate>
            <div class="auth-fields">
              <label class="auth-field" data-field="email">
                <input id="emailInput" class="input auth-input" type="email" autocomplete="email" placeholder=" " />
                <span class="auth-floating-label" data-i18n="auth.field.email">${t(lang, 'auth.field.email')}</span>
              </label>

              <label class="auth-field auth-field-password" data-field="password">
                <input id="passwordInput" class="input auth-input auth-input-password" type="password" autocomplete="current-password" placeholder=" " />
                <span class="auth-floating-label" data-i18n="auth.field.password">${t(lang, 'auth.field.password')}</span>
                <button
                  id="loginPasswordToggle"
                  class="auth-password-toggle"
                  type="button"
                  aria-label="${t(lang, 'auth.password.show')}"
                  title="${t(lang, 'auth.password.show')}"
                >
                  <span class="auth-password-toggle-show" aria-hidden="true">
                    <svg viewBox="0 0 24 24" focusable="false">
                      <path d="M12 5C6.5 5 2.1 8.4 1 12c1.1 3.6 5.5 7 11 7s9.9-3.4 11-7c-1.1-3.6-5.5-7-11-7Zm0 11.2A4.2 4.2 0 1 1 12 7.8a4.2 4.2 0 0 1 0 8.4Zm0-6.6a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8Z"></path>
                    </svg>
                  </span>
                  <span class="auth-password-toggle-hide hidden" aria-hidden="true">
                    <svg viewBox="0 0 24 24" focusable="false">
                      <path d="m3.3 2 18.7 18.7-1.3 1.3-3.3-3.3A11.8 11.8 0 0 1 12 20c-5.5 0-9.9-3.4-11-7 .6-2 2.2-3.9 4.4-5.2L2 3.3 3.3 2Zm6 7.3 5.4 5.4a4.2 4.2 0 0 1-5.4-5.4Zm2.7-4.3c5.5 0 9.9 3.4 11 7-.5 1.7-1.7 3.3-3.4 4.5l-2-2A6 6 0 0 0 12 8.2c-.5 0-1 .1-1.5.2L7.8 5.8A12.5 12.5 0 0 1 12 5Zm0 2.4c2.5 0 4.6 1.5 5.5 3.6l-1.9 1.9a4.2 4.2 0 0 0-4.5-4.5l-1.8-1.8c.8-.2 1.7-.3 2.7-.3Z"></path>
                    </svg>
                  </span>
                </button>
              </label>
            </div>

            <div id="authMessage" class="auth-message ${redirectMessage ? 'success' : 'hidden'}" aria-live="polite">${redirectMessage ?? ''}</div>

            <button id="loginSubmit" class="btn primary full auth-submit" type="submit" ${!isSupabaseConfigured ? 'disabled' : ''}>
              <span data-i18n="auth.login.submit">${t(lang, 'auth.login.submit')}</span>
            </button>

            <p class="auth-switch">
              <span data-i18n="auth.login.helperPrefix">${t(lang, 'auth.login.helperPrefix')}</span>
              <button id="signupHelperLink" class="auth-link-button" type="button" data-i18n="auth.login.helperAction">${t(lang, 'auth.login.helperAction')}</button>
            </p>
          </form>
        </div>
      </div>
    `;

    const formEl = document.getElementById('loginForm') as HTMLFormElement | null;
    const emailEl = document.getElementById('emailInput') as HTMLInputElement | null;
    const passwordEl = document.getElementById('passwordInput') as HTMLInputElement | null;
    const submitEl = document.getElementById('loginSubmit') as HTMLButtonElement | null;
    const toggleEl = document.getElementById('loginPasswordToggle') as HTMLButtonElement | null;
    const signupLinkEl = document.getElementById('signupHelperLink') as HTMLButtonElement | null;
    const touched: TouchedState = {
        email: false,
        password: false,
    };

    if (!formEl || !emailEl || !passwordEl || !submitEl) {
        return;
    }

    const syncValidation = (showAllErrors = false) => {
        const validation = validateLoginForm({
            email: emailEl.value,
            password: passwordEl.value,
        }, lang);

        applyFieldState('email', emailEl, showAllErrors || touched.email ? validation.email : null);
        applyFieldState('password', passwordEl, showAllErrors || touched.password ? validation.password : null);

        submitEl.disabled = !isSupabaseConfigured || Object.values(validation).some((message) => message !== null);
    };

    [
        { fieldName: 'email' as const, element: emailEl },
        { fieldName: 'password' as const, element: passwordEl },
    ].forEach(({ fieldName, element }) => {
        element.addEventListener('blur', () => {
            touched[fieldName] = true;
            syncValidation();
        });

        element.addEventListener('input', () => syncValidation());
    });

    toggleEl?.addEventListener('click', () => {
        const nextType = passwordEl.type === 'password' ? 'text' : 'password';
        passwordEl.type = nextType;
        toggleEl.classList.toggle('is-visible', nextType === 'text');
        const nextLabel = t(lang, nextType === 'text' ? 'auth.password.hide' : 'auth.password.show');
        toggleEl.setAttribute('aria-label', nextLabel);
        toggleEl.setAttribute('title', nextLabel);
    });

    signupLinkEl?.addEventListener('click', () => {
        navigate('/signup');
    });

    formEl.addEventListener('submit', async (event) => {
        event.preventDefault();
        touched.email = true;
        touched.password = true;
        syncValidation(true);

        const validation = validateLoginForm({
            email: emailEl.value,
            password: passwordEl.value,
        }, lang);

        if (Object.values(validation).some((message) => message !== null)) {
            return;
        }

        if (!supabase) {
            alert(supabaseUnavailableMessage);
            return;
        }

        const messageEl = document.getElementById('authMessage');
        const email = emailEl.value.trim();
        const password = passwordEl.value;

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

    syncValidation();
}

function validateLoginForm(values: Record<FieldName, string>, lang: ReturnType<typeof getInitialLang>): ValidationState {
    return {
        email: isValidEmail(values.email.trim()) ? null : t(lang, 'auth.validation.email'),
        password: values.password.length > 0 ? null : t(lang, 'auth.validation.passwordRequired'),
    };
}

function isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function applyFieldState(fieldName: FieldName, fieldEl: HTMLInputElement, errorMessage: string | null) {
    const fieldWrapper = fieldEl.closest('.auth-field');
    if (!fieldWrapper) {
        return;
    }

    const hintId = `login${fieldName.charAt(0).toUpperCase()}${fieldName.slice(1)}Error`;
    let hintEl = document.getElementById(hintId) as HTMLParagraphElement | null;
    if (!hintEl) {
        hintEl = document.createElement('p');
        hintEl.id = hintId;
        hintEl.className = 'auth-field-hint';
        fieldWrapper.insertAdjacentElement('afterend', hintEl);
    }

    const hasError = Boolean(errorMessage);
    fieldWrapper.classList.toggle('is-invalid', hasError);
    fieldEl.setAttribute('aria-invalid', String(hasError));
    fieldEl.setAttribute('aria-describedby', hintId);
    hintEl.textContent = errorMessage ?? '';
    hintEl.classList.toggle('is-visible', hasError);
}
