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
    hostPlayerId: string;
    isPrivate: boolean;
    selectedGame: string;
    status: RoomStatus;
};

export type JoinRoomResponse = {
    ok: boolean;
    roomCode: string;
    playerId: string;
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
    queuedPlayers: number;
    playersNeeded: number;
    minPlayers: number;
    maxPlayers: number;
    strictCount: boolean;
    estimatedWaitSeconds: number;
};

export type MyMatchPlayer = {
    userId: string;
    username: string;
    result: 'WIN' | 'LOSS' | 'DRAW' | 'ABANDONED' | null;
    score: number | null;
    seatIndex: number | null;
};

export type MyMatchSummary = {
    matchId: string;
    game: {
        id: string;
        slug: string;
        title: string;
    };
    roomCode: string | null;
    status: 'COMPLETED';
    startedAt: string;
    endedAt: string | null;
    resultType: 'WIN' | 'DRAW' | 'TIMEOUT' | 'RESIGNATION' | 'DISCONNECT' | 'ABORTED' | null;
    winnerUserId: string | null;
    currentUser: MyMatchPlayer;
    players: MyMatchPlayer[];
};

export type MyMatchesResponse = {
    items: MyMatchSummary[];
    limit: number;
    nextCursor: string | null;
};

export type MyGameStatsSummary = {
    game: {
        id: string;
        slug: string;
        title: string;
    };
    gamesPlayed: number;
    wins: number;
    losses: number;
    draws: number;
    highScore: number;
    currentStreak: number;
    bestStreak: number;
    totalPlayTimeSeconds: number;
    lastPlayedAt: string | null;
};

export type MyStatsResponse = {
    items: MyGameStatsSummary[];
};

export type LeaderboardEntry = {
    rank: number;
    userId: string;
    username: string;
    displayName: string;
    avatar: {
        color: string | null;
        shape: string | null;
        assetUrl: string | null;
    };
    score: number;
    matchId: string | null;
};

export type LeaderboardResponse = {
    game: {
        id: string;
        slug: string;
        title: string;
    };
    mode: string;
    items: LeaderboardEntry[];
    currentUser: {
        rank: number;
        score: number;
    } | null;
    limit: number;
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

export async function getMyMatches(input: { limit?: number; before?: string } = {}): Promise<MyMatchesResponse> {
    const params = new URLSearchParams();
    if (input.limit !== undefined) {
        params.set('limit', String(input.limit));
    }
    if (input.before) {
        params.set('before', input.before);
    }

    const query = params.toString();
    const url = `${resolveApiBaseUrl()}/me/matches${query ? `?${query}` : ''}`;
    const response = await authenticatedFetch(url);
    return parseJsonResponse<MyMatchesResponse>(response, 'Failed to load match history');
}

export async function getMyStats(input: { game?: string } = {}): Promise<MyStatsResponse> {
    const params = new URLSearchParams();
    if (input.game) {
        params.set('game', input.game);
    }

    const query = params.toString();
    const url = `${resolveApiBaseUrl()}/me/stats${query ? `?${query}` : ''}`;
    const response = await authenticatedFetch(url);
    return parseJsonResponse<MyStatsResponse>(response, 'Failed to load game stats');
}

export async function getLeaderboard(input: { game: string; mode?: string; limit?: number }): Promise<LeaderboardResponse> {
    const params = new URLSearchParams();
    params.set('game', input.game);
    if (input.mode) {
        params.set('mode', input.mode);
    }
    if (input.limit !== undefined) {
        params.set('limit', String(input.limit));
    }

    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/leaderboard?${params.toString()}`);
    return parseJsonResponse<LeaderboardResponse>(response, 'Failed to load leaderboard');
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
