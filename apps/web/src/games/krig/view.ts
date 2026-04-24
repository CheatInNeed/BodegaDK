export type KrigViewModel = {
    roomCode: string;
    trickNumber: number;
    selfPlayerId: string | null;
    statusText: string;
    canFlip: boolean;
    warActive: boolean;
    warDepth: number;
    warPileSize: number;
    centerPileSize: number;
    players: Array<{
        playerId: string;
        displayName: string;
        pileCount: number;
        stakeCount: number;
        tableCard: { kind: 'face' | 'back' | 'stack' | 'empty'; cardCode?: string; size?: string };
        isSelf: boolean;
        isReady: boolean;
        isRoundWinner: boolean;
        isRoundLoser: boolean;
        callout: string | null;
    }>;
    isGameOver: boolean;
    postGame: {
        winnerLabel: string;
        isTie: boolean;
        rematchButtonLabel: string;
        rematchDisabled: boolean;
        rematchStatusText: string;
        piles: Array<{ playerId: string; displayName: string; pileCount: number }>;
    } | null;
};

export function renderKrigRoom(_vm: KrigViewModel): string {
    return `<div id="krig-root"></div>`;
}
