export type CasinoViewModel = {
    roomCode: string;
    players: Array<{ playerId: string; displayName: string }>;
    turnPlayerId: string | null;
    turnPlayerName: string;
    dealerPlayerId: string | null;
    tableStacks: Array<{
        stackId: string;
        cards: string[];
        total: number;
        locked: boolean;
        topCard: string;
    }>;
    hand: Array<{
        card: string;
        selected: boolean;
    }>;
    deckCount: number;
    capturedCounts: Record<string, number>;
    started: boolean;
    isMyTurn: boolean;
    selfPlayerId: string | null;
    selectedHandCard: string | null;
};
