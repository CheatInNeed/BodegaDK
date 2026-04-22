export type RoomStatus = 'LOBBY' | 'IN_GAME' | 'FINISHED';

export type LobbyParticipant = {
    playerId: string;
    username: string | null;
};

export type LobbyRoomSummary = {
    roomCode: string;
    hostPlayerId: string;
    selectedGame: string;
    status: RoomStatus;
    playerCount: number;
    participants: LobbyParticipant[];
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

export type MatchmakingResponse = {
    ticketId: string;
    gameType: string;
    status: 'WAITING' | 'MATCHED' | 'CANCELLED';
    roomCode: string | null;
    playerId: string;
    token: string;
    queuedPlayers: number;
    playersNeeded: number;
    minPlayers: number;
    maxPlayers: number;
    strictCount: boolean;
    estimatedWaitSeconds: number;
};

export async function listRooms(): Promise<LobbyRoomSummary[]> {
    const response = await fetch(`${resolveApiBaseUrl()}/rooms`);
    return parseJsonResponse<LobbyRoomSummary[]>(response, 'Failed to load public rooms');
}

export async function createRoom(input: {
    gameType?: string;
    isPrivate?: boolean;
    playerId?: string;
    username?: string;
    token?: string;
}): Promise<CreateRoomResponse> {
    const response = await fetch(`${resolveApiBaseUrl()}/rooms`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
    });

    return parseJsonResponse<CreateRoomResponse>(response, 'Failed to create room');
}

export async function joinRoom(input: { roomCode: string; playerId?: string; username?: string; token?: string }): Promise<JoinRoomResponse> {
    const response = await fetch(`${resolveApiBaseUrl()}/rooms/${encodeURIComponent(input.roomCode)}/join`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            playerId: input.playerId,
            username: input.username,
            token: input.token,
        }),
    });

    return parseJsonResponse<JoinRoomResponse>(response, 'Failed to join room');
}

export async function leaveRoom(input: { roomCode: string; token: string }): Promise<RoomActionResponse> {
    const response = await fetch(`${resolveApiBaseUrl()}/rooms/${encodeURIComponent(input.roomCode)}/leave`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            token: input.token,
        }),
    });

    return parseJsonResponse<RoomActionResponse>(response, 'Failed to leave room');
}

export async function kickPlayer(input: { roomCode: string; actorToken: string; targetPlayerId: string }): Promise<RoomActionResponse> {
    const response = await fetch(`${resolveApiBaseUrl()}/rooms/${encodeURIComponent(input.roomCode)}/kick`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            actorToken: input.actorToken,
            targetPlayerId: input.targetPlayerId,
        }),
    });

    return parseJsonResponse<RoomActionResponse>(response, 'Failed to kick player');
}

export async function enqueueMatchmaking(input: {
    gameType: string;
    playerId: string;
    username?: string;
    token: string;
}): Promise<MatchmakingResponse> {
    const response = await fetch(`${resolveApiBaseUrl()}/matchmaking/queue`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
    });

    return parseJsonResponse<MatchmakingResponse>(response, 'Failed to join matchmaking queue');
}

export async function getMatchmakingTicket(ticketId: string): Promise<MatchmakingResponse> {
    const response = await fetch(`${resolveApiBaseUrl()}/matchmaking/queue/${encodeURIComponent(ticketId)}`);
    return parseJsonResponse<MatchmakingResponse>(response, 'Failed to load matchmaking ticket');
}

export async function cancelMatchmakingTicket(ticketId: string): Promise<void> {
    const response = await fetch(`${resolveApiBaseUrl()}/matchmaking/queue/${encodeURIComponent(ticketId)}`, {
        method: 'DELETE',
    });

    if (response.ok) {
        return;
    }

    let details = '';
    try {
        const body = await response.json() as { message?: string };
        details = typeof body.message === 'string' ? body.message : '';
    } catch {
        details = '';
    }

    const suffix = details ? `: ${details}` : '';
    throw new Error(`Failed to cancel matchmaking ticket (${response.status})${suffix}`);
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

    const suffix = details ? `: ${details}` : '';
    throw new Error(`${fallbackMessage} (${response.status})${suffix}`);
}

function resolveApiBaseUrl(): string {
    if (window.location.port === '5173') {
        return 'http://localhost:8080';
    }
    return '/api';
}
