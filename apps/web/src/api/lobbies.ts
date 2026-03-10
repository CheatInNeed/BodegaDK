import { resolveApiBaseUrl } from './backend.js';

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
};

export type GameSummary = {
    gameId: string;
    minPlayers: number;
    maxPlayers: number;
};

type RoomMutationError = {
    message?: string;
};

export async function listGames(): Promise<GameSummary[]> {
    return apiFetch<GameSummary[]>('/rooms/games');
}

export async function createLobby(input: {
    playerId: string;
    displayName: string;
    gameId: string;
    isPublic: boolean;
}): Promise<LobbyRoom> {
    return apiFetch<LobbyRoom>('/rooms', withJson('POST', input));
}

export async function listPublicLobbies(): Promise<LobbySummary[]> {
    return apiFetch<LobbySummary[]>('/rooms');
}

export async function getLobby(roomCode: string): Promise<LobbyRoom> {
    return apiFetch<LobbyRoom>(`/rooms/${encodeURIComponent(roomCode)}`);
}

export async function joinLobby(roomCode: string, input: {
    playerId: string;
    displayName: string;
}): Promise<LobbyRoom> {
    return apiFetch<LobbyRoom>(`/rooms/${encodeURIComponent(roomCode)}/join`, withJson('POST', input));
}

export async function updateLobby(roomCode: string, input: {
    actorPlayerId: string;
    isPublic?: boolean;
    kickPlayerId?: string;
}): Promise<LobbyRoom> {
    return apiFetch<LobbyRoom>(`/rooms/${encodeURIComponent(roomCode)}`, withJson('PATCH', input));
}

export async function startLobby(roomCode: string, actorPlayerId: string): Promise<LobbyRoom> {
    return apiFetch<LobbyRoom>(`/rooms/${encodeURIComponent(roomCode)}/start`, withJson('POST', { actorPlayerId }));
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
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
}

function withJson(method: 'POST' | 'PATCH', body: object): RequestInit {
    return {
        method,
        body: JSON.stringify(body),
    };
}
