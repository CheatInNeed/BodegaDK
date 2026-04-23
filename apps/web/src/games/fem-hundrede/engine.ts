export type Suit = { s: '♠' | '♥' | '♦' | '♣'; red: boolean };
export type Card = { id: string; rank: string; suit: Suit | null; isRed?: boolean };
export type GamePhase = 'draw' | 'play';

export type FemHundredeState = {
    playerNames: [string, string];
    scores: [number, number];
    currentPlayer: 0 | 1;
    phase: GamePhase;
    hands: [Card[], Card[]];
    melds: [Card[][], Card[][]];
    drawPileCount: number;
    discardPile: Card[];
    selected: Set<string>;
    message: string;
    toast: string | null;
};

export type GameAction =
    | { type: 'TOGGLE_SELECT'; id: string }
    | { type: 'DRAW' }
    | { type: 'TAKE_TOP' }
    | { type: 'TAKE_PILE' }
    | { type: 'LAY_MELD' }
    | { type: 'DISCARD' }
    | { type: 'BOT_TURN' }
    | { type: 'CLEAR_TOAST' }
    | { type: 'RESET' };

export const SUITS: Suit[] = [
    { s: '♠', red: false },
    { s: '♥', red: true },
    { s: '♦', red: true },
    { s: '♣', red: false },
];

export const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'] as const;

export const FACE_RANKS = ['J', 'Q', 'K'];

export const RANK_VAL: Record<string, number> = {
    A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6,
    '7': 7, '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13,
};

let _uid = 1000;

function mk(rank: string, suitSym: string): Card {
    const suit = SUITS.find((s) => s.s === suitSym) ?? SUITS[0];
    return { id: `${rank}${suitSym}`, rank, suit };
}

export function randomDrawCard(): Card {
    const r = RANKS[Math.floor(Math.random() * 13)];
    const s = SUITS[Math.floor(Math.random() * 4)];
    return { id: `drn${_uid++}`, rank: r, suit: s };
}

function randomBotDiscard(): Card {
    const r = RANKS[Math.floor(Math.random() * 13)];
    const s = SUITS[Math.floor(Math.random() * 4)];
    return { id: `bot${_uid++}`, rank: r, suit: s };
}

export function isValidMeld(cards: Card[]): boolean {
    if (!cards || cards.length < 3) return false;
    const jokers = cards.filter((c) => c.rank === 'Joker');
    const real = cards.filter((c) => c.rank !== 'Joker');
    if (real.length === 0) return jokers.length >= 3;
    const suits = [...new Set(real.map((c) => c.suit?.s))];
    if (suits.length > 1) return false;
    const vals = real.map((c) => RANK_VAL[c.rank]).filter(Boolean).sort((a, b) => a - b);
    if (!vals.length) return false;
    const range = vals[vals.length - 1] - vals[0] + 1;
    const gaps = range - vals.length;
    return gaps <= jokers.length && range <= 13;
}

export function meldScore(cards: Card[]): number {
    return cards.reduce((sum, c) => {
        if (c.rank === 'Joker') return sum + 20;
        if (FACE_RANKS.includes(c.rank)) return sum + 10;
        if (c.rank === 'A') return sum + 15;
        return sum + (RANK_VAL[c.rank] ?? 0);
    }, 0);
}

const INIT_P0_HAND: Card[] = [
    mk('A', '♥'), mk('9', '♥'), mk('Q', '♦'), mk('J', '♦'),
    mk('8', '♠'), mk('K', '♠'), mk('3', '♣'),
];

const INIT_P1_HAND: Card[] = Array.from({ length: 7 }, (_, i) => ({ id: `back${i}`, rank: '', suit: null }));

const INIT_MELDS_P0: Card[][] = [[mk('4', '♥'), mk('5', '♥'), mk('6', '♥')]];
const INIT_MELDS_P1: Card[][] = [[mk('9', '♣'), mk('10', '♣'), mk('J', '♣')]];

const INIT_DISCARD: Card[] = [mk('Q', '♠'), mk('7', '♦')];

export function makeInitialState(names?: [string, string]): FemHundredeState {
    return {
        playerNames: names ?? ['Magnus', 'Lars'],
        scores: [150, 230],
        currentPlayer: 0,
        phase: 'draw',
        hands: [[...INIT_P0_HAND], [...INIT_P1_HAND]],
        melds: [INIT_MELDS_P0.map((g) => [...g]), INIT_MELDS_P1.map((g) => [...g])],
        drawPileCount: 23,
        discardPile: [...INIT_DISCARD],
        selected: new Set(),
        message: 'Din tur — træk et kort fra bunken, eller tag aflagningsbunken',
        toast: null,
    };
}

export function applyAction(state: FemHundredeState, action: GameAction): FemHundredeState {
    switch (action.type) {
        case 'TOGGLE_SELECT': {
            if (state.phase !== 'play' || state.currentPlayer !== 0) return state;
            const sel = new Set(state.selected);
            if (sel.has(action.id)) sel.delete(action.id); else sel.add(action.id);
            return { ...state, selected: sel };
        }

        case 'DRAW': {
            if (state.phase !== 'draw' || state.currentPlayer !== 0 || state.drawPileCount < 1) return state;
            const card = randomDrawCard();
            return {
                ...state,
                hands: [[...state.hands[0], card], state.hands[1]],
                drawPileCount: state.drawPileCount - 1,
                phase: 'play',
                selected: new Set(),
                message: `${card.rank}${card.suit?.s ?? ''} trukket — læg et stik, eller vælg et kort at aflægge`,
            };
        }

        case 'TAKE_TOP': {
            if (state.phase !== 'draw' || !state.discardPile.length || state.currentPlayer !== 0) return state;
            const top = state.discardPile[state.discardPile.length - 1];
            return {
                ...state,
                hands: [[...state.hands[0], top], state.hands[1]],
                discardPile: state.discardPile.slice(0, -1),
                phase: 'play',
                selected: new Set(),
                message: `${top.rank}${top.suit?.s ?? ''} taget — læg et stik, eller vælg et kort at aflægge`,
            };
        }

        case 'TAKE_PILE': {
            if (state.phase !== 'draw' || !state.discardPile.length || state.currentPlayer !== 0) return state;
            const count = state.discardPile.length;
            return {
                ...state,
                hands: [[...state.hands[0], ...state.discardPile], state.hands[1]],
                discardPile: [],
                phase: 'play',
                selected: new Set(),
                message: `Bunke taget (${count} kort)! Læg et stik, eller aflæg et kort`,
            };
        }

        case 'LAY_MELD': {
            if (state.phase !== 'play' || state.currentPlayer !== 0) return state;
            const selCards = state.hands[0].filter((c) => state.selected.has(c.id));
            if (!isValidMeld(selCards)) return state;
            const pts = meldScore(selCards);
            return {
                ...state,
                hands: [state.hands[0].filter((c) => !state.selected.has(c.id)), state.hands[1]],
                melds: [[...state.melds[0], selCards], state.melds[1]],
                scores: [state.scores[0] + pts, state.scores[1]],
                selected: new Set(),
                message: `Stik lagt! +${pts} point — aflæg nu et kort for at afslutte din tur`,
                toast: `+${pts} point`,
            };
        }

        case 'DISCARD': {
            if (state.phase !== 'play' || state.currentPlayer !== 0) return state;
            const [selId] = [...state.selected];
            const card = state.hands[0].find((c) => c.id === selId);
            if (!card) return state;
            return {
                ...state,
                hands: [state.hands[0].filter((c) => c.id !== selId), state.hands[1]],
                discardPile: [...state.discardPile, card],
                phase: 'draw',
                currentPlayer: 1,
                selected: new Set(),
                message: `${state.playerNames[1]} tænker...`,
                toast: null,
            };
        }

        case 'BOT_TURN': {
            const botCard = randomBotDiscard();
            return {
                ...state,
                discardPile: [...state.discardPile, botCard],
                phase: 'draw',
                currentPlayer: 0,
                message: `${state.playerNames[1]} aflagde ${botCard.rank}${botCard.suit?.s ?? ''} — Din tur`,
                toast: null,
            };
        }

        case 'CLEAR_TOAST':
            return { ...state, toast: null };

        case 'RESET':
            return makeInitialState(state.playerNames);

        default:
            return state;
    }
}
