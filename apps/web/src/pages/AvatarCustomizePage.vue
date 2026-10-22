<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { supabase } from '@/lib/supabase';
import { isSupabaseConfigured, supabaseUnavailableMessage } from '@/lib/supabase';

const router = useRouter();
const authStore = useAuthStore();

const selectedColor = ref('');
const selectedShape = ref('');
const saving = ref(false);

function selectAvatar(color: string, shape: string) {
  selectedColor.value = color;
  selectedShape.value = shape;
}

async function save() {
  if (!supabase || !authStore.user) return;
  if (!selectedColor.value) {
    alert('Pick an avatar first');
    return;
  }

  saving.value = true;
  const avatarKey = selectedShape.value === 'circle' ? 'default_circle' : 'default_square';

  const { data: avatarDef, error: avatarDefError } = await supabase
    .from('avatar_defs')
    .select('id')
    .eq('key', avatarKey)
    .single();

  if (avatarDefError || !avatarDef?.id) {
    alert('Avatar definition not found');
    saving.value = false;
    return;
  }

  await supabase.from('user_avatars').upsert({
    user_id: authStore.user.id,
    avatar_def_id: avatarDef.id,
    color: selectedColor.value,
    options: { shape: selectedShape.value },
  });

  saving.value = false;
  router.push('/');
}
</script>

<template>
  <div class="auth-page">
    <div class="card auth-card">
      <h1 class="card-title">Choose Avatar</h1>
      <p v-if="!isSupabaseConfigured" class="card-desc">{{ supabaseUnavailableMessage }}</p>

      <div class="avatar-options">
        <div
          class="avatar choice"
          :class="{ selected: selectedColor === 'red' && selectedShape === 'circle' }"
          data-color="red"
          data-shape="circle"
          @click="selectAvatar('red', 'circle')"
        ></div>
        <div
          class="avatar choice"
          :class="{ selected: selectedColor === 'blue' && selectedShape === 'square' }"
          data-color="blue"
          data-shape="square"
          @click="selectAvatar('blue', 'square')"
        ></div>
      </div>

      <button
        class="btn primary full"
        :disabled="!isSupabaseConfigured || saving"
        @click="save"
      >
        Save
      </button>
    </div>
  </div>
</template>
