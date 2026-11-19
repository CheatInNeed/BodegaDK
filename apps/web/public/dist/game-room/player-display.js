const DEFAULT_GUEST_LABEL = 'Guest';
export function buildPlayerNameMap(value, options) {
    if (!Array.isArray(value)) {
        return {};
    }
    const playerNames = {};
    for (const entry of value) {
        const player = readPlayerEntry(entry);
        if (!player)
            continue;
        const preferredName = player.playerId === options?.selfPlayerId
            ? firstNonEmpty(options?.selfUsername, player.username, player.name)
            : firstNonEmpty(player.username, player.name);
        playerNames[player.playerId] = formatPlayerDisplayName(player.playerId, preferredName);
    }
    return playerNames;
}
export function formatPlayerDisplayName(playerId, username) {
    const preferredName = firstNonEmpty(username);
    if (preferredName) {
        return preferredName;
    }
    return DEFAULT_GUEST_LABEL;
}
export function resolvePlayerName(playerNames, playerId) {
    if (!playerId) {
        return DEFAULT_GUEST_LABEL;
    }
    return playerNames[playerId] ?? formatPlayerDisplayName(playerId);
}
function readPlayerEntry(value) {
    if (typeof value === 'string') {
        return { playerId: value };
    }
    if (!value || typeof value !== 'object') {
        return null;
    }
    const record = value;
    if (typeof record.playerId !== 'string') {
        return null;
    }
    return {
        playerId: record.playerId,
        username: typeof record.username === 'string' ? record.username : null,
        name: typeof record.name === 'string' ? record.name : null,
    };
}
function firstNonEmpty(...values) {
    for (const value of values) {
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }
    return null;
}
