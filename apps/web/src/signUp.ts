import { getInitialLang, t } from './i18n.js';
import { navigate } from './index.js';
import { isSupabaseConfigured, supabase, supabaseUnavailableMessage } from './supabase.js';

const LOGIN_REDIRECT_MESSAGE_KEY = 'auth:login-message';
const MIN_PASSWORD_LENGTH = 8;
const MIN_USERNAME_LENGTH = 2;

type FieldName = 'email' | 'password' | 'username' | 'country';

type ValidationState = Record<FieldName, string | null>;
type TouchedState = Record<FieldName, boolean>;

export function renderSignup() {
    const app = document.getElementById('app');
    if (!app) return;

    const lang = getInitialLang();
    const unavailableHtml = !isSupabaseConfigured
        ? `<p class="card-desc">${supabaseUnavailableMessage}</p>`
        : '';

    app.innerHTML = `
    <div class="auth-page auth-page-signup">
      <div class="auth-card auth-card-premium">
        <div class="auth-card-header">
          <p class="auth-kicker">BodegaDK</p>
          <h1 class="card-title" data-i18n="auth.signup.title">${t(lang, 'auth.signup.title')}</h1>
          <p class="auth-lead" data-i18n="auth.signup.subtitle">${t(lang, 'auth.signup.subtitle')}</p>
          ${unavailableHtml}
        </div>

        <form id="signupForm" class="auth-form" novalidate>
          <div class="auth-fields">
            <label class="auth-field" data-field="email">
              <input id="email" class="input auth-input" type="email" autocomplete="email" placeholder=" " />
              <span class="auth-floating-label" data-i18n="auth.field.email">${t(lang, 'auth.field.email')}</span>
            </label>

            <label class="auth-field auth-field-password" data-field="password">
              <input id="password" class="input auth-input auth-input-password" type="password" autocomplete="new-password" placeholder=" " />
              <span class="auth-floating-label" data-i18n="auth.field.password">${t(lang, 'auth.field.password')}</span>
              <button
                id="passwordToggle"
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

            <label class="auth-field" data-field="username">
              <input id="username" class="input auth-input" type="text" autocomplete="nickname" placeholder=" " />
              <span class="auth-floating-label" data-i18n="auth.field.username">${t(lang, 'auth.field.username')}</span>
            </label>

            <label class="auth-field auth-select-field" data-field="country" data-empty="true">
              <select id="country" class="input auth-input auth-select" autocomplete="country-name">
                <option value="" selected>${t(lang, 'auth.country.placeholder')}</option>
                <option value="DK">${t(lang, 'auth.country.denmark')}</option>
                <option value="SE">${t(lang, 'auth.country.sweden')}</option>
                <option value="NO">${t(lang, 'auth.country.norway')}</option>
                <option value="DE">${t(lang, 'auth.country.germany')}</option>
                <option value="US">${t(lang, 'auth.country.unitedStates')}</option>
              </select>
              <span class="auth-floating-label" data-i18n="auth.field.country">${t(lang, 'auth.field.country')}</span>
            </label>
          </div>

          <div id="authMessage" class="auth-message hidden" aria-live="polite"></div>

          <button id="signupSubmit" class="btn primary full auth-submit" type="submit" ${!isSupabaseConfigured ? 'disabled' : ''}>
            <span data-i18n="auth.signup.submit">${t(lang, 'auth.signup.submit')}</span>
          </button>

          <p class="auth-switch">
            <span data-i18n="auth.signup.helperPrefix">${t(lang, 'auth.signup.helperPrefix')}</span>
            <button id="loginHelperLink" class="auth-link-button" type="button" data-i18n="auth.signup.helperAction">${t(lang, 'auth.signup.helperAction')}</button>
          </p>
        </form>
      </div>
    </div>
    `;

    const emailEl = document.getElementById('email') as HTMLInputElement | null;
    const passwordEl = document.getElementById('password') as HTMLInputElement | null;
    const usernameEl = document.getElementById('username') as HTMLInputElement | null;
    const countryEl = document.getElementById('country') as HTMLSelectElement | null;
    const formEl = document.getElementById('signupForm') as HTMLFormElement | null;
    const submitEl = document.getElementById('signupSubmit') as HTMLButtonElement | null;
    const passwordToggleEl = document.getElementById('passwordToggle') as HTMLButtonElement | null;
    const loginHelperLinkEl = document.getElementById('loginHelperLink') as HTMLButtonElement | null;
    const touched: TouchedState = {
        email: false,
        password: false,
        username: false,
        country: false,
    };

    if (!emailEl || !passwordEl || !usernameEl || !countryEl || !formEl || !submitEl) {
        return;
    }

    const syncValidation = (showAllErrors = false) => {
        const validation = validateForm({
            email: emailEl.value,
            password: passwordEl.value,
            username: usernameEl.value,
            country: countryEl.value,
        }, lang);

        applyFieldState('email', emailEl, showAllErrors || touched.email ? validation.email : null);
        applyFieldState('password', passwordEl, showAllErrors || touched.password ? validation.password : null);
        applyFieldState('username', usernameEl, showAllErrors || touched.username ? validation.username : null);
        applyFieldState('country', countryEl, showAllErrors || touched.country ? validation.country : null);

        submitEl.disabled = !isSupabaseConfigured || Object.values(validation).some((message) => message !== null);
    };

    [
        { fieldName: 'email' as const, element: emailEl },
        { fieldName: 'password' as const, element: passwordEl },
        { fieldName: 'username' as const, element: usernameEl },
    ].forEach(({ fieldName, element }) => {
        element.addEventListener('blur', () => {
            touched[fieldName] = true;
            syncValidation();
        });

        element.addEventListener('input', () => syncValidation());
    });

    countryEl.addEventListener('change', () => {
        touched.country = true;
        const field = countryEl.closest('.auth-field') as HTMLElement | null;
        if (field) {
            field.dataset.empty = countryEl.value ? 'false' : 'true';
        }
        syncValidation();
    });

    passwordToggleEl?.addEventListener('click', () => {
        const nextType = passwordEl.type === 'password' ? 'text' : 'password';
        passwordEl.type = nextType;
        passwordToggleEl.classList.toggle('is-visible', nextType === 'text');
        const nextLabel = t(lang, nextType === 'text' ? 'auth.password.hide' : 'auth.password.show');
        passwordToggleEl.setAttribute('aria-label', nextLabel);
        passwordToggleEl.setAttribute('title', nextLabel);
    });

    loginHelperLinkEl?.addEventListener('click', () => {
        navigate('/login');
    });

    formEl.addEventListener('submit', async (event) => {
        event.preventDefault();
        Object.keys(touched).forEach((field) => {
            touched[field as FieldName] = true;
        });
        syncValidation(true);
        await handleSignup({ emailEl, passwordEl, usernameEl, countryEl, submitEl, lang });
        syncValidation(true);
    });

    syncValidation();
}

async function handleSignup(input: {
    emailEl: HTMLInputElement;
    passwordEl: HTMLInputElement;
    usernameEl: HTMLInputElement;
    countryEl: HTMLSelectElement;
    submitEl: HTMLButtonElement;
    lang: ReturnType<typeof getInitialLang>;
}) {
    if (!supabase) {
        alert(supabaseUnavailableMessage);
        return;
    }

    const { emailEl, passwordEl, usernameEl, countryEl, submitEl, lang } = input;
    const msg = document.getElementById('authMessage');
    const validation = validateForm({
        email: emailEl.value,
        password: passwordEl.value,
        username: usernameEl.value,
        country: countryEl.value,
    }, lang);

    applyFieldState('email', emailEl, validation.email);
    applyFieldState('password', passwordEl, validation.password);
    applyFieldState('username', usernameEl, validation.username);
    applyFieldState('country', countryEl, validation.country);

    if (Object.values(validation).some((message) => message !== null)) {
        showAuthMessage(msg, Object.values(validation).find((message) => message !== null) ?? t(lang, 'auth.error.form'), 'error');
        return;
    }

    submitEl.disabled = true;

    const email = emailEl.value.trim();
    const password = passwordEl.value;
    const username = usernameEl.value.trim();
    const country = countryEl.value.trim();

    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: { username, country }
        }
    });

    if (error) {
        showAuthMessage(msg, error.message, 'error');
        submitEl.disabled = false;
        return;
    }

    if (data.session) {
        showAuthMessage(msg, t(lang, 'auth.signup.success'), 'success');
        setTimeout(() => navigate('/'), 500);
        return;
    }

    const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });

    if (loginError) {
        sessionStorage.setItem(LOGIN_REDIRECT_MESSAGE_KEY, t(lang, 'auth.signup.redirectLogin'));
        navigate('/login');
        return;
    }

    showAuthMessage(msg, t(lang, 'auth.signup.success'), 'success');
    setTimeout(() => navigate('/'), 500);
}

function validateForm(values: Record<FieldName, string>, lang: ReturnType<typeof getInitialLang>): ValidationState {
    return {
        email: isValidEmail(values.email.trim()) ? null : t(lang, 'auth.validation.email'),
        password: values.password.length >= MIN_PASSWORD_LENGTH ? null : t(lang, 'auth.validation.password'),
        username: values.username.trim().length >= MIN_USERNAME_LENGTH ? null : t(lang, 'auth.validation.username'),
        country: values.country.trim() ? null : t(lang, 'auth.validation.country'),
    };
}

function isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function applyFieldState(fieldName: FieldName, fieldEl: HTMLInputElement | HTMLSelectElement, errorMessage: string | null) {
    const fieldWrapper = fieldEl.closest('.auth-field');
    if (!fieldWrapper) {
        return;
    }

    const hintId = `${fieldName}Error`;
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

function showAuthMessage(
    element: HTMLElement | null,
    text: string,
    type: 'success' | 'error'
) {
    if (!element) {
        return;
    }

    element.textContent = text;
    element.classList.remove('hidden', 'success', 'error');
    element.classList.add(type);
}

export function consumeSignupRedirectMessage(): string | null {
    const message = sessionStorage.getItem(LOGIN_REDIRECT_MESSAGE_KEY);
    if (!message) {
        return null;
    }

    sessionStorage.removeItem(LOGIN_REDIRECT_MESSAGE_KEY);
    return message;
}
