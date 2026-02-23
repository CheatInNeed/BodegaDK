export type View = 'home' | 'play' | 'settings' | 'help' | 'room';

export type AppRoute = {
    view: View;
    game: string | null;
    room: string | null;
    token: string | null;
    mock: boolean;
};

export function readRoute(): AppRoute {
    const params = new URLSearchParams(window.location.search);
    const view = parseView(params.get('view'));

    return {
        view,
        game: params.get('game'),
        room: params.get('room'),
        token: params.get('token'),
        mock: params.get('mock') === '1',
    };
}

export function writeRoute(patch: Partial<AppRoute>) {
    const current = readRoute();
    const next: AppRoute = {
        ...current,
        ...patch,
    };

    const params = new URLSearchParams(window.location.search);
    params.set('view', next.view);

    setNullable(params, 'game', next.game);
    setNullable(params, 'room', next.room);
    setNullable(params, 'token', next.token);

    if (next.mock) {
        params.set('mock', '1');
    } else {
        params.delete('mock');
    }

    const query = params.toString();
    const nextUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
    window.history.pushState({}, '', nextUrl);
}

function parseView(value: string | null): View {
    if (value === 'home' || value === 'play' || value === 'settings' || value === 'help' || value === 'room') {
        return value;
    }

    return 'play';
}

function setNullable(params: URLSearchParams, key: string, value: string | null) {
    if (value && value.trim().length > 0) {
        params.set(key, value);
    } else {
        params.delete(key);
    }
}
