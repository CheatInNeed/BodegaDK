export type SnydPlayerRow = {
    playerId: string;
    displayName: string;
    handCount: number | null;
    isCurrentTurn: boolean;
    isSelf: boolean;
};

export type SnydViewModel = {
    roomCode: string;
    turnPlayerId: string | null;
    turnPlayerName: string;
    nextPlayerId: string | null;
    nextPlayerName: string;
    pileCount: number;
    lastClaimText: string;
    claimRankInput: string;
    isMyTurn: boolean;
    selectedCount: number;
    players: SnydPlayerRow[];
    hand: Array<{ card: string; selected: boolean }>;
};
