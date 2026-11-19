<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ChatMessage, GameLogEntry } from '@/lib/game-room/types';

const props = defineProps<{
  historyEntries: GameLogEntry[];
  chatMessages: ChatMessage[];
}>();

type Tab = 'history' | 'chat';

const OPEN_KEY = 'gt-side-panel-open';
const TAB_KEY = 'gt-side-panel-tab';

const { t } = useI18n();

function readStored(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function writeStored(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
}

const open = ref(readStored(OPEN_KEY) === '1');
const tab = ref<Tab>(readStored(TAB_KEY) === 'history' ? 'history' : 'chat');

watch(open, (value) => writeStored(OPEN_KEY, value ? '1' : '0'));
watch(tab, (value) => writeStored(TAB_KEY, value));

// Unread badge counts chat lines that arrived while the panel was closed.
const seenChatCount = ref(open.value ? props.chatMessages.length : 0);
const unreadChat = computed(() => (open.value ? 0 : props.chatMessages.length - seenChatCount.value));
watch([open, () => props.chatMessages.length], () => {
  if (open.value) seenChatCount.value = props.chatMessages.length;
});

// Keep the active list scrolled to the newest entry.
const listEl = ref<HTMLElement | null>(null);
watch([tab, open, () => props.historyEntries.length, () => props.chatMessages.length], async () => {
  await nextTick();
  if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight;
});

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
</script>

<template>
  <div class="gt-side" :class="{ 'gt-side--open': open }">
    <button
      class="gt-side-toggle"
      type="button"
      :aria-expanded="open"
      :aria-label="open ? t('room.panel.close') : t('room.panel.open')"
      @click="open = !open"
    >
      <span aria-hidden="true">{{ open ? '▶' : '◀' }}</span>
      <span v-if="unreadChat > 0" class="gt-side-badge">{{ unreadChat }}</span>
    </button>

    <aside class="gt-side-panel" :aria-hidden="!open">
      <div class="gt-side-tabs" role="tablist">
        <button
          class="gt-side-tab"
          :class="{ 'gt-side-tab--active': tab === 'chat' }"
          type="button"
          role="tab"
          :aria-selected="tab === 'chat'"
          @click="tab = 'chat'"
        >{{ t('room.panel.chat') }}</button>
        <button
          class="gt-side-tab"
          :class="{ 'gt-side-tab--active': tab === 'history' }"
          type="button"
          role="tab"
          :aria-selected="tab === 'history'"
          @click="tab = 'history'"
        >{{ t('room.panel.history') }}</button>
      </div>

      <div ref="listEl" class="gt-side-list">
        <template v-if="tab === 'history'">
          <p v-if="historyEntries.length === 0" class="gt-side-empty">{{ t('room.panel.historyEmpty') }}</p>
          <div
            v-for="entry in historyEntries"
            :key="entry.id"
            class="gt-side-entry"
            :class="`gt-side-entry--${entry.kind}`"
          >
            <span class="gt-side-time">{{ formatTime(entry.timestamp) }}</span>
            <span>{{ entry.text }}</span>
          </div>
        </template>

        <template v-else>
          <p v-if="chatMessages.length === 0" class="gt-side-empty">{{ t('room.panel.chatEmpty') }}</p>
          <template v-for="msg in chatMessages" :key="msg.id">
            <div v-if="msg.kind === 'system'" class="gt-side-system">{{ t(msg.key, msg.params ?? {}) }}</div>
            <div v-else class="gt-side-entry">
              <span class="gt-side-time">{{ formatTime(msg.timestamp) }}</span>
              <span><strong>{{ msg.displayName }}:</strong> {{ msg.text }}</span>
            </div>
          </template>
        </template>
      </div>

      <form v-if="tab === 'chat'" class="gt-side-input" @submit.prevent>
        <input type="text" :placeholder="t('room.panel.chatSoon')" disabled />
        <button class="gt-btn gt-btn--secondary" type="submit" disabled>{{ t('room.panel.send') }}</button>
      </form>
    </aside>
  </div>
</template>
