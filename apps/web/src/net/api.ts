export type RoomStatus = 'LOBBY' | 'IN_GAME';

export type LobbyRoomSummary = {
    roomCode: string;
    hostPlayerId: string;
    selectedGame: string;
    status: RoomStatus;
    playerCount: number;
    participants: string[];
};

export type CreateRoomResponse = {
    roomCode: string;
    playerId: string;
    token: string;
    hostPlayerId: string;
    isPrivate: boolean;
    selectedGame: string;
    status: RoomStatus;
};

export type JoinRoomResponse = {
    ok: boolean;
    roomCode: string;
    playerId: string;
    token: string;
    hostPlayerId: string;
    selectedGame: string;
    status: RoomStatus;
};

export type RoomActionResponse = { ok: boolean };

export async function listRooms(accessToken: string): Promise<LobbyRoomSummary[]> {
    const response = await fetch(`${resolveApiBaseUrl()}/rooms`, {
        headers: authHeaders(accessToken),
    });
    return parseJsonResponse<LobbyRoomSummary[]>(response, 'Failed to load public rooms');
}

export async function createRoom(input: {
    gameType?: string;
    isPrivate?: boolean;
    playerId?: string;
    token?: string;
    accessToken: string;
}): Promise<CreateRoomResponse> {
    const response = await fetch(`${resolveApiBaseUrl()}/rooms`, {
        method: 'POST',
        headers: jsonHeaders(input.accessToken),
        body: JSON.stringify(input),
    });

    return parseJsonResponse<CreateRoomResponse>(response, 'Failed to create room');
}

export async function joinRoom(input: { roomCode: string; playerId?: string; token?: string; accessToken: string }): Promise<JoinRoomResponse> {
    const response = await fetch(`${resolveApiBaseUrl()}/rooms/${encodeURIComponent(input.roomCode)}/join`, {
        method: 'POST',
        headers: jsonHeaders(input.accessToken),
        body: JSON.stringify({
            playerId: input.playerId,
            token: input.token,
        }),
    });

    return parseJsonResponse<JoinRoomResponse>(response, 'Failed to join room');
}

export async function leaveRoom(input: { roomCode: string; token: string; accessToken: string }): Promise<RoomActionResponse> {
    const response = await fetch(`${resolveApiBaseUrl()}/rooms/${encodeURIComponent(input.roomCode)}/leave`, {
        method: 'POST',
        headers: jsonHeaders(input.accessToken),
        body: JSON.stringify({
            token: input.token,
        }),
    });

    return parseJsonResponse<RoomActionResponse>(response, 'Failed to leave room');
}

export async function kickPlayer(input: { roomCode: string; actorToken: string; targetPlayerId: string; accessToken: string }): Promise<RoomActionResponse> {
    const response = await fetch(`${resolveApiBaseUrl()}/rooms/${encodeURIComponent(input.roomCode)}/kick`, {
        method: 'POST',
        headers: jsonHeaders(input.accessToken),
        body: JSON.stringify({
            actorToken: input.actorToken,
            targetPlayerId: input.targetPlayerId,
        }),
    });

    return parseJsonResponse<RoomActionResponse>(response, 'Failed to kick player');
}

async function parseJsonResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
    if (response.ok) {
        return response.json() as Promise<T>;
    }

    let details = '';
    try {
        const body = await response.json() as { message?: string };
        details = typeof body.message === 'string' ? body.message : '';
    } catch {
        details = '';
    }

    console.error('[api]', fallbackMessage, {
        status: response.status,
        statusText: response.statusText,
        details,
    });

    const suffix = details ? `: ${details}` : '';
    throw new Error(`${fallbackMessage} (${response.status})${suffix}`);
}

function resolveApiBaseUrl(): string {
    if (window.location.port === '5173') {
        return 'http://localhost:8080';
    }
    return '/api';
}

function authHeaders(accessToken: string): HeadersInit {
    return {
        Authorization: `Bearer ${accessToken}`,
    };
}

function jsonHeaders(accessToken: string): HeadersInit {
    return {
        ...authHeaders(accessToken),
        'Content-Type': 'application/json',
    };
}
