import type {
    CasinoPrivateState,
    CasinoPublicState,
    CasinoValueMap,
    ClientToServerMessage,
    ServerToClientMessage,
    SnydPrivateState,
    SnydPublicState,
} from './protocol.js';
import type { RoomTransport, RoomTransportHandlers } from '../game-room/types.js';
import {
    applyCasinoBuildMove,
    applyCasinoMergeMove,
    applyCasinoMove,
    finishCasinoGame,
    initializeCasinoState,
    startCasinoRound,
    validateCasinoValueMap,
    type CasinoState,
} from '../games/casino/engine.js';

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

type MockCasinoRoomData = {
    game: 'casino';
    roomCode: string;
    tokens: Record<string, string>;
    engine: CasinoState;
};

type MockSnydRoomData = MockRoomData & {
    game: 'snyd';
};

type MockFemRoomData = {
    game: 'fem';
    roomCode: string;
    tokens: Record<string, string>;
};

type AnyMockRoomData = MockCasinoRoomData | MockSnydRoomData | MockFemRoomData;

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
                const gameLower = message.payload.game?.toLowerCase();
                const desiredGame: 'snyd' | 'casino' | 'fem' =
                    gameLower === 'casino' ? 'casino' : gameLower === 'fem' ? 'fem' : 'snyd';
                let room: AnyMockRoomData;
                try {
                    room = readOrCreateRoom(
                        message.payload.roomCode,
                        desiredGame,
                        message.payload.setup?.casinoRules?.valueMap,
                    );
                } catch (error) {
                    handlers.onMessage({
                        type: 'ERROR',
                        payload: {
                            message: error instanceof Error ? error.message : 'Failed to initialize room',
                        },
                    });
                    return;
                }

                if (room.game !== desiredGame) {
                    handlers.onMessage({
                        type: 'ERROR',
                        payload: { message: `Room already initialized for game ${room.game}` },
                    });
                    return;
                }

                const registeredPlayer = registerToken(room, message.payload.token);
                if (!registeredPlayer) {
                    handlers.onMessage({
                        type: 'ERROR',
                        payload: { message: 'Room is full' },
                    });
                    return;
                }
                myPlayerId = registeredPlayer;
                saveRoom(room);

                if (!channel) {
                    channel = new BroadcastChannel(getChannelName(message.payload.roomCode));
                    channel.addEventListener('message', listener);
                }

                if (room.game === 'casino') {
                    maybeStartCasinoGame(room);
                }

                const snapshotMessage = makeSnapshot(room, myPlayerId);
                handlers.onMessage(snapshotMessage);
                return;
            }

            if (!currentRoomCode || !myPlayerId) return;

            const room = readOrCreateRoom(currentRoomCode, 'snyd');

            if (room.game === 'fem') {
                return;
            }

            if (room.game === 'casino') {
                if (
                    message.type !== 'CASINO_PLAY_MOVE'
                    && message.type !== 'CASINO_BUILD_STACK'
                    && message.type !== 'CASINO_MERGE_STACKS'
                ) {
                    sendToPlayer(room.roomCode, myPlayerId, {
                        type: 'ERROR',
                        payload: { message: 'Unsupported action for casino room' },
                    });
                    return;
                }

                if (message.type === 'CASINO_PLAY_MOVE') {
                    handleCasinoMove(room, myPlayerId, message.payload);
                } else if (message.type === 'CASINO_BUILD_STACK') {
                    handleCasinoBuild(room, myPlayerId, message.payload);
                } else {
                    handleCasinoMerge(room, myPlayerId, message.payload);
                }
                return;
            }

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
    room: MockSnydRoomData,
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
function handleCasinoMove(
    room: MockCasinoRoomData,
    actorPlayerId: string,
    payload: Extract<ClientToServerMessage, { type: 'CASINO_PLAY_MOVE' }>['payload'],
) {
    const error = applyCasinoMove(room.engine, actorPlayerId, {
        handCard: payload.handCard,
        captureStackIds: payload.captureStackIds,
        playedValue: payload.playedValue,
    });
    if (error) {
        sendToPlayer(room.roomCode, actorPlayerId, { type: 'ERROR', payload: { message: error } });
        return;
    }
    if (room.engine.finished) {
        finishCasinoGame(room.engine);
    }
    saveRoom(room);
    broadcastCasinoState(room);
    if (room.engine.finished) {
        broadcast(room.roomCode, {
            type: 'GAME_FINISHED',
            payload: {
                winnerPlayerId: room.engine.winnerPlayerId,
            },
        });
    }
}

function handleCasinoBuild(
    room: MockCasinoRoomData,
    actorPlayerId: string,
    payload: Extract<ClientToServerMessage, { type: 'CASINO_BUILD_STACK' }>['payload'],
) {
    const error = applyCasinoBuildMove(room.engine, actorPlayerId, payload);
    if (error) {
        sendToPlayer(room.roomCode, actorPlayerId, { type: 'ERROR', payload: { message: error } });
        return;
    }
    saveRoom(room);
    broadcastCasinoState(room);
}

function handleCasinoMerge(
    room: MockCasinoRoomData,
    actorPlayerId: string,
    payload: Extract<ClientToServerMessage, { type: 'CASINO_MERGE_STACKS' }>['payload'],
) {
    const error = applyCasinoMergeMove(room.engine, actorPlayerId, payload);
    if (error) {
        sendToPlayer(room.roomCode, actorPlayerId, { type: 'ERROR', payload: { message: error } });
        return;
    }
    saveRoom(room);
    broadcastCasinoState(room);
}

function maybeStartCasinoGame(room: MockCasinoRoomData) {
    const uniquePlayers = [...new Set(Object.values(room.tokens))];
    if (uniquePlayers.length !== 2 || room.engine.started) return;

    const players = uniquePlayers.includes('p1') && uniquePlayers.includes('p2')
        ? ['p1', 'p2']
        : uniquePlayers;
    room.engine.players = players;
    if (!room.engine.dealerPlayerId || !players.includes(room.engine.dealerPlayerId)) {
        room.engine.dealerPlayerId = players[1] ?? null;
    }
    const error = startCasinoRound(room.engine);
    if (error) return;
    saveRoom(room);
    broadcastCasinoState(room);
}

function broadcastCasinoState(room: MockCasinoRoomData) {
    broadcast(room.roomCode, {
        type: 'PUBLIC_UPDATE',
        payload: makeCasinoPublicState(room),
    });

    for (const playerId of Object.values(room.tokens)) {
        sendToPlayer(room.roomCode, playerId, {
            type: 'PRIVATE_UPDATE',
            payload: makeCasinoPrivateState(room, playerId),
        });
    }
}

function readOrCreateRoom(
    roomCode: string,
    desiredGame: 'snyd' | 'casino' | 'fem',
    requestedRules?: CasinoValueMap,
): AnyMockRoomData {
    const key = getStorageKey(roomCode);
    const raw = localStorage.getItem(key);
    if (raw) {
        try {
            const stored = JSON.parse(raw) as AnyMockRoomData;
            if (stored.game === desiredGame) return stored;
            // Game type mismatch — discard stale entry and create fresh.
            localStorage.removeItem(key);
        } catch {
            localStorage.removeItem(key);
        }
    }

    if (desiredGame === 'casino') {
        if (!requestedRules) {
            throw new Error('Missing setup.casinoRules for casino room');
        }
        const validationError = validateCasinoValueMap(requestedRules);
        if (validationError) {
            throw new Error(validationError);
        }

        const room: MockCasinoRoomData = {
            game: 'casino',
            roomCode,
            tokens: {},
            engine: initializeCasinoState({
                roomCode,
                players: ['p1', 'p2'],
                dealerPlayerId: 'p2',
                rules: { valueMap: requestedRules },
            }),
        };
        saveRoom(room);
        return room;
    }

    if (desiredGame === 'fem') {
        const room: MockFemRoomData = { game: 'fem', roomCode, tokens: {} };
        saveRoom(room);
        return room;
    }

    const room: MockSnydRoomData = {
        game: 'snyd',
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
function registerToken(room: AnyMockRoomData, token: string): string | null {
    if (room.tokens[token]) return room.tokens[token];

    const usedPlayerIds = new Set(Object.values(room.tokens));
    const players = room.game === 'casino' || room.game === 'fem' ? ['p1', 'p2'] : room.players;
    const available = players.find((playerId) => !usedPlayerIds.has(playerId));
    if (!available && (room.game === 'casino' || room.game === 'fem')) {
        return null;
    }
    const playerId = available ?? players[0];
    room.tokens[token] = playerId;
    return playerId;
}

function makeSnapshot(room: AnyMockRoomData, playerId: string): ServerToClientMessage {
    if (room.game === 'casino') {
        return {
            type: 'STATE_SNAPSHOT',
            payload: {
                publicState: makeCasinoPublicState(room),
                privateState: makeCasinoPrivateState(room, playerId),
            },
        };
    }
    if (room.game === 'fem') {
        return {
            type: 'STATE_SNAPSHOT',
            payload: {
                publicState: makeFemPublicState(),
                privateState: makeFemPrivateState(playerId),
            },
        };
    }
    return {
        type: 'STATE_SNAPSHOT',
        payload: {
            publicState: makePublicState(room),
            privateState: makePrivateState(room, playerId),
        },
    };
}

function makeFemPublicState(): Record<string, unknown> {
    return {
        players: ['p1', 'p2'],
        turnPlayerId: 'p1',
        roundNumber: 2,
        scores: { p1: 150, p2: 80 },
        stockPileCount: 28,
        discardPileTop: 'HQ',
        melds: [
            {
                id: 'meld-1',
                suit: 'H',
                cards: ['HA', 'H2', 'H3', 'H4'],
                pointsPerPlayer: { p1: 40 },
            },
            {
                id: 'meld-2',
                suit: 'D',
                cards: ['DA', 'D2', 'D3'],
                pointsPerPlayer: { p2: 30 },
            },
        ],
        playerCardCounts: { p1: 10, p2: 11 },
        phase: 'PLAYING',
        discardGrabPhase: false,
        grabPriorityPlayerId: null,
        winnerPlayerId: null,
    };
}

function makeFemPrivateState(playerId: string): Record<string, unknown> {
    const hand = playerId === 'p1'
        ? ['H5', 'H6', 'H7', 'D7', 'D8', 'SA', 'CA', 'DA', 'S10', 'CK']
        : ['C5', 'C6', 'C7', 'S5', 'S6', 'HK', 'DK', 'CQ', 'SQ', 'H9', 'D9'];
    return { playerId, hand, projectedRoundScore: playerId === 'p1' ? 40 : 30 };
}

function makeCasinoPublicState(room: MockCasinoRoomData): CasinoPublicState {
    return {
        roomCode: room.roomCode,
        players: room.engine.players,
        dealerPlayerId: room.engine.dealerPlayerId,
        turnPlayerId: room.engine.turnPlayerId,
        tableStacks: room.engine.tableStacks.map((stack) => ({
            stackId: stack.stackId,
            cards: stack.cards,
            total: stack.total,
            locked: stack.locked,
            topCard: stack.cards[stack.cards.length - 1] ?? '',
        })),
        deckCount: room.engine.deck.length,
        capturedCounts: room.engine.capturedCounts,
        lastCapturePlayerId: room.engine.lastCapturePlayerId,
        started: room.engine.started,
        rules: room.engine.rules,
    };
}

function makeCasinoPrivateState(room: MockCasinoRoomData, playerId: string): CasinoPrivateState {
    return {
        playerId,
        hand: room.engine.hands[playerId] ?? [],
        capturedCards: room.engine.capturedCards[playerId] ?? [],
    };
}

function makePublicState(room: MockSnydRoomData): SnydPublicState {
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

function makePrivateState(room: MockSnydRoomData, playerId: string): SnydPrivateState {
    return {
        playerId,
        hand: room.hands[playerId] ?? [],
    };
}

function makeCounts(room: MockSnydRoomData): Record<string, number> {
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

function getNextPlayer(room: MockSnydRoomData, playerId: string): string {
    const index = room.players.indexOf(playerId);
    if (index < 0) return room.players[0];
    return room.players[(index + 1) % room.players.length];
}

function saveRoom(room: AnyMockRoomData) {
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
