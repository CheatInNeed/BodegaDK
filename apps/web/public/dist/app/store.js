export function createAppStore(initial) {
    let state = initial;
    const listeners = new Set();
    const getState = () => state;
    const subscribe = (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
    };
    const dispatch = (action) => {
        console.log('[app-store]', action.type, action);
        const next = reducer(state, action);
        if (next === state)
            return;
        state = next;
        listeners.forEach(l => l(state));
    };
    return { getState, subscribe, dispatch };
}
function reducer(state, action) {
    switch (action.type) {
        case 'AUTH_INITIALIZED':
            if (state.auth.initialized && state.auth.user === action.user && state.auth.avatar === action.avatar)
                return state;
            return { ...state, auth: { initialized: true, user: action.user, avatar: action.avatar } };
        case 'AUTH_SIGNED_OUT':
            return { ...state, auth: { initialized: true, user: null, avatar: null } };
        case 'SET_LANG': return { ...state, lang: action.lang };
        case 'SET_THEME': return { ...state, theme: action.theme };
        case 'SET_VIEW': {
            if (state.view === action.view && state.route.game === action.route.game && state.route.room === action.route.room && state.route.mock === action.route.mock)
                return state;
            if (state.view === action.view)
                return { ...state, route: action.route };
            // Failed list loads are not retried on re-render; opening a view
            // again clears the error so it gets one fresh attempt.
            return {
                ...state,
                view: action.view,
                route: action.route,
                lobbyBrowser: { ...state.lobbyBrowser, errorMessage: null },
                leaderboard: { ...state.leaderboard, errorMessage: null },
            };
        }
        case 'TOGGLE_SIDEBAR': return { ...state, sidebarCollapsed: !state.sidebarCollapsed };
        case 'NOTIFICATIONS_OPEN':
            if (state.notifications.open)
                return state;
            return { ...state, notifications: { ...state.notifications, open: true } };
        case 'NOTIFICATIONS_CLOSE':
            if (!state.notifications.open)
                return state;
            return { ...state, notifications: { ...state.notifications, open: false } };
        case 'NOTIFICATIONS_LOADING': return { ...state, notifications: { ...state.notifications, loading: true, errorMessage: null } };
        case 'NOTIFICATIONS_LOADED': return { ...state, notifications: { ...state.notifications, loading: false, items: action.items, unreadCount: action.unreadCount } };
        case 'NOTIFICATIONS_ERROR': return { ...state, notifications: { ...state.notifications, loading: false, errorMessage: action.message } };
        case 'NOTIFICATIONS_ALL_READ': return { ...state, notifications: { ...state.notifications, items: state.notifications.items.map(i => ({ ...i, read: true })), unreadCount: 0, readAllBusy: false } };
        case 'NOTIFICATION_READ': return { ...state, notifications: { ...state.notifications, items: state.notifications.items.map(i => i.id === action.id ? { ...i, read: true } : i) } };
        case 'NOTIFICATIONS_BUSY': return { ...state, notifications: { ...state.notifications, busyId: action.id } };
        case 'NOTIFICATIONS_CLEAR': return { ...state, notifications: { ...state.notifications, items: [], unreadCount: 0, errorMessage: null, loading: false, open: false } };
        case 'LOBBY_LOADING': return { ...state, lobbyBrowser: { ...state.lobbyBrowser, loading: true, errorMessage: null } };
        case 'LOBBY_LOADED': return { ...state, lobbyBrowser: { ...state.lobbyBrowser, loading: false, loaded: true, rooms: action.rooms } };
        case 'LOBBY_ERROR': return { ...state, lobbyBrowser: { ...state.lobbyBrowser, loading: false, errorMessage: action.message } };
        case 'LOBBY_SET_JOIN_CODE': return { ...state, lobbyBrowser: { ...state.lobbyBrowser, joinCode: action.code } };
        case 'LOBBY_SET_CREATE_PRIVATE': return { ...state, lobbyBrowser: { ...state.lobbyBrowser, createPrivate: action.value } };
        case 'LOBBY_SET_BUSY': return { ...state, lobbyBrowser: { ...state.lobbyBrowser, busy: action.busy } };
        case 'LOBBY_RESET_LOADED': return { ...state, lobbyBrowser: { ...state.lobbyBrowser, loaded: false } };
        case 'LEADERBOARD_LOADING': return { ...state, leaderboard: { ...state.leaderboard, loading: true, errorMessage: null } };
        case 'LEADERBOARD_LOADED': return { ...state, leaderboard: { ...state.leaderboard, loading: false, data: action.data } };
        case 'LEADERBOARD_ERROR': return { ...state, leaderboard: { ...state.leaderboard, loading: false, errorMessage: action.message } };
        case 'LEADERBOARD_SET_GAME': return { ...state, leaderboard: { ...state.leaderboard, game: action.game, data: null, errorMessage: null } };
        case 'PROFILE_FRIEND_SET_USERNAME': return { ...state, profileFriend: { ...state.profileFriend, addUsername: action.username } };
        case 'PROFILE_FRIEND_SENDING': return { ...state, profileFriend: { ...state.profileFriend, sending: action.value } };
        case 'PROFILE_FRIEND_ERROR': return { ...state, profileFriend: { ...state.profileFriend, errorMessage: action.message } };
        case 'PROFILE_FRIEND_BUSY_FRIENDSHIP': return { ...state, profileFriend: { ...state.profileFriend, busyFriendshipId: action.id } };
        case 'PROFILE_FRIEND_BUSY_CHALLENGE': return { ...state, profileFriend: { ...state.profileFriend, busyChallengeUserId: action.userId } };
        case 'PROFILE_FRIEND_RESET': return { ...state, profileFriend: { addUsername: '', sending: false, busyFriendshipId: null, busyChallengeUserId: null, errorMessage: null } };
        case 'QUICK_PLAY_LOADING': return { ...state, quickPlay: { ...state.quickPlay, loading: true, errorMessage: null, activeGame: action.gameType, ticket: null, startedAtMs: null, leaving: false, matchedCountdown: null } };
        case 'QUICK_PLAY_STARTED': return { ...state, quickPlay: { ...state.quickPlay, loading: false, ticket: action.ticket, startedAtMs: action.startedAtMs, activeGame: action.ticket.gameType } };
        case 'QUICK_PLAY_TICKET_UPDATE': return { ...state, quickPlay: { ...state.quickPlay, ticket: action.ticket, activeGame: action.ticket.gameType } };
        case 'QUICK_PLAY_MATCHED': return { ...state, quickPlay: { ...state.quickPlay, matchedCountdown: action.countdown } };
        case 'QUICK_PLAY_TICK': return { ...state, quickPlay: { ...state.quickPlay, matchedCountdown: action.countdown } };
        case 'QUICK_PLAY_RESET': return { ...state, quickPlay: { loading: false, errorMessage: null, activeGame: null, ticket: null, startedAtMs: null, leaving: false, matchedCountdown: null } };
        case 'QUICK_PLAY_ERROR': return { ...state, quickPlay: { ...state.quickPlay, loading: false, errorMessage: action.message } };
        case 'QUICK_PLAY_LEAVING': return { ...state, quickPlay: { ...state.quickPlay, leaving: action.value } };
        case 'HOME_MATCHMAKING_SET_CODE': return { ...state, homeMatchmaking: { ...state.homeMatchmaking, joinCode: action.code } };
        case 'HOME_MATCHMAKING_SET_BUSY': return { ...state, homeMatchmaking: { ...state.homeMatchmaking, busy: action.busy } };
        case 'HOME_MATCHMAKING_ERROR': return { ...state, homeMatchmaking: { ...state.homeMatchmaking, errorMessage: action.message } };
        default: return state;
    }
}
