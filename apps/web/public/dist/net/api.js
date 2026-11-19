import { supabase } from '../supabase.js';
export async function listRooms() {
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/rooms`);
    return parseJsonResponse(response, 'Failed to load public rooms');
}
export async function createRoom(input) {
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/rooms`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
    });
    return parseJsonResponse(response, 'Failed to create room');
}
export async function joinRoom(input) {
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/rooms/${encodeURIComponent(input.roomCode)}/join`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            username: input.username,
        }),
    });
    return parseJsonResponse(response, 'Failed to join room');
}
export async function leaveRoom(input) {
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/rooms/${encodeURIComponent(input.roomCode)}/leave`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
    });
    return parseJsonResponse(response, 'Failed to leave room');
}
export async function kickPlayer(input) {
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/rooms/${encodeURIComponent(input.roomCode)}/kick`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            targetPlayerId: input.targetPlayerId,
        }),
    });
    return parseJsonResponse(response, 'Failed to kick player');
}
export async function updateRoomVisibility(input) {
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/rooms/${encodeURIComponent(input.roomCode)}/visibility`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            isPrivate: input.isPrivate,
        }),
    });
    return parseJsonResponse(response, 'Failed to update room visibility');
}
export async function claimRoomIdentity(input) {
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/rooms/${encodeURIComponent(input.roomCode)}/claim-identity`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            username: input.username,
        }),
    });
    return parseJsonResponse(response, 'Failed to claim room identity');
}
export async function enqueueMatchmaking(input) {
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/matchmaking/queue`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
    });
    return parseJsonResponse(response, 'Failed to join matchmaking queue');
}
export async function getMatchmakingTicket(ticketId) {
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/matchmaking/queue/${encodeURIComponent(ticketId)}`);
    return parseJsonResponse(response, 'Failed to load matchmaking ticket');
}
export async function cancelMatchmakingTicket(ticketId) {
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/matchmaking/queue/${encodeURIComponent(ticketId)}`, {
        method: 'DELETE',
    });
    if (response.ok) {
        return;
    }
    let details = '';
    try {
        const body = await response.json();
        details = typeof body.message === 'string' ? body.message : '';
    }
    catch {
        details = '';
    }
    const suffix = details ? `: ${details}` : '';
    throw new Error(`Failed to cancel matchmaking ticket (${response.status})${suffix}`);
}
export async function getMyMatches(input = {}) {
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
    return parseJsonResponse(response, 'Failed to load match history');
}
export async function getMyStats(input = {}) {
    const params = new URLSearchParams();
    if (input.game) {
        params.set('game', input.game);
    }
    const query = params.toString();
    const url = `${resolveApiBaseUrl()}/me/stats${query ? `?${query}` : ''}`;
    const response = await authenticatedFetch(url);
    return parseJsonResponse(response, 'Failed to load game stats');
}
export async function getFriends() {
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/friends`);
    return parseJsonResponse(response, 'Failed to load friends');
}
export async function getFriendRequests() {
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/friends/requests`);
    return parseJsonResponse(response, 'Failed to load friend requests');
}
export async function sendFriendRequest(username) {
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/friends/request`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username }),
    });
    return parseJsonResponse(response, 'Failed to send friend request');
}
export async function acceptFriendRequest(friendshipId) {
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/friends/${encodeURIComponent(friendshipId)}/accept`, {
        method: 'POST',
    });
    return parseJsonResponse(response, 'Failed to accept friend request');
}
export async function declineFriendRequest(friendshipId) {
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/friends/${encodeURIComponent(friendshipId)}/decline`, {
        method: 'POST',
    });
    return parseJsonResponse(response, 'Failed to decline friend request');
}
export async function removeFriendship(friendshipId) {
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/friends/${encodeURIComponent(friendshipId)}`, {
        method: 'DELETE',
    });
    if (response.ok) {
        return;
    }
    let details = '';
    try {
        const body = await response.json();
        details = typeof body.message === 'string' ? body.message : '';
    }
    catch {
        details = '';
    }
    const suffix = details ? `: ${details}` : '';
    throw new Error(`Failed to remove friend (${response.status})${suffix}`);
}
export async function createChallenge(input) {
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/challenges`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
    });
    return parseJsonResponse(response, 'Failed to send challenge');
}
export async function acceptChallenge(challengeId) {
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/challenges/${encodeURIComponent(challengeId)}/accept`, {
        method: 'POST',
    });
    return parseJsonResponse(response, 'Failed to accept challenge');
}
export async function declineChallenge(challengeId) {
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/challenges/${encodeURIComponent(challengeId)}/decline`, {
        method: 'POST',
    });
    return parseJsonResponse(response, 'Failed to decline challenge');
}
export async function cancelChallenge(challengeId) {
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/challenges/${encodeURIComponent(challengeId)}/cancel`, {
        method: 'POST',
    });
    return parseJsonResponse(response, 'Failed to cancel challenge');
}
export async function getNotifications(input = {}) {
    const params = new URLSearchParams();
    if (input.limit !== undefined) {
        params.set('limit', String(input.limit));
    }
    const query = params.toString();
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/notifications${query ? `?${query}` : ''}`);
    return parseJsonResponse(response, 'Failed to load notifications');
}
export async function markNotificationRead(notificationId) {
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/notifications/${encodeURIComponent(notificationId)}/read`, {
        method: 'POST',
    });
    return parseJsonResponse(response, 'Failed to mark notification as read');
}
export async function markAllNotificationsRead() {
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/notifications/read-all`, {
        method: 'POST',
    });
    return parseJsonResponse(response, 'Failed to mark notifications as read');
}
export async function getLeaderboard(input) {
    const params = new URLSearchParams();
    params.set('game', input.game);
    if (input.mode) {
        params.set('mode', input.mode);
    }
    if (input.limit !== undefined) {
        params.set('limit', String(input.limit));
    }
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/leaderboard?${params.toString()}`);
    return parseJsonResponse(response, 'Failed to load leaderboard');
}
export async function getAccessTokenOrRedirect() {
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
export async function authenticatedFetch(input, init = {}) {
    const accessToken = await getAccessTokenOrRedirect();
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${accessToken}`);
    return fetch(input, { ...init, headers });
}
let loginRedirectStartedAt = 0;
function redirectToLogin() {
    // The auth pages themselves never bounce.
    const path = window.location.pathname;
    if (path === '/login' || path === '/signup') {
        return;
    }
    // Assigning location.href again aborts the navigation that is already
    // pending, so several failing requests in a row must only redirect once.
    // Time-based rather than a permanent flag: a page restored by the back
    // button keeps its JS state and must be able to redirect again.
    const now = Date.now();
    if (now - loginRedirectStartedAt < 2000) {
        return;
    }
    loginRedirectStartedAt = now;
    window.location.href = '/login';
}
export class ApiError extends Error {
    status;
    statusText;
    url;
    body;
    constructor(message, status, statusText, url, body) {
        super(message);
        this.status = status;
        this.statusText = statusText;
        this.url = url;
        this.body = body;
        this.name = 'ApiError';
    }
}
async function parseJsonResponse(response, fallbackMessage) {
    if (response.ok) {
        return response.json();
    }
    const body = await readErrorBody(response);
    const details = extractErrorMessage(body);
    const diagnostic = details ? `: ${details}` : '';
    const message = `${fallbackMessage} (${response.status} ${response.statusText || 'HTTP error'})${diagnostic}`;
    console.error('[api] request failed', {
        url: response.url,
        status: response.status,
        statusText: response.statusText,
        body,
    });
    throw new ApiError(message, response.status, response.statusText, response.url, body);
}
async function readErrorBody(response) {
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
        try {
            return await response.json();
        }
        catch {
            return null;
        }
    }
    try {
        return await response.text();
    }
    catch {
        return null;
    }
}
function extractErrorMessage(body) {
    if (typeof body === 'string') {
        return body.trim().slice(0, 500);
    }
    if (!body || typeof body !== 'object') {
        return '';
    }
    const record = body;
    for (const key of ['message', 'error', 'detail', 'path']) {
        const value = record[key];
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }
    return JSON.stringify(body).slice(0, 500);
}
export function resolveApiBaseUrl() {
    if (window.location.port === '5173') {
        return 'http://localhost:8080';
    }
    return '/api';
}
