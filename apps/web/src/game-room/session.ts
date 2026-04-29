import { createRoomStore } from './store.js';
import { buildPlayerNameMap } from './player-display.js';
import type { GameAdapter, RoomBootstrap, RoomSessionState, RoomTransport, UiIntent } from './types.js';
import { createWebSocketTransport } from './transport/ws-client.js';
import { createMockServerTransport } from '../net/mock-server.js';
import { getAccessTokenOrRedirect } from '../net/api.js';
import { createDefaultCasinoValueMap, parseServerMessage, type ClientToServerMessage } from '../net/protocol.js';

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
    let krigRevealTimer: ReturnType<typeof setTimeout> | null = null;
    let krigResultTimer: ReturnType<typeof setTimeout> | null = null;
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
        krigPresentation: {
            phase: 'idle',
            activeBattleRound: null,
            completedBattleRound: null,
        },
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
            async onOpen() {
                store.dispatch({ type: 'SET_CONNECTION', connection: 'connected' });
                const accessToken = options.bootstrap.useMock
                    ? (options.bootstrap.mockClientId ?? options.bootstrap.roomCode)
                    : await getAccessTokenOrRedirect();
                transport?.send({
                    type: 'CONNECT',
                    payload: {
                        roomCode: options.bootstrap.roomCode,
                        accessToken,
                        game: options.bootstrap.game,
                        setup: options.bootstrap.game.toLowerCase() === 'casino'
                            ? {
                                casinoRules: {
                                    valueMap: createDefaultCasinoValueMap(),
                                },
                            }
                            : undefined,
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
                syncKrigPresentation(store.getState(), store.dispatch);
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
        clearKrigTimers();
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
        const message = options.adapter.buildAction?.(intent, state);
        if (!message) return;
        transport?.send(message);
    };

    const sendMessage = (message: ClientToServerMessage) => {
        const state = store.getState();
        if (state.connection !== 'connected') return;
        transport?.send(message);
    };

    const toViewModel = (viewOptions?: { selfUsername?: string | null }) => {
        const state = store.getState();
        return options.adapter.toViewModel({
            sessionState: state,
            publicState: state.publicState as TPublic | null,
            privateState: state.privateState as TPrivate | null,
            selectedCards: state.selectedHandCards,
            selfPlayerId: state.playerId,
            playerNames: buildPlayerNameMap((state.publicState as { players?: unknown } | null)?.players, {
                selfPlayerId: state.playerId,
                selfUsername: viewOptions?.selfUsername ?? null,
            }),
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

    function clearKrigTimers() {
        if (krigRevealTimer !== null) {
            clearTimeout(krigRevealTimer);
            krigRevealTimer = null;
        }
        if (krigResultTimer !== null) {
            clearTimeout(krigResultTimer);
            krigResultTimer = null;
        }
    }

    function syncKrigPresentation(nextState: RoomSessionState, dispatch: ReturnType<typeof createRoomStore>['dispatch']) {
        if (nextState.game.toLowerCase() !== 'krig') return;

        const publicState = nextState.publicState;
        const faceUpCards = readStringRecord(publicState?.currentFaceUpCards);
        const lastTrick = readRecord(publicState?.lastTrick);
        const battleRound = typeof lastTrick?.trickNumber === 'number' ? lastTrick.trickNumber : null;
        const hasVisibleReveal = Object.values(faceUpCards).some((card) => typeof card === 'string' && card.length > 0);
        const presentation = nextState.krigPresentation;

        if (!hasVisibleReveal || battleRound === null) {
            if (presentation.phase !== 'idle' || presentation.activeBattleRound !== null) {
                clearKrigTimers();
                dispatch({
                    type: 'SET_KRIG_PRESENTATION',
                    presentation: {
                        phase: 'idle',
                        activeBattleRound: null,
                        completedBattleRound: presentation.completedBattleRound,
                    },
                });
            }
            return;
        }

        if (battleRound === presentation.completedBattleRound || battleRound === presentation.activeBattleRound) {
            return;
        }

        clearKrigTimers();

        const isWar = typeof lastTrick?.warDepth === 'number' && lastTrick.warDepth > 0;

        dispatch({
            type: 'SET_KRIG_PRESENTATION',
            presentation: {
                phase: 'suspense',
                activeBattleRound: battleRound,
                completedBattleRound: presentation.completedBattleRound,
            },
        });

        krigRevealTimer = setTimeout(() => {
            const current = store.getState();
            if (current.krigPresentation.activeBattleRound !== battleRound) return;

            if (isWar) {
                // War: skip the result phase — go straight to idle so players can flip again
                dispatch({
                    type: 'SET_KRIG_PRESENTATION',
                    presentation: {
                        phase: 'idle',
                        activeBattleRound: null,
                        completedBattleRound: battleRound,
                    },
                });
            } else {
                // Normal: show result, then idle
                dispatch({
                    type: 'SET_KRIG_PRESENTATION',
                    presentation: {
                        phase: 'result',
                        activeBattleRound: battleRound,
                        completedBattleRound: current.krigPresentation.completedBattleRound,
                    },
                });

                krigResultTimer = setTimeout(() => {
                    const latest = store.getState();
                    if (latest.krigPresentation.activeBattleRound !== battleRound) return;
                    dispatch({
                        type: 'SET_KRIG_PRESENTATION',
                        presentation: {
                            phase: 'idle',
                            activeBattleRound: null,
                            completedBattleRound: battleRound,
                        },
                    });
                }, 2000);
            }
        }, 1200);
    }
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

function readRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null;
}

function readStringRecord(value: unknown): Record<string, string | null> {
    if (typeof value !== 'object' || value === null) return {};
    return Object.entries(value as Record<string, unknown>).reduce<Record<string, string | null>>((acc, [key, entry]) => {
        acc[key] = typeof entry === 'string' ? entry : null;
        return acc;
    }, {});
}
