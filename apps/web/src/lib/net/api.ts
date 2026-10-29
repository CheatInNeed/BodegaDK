// API types re-exported for use across the Vue app.
// The actual fetch logic lives in composables/useApi.ts which handles auth tokens.

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

export type FriendUser = {
  userId: string;
  username: string;
  displayName: string | null;
};

export type FriendshipSummary = {
  id: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'BLOCKED';
  requester: FriendUser;
  addressee: FriendUser;
  createdAt: string | null;
  updatedAt: string | null;
};

export type FriendRequestsResponse = {
  incoming: FriendshipSummary[];
  outgoing: FriendshipSummary[];
};

export type ChallengeSummary = {
  id: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'CANCELLED' | 'EXPIRED';
  challenger: FriendUser;
  challenged: FriendUser;
  game: {
    id: string;
    slug: string;
    title: string;
  };
  roomCode: string | null;
  createdAt: string | null;
  expiresAt: string | null;
  respondedAt: string | null;
};

export type ChallengeAcceptResponse = {
  challenge: ChallengeSummary;
  room: CreateRoomResponse;
};

export type NotificationSummary = {
  id: string;
  type: string;
  actor: FriendUser | null;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string | null;
};

export type NotificationsResponse = {
  items: NotificationSummary[];
  unreadCount: number;
  limit: number;
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
