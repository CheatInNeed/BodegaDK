import { navigate } from './index.js';
import { isSupabaseConfigured, supabase, supabaseUnavailableMessage } from "./supabase.js";

export function renderCustom() {
    const app = document.getElementById('app');
    if (!app) return;

    const unavailableHtml = !isSupabaseConfigured
        ? `<p class="card-desc">${supabaseUnavailableMessage}</p>`
        : '';

    app.innerHTML = `
    <div class="auth-page">
      <div class="card auth-card">
        <h1 class="card-title">Choose Avatar</h1>
        ${unavailableHtml}

        <div class="avatar-options">
          <div class="avatar choice" data-color="red" data-shape="circle"></div>
          <div class="avatar choice" data-color="blue" data-shape="square"></div>
        </div>

        <button id="saveAvatar" class="btn primary full" ${!isSupabaseConfigured ? 'disabled' : ''}>Save</button>
      </div>
    </div>
    `;

    // 🔥 THIS WAS MISSING
    wireCustomEvents();
}

function wireCustomEvents() {
    let selectedColor = '';
    let selectedShape = '';

    const choices = document.querySelectorAll('.choice');

    choices.forEach(el => {
        el.addEventListener('click', () => {
            console.log("CLICKED");

            choices.forEach(c => c.classList.remove('selected'));
            el.classList.add('selected');

            selectedColor = el.getAttribute('data-color')!;
            selectedShape = el.getAttribute('data-shape')!;
        });
    });

    document.getElementById('saveAvatar')?.addEventListener('click', async () => {
        console.log("SAVE CLICK");

        if (!supabase) {
            alert(supabaseUnavailableMessage);
            return;
        }

        const { data } = await supabase.auth.getUser();
        const user = data.user;

        if (!user) {
            alert("Not logged in");
            return;
        }

        if (!selectedColor) {
            alert("Pick an avatar first");
            return;
        }

        await supabase.from('avatars').upsert({
            user_id: user.id,
            avatar_color: selectedColor,
            avatar_shape: selectedShape
        });

        navigate('/');
    });
}
