import { parseCardCode } from '../games/shared/game-cards';
import type { HistoryEvent } from '../net/protocol';
import type { GameLogEntry } from './types';

/** Read `publicState.history`, dropping malformed entries. */
export function readHistory(value: unknown): HistoryEvent[] {
    if (!Array.isArray(value)) return [];
    return value.filter((entry): entry is HistoryEvent =>
        !!entry
        && typeof entry === 'object'
        && typeof (entry as HistoryEvent).seq === 'number'
        && typeof (entry as HistoryEvent).type === 'string'
        && typeof (entry as HistoryEvent).data === 'object'
        && (entry as HistoryEvent).data !== null,
    );
}

/**
 * Map server history events to log entries. `describe` returns null for event
 * types it doesn't know, which are skipped.
 */
export function toLogEntries(
    events: HistoryEvent[],
    describe: (event: HistoryEvent) => Pick<GameLogEntry, 'text' | 'kind'> | null,
): GameLogEntry[] {
    const entries: GameLogEntry[] = [];
    for (const event of events) {
        const described = describe(event);
        if (!described) continue;
        entries.push({
            id: String(event.seq),
            timestamp: typeof event.at === 'number' ? event.at : Date.now(),
            ...described,
        });
    }
    return entries;
}

/** Short display label for a card code, e.g. "HA" -> "A♥". */
export function formatCard(code: string | undefined): string {
    if (!code) return '—';
    const card = parseCardCode(code);
    if (!card) return code;
    return card.isJoker ? 'Joker' : `${card.rank}${card.suit.s}`;
}
