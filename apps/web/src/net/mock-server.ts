import type {
    ClientToServerMessage,
    ServerToClientMessage,
    SnydPrivateState,
    SnydPublicState,
} from './protocol.js';
import type { RoomTransport, RoomTransportHandlers } from '../game-room/types.js';

type MockRoomData = {
    roomCode: string;
    players: string[];
    tokens: Record<string, string>;
    hands: Record<string, string[]>;
    turnPlayerId: string;
    nextPlayerId: string;
    pileCount: number;
    lastClaim?: {
        playerId: string;
        claimRank: string;
        count: number;
    };
    winnerPlayerId: string | null;
};

type BroadcastPayload = {
    roomCode: string;
    targetPlayerId: string | null;
    message: ServerToClientMessage;
};

const STORAGE_PREFIX = 'bodegadk.mock.room.';

/**
 * Dev-only in-browser transport that simulates a server-authoritative room.
 * It shares room state across tabs and emits protocol-compatible messages.
 */
export function createMockServerTransport(): RoomTransport {
    let handlers: RoomTransportHandlers | null = null;
    let channel: BroadcastChannel | null = null;
    let myPlayerId: string | null = null;
    let currentRoomCode: string | null = null;

    const listener = (event: MessageEvent<BroadcastPayload>) => {
        if (!handlers || !myPlayerId) return;
        const payload = event.data;
        if (!payload || payload.roomCode !== currentRoomCode) return;
        if (payload.targetPlayerId && payload.targetPlayerId !== myPlayerId) return;
        handlers.onMessage(payload.message);
    };

    return {
        connect(nextHandlers: RoomTransportHandlers) {
            handlers = nextHandlers;
            queueMicrotask(() => handlers?.onOpen());
        },

        send(message: ClientToServerMessage) {
            if (!handlers) return;

            if (message.type === 'CONNECT') {
                currentRoomCode = message.payload.roomCode;
                const room = readOrCreateRoom(message.payload.roomCode);
                myPlayerId = registerToken(room, message.payload.token);
                saveRoom(room);

                if (!channel) {
                    channel = new BroadcastChannel(getChannelName(message.payload.roomCode));
                    channel.addEventListener('message', listener);
                }

                const snapshotMessage: ServerToClientMessage = {
                    type: 'STATE_SNAPSHOT',
                    payload: {
                        publicState: makePublicState(room),
                        privateState: makePrivateState(room, myPlayerId),
                    },
                };
                handlers.onMessage(snapshotMessage);
                return;
            }

            if (!currentRoomCode || !myPlayerId) return;

            const room = readOrCreateRoom(currentRoomCode);

            if (message.type === 'PLAY_CARDS') {
                handlePlayCards(room, myPlayerId, message);
                return;
            }

            if (message.type === 'CALL_SNYD') {
                if (room.winnerPlayerId) return;
                if (room.turnPlayerId !== myPlayerId) {
                    handlers.onMessage({
                        type: 'ERROR',
                        payload: { message: 'Not your turn' },
                    });
                    return;
                }

                room.turnPlayerId = getNextPlayer(room, myPlayerId);
                room.nextPlayerId = getNextPlayer(room, room.turnPlayerId);
                saveRoom(room);

                broadcast(room.roomCode, {
                    type: 'PUBLIC_UPDATE',
                    payload: {
                        turnPlayerId: room.turnPlayerId,
                        nextPlayerId: room.nextPlayerId,
                        playerCardCounts: makeCounts(room),
                    },
                });
            }
        },

        close() {
            channel?.removeEventListener('message', listener);
            channel?.close();
            channel = null;
            myPlayerId = null;
            currentRoomCode = null;
            handlers?.onClose();
            handlers = null;
        },
    };
}

function handlePlayCards(
    room: MockRoomData,
    actorPlayerId: string,
    message: Extract<ClientToServerMessage, { type: 'PLAY_CARDS' }>,
) {
    if (room.winnerPlayerId) return;

    const cards = message.payload.cards;
    if (room.turnPlayerId !== actorPlayerId) {
        sendToPlayer(room.roomCode, actorPlayerId, {
            type: 'ERROR',
            payload: { message: 'Not your turn' },
        });
        return;
    }

    const hand = room.hands[actorPlayerId] ?? [];
    const hasAllCards = cards.every((card) => hand.includes(card));
    if (!hasAllCards) {
        sendToPlayer(room.roomCode, actorPlayerId, {
            type: 'ERROR',
            payload: { message: 'You do not own all selected cards' },
        });
        return;
    }

    room.hands[actorPlayerId] = removeCards(hand, cards);
    room.pileCount += cards.length;
    room.lastClaim = {
        playerId: actorPlayerId,
        claimRank: message.payload.claimRank,
        count: cards.length,
    };

    const nextPlayerId = getNextPlayer(room, actorPlayerId);
    room.turnPlayerId = nextPlayerId;
    room.nextPlayerId = getNextPlayer(room, nextPlayerId);

    if (room.hands[actorPlayerId].length === 0) {
        room.winnerPlayerId = actorPlayerId;
    }

    saveRoom(room);

    broadcast(room.roomCode, {
        type: 'PUBLIC_UPDATE',
        payload: {
            turnPlayerId: room.turnPlayerId,
            nextPlayerId: room.nextPlayerId,
            pileCount: room.pileCount,
            lastClaim: room.lastClaim,
            playerCardCounts: makeCounts(room),
        },
    });

    sendToPlayer(room.roomCode, actorPlayerId, {
        type: 'PRIVATE_UPDATE',
        payload: {
            playerId: actorPlayerId,
            hand: room.hands[actorPlayerId],
        },
    });

    if (room.winnerPlayerId) {
        broadcast(room.roomCode, {
            type: 'GAME_FINISHED',
            payload: { winnerPlayerId: room.winnerPlayerId },
        });
    }
}

/**
 * Loads room state from localStorage or creates a deterministic default room.
 */
function readOrCreateRoom(roomCode: string): MockRoomData {
    const key = getStorageKey(roomCode);
    const raw = localStorage.getItem(key);
    if (raw) {
        try {
            return JSON.parse(raw) as MockRoomData;
        } catch {
            localStorage.removeItem(key);
        }
    }

    const room: MockRoomData = {
        roomCode,
        players: ['p1', 'p2'],
        tokens: {},
        hands: {
            p1: ['H7', 'C2', 'DA', 'S8'],
            p2: ['H3', 'D3', 'CK', 'SA'],
        },
        turnPlayerId: 'p1',
        nextPlayerId: 'p2',
        pileCount: 0,
        winnerPlayerId: null,
    };

    saveRoom(room);
    return room;
}

/**
 * Stable token -> player mapping per room for repeatable multi-tab testing.
 */
function registerToken(room: MockRoomData, token: string): string {
    if (room.tokens[token]) return room.tokens[token];

    const usedPlayerIds = new Set(Object.values(room.tokens));
    const available = room.players.find((playerId) => !usedPlayerIds.has(playerId));
    const playerId = available ?? room.players[0];
    room.tokens[token] = playerId;
    return playerId;
}

function makePublicState(room: MockRoomData): SnydPublicState {
    return {
        roomCode: room.roomCode,
        players: room.players,
        turnPlayerId: room.turnPlayerId,
        nextPlayerId: room.nextPlayerId,
        pileCount: room.pileCount,
        lastClaim: room.lastClaim,
        playerCardCounts: makeCounts(room),
    };
}

function makePrivateState(room: MockRoomData, playerId: string): SnydPrivateState {
    return {
        playerId,
        hand: room.hands[playerId] ?? [],
    };
}

function makeCounts(room: MockRoomData): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const playerId of room.players) {
        counts[playerId] = room.hands[playerId]?.length ?? 0;
    }
    return counts;
}

function removeCards(hand: string[], cards: string[]): string[] {
    const mutable = [...hand];
    for (const card of cards) {
        const index = mutable.indexOf(card);
        if (index >= 0) mutable.splice(index, 1);
    }
    return mutable;
}

function getNextPlayer(room: MockRoomData, playerId: string): string {
    const index = room.players.indexOf(playerId);
    if (index < 0) return room.players[0];
    return room.players[(index + 1) % room.players.length];
}

function saveRoom(room: MockRoomData) {
    localStorage.setItem(getStorageKey(room.roomCode), JSON.stringify(room));
}

/**
 * Broadcast public messages to all room listeners.
 */
function broadcast(roomCode: string, message: ServerToClientMessage) {
    const channel = new BroadcastChannel(getChannelName(roomCode));
    const payload: BroadcastPayload = { roomCode, targetPlayerId: null, message };
    channel.postMessage(payload);
    channel.close();
}

/**
 * Send private updates to a single player listener.
 */
function sendToPlayer(roomCode: string, targetPlayerId: string, message: ServerToClientMessage) {
    const channel = new BroadcastChannel(getChannelName(roomCode));
    const payload: BroadcastPayload = { roomCode, targetPlayerId, message };
    channel.postMessage(payload);
    channel.close();
}

function getStorageKey(roomCode: string) {
    return `${STORAGE_PREFIX}${roomCode}`;
}

function getChannelName(roomCode: string) {
    return `bodegadk-mock-room-${roomCode}`;
}
