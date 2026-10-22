<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useLobbyStore } from '@/stores/lobby';

const { t } = useI18n();
const router = useRouter();
const lobbyStore = useLobbyStore();

const joinCode = ref('');
const errorMessage = ref<string | null>(null);
const busy = ref(false);

async function join() {
  const code = joinCode.value.trim();
  if (!code) return;

  busy.value = true;
  errorMessage.value = null;
  try {
    await lobbyStore.joinRoom({ roomCode: code });
    router.push(`/lobby/${code}`);
  } catch (e: any) {
    errorMessage.value = e.message ?? 'Failed to join room';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="join-by-code">
    <label class="join-by-code-label">{{ t('home.card.quick.join.label') }}</label>
    <div class="join-by-code-row">
      <input
        v-model="joinCode"
        class="input"
        type="text"
        :placeholder="t('home.card.quick.join.placeholder')"
        @keydown.enter="join"
      />
      <button class="btn primary" :disabled="busy || !joinCode.trim()" @click="join">
        {{ t('home.card.quick.join.action') }}
      </button>
    </div>
    <p v-if="errorMessage" class="card-desc" style="color: var(--c-danger);">{{ errorMessage }}</p>
  </div>
</template>
