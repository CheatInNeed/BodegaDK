import { createRoomStore } from './store.js';
import type { GameAdapter, RoomBootstrap, RoomSessionState, RoomTransport, UiIntent } from './types.js';
import { createWebSocketTransport } from './transport/ws-client.js';
import { createMockServerTransport } from '../net/mock-server.js';
import { parseServerMessage, type ClientToServerMessage } from '../net/protocol.js';

type SessionOptions<TPublic extends Record<string, unknown>, TPrivate extends Record<string, unknown>, TViewModel> = {
    bootstrap: RoomBootstrap;
    adapter: GameAdapter<TPublic, TPrivate, TViewModel>;
    wsUrl?: string;
};

/**
 * Creates a single game-room session that owns:
 * - connection lifecycle
 * - socket/mock transport wiring
 * - store dispatching
 * - UI intent -> outbound protocol messages
 */
export function createGameRoomSession<TPublic extends Record<string, unknown>, TPrivate extends Record<string, unknown>, TViewModel>(
    options: SessionOptions<TPublic, TPrivate, TViewModel>,
) {
    const initialState: RoomSessionState = {
        connection: 'idle',
        roomCode: options.bootstrap.roomCode,
        playerId: null,
        game: options.bootstrap.game,
        publicState: null,
        privateState: null,
        selectedHandCards: [],
        lastError: null,
        winnerPlayerId: null,
    };

    const store = createRoomStore(initialState);
    let transport: RoomTransport | null = null;

    const getState = () => store.getState();
    const subscribe = store.subscribe;

    const start = () => {
        if (transport) return;

        transport = options.bootstrap.useMock
            ? createMockServerTransport()
            : createWebSocketTransport(resolveWsUrl(options.wsUrl));

        store.dispatch({ type: 'SET_CONNECTION', connection: 'connecting' });

        transport.connect({
            onOpen() {
                store.dispatch({ type: 'SET_CONNECTION', connection: 'connected' });
                transport?.send({
                    type: 'CONNECT',
                    payload: {
                        roomCode: options.bootstrap.roomCode,
                        token: options.bootstrap.token,
                    },
                });
            },
            onMessage(raw) {
                const parsed = parseServerMessage(raw);
                if (!parsed) {
                    console.warn('[game-room] ignoring malformed server message', raw);
                    return;
                }
                store.dispatch({ type: 'SERVER_MESSAGE', message: parsed });
            },
            onClose() {
                store.dispatch({ type: 'SET_CONNECTION', connection: 'reconnecting' });
            },
            onError(message) {
                store.dispatch({ type: 'SET_ERROR', message });
            },
        });
    };

    const stop = () => {
        transport?.close();
        transport = null;
        store.dispatch({ type: 'SET_CONNECTION', connection: 'idle' });
    };

    const toggleCard = (card: string) => {
        store.dispatch({ type: 'TOGGLE_CARD', card });
    };

    const sendIntent = (intent: UiIntent) => {
        const state = store.getState();
        // Guard against client-side actions when room is not actionable.
        if (state.connection !== 'connected') return;
        if (state.winnerPlayerId) return;
        const message = options.adapter.buildAction?.(intent, state);
        if (!message) return;
        transport?.send(message);
    };

    const sendMessage = (message: ClientToServerMessage) => {
        const state = store.getState();
        if (state.connection !== 'connected') return;
        transport?.send(message);
    };

    const toViewModel = () => {
        const state = store.getState();
        return options.adapter.toViewModel({
            publicState: state.publicState as TPublic | null,
            privateState: state.privateState as TPrivate | null,
            selectedCards: state.selectedHandCards,
            selfPlayerId: state.playerId,
        });
    };

    return {
        getState,
        subscribe,
        start,
        stop,
        toggleCard,
        sendIntent,
        sendMessage,
        toViewModel,
    };
}

/**
 * Resolve default WS endpoint from current browser origin.
 */
function resolveWsUrl(explicitUrl?: string): string {
    if (explicitUrl) return explicitUrl;

    if (window.location.port === '5173') {
        return 'ws://localhost:8080/ws';
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
}
