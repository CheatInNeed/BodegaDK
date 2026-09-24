import type { AppRoute, View } from './router.js';
import type { Lang } from '../i18n.js';
import type { LobbyRoomSummary, MatchmakingResponse, NotificationSummary } from '../net/api.js';
import type { LeaderboardViewState } from '../leaderboard.js';
import type { ProfileFriendUiState } from '../profile.js';

export type ThemeId = 'bodega' | 'harbor' | 'parlor';

export type AppState = {
    lang: Lang;
    view: View;
    theme: ThemeId;
    sidebarCollapsed: boolean;
    route: AppRoute;

    auth: {
        initialized: boolean;
        user: { id: string; username: string | null } | null;
        avatar: { color: string; shape: string } | null;
    };

    notifications: {
        open: boolean;
        loading: boolean;
        items: NotificationSummary[];
        unreadCount: number;
        errorMessage: string | null;
        busyId: string | null;
        readAllBusy: boolean;
    };

    lobbyBrowser: {
        rooms: LobbyRoomSummary[];
        loading: boolean;
        loaded: boolean;
        busy: boolean;
        errorMessage: string | null;
        joinCode: string;
        createPrivate: boolean;
    };

    leaderboard: LeaderboardViewState;

    profileFriend: ProfileFriendUiState;

    quickPlay: {
        loading: boolean;
        errorMessage: string | null;
        activeGame: string | null;
        ticket: MatchmakingResponse | null;
        startedAtMs: number | null;
        leaving: boolean;
        matchedCountdown: number | null;
    };

    homeMatchmaking: {
        joinCode: string;
        busy: boolean;
        errorMessage: string | null;
    };
};

export type AppAction =
    | { type: 'AUTH_INITIALIZED'; user: AppState['auth']['user']; avatar: AppState['auth']['avatar'] }
    | { type: 'AUTH_SIGNED_OUT' }

    | { type: 'SET_LANG'; lang: Lang }
    | { type: 'SET_VIEW'; view: View; route: AppRoute }
    | { type: 'SET_THEME'; theme: ThemeId }
    | { type: 'TOGGLE_SIDEBAR' }

    | { type: 'NOTIFICATIONS_OPEN' }
    | { type: 'NOTIFICATIONS_CLOSE' }
    | { type: 'NOTIFICATIONS_LOADED'; items: NotificationSummary[]; unreadCount: number }
    | { type: 'NOTIFICATIONS_LOADING' }
    | { type: 'NOTIFICATIONS_ERROR'; message: string }
    | { type: 'NOTIFICATION_READ'; id: string }
    | { type: 'NOTIFICATIONS_ALL_READ' }
    | { type: 'NOTIFICATIONS_BUSY'; id: string | null }
    | { type: 'NOTIFICATIONS_CLEAR' }

    | { type: 'LOBBY_LOADING' }
    | { type: 'LOBBY_LOADED'; rooms: LobbyRoomSummary[] }
    | { type: 'LOBBY_ERROR'; message: string }
    | { type: 'LOBBY_SET_JOIN_CODE'; code: string }
    | { type: 'LOBBY_SET_CREATE_PRIVATE'; value: boolean }
    | { type: 'LOBBY_SET_BUSY'; busy: boolean }
    | { type: 'LOBBY_RESET_LOADED' }

    | { type: 'LEADERBOARD_LOADING' }
    | { type: 'LEADERBOARD_LOADED'; data: LeaderboardViewState['data'] }
    | { type: 'LEADERBOARD_ERROR'; message: string }
    | { type: 'LEADERBOARD_SET_GAME'; game: LeaderboardViewState['game'] }

    | { type: 'PROFILE_FRIEND_SET_USERNAME'; username: string }
    | { type: 'PROFILE_FRIEND_SENDING'; value: boolean }
    | { type: 'PROFILE_FRIEND_ERROR'; message: string | null }
    | { type: 'PROFILE_FRIEND_BUSY_FRIENDSHIP'; id: string | null }
    | { type: 'PROFILE_FRIEND_BUSY_CHALLENGE'; userId: string | null }
    | { type: 'PROFILE_FRIEND_RESET' }

    | { type: 'QUICK_PLAY_LOADING'; gameType: string }
    | { type: 'QUICK_PLAY_STARTED'; ticket: MatchmakingResponse; startedAtMs: number }
    | { type: 'QUICK_PLAY_TICKET_UPDATE'; ticket: MatchmakingResponse }
    | { type: 'QUICK_PLAY_MATCHED'; countdown: number }
    | { type: 'QUICK_PLAY_TICK'; countdown: number }
    | { type: 'QUICK_PLAY_RESET' }
    | { type: 'QUICK_PLAY_ERROR'; message: string }
    | { type: 'QUICK_PLAY_LEAVING'; value: boolean }

    | { type: 'HOME_MATCHMAKING_SET_CODE'; code: string }
    | { type: 'HOME_MATCHMAKING_SET_BUSY'; busy: boolean }
    | { type: 'HOME_MATCHMAKING_ERROR'; message: string | null };

type Listener = (state: AppState) => void;

export function createAppStore(initial: AppState) {
    let state = initial;
    const listeners = new Set<Listener>();

    const getState = () => state;

    const subscribe = (listener: Listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
    };

    const dispatch = (action: AppAction) => {
        console.log('[app-store]', action.type, action);
        const next = reducer(state, action);
        if (next === state) return;
        state = next;
        listeners.forEach(l => l(state));
    };

    return { getState, subscribe, dispatch };
}

function reducer(state: AppState, action: AppAction): AppState {
    switch (action.type) {
        case 'AUTH_INITIALIZED':
            return { ...state, auth: { initialized: true, user: action.user, avatar: action.avatar } };
        case 'AUTH_SIGNED_OUT':
            return { ...state, auth: { initialized: true, user: null, avatar: null } };

        case 'SET_LANG':   return { ...state, lang: action.lang };
        case 'SET_THEME':  return { ...state, theme: action.theme };
        case 'SET_VIEW':   return { ...state, view: action.view, route: action.route };
        case 'TOGGLE_SIDEBAR': return { ...state, sidebarCollapsed: !state.sidebarCollapsed };

        case 'NOTIFICATIONS_OPEN':    return { ...state, notifications: { ...state.notifications, open: true } };
        case 'NOTIFICATIONS_CLOSE':   return { ...state, notifications: { ...state.notifications, open: false } };
        case 'NOTIFICATIONS_LOADING': return { ...state, notifications: { ...state.notifications, loading: true, errorMessage: null } };
        case 'NOTIFICATIONS_LOADED':  return { ...state, notifications: { ...state.notifications, loading: false, items: action.items, unreadCount: action.unreadCount } };
        case 'NOTIFICATIONS_ERROR':   return { ...state, notifications: { ...state.notifications, loading: false, errorMessage: action.message } };
        case 'NOTIFICATIONS_ALL_READ': return { ...state, notifications: { ...state.notifications, items: state.notifications.items.map(i => ({ ...i, read: true })), unreadCount: 0, readAllBusy: false } };
        case 'NOTIFICATION_READ':     return { ...state, notifications: { ...state.notifications, items: state.notifications.items.map(i => i.id === action.id ? { ...i, read: true } : i) } };
        case 'NOTIFICATIONS_BUSY':    return { ...state, notifications: { ...state.notifications, busyId: action.id } };
        case 'NOTIFICATIONS_CLEAR':   return { ...state, notifications: { ...state.notifications, items: [], unreadCount: 0, errorMessage: null, loading: false, open: false } };

        case 'LOBBY_LOADING': return { ...state, lobbyBrowser: { ...state.lobbyBrowser, loading: true, errorMessage: null } };
        case 'LOBBY_LOADED':  return { ...state, lobbyBrowser: { ...state.lobbyBrowser, loading: false, loaded: true, rooms: action.rooms } };
        case 'LOBBY_ERROR':   return { ...state, lobbyBrowser: { ...state.lobbyBrowser, loading: false, errorMessage: action.message } };
        case 'LOBBY_SET_JOIN_CODE':      return { ...state, lobbyBrowser: { ...state.lobbyBrowser, joinCode: action.code } };
        case 'LOBBY_SET_CREATE_PRIVATE': return { ...state, lobbyBrowser: { ...state.lobbyBrowser, createPrivate: action.value } };
        case 'LOBBY_SET_BUSY':           return { ...state, lobbyBrowser: { ...state.lobbyBrowser, busy: action.busy } };
        case 'LOBBY_RESET_LOADED':       return { ...state, lobbyBrowser: { ...state.lobbyBrowser, loaded: false } };

        case 'LEADERBOARD_LOADING': return { ...state, leaderboard: { ...state.leaderboard, loading: true, errorMessage: null } };
        case 'LEADERBOARD_LOADED':  return { ...state, leaderboard: { ...state.leaderboard, loading: false, data: action.data } };
        case 'LEADERBOARD_ERROR':   return { ...state, leaderboard: { ...state.leaderboard, loading: false, errorMessage: action.message } };
        case 'LEADERBOARD_SET_GAME': return { ...state, leaderboard: { ...state.leaderboard, game: action.game, data: null, errorMessage: null } };

        case 'PROFILE_FRIEND_SET_USERNAME':    return { ...state, profileFriend: { ...state.profileFriend, addUsername: action.username } };
        case 'PROFILE_FRIEND_SENDING':         return { ...state, profileFriend: { ...state.profileFriend, sending: action.value } };
        case 'PROFILE_FRIEND_ERROR':           return { ...state, profileFriend: { ...state.profileFriend, errorMessage: action.message } };
        case 'PROFILE_FRIEND_BUSY_FRIENDSHIP': return { ...state, profileFriend: { ...state.profileFriend, busyFriendshipId: action.id } };
        case 'PROFILE_FRIEND_BUSY_CHALLENGE':  return { ...state, profileFriend: { ...state.profileFriend, busyChallengeUserId: action.userId } };
        case 'PROFILE_FRIEND_RESET':           return { ...state, profileFriend: { addUsername: '', sending: false, busyFriendshipId: null, busyChallengeUserId: null, errorMessage: null } };

        case 'QUICK_PLAY_LOADING':       return { ...state, quickPlay: { ...state.quickPlay, loading: true, errorMessage: null, activeGame: action.gameType, ticket: null, startedAtMs: null, leaving: false, matchedCountdown: null } };
        case 'QUICK_PLAY_STARTED':       return { ...state, quickPlay: { ...state.quickPlay, loading: false, ticket: action.ticket, startedAtMs: action.startedAtMs, activeGame: action.ticket.gameType } };
        case 'QUICK_PLAY_TICKET_UPDATE': return { ...state, quickPlay: { ...state.quickPlay, ticket: action.ticket, activeGame: action.ticket.gameType } };
        case 'QUICK_PLAY_MATCHED':       return { ...state, quickPlay: { ...state.quickPlay, matchedCountdown: action.countdown } };
        case 'QUICK_PLAY_TICK':          return { ...state, quickPlay: { ...state.quickPlay, matchedCountdown: action.countdown } };
        case 'QUICK_PLAY_RESET':         return { ...state, quickPlay: { loading: false, errorMessage: null, activeGame: null, ticket: null, startedAtMs: null, leaving: false, matchedCountdown: null } };
        case 'QUICK_PLAY_ERROR':         return { ...state, quickPlay: { ...state.quickPlay, loading: false, errorMessage: action.message } };
        case 'QUICK_PLAY_LEAVING':       return { ...state, quickPlay: { ...state.quickPlay, leaving: action.value } };

        case 'HOME_MATCHMAKING_SET_CODE':  return { ...state, homeMatchmaking: { ...state.homeMatchmaking, joinCode: action.code } };
        case 'HOME_MATCHMAKING_SET_BUSY':  return { ...state, homeMatchmaking: { ...state.homeMatchmaking, busy: action.busy } };
        case 'HOME_MATCHMAKING_ERROR':     return { ...state, homeMatchmaking: { ...state.homeMatchmaking, errorMessage: action.message } };

        default: return state;
    }
}
