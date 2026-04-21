package dk.bodegadk.server.domain.games.krig;

import dk.bodegadk.server.domain.engine.GameEngine;
import dk.bodegadk.server.domain.engine.GameState;
import dk.bodegadk.server.domain.primitives.Card;
import dk.bodegadk.server.domain.primitives.Deck;

import java.util.ArrayList;
import java.util.List;

public class KrigEngine implements GameEngine<KrigState, KrigAction> {
    private static final int PLAYER_COUNT = 2;
    private static final int WAR_STAKE_CARDS = 3;

    @Override public String gameId() { return "krig"; }
    @Override public int minPlayers() { return PLAYER_COUNT; }
    @Override public int maxPlayers() { return PLAYER_COUNT; }

    @Override
    public KrigState init(List<String> playerIds) {
        if (playerIds.size() != PLAYER_COUNT) {
            throw new GameRuleException("Krig requires exactly 2 players.");
        }

        KrigState state = new KrigState(playerIds);
        List<List<Card>> hands = Deck.standard52().shuffle().deal(PLAYER_COUNT);
        for (int i = 0; i < PLAYER_COUNT; i++) {
            state.drawPiles().put(playerIds.get(i), new ArrayList<>(hands.get(i)));
        }
        state.setPhase(GameState.Phase.PLAYING);
        return state;
    }

    @Override
    public void validate(KrigAction action, KrigState state) throws GameRuleException {
        if (state.isFinished()) {
            throw new GameRuleException("Game is already finished.");
        }
        if (!state.playerIds().contains(action.playerId())) {
            throw new GameRuleException("Player not in game.");
        }
        if (state.readyPlayerIds().contains(action.playerId())) {
            throw new GameRuleException("You are already ready for this flip.");
        }
        if (state.drawPiles().getOrDefault(action.playerId(), List.of()).isEmpty()) {
            throw new GameRuleException("You have no cards left to flip.");
        }
    }

    @Override
    public KrigState apply(KrigAction action, KrigState state) {
        validate(action, state);
        KrigState next = state.copy();
        if (next.readyPlayerIds().isEmpty()) {
            prepareNextFlip(next);
        }
        next.readyPlayerIds().add(action.playerId());
        next.setStatusText("Waiting for both players to flip.");

        if (next.readyPlayerIds().size() < PLAYER_COUNT) {
            return next;
        }

        resolveTrick(next);
        return next;
    }

    public KrigState requestRematch(String playerId, KrigState state) {
        if (!state.isFinished()) {
            throw new GameRuleException("Game is not over yet.");
        }
        if (!state.playerIds().contains(playerId)) {
            throw new GameRuleException("Player not in game.");
        }

        KrigState next = state.copy();
        next.rematchPlayerIds().add(playerId);
        if (next.rematchPlayerIds().size() < PLAYER_COUNT) {
            return next;
        }

        return init(state.playerIds());
    }

    @Override
    public boolean isFinished(KrigState state) {
        return state.isFinished();
    }

    @Override
    public String getWinner(KrigState state) {
        return state.winnerPlayerId();
    }

    private void resolveTrick(KrigState state) {
        state.readyPlayerIds().clear();
        prepareNextFlip(state);
        snapshotDrawPileCounts(state);

        String firstPlayerId = state.playerIds().get(0);
        String secondPlayerId = state.playerIds().get(1);
        Resolution resolution = flipBattleCards(state, firstPlayerId, secondPlayerId);

        while (resolution.winnerPlayerId == null && resolution.tie) {
            state.setWarDepth(state.warDepth() + 1);
            resolution = continueWar(state, firstPlayerId, secondPlayerId);
        }

        if (resolution.winnerPlayerId == null) {
            finishGame(state, null, "War cannot continue.");
            return;
        }

        awardCenterPile(state, resolution.winnerPlayerId);
        state.setLastTrick(new KrigState.TrickResult(
                state.trickNumber(),
                firstPlayerId,
                resolution.firstCard == null ? null : resolution.firstCard.toString(),
                secondPlayerId,
                resolution.secondCard == null ? null : resolution.secondCard.toString(),
                resolution.winnerPlayerId,
                resolution.outcome,
                resolution.cardsWon,
                state.warDepth()
        ));

        if (state.drawPiles().get(firstPlayerId).isEmpty()) {
            finishGame(state, secondPlayerId, "Game over.");
            return;
        }
        if (state.drawPiles().get(secondPlayerId).isEmpty()) {
            finishGame(state, firstPlayerId, "Game over.");
            return;
        }

        state.setTrickNumber(state.trickNumber() + 1);
        state.setStatusText(state.warDepth() > 0 ? "War resolved. Ready for the next flip." : "Trick resolved. Ready for the next flip.");
    }

    private void prepareNextFlip(KrigState state) {
        state.centerPile().clear();
        state.currentFaceUpCards().clear();
        state.drawPileCountsBeforeTrick().clear();
        state.setLastTrick(null);
        state.setWarDepth(0);
    }

    private void snapshotDrawPileCounts(KrigState state) {
        state.drawPileCountsBeforeTrick().clear();
        for (String playerId : state.playerIds()) {
            state.drawPileCountsBeforeTrick().put(playerId, state.drawPiles().getOrDefault(playerId, List.of()).size());
        }
    }

    private Resolution flipBattleCards(KrigState state, String firstPlayerId, String secondPlayerId) {
        Card firstCard = drawFaceUp(state, firstPlayerId);
        Card secondCard = drawFaceUp(state, secondPlayerId);
        return compareFaceUpCards(firstPlayerId, firstCard, secondPlayerId, secondCard, state.centerPile().size());
    }

    private Resolution continueWar(KrigState state, String firstPlayerId, String secondPlayerId) {
        placeWarStakes(state, firstPlayerId);
        placeWarStakes(state, secondPlayerId);

        Card firstCard = drawFaceUpIfAvailable(state, firstPlayerId);
        Card secondCard = drawFaceUpIfAvailable(state, secondPlayerId);

        if (firstCard == null && secondCard == null) {
            return new Resolution(null, null, null, "TIE", true, state.centerPile().size());
        }
        if (firstCard == null) {
            return new Resolution(secondPlayerId, null, secondCard, "SECOND", false, state.centerPile().size());
        }
        if (secondCard == null) {
            return new Resolution(firstPlayerId, firstCard, null, "FIRST", false, state.centerPile().size());
        }

        return compareFaceUpCards(firstPlayerId, firstCard, secondPlayerId, secondCard, state.centerPile().size());
    }

    private void placeWarStakes(KrigState state, String playerId) {
        List<Card> pile = state.drawPiles().get(playerId);
        int stakeCount = Math.min(WAR_STAKE_CARDS, Math.max(0, pile.size() - 1));
        for (int i = 0; i < stakeCount; i++) {
            Card card = pile.removeFirst();
            state.centerPile().add(new KrigState.CenterCard(playerId, card.toString(), false));
        }
    }

    private Card drawFaceUp(KrigState state, String playerId) {
        Card card = state.drawPiles().get(playerId).removeFirst();
        state.centerPile().add(new KrigState.CenterCard(playerId, card.toString(), true));
        state.currentFaceUpCards().put(playerId, card);
        return card;
    }

    private Card drawFaceUpIfAvailable(KrigState state, String playerId) {
        List<Card> pile = state.drawPiles().get(playerId);
        if (pile.isEmpty()) {
            state.currentFaceUpCards().put(playerId, null);
            return null;
        }
        return drawFaceUp(state, playerId);
    }

    private Resolution compareFaceUpCards(String firstPlayerId, Card firstCard, String secondPlayerId, Card secondCard, int cardsWon) {
        if (firstCard.value() > secondCard.value()) {
            return new Resolution(firstPlayerId, firstCard, secondCard, "FIRST", false, cardsWon);
        }
        if (secondCard.value() > firstCard.value()) {
            return new Resolution(secondPlayerId, firstCard, secondCard, "SECOND", false, cardsWon);
        }
        return new Resolution(null, firstCard, secondCard, "TIE", true, cardsWon);
    }

    private void awardCenterPile(KrigState state, String winnerPlayerId) {
        List<Card> winnerPile = state.drawPiles().get(winnerPlayerId);
        for (KrigState.CenterCard centerCard : state.centerPile()) {
            winnerPile.add(Card.parse(centerCard.card()));
        }
    }

    private void finishGame(KrigState state, String winnerPlayerId, String statusText) {
        state.setPhase(GameState.Phase.FINISHED);
        state.rematchPlayerIds().clear();
        state.setWinnerPlayerId(winnerPlayerId);
        state.setStatusText(statusText);
    }

    private record Resolution(
            String winnerPlayerId,
            Card firstCard,
            Card secondCard,
            String outcome,
            boolean tie,
            int cardsWon
    ) {
    }
}
