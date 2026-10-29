import { useAuthStore } from '@/stores/auth';
import router from '@/router';
import * as api from '@/lib/net/api';

export function useApi() {
  const authStore = useAuthStore();

  async function getAccessTokenOrRedirect(): Promise<string> {
    try {
      return await authStore.getAccessToken();
    } catch {
      router.push('/login');
      throw new Error('Authentication required');
    }
  }

  async function authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    const accessToken = await getAccessTokenOrRedirect();
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${accessToken}`);
    return fetch(input, { ...init, headers });
  }

  function resolveApiBaseUrl(): string {
    // In dev, Vite proxy handles /api → localhost:8080
    return '/api';
  }

  // Re-export all API functions using the authenticated fetch from this composable
  // Each function creates its own authenticated request

  async function listRooms() {
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/rooms`);
    return parseJsonResponse<api.LobbyRoomSummary[]>(response, 'Failed to load public rooms');
  }

  async function createRoom(input: { gameType?: string; isPrivate?: boolean; username?: string }) {
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return parseJsonResponse<api.CreateRoomResponse>(response, 'Failed to create room');
  }

  async function joinRoom(input: { roomCode: string; username?: string }) {
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/rooms/${encodeURIComponent(input.roomCode)}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: input.username }),
    });
    return parseJsonResponse<api.JoinRoomResponse>(response, 'Failed to join room');
  }

  async function leaveRoom(input: { roomCode: string }) {
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/rooms/${encodeURIComponent(input.roomCode)}/leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    return parseJsonResponse<api.RoomActionResponse>(response, 'Failed to leave room');
  }

  async function kickPlayer(input: { roomCode: string; targetPlayerId: string }) {
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/rooms/${encodeURIComponent(input.roomCode)}/kick`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetPlayerId: input.targetPlayerId }),
    });
    return parseJsonResponse<api.RoomActionResponse>(response, 'Failed to kick player');
  }

  async function updateRoomVisibility(input: { roomCode: string; isPrivate: boolean }) {
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/rooms/${encodeURIComponent(input.roomCode)}/visibility`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isPrivate: input.isPrivate }),
    });
    return parseJsonResponse<api.RoomActionResponse>(response, 'Failed to update room visibility');
  }

  async function claimRoomIdentity(input: { roomCode: string; username?: string }) {
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/rooms/${encodeURIComponent(input.roomCode)}/claim-identity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: input.username }),
    });
    return parseJsonResponse<api.RoomActionResponse>(response, 'Failed to claim room identity');
  }

  async function enqueueMatchmaking(input: { gameType: string; username?: string; clientSessionId?: string }) {
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/matchmaking/queue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return parseJsonResponse<api.MatchmakingResponse>(response, 'Failed to join matchmaking queue');
  }

  async function getMatchmakingTicket(ticketId: string) {
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/matchmaking/queue/${encodeURIComponent(ticketId)}`);
    return parseJsonResponse<api.MatchmakingResponse>(response, 'Failed to load matchmaking ticket');
  }

  async function cancelMatchmakingTicket(ticketId: string) {
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/matchmaking/queue/${encodeURIComponent(ticketId)}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error(`Failed to cancel matchmaking ticket (${response.status})`);
    }
  }

  async function getMyMatches(input: { limit?: number; before?: string } = {}) {
    const params = new URLSearchParams();
    if (input.limit !== undefined) params.set('limit', String(input.limit));
    if (input.before) params.set('before', input.before);
    const query = params.toString();
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/me/matches${query ? `?${query}` : ''}`);
    return parseJsonResponse<api.MyMatchesResponse>(response, 'Failed to load match history');
  }

  async function getMyStats(input: { game?: string } = {}) {
    const params = new URLSearchParams();
    if (input.game) params.set('game', input.game);
    const query = params.toString();
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/me/stats${query ? `?${query}` : ''}`);
    return parseJsonResponse<api.MyStatsResponse>(response, 'Failed to load game stats');
  }

  async function getFriends() {
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/friends`);
    return parseJsonResponse<api.FriendshipSummary[]>(response, 'Failed to load friends');
  }

  async function getFriendRequests() {
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/friends/requests`);
    return parseJsonResponse<api.FriendRequestsResponse>(response, 'Failed to load friend requests');
  }

  async function sendFriendRequest(username: string) {
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/friends/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    });
    return parseJsonResponse<api.FriendshipSummary>(response, 'Failed to send friend request');
  }

  async function acceptFriendRequest(friendshipId: string) {
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/friends/${encodeURIComponent(friendshipId)}/accept`, {
      method: 'POST',
    });
    return parseJsonResponse<api.FriendshipSummary>(response, 'Failed to accept friend request');
  }

  async function declineFriendRequest(friendshipId: string) {
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/friends/${encodeURIComponent(friendshipId)}/decline`, {
      method: 'POST',
    });
    return parseJsonResponse<api.FriendshipSummary>(response, 'Failed to decline friend request');
  }

  async function removeFriendship(friendshipId: string) {
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/friends/${encodeURIComponent(friendshipId)}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error(`Failed to remove friend (${response.status})`);
    }
  }

  async function createChallenge(input: { username: string; gameType?: string }) {
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/challenges`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return parseJsonResponse<api.ChallengeSummary>(response, 'Failed to send challenge');
  }

  async function acceptChallenge(challengeId: string) {
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/challenges/${encodeURIComponent(challengeId)}/accept`, {
      method: 'POST',
    });
    return parseJsonResponse<api.ChallengeAcceptResponse>(response, 'Failed to accept challenge');
  }

  async function declineChallenge(challengeId: string) {
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/challenges/${encodeURIComponent(challengeId)}/decline`, {
      method: 'POST',
    });
    return parseJsonResponse<api.ChallengeSummary>(response, 'Failed to decline challenge');
  }

  async function getNotifications(input: { limit?: number } = {}) {
    const params = new URLSearchParams();
    if (input.limit !== undefined) params.set('limit', String(input.limit));
    const query = params.toString();
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/notifications${query ? `?${query}` : ''}`);
    return parseJsonResponse<api.NotificationsResponse>(response, 'Failed to load notifications');
  }

  async function markNotificationRead(notificationId: string) {
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/notifications/${encodeURIComponent(notificationId)}/read`, {
      method: 'POST',
    });
    return parseJsonResponse<api.NotificationSummary>(response, 'Failed to mark notification as read');
  }

  async function markAllNotificationsRead() {
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/notifications/read-all`, {
      method: 'POST',
    });
    return parseJsonResponse<{ ok: boolean }>(response, 'Failed to mark notifications as read');
  }

  async function getLeaderboard(input: { game: string; mode?: string; limit?: number }) {
    const params = new URLSearchParams();
    params.set('game', input.game);
    if (input.mode) params.set('mode', input.mode);
    if (input.limit !== undefined) params.set('limit', String(input.limit));
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/leaderboard?${params.toString()}`);
    return parseJsonResponse<api.LeaderboardResponse>(response, 'Failed to load leaderboard');
  }

  return {
    authenticatedFetch,
    resolveApiBaseUrl,
    getAccessTokenOrRedirect,
    listRooms,
    createRoom,
    joinRoom,
    leaveRoom,
    kickPlayer,
    updateRoomVisibility,
    claimRoomIdentity,
    enqueueMatchmaking,
    getMatchmakingTicket,
    cancelMatchmakingTicket,
    getMyMatches,
    getMyStats,
    getFriends,
    getFriendRequests,
    sendFriendRequest,
    acceptFriendRequest,
    declineFriendRequest,
    removeFriendship,
    createChallenge,
    acceptChallenge,
    declineChallenge,
    getNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    getLeaderboard,
  };
}

async function parseJsonResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (response.ok) {
    return response.json() as Promise<T>;
  }

  let details = '';
  try {
    const body = await response.json() as Record<string, unknown>;
    for (const key of ['message', 'error', 'detail']) {
      const value = body[key];
      if (typeof value === 'string' && value.trim()) {
        details = value.trim();
        break;
      }
    }
  } catch {
    // ignore
  }

  const diagnostic = details ? `: ${details}` : '';
  throw new Error(`${fallbackMessage} (${response.status})${diagnostic}`);
}
