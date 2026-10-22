import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useApi } from '@/composables/useApi';
import type { FriendshipSummary, FriendRequestsResponse } from '@/lib/net/api';

export const useFriendsStore = defineStore('friends', () => {
  const api = useApi();

  const friends = ref<FriendshipSummary[]>([]);
  const requests = ref<FriendRequestsResponse | null>(null);
  const loading = ref(false);
  const errorMessage = ref<string | null>(null);
  const addUsername = ref('');
  const sending = ref(false);
  const busyFriendshipId = ref<string | null>(null);
  const busyChallengeUserId = ref<string | null>(null);

  async function loadFriends() {
    loading.value = true;
    errorMessage.value = null;
    try {
      friends.value = await api.getFriends();
    } catch (e) {
      errorMessage.value = e instanceof Error ? e.message : 'Failed to load friends';
    } finally {
      loading.value = false;
    }
  }

  async function loadRequests() {
    try {
      requests.value = await api.getFriendRequests();
    } catch (e) {
      errorMessage.value = e instanceof Error ? e.message : 'Failed to load friend requests';
    }
  }

  async function sendRequest(username: string) {
    sending.value = true;
    errorMessage.value = null;
    try {
      await api.sendFriendRequest(username);
      addUsername.value = '';
      await loadRequests();
    } catch (e) {
      errorMessage.value = e instanceof Error ? e.message : 'Failed to send friend request';
    } finally {
      sending.value = false;
    }
  }

  async function acceptRequest(friendshipId: string) {
    busyFriendshipId.value = friendshipId;
    errorMessage.value = null;
    try {
      await api.acceptFriendRequest(friendshipId);
      await Promise.all([loadFriends(), loadRequests()]);
    } catch (e) {
      errorMessage.value = e instanceof Error ? e.message : 'Failed to accept friend request';
    } finally {
      busyFriendshipId.value = null;
    }
  }

  async function declineRequest(friendshipId: string) {
    busyFriendshipId.value = friendshipId;
    errorMessage.value = null;
    try {
      await api.declineFriendRequest(friendshipId);
      await loadRequests();
    } catch (e) {
      errorMessage.value = e instanceof Error ? e.message : 'Failed to decline friend request';
    } finally {
      busyFriendshipId.value = null;
    }
  }

  async function removeFriend(friendshipId: string) {
    busyFriendshipId.value = friendshipId;
    errorMessage.value = null;
    try {
      await api.removeFriendship(friendshipId);
      await loadFriends();
    } catch (e) {
      errorMessage.value = e instanceof Error ? e.message : 'Failed to remove friend';
    } finally {
      busyFriendshipId.value = null;
    }
  }

  async function challenge(username: string, gameType?: string) {
    busyChallengeUserId.value = username;
    errorMessage.value = null;
    try {
      await api.createChallenge({ username, gameType });
    } catch (e) {
      errorMessage.value = e instanceof Error ? e.message : 'Failed to send challenge';
    } finally {
      busyChallengeUserId.value = null;
    }
  }

  function reset() {
    addUsername.value = '';
    sending.value = false;
    busyFriendshipId.value = null;
    busyChallengeUserId.value = null;
    errorMessage.value = null;
  }

  return {
    friends,
    requests,
    loading,
    errorMessage,
    addUsername,
    sending,
    busyFriendshipId,
    busyChallengeUserId,
    loadFriends,
    loadRequests,
    sendRequest,
    acceptRequest,
    declineRequest,
    removeFriend,
    challenge,
    reset,
  };
});
