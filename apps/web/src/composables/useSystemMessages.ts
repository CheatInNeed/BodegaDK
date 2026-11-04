import { ref, watch } from 'vue';
import { buildPlayerNameMap } from '@/lib/game-room/player-display';
import type { ChatMessage, RoomSessionState } from '@/lib/game-room/types';

/**
 * Derives system chat lines (players joining/leaving, connection changes,
 * errors) from room session state. Purely client-side: the log starts when
 * the room is opened.
 */
export function useSystemMessages(getState: () => RoomSessionState) {
  const messages = ref<ChatMessage[]>([]);
  let nextId = 0;

  function push(key: string, params?: Record<string, string>) {
    messages.value.push({ id: `sys-${nextId++}`, timestamp: Date.now(), kind: 'system', key, params });
  }

  // Connection: skip the initial connect, announce drops and recoveries.
  let hasConnected = false;
  watch(() => getState().connection, (next, prev) => {
    if (next === 'connected') {
      if (hasConnected && prev !== 'connected') push('room.chat.system.reconnected');
      hasConnected = true;
    } else if (hasConnected && prev === 'connected' && next === 'reconnecting') {
      push('room.chat.system.disconnected');
    } else if (next === 'error') {
      push('room.chat.system.connectionError');
    }
  }, { immediate: true });

  // Players: the first player list is the baseline; announce changes after it.
  let knownPlayers: Record<string, string> | null = null;
  watch(() => (getState().publicState as { players?: unknown } | null)?.players, (players) => {
    if (!Array.isArray(players)) return;
    const current = buildPlayerNameMap(players);
    const selfId = getState().playerId;
    if (knownPlayers) {
      for (const [id, name] of Object.entries(current)) {
        if (!(id in knownPlayers) && id !== selfId) push('room.chat.system.joined', { name });
      }
      for (const [id, name] of Object.entries(knownPlayers)) {
        if (!(id in current) && id !== selfId) push('room.chat.system.left', { name });
      }
    }
    knownPlayers = current;
  }, { immediate: true });

  watch(() => getState().lastError, (error) => {
    if (error) push('room.chat.system.error', { message: error });
  });

  return messages;
}
