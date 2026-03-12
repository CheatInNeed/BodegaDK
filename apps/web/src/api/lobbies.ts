import { resolveApiBaseUrl } from './backend.js';
import { seedMockRoom } from '../net/mock-server.js';

export type LobbyPlayer = {
    playerId: string;
    displayName: string;
    host: boolean;
};

export type LobbyRoom = {
    roomCode: string;
    hostPlayerId: string;
    gameId: string;
    isPublic: boolean;
    status: 'WAITING' | 'PLAYING' | 'FINISHED';
    minPlayers: number;
    maxPlayers: number;
    currentPlayers: number;
    players: LobbyPlayer[];
    mock?: boolean;
};

export type LobbySummary = {
    roomCode: string;
    gameId: string;
    isPublic: boolean;
    status: 'WAITING' | 'PLAYING' | 'FINISHED';
    hostPlayerId: string;
    minPlayers: number;
    maxPlayers: number;
    currentPlayers: number;
    mock?: boolean;
};

export type GameSummary = {
    gameId: string;
    minPlayers: number;
    maxPlayers: number;
};

type RoomMutationError = {
    message?: string;
};

type StoredLobbyRoom = Omit<LobbyRoom, 'players'> & {
    players: LobbyPlayer[];
    startedAt: number | null;
};

const MOCK_GAMES: GameSummary[] = [
    { gameId: 'snyd', minPlayers: 2, maxPlayers: 8 },
];

const LOBBY_STORAGE_KEY = 'bodegadk.mock.lobbies';
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export async function listGames(): Promise<GameSummary[]> {
    return apiFetch<GameSummary[]>('/rooms/games', undefined, () => MOCK_GAMES);
}

export async function createLobby(input: {
    playerId: string;
    displayName: string;
    gameId: string;
    isPublic: boolean;
}): Promise<LobbyRoom> {
    return apiFetch<LobbyRoom>('/rooms', withJson('POST', input), () => createMockLobby(input));
}

export async function listPublicLobbies(): Promise<LobbySummary[]> {
    return apiFetch<LobbySummary[]>('/rooms', undefined, listMockPublicLobbies);
}

export async function getLobby(roomCode: string): Promise<LobbyRoom> {
    return apiFetch<LobbyRoom>(`/rooms/${encodeURIComponent(roomCode)}`, undefined, () => getMockLobby(roomCode));
}

export async function joinLobby(roomCode: string, input: {
    playerId: string;
    displayName: string;
}): Promise<LobbyRoom> {
    return apiFetch<LobbyRoom>(`/rooms/${encodeURIComponent(roomCode)}/join`, withJson('POST', input), () => joinMockLobby(roomCode, input));
}

export async function updateLobby(roomCode: string, input: {
    actorPlayerId: string;
    isPublic?: boolean;
    kickPlayerId?: string;
}): Promise<LobbyRoom> {
    return apiFetch<LobbyRoom>(`/rooms/${encodeURIComponent(roomCode)}`, withJson('PATCH', input), () => updateMockLobby(roomCode, input));
}

export async function startLobby(roomCode: string, actorPlayerId: string): Promise<LobbyRoom> {
    return apiFetch<LobbyRoom>(`/rooms/${encodeURIComponent(roomCode)}/start`, withJson('POST', { actorPlayerId }), () => startMockLobby(roomCode, actorPlayerId));
}

async function apiFetch<T>(path: string, init?: RequestInit, fallback?: () => T | Promise<T>): Promise<T> {
    try {
        const response = await fetch(`${resolveApiBaseUrl()}${path}`, {
            headers: {
                'Content-Type': 'application/json',
                ...(init?.headers ?? {}),
            },
            ...init,
        });

        if (!response.ok) {
            let errorMessage = `Request failed with status ${response.status}`;
            try {
                const data = await response.json() as RoomMutationError;
                if (typeof data.message === 'string' && data.message.trim().length > 0) {
                    errorMessage = data.message;
                }
            } catch {
                // Ignore malformed JSON error responses and use the generic message.
            }
            throw new Error(errorMessage);
        }

        return response.json() as Promise<T>;
    } catch (error) {
        if (fallback && shouldUseMockFallback(error)) {
            return fallback();
        }
        throw error;
    }
}

function withJson(method: 'POST' | 'PATCH', body: object): RequestInit {
    return {
        method,
        body: JSON.stringify(body),
    };
}

function shouldUseMockFallback(error: unknown): boolean {
    return isLocalDev() && error instanceof TypeError;
}

function isLocalDev(): boolean {
    return window.location.port === '5173';
}

function createMockLobby(input: {
    playerId: string;
    displayName: string;
    gameId: string;
    isPublic: boolean;
}): LobbyRoom {
    const game = requireMockGame(input.gameId);
    const roomCode = generateRoomCode(readStoredLobbies());
    const room: StoredLobbyRoom = {
        roomCode,
        hostPlayerId: input.playerId,
        gameId: input.gameId,
        isPublic: input.isPublic,
        status: 'WAITING',
        minPlayers: game.minPlayers,
        maxPlayers: game.maxPlayers,
        currentPlayers: 1,
        players: [{
            playerId: input.playerId,
            displayName: input.displayName,
            host: true,
        }],
        startedAt: null,
        mock: true,
    };

    writeStoredLobbies([...readStoredLobbies(), room]);
    return toLobbyRoom(room);
}

function listMockPublicLobbies(): LobbySummary[] {
    return readStoredLobbies()
        .filter((room) => room.isPublic && room.status === 'WAITING')
        .map(toLobbySummary);
}

function getMockLobby(roomCode: string): LobbyRoom {
    const room = findStoredLobby(roomCode);
    if (!room) {
        throw new Error(`Room not found: ${roomCode}`);
    }
    return toLobbyRoom(room);
}

function joinMockLobby(roomCode: string, input: {
    playerId: string;
    displayName: string;
}): LobbyRoom {
    const room = findStoredLobby(roomCode);
    if (!room) {
        throw new Error(`Room not found: ${roomCode}`);
    }
    if (room.status === 'PLAYING') {
        throw new Error('This lobby is already playing. Joining as an active player is blocked.');
    }

    const existing = room.players.find((player) => player.playerId === input.playerId);
    if (!existing && room.currentPlayers >= room.maxPlayers) {
        throw new Error('Lobby is full.');
    }

    if (existing) {
        existing.displayName = input.displayName;
    } else {
        room.players.push({
            playerId: input.playerId,
            displayName: input.displayName,
            host: false,
        });
        room.currentPlayers = room.players.length;
    }

    saveStoredLobby(room);
    return toLobbyRoom(room);
}

function updateMockLobby(roomCode: string, input: {
    actorPlayerId: string;
    isPublic?: boolean;
    kickPlayerId?: string;
}): LobbyRoom {
    const room = findStoredLobby(roomCode);
    if (!room) {
        throw new Error(`Room not found: ${roomCode}`);
    }
    assertHost(room, input.actorPlayerId);

    if (typeof input.isPublic === 'boolean') {
        room.isPublic = input.isPublic;
    }

    if (input.kickPlayerId) {
        if (input.kickPlayerId === room.hostPlayerId) {
            throw new Error('Host cannot kick themselves.');
        }
        room.players = room.players.filter((player) => player.playerId !== input.kickPlayerId);
        room.currentPlayers = room.players.length;
    }

    saveStoredLobby(room);
    return toLobbyRoom(room);
}

function startMockLobby(roomCode: string, actorPlayerId: string): LobbyRoom {
    const room = findStoredLobby(roomCode);
    if (!room) {
        throw new Error(`Room not found: ${roomCode}`);
    }
    assertHost(room, actorPlayerId);

    if (room.status !== 'WAITING') {
        throw new Error(`Lobby cannot be started from status ${room.status}`);
    }
    if (room.currentPlayers < room.minPlayers) {
        throw new Error(`Need at least ${room.minPlayers} players to start.`);
    }

    room.status = 'PLAYING';
    room.startedAt = Date.now();
    saveStoredLobby(room);
    seedMockRoom(room.roomCode, room.players.map((player) => player.playerId));
    return toLobbyRoom(room);
}

function requireMockGame(gameId: string): GameSummary {
    const match = MOCK_GAMES.find((game) => game.gameId === gameId);
    if (!match) {
        throw new Error(`Unsupported game mode: ${gameId}`);
    }
    return match;
}

function findStoredLobby(roomCode: string): StoredLobbyRoom | null {
    const normalized = roomCode.trim().toUpperCase();
    return readStoredLobbies().find((room) => room.roomCode === normalized) ?? null;
}

function saveStoredLobby(room: StoredLobbyRoom) {
    const rooms = readStoredLobbies();
    const index = rooms.findIndex((candidate) => candidate.roomCode === room.roomCode);
    if (index >= 0) {
        rooms[index] = room;
    } else {
        rooms.push(room);
    }
    writeStoredLobbies(rooms);
}

function readStoredLobbies(): StoredLobbyRoom[] {
    const raw = localStorage.getItem(LOBBY_STORAGE_KEY);
    if (!raw) return [];

    try {
        return JSON.parse(raw) as StoredLobbyRoom[];
    } catch {
        localStorage.removeItem(LOBBY_STORAGE_KEY);
        return [];
    }
}

function writeStoredLobbies(rooms: StoredLobbyRoom[]) {
    localStorage.setItem(LOBBY_STORAGE_KEY, JSON.stringify(rooms));
}

function generateRoomCode(rooms: StoredLobbyRoom[]): string {
    for (let attempt = 0; attempt < 30; attempt += 1) {
        let candidate = '';
        for (let i = 0; i < 6; i += 1) {
            const index = Math.floor(Math.random() * ROOM_CODE_ALPHABET.length);
            candidate += ROOM_CODE_ALPHABET[index];
        }
        if (!rooms.some((room) => room.roomCode === candidate)) {
            return candidate;
        }
    }
    throw new Error('Could not generate a unique room code.');
}

function assertHost(room: StoredLobbyRoom, actorPlayerId: string) {
    if (room.hostPlayerId !== actorPlayerId) {
        throw new Error('Only the host may perform this action.');
    }
}

function toLobbyRoom(room: StoredLobbyRoom): LobbyRoom {
    return {
        roomCode: room.roomCode,
        hostPlayerId: room.hostPlayerId,
        gameId: room.gameId,
        isPublic: room.isPublic,
        status: room.status,
        minPlayers: room.minPlayers,
        maxPlayers: room.maxPlayers,
        currentPlayers: room.currentPlayers,
        players: room.players,
        mock: true,
    };
}

function toLobbySummary(room: StoredLobbyRoom): LobbySummary {
    return {
        roomCode: room.roomCode,
        gameId: room.gameId,
        isPublic: room.isPublic,
        status: room.status,
        hostPlayerId: room.hostPlayerId,
        minPlayers: room.minPlayers,
        maxPlayers: room.maxPlayers,
        currentPlayers: room.currentPlayers,
        mock: true,
    };
}
