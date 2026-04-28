import { supabase } from '../supabase.js';

export type RoomStatus = 'LOBBY' | 'IN_GAME' | 'FINISHED' | 'ABANDONED';

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
    status: 'WAITING' | 'MATCHED' | 'CANCELLED' | 'EXPIRED';
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
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/rooms`);
    return parseJsonResponse<LobbyRoomSummary[]>(response, 'Failed to load public rooms');
}

export async function createRoom(input: {
    gameType?: string;
    isPrivate?: boolean;
    username?: string;
}): Promise<CreateRoomResponse> {
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/rooms`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
    });

    return parseJsonResponse<CreateRoomResponse>(response, 'Failed to create room');
}

export async function joinRoom(input: { roomCode: string; username?: string }): Promise<JoinRoomResponse> {
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/rooms/${encodeURIComponent(input.roomCode)}/join`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            username: input.username,
        }),
    });

    return parseJsonResponse<JoinRoomResponse>(response, 'Failed to join room');
}

export async function leaveRoom(input: { roomCode: string }): Promise<RoomActionResponse> {
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/rooms/${encodeURIComponent(input.roomCode)}/leave`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
        }),
    });

    return parseJsonResponse<RoomActionResponse>(response, 'Failed to leave room');
}

export async function kickPlayer(input: { roomCode: string; targetPlayerId: string }): Promise<RoomActionResponse> {
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/rooms/${encodeURIComponent(input.roomCode)}/kick`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            targetPlayerId: input.targetPlayerId,
        }),
    });

    return parseJsonResponse<RoomActionResponse>(response, 'Failed to kick player');
}

export async function updateRoomVisibility(input: { roomCode: string; isPrivate: boolean }): Promise<RoomActionResponse> {
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/rooms/${encodeURIComponent(input.roomCode)}/visibility`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            isPrivate: input.isPrivate,
        }),
    });

    return parseJsonResponse<RoomActionResponse>(response, 'Failed to update room visibility');
}

export async function claimRoomIdentity(input: { roomCode: string; username?: string }): Promise<RoomActionResponse> {
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/rooms/${encodeURIComponent(input.roomCode)}/claim-identity`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            username: input.username,
        }),
    });

    return parseJsonResponse<RoomActionResponse>(response, 'Failed to claim room identity');
}

export async function enqueueMatchmaking(input: {
    gameType: string;
    username?: string;
    clientSessionId?: string;
}): Promise<MatchmakingResponse> {
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/matchmaking/queue`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
    });

    return parseJsonResponse<MatchmakingResponse>(response, 'Failed to join matchmaking queue');
}

export async function getMatchmakingTicket(ticketId: string): Promise<MatchmakingResponse> {
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/matchmaking/queue/${encodeURIComponent(ticketId)}`);
    return parseJsonResponse<MatchmakingResponse>(response, 'Failed to load matchmaking ticket');
}

export async function cancelMatchmakingTicket(ticketId: string): Promise<void> {
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/matchmaking/queue/${encodeURIComponent(ticketId)}`, {
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

export async function getAccessTokenOrRedirect(): Promise<string> {
    if (!supabase) {
        redirectToLogin();
        throw new Error('Authentication is not configured');
    }
    const { data, error } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (error || !accessToken) {
        redirectToLogin();
        throw new Error('Authentication required');
    }
    return accessToken;
}

async function authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    const accessToken = await getAccessTokenOrRedirect();
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${accessToken}`);
    return fetch(input, { ...init, headers });
}

function redirectToLogin() {
    if (window.location.pathname !== '/login') {
        window.location.href = '/login';
    }
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
