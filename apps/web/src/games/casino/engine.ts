const SUITS = ['H', 'D', 'C', 'S'] as const;
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;

export type CasinoValueMap = Record<string, number[]>;

export type CasinoState = {
    roomCode: string;
    players: string[];
    dealerPlayerId: string | null;
    turnPlayerId: string | null;
    tableStacks: CasinoTableStack[];
    deck: string[];
    hands: Record<string, string[]>;
    capturedCards: Record<string, string[]>;
    capturedCounts: Record<string, number>;
    lastCapturePlayerId: string | null;
    started: boolean;
    winnerPlayerId: string | null;
    finished: boolean;
    rules: {
        valueMap: CasinoValueMap;
    };
    nextStackSeq: number;
};

export type CasinoTableStack = {
    stackId: string;
    cards: string[];
    total: number;
    locked: boolean;
};

export function createShuffledDeck(seed: string): string[] {
    const deck = createFullDeck();
    let cursor = hashSeed(seed);
    for (let i = deck.length - 1; i > 0; i -= 1) {
        cursor = nextSeed(cursor);
        const j = cursor % (i + 1);
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

export function createFullDeck(): string[] {
    const deck: string[] = [];
    for (const suit of SUITS) {
        for (const rank of RANKS) {
            deck.push(`${suit}${rank}`);
        }
    }
    return deck;
}

export function validateCasinoValueMap(valueMap: CasinoValueMap): string | null {
    for (const suit of SUITS) {
        for (const rank of RANKS) {
            const code = `${suit}${rank}`;
            const values = valueMap[code];
            if (!Array.isArray(values) || values.length === 0 || values.some((value) => !Number.isFinite(value))) {
                return `Invalid or missing valueMap entry for ${code}`;
            }
        }
    }
    return null;
}

export function initializeCasinoState(params: {
    roomCode: string;
    players: string[];
    dealerPlayerId: string | null;
    rules: { valueMap: CasinoValueMap };
}): CasinoState {
    const hands: Record<string, string[]> = {};
    const capturedCards: Record<string, string[]> = {};
    const capturedCounts: Record<string, number> = {};

    for (const playerId of params.players) {
        hands[playerId] = [];
        capturedCards[playerId] = [];
        capturedCounts[playerId] = 0;
    }

    return {
        roomCode: params.roomCode,
        players: params.players,
        dealerPlayerId: params.dealerPlayerId,
        turnPlayerId: null,
        tableStacks: [],
        deck: createShuffledDeck(params.roomCode),
        hands,
        capturedCards,
        capturedCounts,
        lastCapturePlayerId: null,
        started: false,
        winnerPlayerId: null,
        finished: false,
        rules: params.rules,
        nextStackSeq: 1,
    };
}

export function startCasinoRound(state: CasinoState): string | null {
    if (state.players.length !== 2) return 'Casino requires exactly 2 players';
    if (state.started) return null;

    const nonDealer = state.players.find((playerId) => playerId !== state.dealerPlayerId) ?? state.players[0];
    const dealer = state.dealerPlayerId ?? state.players[1];
    state.dealerPlayerId = dealer;
    state.turnPlayerId = nonDealer;

    const cards = drawMany(state.deck, 4);
    state.tableStacks = cards.map((card) => makeSingleCardStack(state, card));
    dealHands(state, 4);
    state.started = true;
    return null;
}

export function applyCasinoMove(
    state: CasinoState,
    actorPlayerId: string,
    move: { handCard: string; captureStackIds: string[]; playedValue?: number },
): string | null {
    if (!state.started) return 'Game has not started yet';
    if (state.finished) return 'Game is already finished';
    if (state.turnPlayerId !== actorPlayerId) return 'Not your turn';

    const hand = state.hands[actorPlayerId] ?? [];
    if (!hand.includes(move.handCard)) return 'You do not have that card in hand';

    const effectiveValues = resolveCardValues(state.rules.valueMap, move.handCard);
    if (effectiveValues.length === 0) return `No configured value for card ${move.handCard}`;

    const captureStackIds = dedupe(move.captureStackIds);
    if (captureStackIds.length > 0) {
        const targetStacks: CasinoTableStack[] = [];
        for (const stackId of captureStackIds) {
            const stack = state.tableStacks.find((candidate) => candidate.stackId === stackId);
            if (!stack) {
                return `Capture stack ${stackId} is not on table`;
            }
            targetStacks.push(stack);
        }

        const captureTotal = targetStacks.reduce((sum, stack) => sum + stack.total, 0);
        const allowedPlayedValues = move.playedValue === undefined
            ? effectiveValues
            : effectiveValues.filter((value) => value === move.playedValue);

        if (allowedPlayedValues.length === 0) return 'Invalid playedValue for selected hand card';
        if (!allowedPlayedValues.includes(captureTotal)) return 'Capture stacks do not match the played card value';

        state.hands[actorPlayerId] = removeOneCard(hand, move.handCard);
        state.tableStacks = state.tableStacks.filter((stack) => !captureStackIds.includes(stack.stackId));

        const capturedFromTable = targetStacks.flatMap((stack) => stack.cards);
        state.capturedCards[actorPlayerId] = [...state.capturedCards[actorPlayerId], move.handCard, ...capturedFromTable];
        state.capturedCounts[actorPlayerId] += capturedFromTable.length + 1;
        state.lastCapturePlayerId = actorPlayerId;
    } else {
        state.hands[actorPlayerId] = removeOneCard(hand, move.handCard);
        state.tableStacks = [...state.tableStacks, makeSingleCardStack(state, move.handCard)];
    }

    return endTurnOrDeal(state, actorPlayerId);
}

export function applyCasinoBuildMove(
    state: CasinoState,
    actorPlayerId: string,
    move: { handCard: string; targetStackId: string; playedValue?: number },
): string | null {
    if (!state.started) return 'Game has not started yet';
    if (state.finished) return 'Game is already finished';
    if (state.turnPlayerId !== actorPlayerId) return 'Not your turn';

    const hand = state.hands[actorPlayerId] ?? [];
    if (!hand.includes(move.handCard)) return 'You do not have that card in hand';

    const stack = state.tableStacks.find((candidate) => candidate.stackId === move.targetStackId);
    if (!stack) return 'Target stack not found';
    if (stack.locked) return 'This stack is locked and cannot change value';

    const effectiveValues = resolveCardValues(state.rules.valueMap, move.handCard);
    const chosenValues = move.playedValue === undefined
        ? effectiveValues
        : effectiveValues.filter((value) => value === move.playedValue);

    if (chosenValues.length === 0) return 'Invalid playedValue for selected hand card';

    const candidateTotals = chosenValues.map((value) => ({ value, total: stack.total + value }));
    const legalCandidates = candidateTotals.filter((candidate) => (
        playerHasTotalCardInHand(state.rules.valueMap, hand, move.handCard, candidate.total)
    ));
    if (legalCandidates.length === 0) {
        return 'Build requires holding the resulting total card in hand';
    }

    const resolved = legalCandidates[0];
    state.hands[actorPlayerId] = removeOneCard(hand, move.handCard);
    stack.cards = [...stack.cards, move.handCard];
    stack.total = resolved.total;
    stack.locked = resolved.total === 7 || resolved.total === resolved.value;

    return endTurnOrDeal(state, actorPlayerId);
}

export function applyCasinoMergeMove(
    state: CasinoState,
    actorPlayerId: string,
    move: { stackIds: string[] },
): string | null {
    if (!state.started) return 'Game has not started yet';
    if (state.finished) return 'Game is already finished';
    if (state.turnPlayerId !== actorPlayerId) return 'Not your turn';

    const selectedIds = dedupe(move.stackIds);
    if (selectedIds.length < 2) return 'Select at least two stacks';

    const selectedStacks: CasinoTableStack[] = [];
    for (const stackId of selectedIds) {
        const stack = state.tableStacks.find((candidate) => candidate.stackId === stackId);
        if (!stack) return 'Selected stack not found';
        if (stack.locked) return 'Cannot merge locked stacks';
        selectedStacks.push(stack);
    }

    const newTotal = selectedStacks.reduce((sum, stack) => sum + stack.total, 0);
    const hand = state.hands[actorPlayerId] ?? [];
    const hasTotalInHand = hand.some((card) => resolveCardValues(state.rules.valueMap, card).includes(newTotal));
    if (!hasTotalInHand) {
        return `Merge requires holding a ${newTotal}-value card in hand`;
    }

    const baseStack = selectedStacks[0];
    const mergedCards = selectedStacks.flatMap((stack) => stack.cards);
    baseStack.cards = mergedCards;
    baseStack.total = newTotal;
    baseStack.locked = newTotal === 7;
    state.tableStacks = state.tableStacks.filter((stack) => !selectedIds.includes(stack.stackId) || stack.stackId === baseStack.stackId);
    return null;
}

export function finishCasinoGame(state: CasinoState) {
    if (state.finished) return;

    if (state.tableStacks.length > 0 && state.lastCapturePlayerId) {
        const leftovers = state.tableStacks.flatMap((stack) => stack.cards);
        state.capturedCards[state.lastCapturePlayerId] = [...state.capturedCards[state.lastCapturePlayerId], ...leftovers];
        state.capturedCounts[state.lastCapturePlayerId] += leftovers.length;
        state.tableStacks = [];
    }

    const [p1, p2] = state.players;
    const c1 = state.capturedCounts[p1] ?? 0;
    const c2 = state.capturedCounts[p2] ?? 0;
    state.winnerPlayerId = c1 === c2 ? null : (c1 > c2 ? p1 : p2);
    state.finished = true;
    state.turnPlayerId = null;
}

function endTurnOrDeal(state: CasinoState, actorPlayerId: string): string | null {
    if (allHandsEmpty(state)) {
        if (state.deck.length > 0) {
            dealHands(state, 4);
            state.turnPlayerId = state.players.find((playerId) => playerId !== state.dealerPlayerId) ?? state.players[0];
            return null;
        }
        finishCasinoGame(state);
        return null;
    }

    state.turnPlayerId = nextPlayer(state.players, actorPlayerId);
    return null;
}

function playerHasTotalCardInHand(
    valueMap: CasinoValueMap,
    hand: string[],
    playedCard: string,
    total: number,
): boolean {
    let skippedPlayed = false;
    for (const card of hand) {
        if (!skippedPlayed && card === playedCard) {
            skippedPlayed = true;
            continue;
        }
        if (resolveCardValues(valueMap, card).includes(total)) return true;
    }
    return false;
}

function makeSingleCardStack(state: CasinoState, card: string): CasinoTableStack {
    const topValue = resolveSingleValue(state.rules.valueMap, card);
    return {
        stackId: `s${state.nextStackSeq++}`,
        cards: [card],
        total: topValue,
        locked: topValue === 7,
    };
}

function dealHands(state: CasinoState, cardsPerPlayer: number) {
    for (let i = 0; i < cardsPerPlayer; i += 1) {
        for (const playerId of state.players) {
            const card = state.deck.shift();
            if (!card) return;
            state.hands[playerId] = [...state.hands[playerId], card];
        }
    }
}

function drawMany(deck: string[], count: number): string[] {
    const drawn: string[] = [];
    for (let i = 0; i < count; i += 1) {
        const card = deck.shift();
        if (!card) break;
        drawn.push(card);
    }
    return drawn;
}

function allHandsEmpty(state: CasinoState): boolean {
    return state.players.every((playerId) => (state.hands[playerId]?.length ?? 0) === 0);
}

function resolveCardValues(valueMap: CasinoValueMap, card: string): number[] {
    const values = valueMap[card];
    if (!Array.isArray(values)) return [];
    return values.filter((value): value is number => Number.isFinite(value));
}

function resolveSingleValue(valueMap: CasinoValueMap, card: string): number {
    const values = resolveCardValues(valueMap, card);
    return values[0] ?? Number.NaN;
}

function removeOneCard(cards: string[], card: string): string[] {
    const next = [...cards];
    const idx = next.indexOf(card);
    if (idx >= 0) next.splice(idx, 1);
    return next;
}

function nextPlayer(players: string[], current: string): string | null {
    const idx = players.indexOf(current);
    if (idx < 0 || players.length === 0) return null;
    return players[(idx + 1) % players.length];
}

function dedupe(values: string[]): string[] {
    return [...new Set(values)];
}

function hashSeed(seed: string): number {
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) {
        hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    }
    return hash || 1;
}

function nextSeed(seed: number): number {
    return (seed * 1664525 + 1013904223) >>> 0;
}
