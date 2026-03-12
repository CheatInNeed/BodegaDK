
import { supabase } from './supabase.js';


export function renderLogin() {
    const app = document.getElementById('app');
    if (!app) return;

    app.innerHTML = `
      <div class="auth-page">
        <div class="auth-card">
          <h1 class="h1">Log ind</h1>

          <input id="emailInput" class="input" placeholder="Email" />
          <input id="passwordInput" type="password" class="input" placeholder="Password" />

          <button id="loginSubmit" class="btn primary full">
            Log ind
          </button>

          <button id="guestSubmit" class="btn full">
            Fortsaet som Guest
          </button>
        </div>
      </div>
    `;

    document.getElementById('loginSubmit')?.addEventListener('click', async () => {
        const email = (document.getElementById('emailInput') as HTMLInputElement).value;
        const password = (document.getElementById('passwordInput') as HTMLInputElement).value;

        const { error } = await supabase.auth.signInWithPassword({ email, password });

        if (error) {
            alert(error.message);
        } else {
            window.location.href = '/';
        }
    });

    document.getElementById('guestSubmit')?.addEventListener('click', () => {
        window.location.href = '/';
    });
}
