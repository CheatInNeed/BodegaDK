export function resolveApiBaseUrl(): string {
    if (window.location.port === '5173') {
        return `${window.location.protocol}//${window.location.hostname}:8080/api`;
    }

    return `${window.location.origin}/api`;
}

export function resolveWsUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

    if (window.location.port === '5173') {
        return `${protocol}//${window.location.hostname}:8080/ws`;
    }

    return `${protocol}//${window.location.host}/ws`;
}
