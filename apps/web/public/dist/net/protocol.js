/**
 * Runtime guard for untyped JSON payloads from the socket layer.
 * Returns null for unknown/unsupported message shapes.
 */
export function parseServerMessage(raw) {
    if (!isRecord(raw))
        return null;
    if (typeof raw.type !== 'string')
        return null;
    if (!isRecord(raw.payload))
        return null;
    if (raw.type === 'STATE_SNAPSHOT'
        || raw.type === 'PUBLIC_UPDATE'
        || raw.type === 'PRIVATE_UPDATE'
        || raw.type === 'ROOM_CLOSED'
        || raw.type === 'ERROR'
        || raw.type === 'GAME_FINISHED') {
        return raw;
    }
    return null;
}
/**
 * Narrow unknown values to non-null object records.
 */
function isRecord(value) {
    return typeof value === 'object' && value !== null;
}
const SUITS = ['H', 'D', 'C', 'S'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export function createDefaultCasinoValueMap() {
    const valueMap = {};
    for (const suit of SUITS) {
        for (const rank of RANKS) {
            valueMap[`${suit}${rank}`] = rankToValues(rank);
        }
    }
    return valueMap;
}
function rankToValues(rank) {
    if (rank === 'A')
        return [1, 14];
    if (rank === 'J')
        return [11];
    if (rank === 'Q')
        return [12];
    if (rank === 'K')
        return [13];
    return [Number(rank)];
}
