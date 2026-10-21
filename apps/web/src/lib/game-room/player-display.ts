const DEFAULT_GUEST_LABEL = 'Guest';

export function buildPlayerNameMap(
    value: unknown,
    options?: { selfPlayerId?: string | null; selfUsername?: string | null },
): Record<string, string> {
    if (!Array.isArray(value)) {
        return {};
    }

    const playerNames: Record<string, string> = {};
    for (const entry of value) {
        const player = readPlayerEntry(entry);
        if (!player) continue;

        const preferredName = player.playerId === options?.selfPlayerId
            ? firstNonEmpty(options?.selfUsername, player.username, player.name)
            : firstNonEmpty(player.username, player.name);

        playerNames[player.playerId] = formatPlayerDisplayName(player.playerId, preferredName);
    }

    return playerNames;
}

export function formatPlayerDisplayName(playerId: string | null | undefined, username?: string | null): string {
    const preferredName = firstNonEmpty(username);
    if (preferredName) {
        return preferredName;
    }

    return DEFAULT_GUEST_LABEL;
}

export function resolvePlayerName(playerNames: Record<string, string>, playerId: string | null | undefined): string {
    if (!playerId) {
        return DEFAULT_GUEST_LABEL;
    }

    return playerNames[playerId] ?? formatPlayerDisplayName(playerId);
}

function readPlayerEntry(value: unknown): { playerId: string; username?: string | null; name?: string | null } | null {
    if (typeof value === 'string') {
        return { playerId: value };
    }

    if (!value || typeof value !== 'object') {
        return null;
    }

    const record = value as {
        playerId?: unknown;
        username?: unknown;
        name?: unknown;
    };
    if (typeof record.playerId !== 'string') {
        return null;
    }

    return {
        playerId: record.playerId,
        username: typeof record.username === 'string' ? record.username : null,
        name: typeof record.name === 'string' ? record.name : null,
    };
}

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
    for (const value of values) {
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }
    return null;
}
