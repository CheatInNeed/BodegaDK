import { ref, onUnmounted, type Ref } from 'vue';
import { createGameRoomSession } from '@/lib/game-room/session';
import type {
  GameAdapter,
  RoomBootstrap,
  RoomSessionState,
  UiIntent,
} from '@/lib/game-room/types';
import type { ClientToServerMessage } from '@/lib/net/protocol';

export function useGameSession<
  TPublic extends Record<string, unknown>,
  TPrivate extends Record<string, unknown>,
  TViewModel,
>(
  bootstrap: RoomBootstrap,
  adapter: GameAdapter<TPublic, TPrivate, TViewModel>,
) {
  const session = createGameRoomSession({ bootstrap, adapter });

  const state = ref<RoomSessionState>(session.getState()) as Ref<RoomSessionState>;
  const viewModel = ref<TViewModel>(session.toViewModel()) as Ref<TViewModel>;

  const unsubscribe = session.subscribe((nextState) => {
    state.value = nextState;
    viewModel.value = session.toViewModel();
  });

  function start() {
    session.start();
  }

  function stop() {
    session.stop();
  }

  function toggleCard(card: string) {
    session.toggleCard(card);
  }

  function sendIntent(intent: UiIntent) {
    session.sendIntent(intent);
  }

  function sendMessage(message: ClientToServerMessage) {
    session.sendMessage(message);
  }

  onUnmounted(() => {
    unsubscribe();
    session.stop();
  });

  return {
    state,
    viewModel,
    start,
    stop,
    toggleCard,
    sendIntent,
    sendMessage,
  };
}
