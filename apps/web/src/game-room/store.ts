import type { ConnectionStatus, RoomSessionState } from './types.js';
import type { ServerToClientMessage, SnydPrivateState } from '../net/protocol.js';

type RoomStoreAction =
    | { type: 'SET_CONNECTION'; connection: ConnectionStatus }
    | { type: 'SET_ERROR'; message: string }
    | { type: 'TOGGLE_CARD'; card: string }
    | { type: 'SERVER_MESSAGE'; message: ServerToClientMessage };

type Listener = (state: RoomSessionState) => void;

export function createRoomStore(initial: RoomSessionState) {
    let state = initial;
    const listeners = new Set<Listener>();

    const getState = () => state;

    const subscribe = (listener: Listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
    };

    const dispatch = (action: RoomStoreAction) => {
        state = reducer(state, action);
        listeners.forEach((listener) => listener(state));
    };

    return { getState, subscribe, dispatch };
}

function reducer(state: RoomSessionState, action: RoomStoreAction): RoomSessionState {
    if (action.type === 'SET_CONNECTION') {
        return { ...state, connection: action.connection };
    }

    if (action.type === 'SET_ERROR') {
        return { ...state, lastError: action.message, connection: 'error' };
    }

    if (action.type === 'TOGGLE_CARD') {
        const selected = new Set(state.selectedHandCards);
        if (selected.has(action.card)) {
            selected.delete(action.card);
        } else {
            selected.add(action.card);
        }

        return { ...state, selectedHandCards: [...selected] };
    }

    if (action.type !== 'SERVER_MESSAGE') return state;

    const msg = action.message;

    if (msg.type === 'STATE_SNAPSHOT') {
        const hand = readHand(msg.payload.privateState);
        return {
            ...state,
            playerId: msg.payload.privateState.playerId,
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

        return {
            ...state,
            publicState: nextPublicState,
            lastError: null,
        };
    }

    if (msg.type === 'PRIVATE_UPDATE') {
        if (state.playerId && msg.payload.playerId !== state.playerId) {
            console.warn('[game-room] ignoring PRIVATE_UPDATE for another player', msg.payload.playerId);
            return state;
        }

        const hand = readHand(msg.payload);
        return {
            ...state,
            playerId: state.playerId ?? msg.payload.playerId,
            privateState: {
                ...(state.privateState ?? {}),
                ...msg.payload,
            },
            selectedHandCards: state.selectedHandCards.filter((card) => hand.includes(card)),
            lastError: null,
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

function readHand(privateState: SnydPrivateState | Record<string, unknown>): string[] {
    const hand = privateState.hand;
    return Array.isArray(hand) ? hand.filter((card) => typeof card === 'string') : [];
}
