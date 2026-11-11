import { createRoomStore } from './store.js';
import { buildPlayerNameMap } from './player-display.js';
import { createWebSocketTransport } from './transport/ws-client.js';
import { createMockServerTransport } from '../net/mock-server.js';
import { getAccessTokenOrRedirect } from '../net/api.js';
import { createDefaultCasinoValueMap, parseServerMessage } from '../net/protocol.js';
/**
 * Creates a single game-room session that owns:
 * - connection lifecycle
 * - socket/mock transport wiring
 * - store dispatching
 * - UI intent -> outbound protocol messages
 */
export function createGameRoomSession(options) {
    let krigRevealTimer = null;
    let krigResultTimer = null;
    const initialState = {
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
    let transport = null;
    const getState = () => store.getState();
    const subscribe = store.subscribe;
    const start = () => {
        if (transport)
            return;
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
    const toggleCard = (card) => {
        store.dispatch({ type: 'TOGGLE_CARD', card });
    };
    const sendIntent = (intent) => {
        const state = store.getState();
        // Guard against client-side actions when room is not actionable.
        if (state.connection !== 'connected')
            return;
        const message = options.adapter.buildAction?.(intent, state);
        if (!message)
            return;
        transport?.send(message);
    };
    const sendMessage = (message) => {
        const state = store.getState();
        if (state.connection !== 'connected')
            return;
        transport?.send(message);
    };
    const toViewModel = (viewOptions) => {
        const state = store.getState();
        return options.adapter.toViewModel({
            sessionState: state,
            publicState: state.publicState,
            privateState: state.privateState,
            selectedCards: state.selectedHandCards,
            selfPlayerId: state.playerId,
            playerNames: buildPlayerNameMap(state.publicState?.players, {
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
    function syncKrigPresentation(nextState, dispatch) {
        if (nextState.game.toLowerCase() !== 'krig')
            return;
        const publicState = nextState.publicState;
        const faceUpCards = readStringRecord(publicState?.currentFaceUpCards);
        const lastTrick = readRecord(publicState?.lastTrick);
        // Each server presentation event gets its own id — use it as the animation trigger key.
        const battleRound = typeof publicState?.presentationEventId === 'number' ? publicState.presentationEventId : null;
        const hasVisibleReveal = Object.values(faceUpCards).some((card) => typeof card === 'string' && card.length > 0);
        const presentation = nextState.krigPresentation;
        // outcome === 'TIE' means war was just declared and players must flip their war card.
        const isTieDeclared = lastTrick?.outcome === 'TIE';
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
            if (current.krigPresentation.activeBattleRound !== battleRound)
                return;
            if (isTieDeclared) {
                // War declared: show tied cards face-up with flip button available.
                // Stays in krig-reveal until war flip resolves (new presentationEventId).
                dispatch({
                    type: 'SET_KRIG_PRESENTATION',
                    presentation: {
                        phase: 'krig-reveal',
                        activeBattleRound: battleRound,
                        completedBattleRound: current.krigPresentation.completedBattleRound,
                    },
                });
            }
            else {
                // Normal battle or war flip resolved: show result, then idle.
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
                    if (latest.krigPresentation.activeBattleRound !== battleRound)
                        return;
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
function resolveWsUrl(explicitUrl) {
    if (explicitUrl)
        return explicitUrl;
    if (window.location.port === '5173') {
        return 'ws://localhost:8080/ws';
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
}
function readRecord(value) {
    return typeof value === 'object' && value !== null ? value : null;
}
function readStringRecord(value) {
    if (typeof value !== 'object' || value === null)
        return {};
    return Object.entries(value).reduce((acc, [key, entry]) => {
        acc[key] = typeof entry === 'string' ? entry : null;
        return acc;
    }, {});
}
