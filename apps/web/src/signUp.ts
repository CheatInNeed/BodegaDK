import { isSupabaseConfigured, supabase, supabaseUnavailableMessage } from './supabase.js';
import { navigate } from './index.js';


export function renderSignup() {
    const app = document.getElementById('app');
    if (!app) return;

    const unavailableHtml = !isSupabaseConfigured
        ? `<p class="card-desc">${supabaseUnavailableMessage}</p>`
        : '';

    const html = `
    <div class="auth-page">
      <div class="auth-card">
        <h1 class="card-title">Opret konto</h1>
        ${unavailableHtml}

        <div class="auth-fields">
          <input id="email" class="input" placeholder="Email" />
          <input id="password" type="password" class="input" placeholder="Kodeord" />
          <input id="username" class="input" placeholder="Brugernavn" />

          <select id="country" class="input">
            <option value="" disabled selected>Vælg land</option>
            <option value="DK">Denmark</option>
            <option value="SE">Sweden</option>
            <option value="NO">Norway</option>
            <option value="DE">Germany</option>
            <option value="US">United States</option>
          </select>
        </div>

        <button id="signupSubmit" class="btn primary full" ${!isSupabaseConfigured ? 'disabled' : ''}>Opret konto</button>
        <div id="authMessage" class="auth-message hidden"></div>

        <p class="auth-switch">
      
        
        </p>
      </div>
    </div>
    `;

    app.innerHTML = html;
    document.getElementById('signupSubmit')?.addEventListener('click', handleSignup);

    const countryEl = document.getElementById('country') as HTMLSelectElement | null;

    if (countryEl) {
        countryEl.style.color = 'var(--muted)';

        countryEl.addEventListener('change', () => {
            if (countryEl.value === "") {
                countryEl.style.color = 'var(--muted)';
            } else {
                countryEl.style.color = 'var(--text)';
            }
        });
    }




}


    async function handleSignup() {
        if (!supabase) {
            alert(supabaseUnavailableMessage);
            return;
        }

        const emailEl = document.getElementById('email') as HTMLInputElement | null;
        const passwordEl = document.getElementById('password') as HTMLInputElement | null;
        const usernameEl = document.getElementById('username') as HTMLInputElement | null;
        const countryEl = document.getElementById('country') as HTMLSelectElement | null;

        if (!emailEl || !passwordEl || !usernameEl || !countryEl) {
            alert("Form error");
            return;
        }

        const email = emailEl.value;
        const password = passwordEl.value;
        const username = usernameEl.value;
        const country = countryEl.value;

        const {error} = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {username, country}
            }
        });



        const msg = document.getElementById('authMessage');

        if (msg) {
            msg.classList.remove('hidden', 'success', 'error');

            if (error) {
                msg.textContent = error.message;
                msg.classList.add('error');
            } else {
                msg.textContent = "Account created ";
                msg.classList.add('success');

                //  AUTO LOGIN
                const { error: loginError } = await supabase.auth.signInWithPassword({
                    email,
                    password
                });

                if (loginError) {
                    msg.textContent = "Account created, but login failed";
                    msg.classList.add('error');
                    return;
                }

                const { data: userData } = await supabase.auth.getUser();
                const user = userData.user;
                if (user) {
                    const { error: profileError } = await supabase.from('profiles').upsert({
                        id: user.id,
                        username: username.trim() || null,
                        country: country.trim() || null,
                    });

                    if (profileError) {
                        msg.textContent = "Account created, but profile setup failed";
                        msg.classList.add('error');
                        return;
                    }
                }

                setTimeout(() => navigate('/'), 800);
            }
        }
    }
