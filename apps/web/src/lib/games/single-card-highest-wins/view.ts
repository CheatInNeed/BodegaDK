export type SingleCardHighestWinsViewModel = {
    roomCode: string;
    dealerLabel: string;
    playerLabel: string;
    middleCard: string;
    scoreYou: number;
    scoreDealer: number;
    feedbackText: string;
    lastPlayerCard: string | null;
    lastDealerCard: string | null;
    hand: Array<{ card: string; selected: boolean }>;
    selectedCard: string | null;
};
