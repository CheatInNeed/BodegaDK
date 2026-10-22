export type FemMeld = {
    id: string;
    suit: string;
    cards: string[];
    pointsPerPlayer: Record<string, number>;
    ownerId: string;
};

export type FemPlayerInfo = {
    playerId: string;
    displayName: string;
    score: number;
    cardCount: number;
    isSelf: boolean;
    isCurrentTurn: boolean;
};

export type FemPostGame = {
    winnerLabel: string;
    scores: Array<{ name: string; score: number; isWinner: boolean }>;
};

export type FemViewModel = {
    selfPlayerId: string | null;
    players: FemPlayerInfo[];
    turnPlayerId: string | null;
    isMyTurn: boolean;
    roundNumber: number;
    phase: string;
    stockPileCount: number;
    discardPileTop: string | null;
    melds: FemMeld[];
    hand: string[];
    selectedCards: string[];
    projectedRoundScore: number;
    winnerPlayerId: string | null;
    postGame: FemPostGame | null;
    canDraw: boolean;
    canDrawDiscard: boolean;
    canTakePile: boolean;
    canLayMeld: boolean;
    canExtendMeld: boolean;
    canDiscard: boolean;
    canClose: boolean;
};
