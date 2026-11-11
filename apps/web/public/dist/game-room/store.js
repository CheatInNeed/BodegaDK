/**
 * Minimal observable store for game-room session state.
 * All state transitions go through the reducer below.
 */
export function createRoomStore(initial) {
    let state = initial;
    const listeners = new Set();
    const getState = () => state;
    const subscribe = (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
    };
    const dispatch = (action) => {
        state = reducer(state, action);
        listeners.forEach((listener) => listener(state));
    };
    return { getState, subscribe, dispatch };
}
/**
 * Reducer with server-authoritative rules:
 * - snapshot replaces authoritative state
 * - public/private updates apply independently
 * - private updates for other players are ignored
 */
function reducer(state, action) {
    if (action.type === 'SET_CONNECTION') {
        return { ...state, connection: action.connection };
    }
    if (action.type === 'SET_ERROR') {
        return { ...state, lastError: action.message, connection: 'error' };
    }
    if (action.type === 'TOGGLE_CARD') {
        if (state.game.toLowerCase() === 'highcard' || state.game.toLowerCase() === 'casino') {
            const isSelected = state.selectedHandCards.includes(action.card);
            return {
                ...state,
                selectedHandCards: isSelected ? [] : [action.card],
            };
        }
        const selected = new Set(state.selectedHandCards);
        if (selected.has(action.card)) {
            selected.delete(action.card);
        }
        else {
            selected.add(action.card);
        }
        return { ...state, selectedHandCards: [...selected] };
    }
    if (action.type === 'SET_KRIG_PRESENTATION') {
        return {
            ...state,
            krigPresentation: action.presentation,
        };
    }
    if (action.type !== 'SERVER_MESSAGE')
        return state;
    const msg = action.message;
    if (msg.type === 'STATE_SNAPSHOT') {
        const hand = readHand(msg.payload.privateState);
        return {
            ...state,
            playerId: readPlayerId(msg.payload.privateState) ?? state.playerId,
            publicState: msg.payload.publicState,
            privateState: msg.payload.privateState,
            selectedHandCards: state.selectedHandCards.filter((card) => hand.includes(card)),
            lastError: null,
            winnerPlayerId: null,
        };
    }
    if (msg.type === 'PUBLIC_UPDATE') {
        const nextPublicState = {
            ...(state.publicState ?? {}),
            ...msg.payload,
        };
        const nextGamePhase = typeof nextPublicState.gamePhase === 'string' ? nextPublicState.gamePhase : null;
        return {
            ...state,
            publicState: nextPublicState,
            winnerPlayerId: nextGamePhase === 'PLAYING' ? null : state.winnerPlayerId,
            lastError: null,
        };
    }
    if (msg.type === 'PRIVATE_UPDATE') {
        const incomingPlayerId = readPlayerId(msg.payload);
        if (state.playerId && incomingPlayerId && incomingPlayerId !== state.playerId) {
            console.warn('[game-room] ignoring PRIVATE_UPDATE for another player', incomingPlayerId);
            return state;
        }
        const hand = readHand(msg.payload);
        return {
            ...state,
            playerId: state.playerId ?? incomingPlayerId ?? null,
            privateState: {
                ...(state.privateState ?? {}),
                ...msg.payload,
            },
            selectedHandCards: state.selectedHandCards.filter((card) => hand.includes(card)),
            lastError: null,
        };
    }
    if (msg.type === 'ROOM_CLOSED') {
        return {
            ...state,
            lastError: 'Room closed',
            connection: 'error',
        };
    }
    if (msg.type === 'ERROR') {
        return {
            ...state,
            lastError: msg.payload.message,
        };
    }
    if (msg.type === 'GAME_FINISHED') {
        return {
            ...state,
            winnerPlayerId: msg.payload.winnerPlayerId,
            selectedHandCards: [],
            lastError: null,
        };
    }
    return state;
}
/**
 * Defensive hand extraction from partial/unknown private payloads.
 */
function readHand(privateState) {
    const hand = privateState.hand;
    return Array.isArray(hand) ? hand.filter((card) => typeof card === 'string') : [];
}
function readPlayerId(privateState) {
    return typeof privateState.playerId === 'string' ? privateState.playerId : null;
}
