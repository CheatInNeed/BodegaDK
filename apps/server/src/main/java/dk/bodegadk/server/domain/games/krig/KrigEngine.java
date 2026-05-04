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
    private static final String WAR_DEMO_DECK = "war-demo";
    private final String deckMode;

    public KrigEngine() {
        this(readDeckMode());
    }

    KrigEngine(String deckMode) {
        this.deckMode = deckMode == null ? "" : deckMode.trim().toLowerCase();
    }

    @Override public String gameId() { return "krig"; }
    @Override public int minPlayers() { return PLAYER_COUNT; }
    @Override public int maxPlayers() { return PLAYER_COUNT; }

    @Override
    public KrigState init(List<String> playerIds) {
        if (playerIds.size() != PLAYER_COUNT) {
            throw new GameRuleException("Krig requires exactly 2 players.");
        }

        KrigState state = new KrigState(playerIds);
        List<List<Card>> hands = WAR_DEMO_DECK.equals(deckMode)
                ? warDemoHands()
                : Deck.standard52().shuffle().deal(PLAYER_COUNT);
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
        // During a war flip the decisive card may be the last card — allow it through;
        // resolveWarFlip handles the empty-pile case via drawFaceUpIfAvailable.
        if (state.warPhase() != KrigState.WarPhase.AWAITING_WAR_FLIP
                && state.drawPiles().getOrDefault(action.playerId(), List.of()).isEmpty()) {
            throw new GameRuleException("You have no cards left to flip.");
        }
    }

    @Override
    public KrigState apply(KrigAction action, KrigState state) {
        validate(action, state);
        KrigState next = state.copy();

        // War flip path — must be checked before the normal readyPlayerIds.isEmpty() guard
        if (next.warPhase() == KrigState.WarPhase.AWAITING_WAR_FLIP) {
            next.readyPlayerIds().add(action.playerId());
            next.setStatusText("Waiting for both players to flip their war card.");
            if (next.readyPlayerIds().size() < PLAYER_COUNT) {
                return next;
            }
            next.readyPlayerIds().clear();
            resolveWarFlip(next);
            return next;
        }

        // Normal flip path
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

        if (resolution.tie) {
            state.setWarDepth(state.warDepth() + 1);
            placeWarStakes(state, firstPlayerId);
            placeWarStakes(state, secondPlayerId);
            state.setWarPhase(KrigState.WarPhase.AWAITING_WAR_FLIP);
            state.setPresentationEventId(state.presentationEventId() + 1);
            state.setLastTrick(new KrigState.TrickResult(
                    state.trickNumber(),
                    firstPlayerId, resolution.firstCard.toString(),
                    secondPlayerId, resolution.secondCard.toString(),
                    null, "TIE",
                    state.centerPile().size(),
                    state.warDepth()
            ));
            state.setStatusText("KRIG! Flip your war card!");
            return;
        }

        finalizeResolution(state, firstPlayerId, resolution.firstCard, secondPlayerId, resolution.secondCard,
                resolution.winnerPlayerId, resolution.outcome);
    }

    private void resolveWarFlip(KrigState state) {
        String firstPlayerId = state.playerIds().get(0);
        String secondPlayerId = state.playerIds().get(1);

        Card firstCard = drawFaceUpIfAvailable(state, firstPlayerId);
        Card secondCard = drawFaceUpIfAvailable(state, secondPlayerId);

        if (firstCard == null && secondCard == null) {
            state.setWarPhase(KrigState.WarPhase.NONE);
            finishGame(state, null, "War cannot continue.");
            return;
        }

        String winnerId;
        String outcome;

        if (firstCard == null) {
            winnerId = secondPlayerId;
            outcome = "SECOND";
        } else if (secondCard == null) {
            winnerId = firstPlayerId;
            outcome = "FIRST";
        } else if (firstCard.value() > secondCard.value()) {
            winnerId = firstPlayerId;
            outcome = "FIRST";
        } else if (secondCard.value() > firstCard.value()) {
            winnerId = secondPlayerId;
            outcome = "SECOND";
        } else {
            // Cascading war
            state.setWarDepth(state.warDepth() + 1);
            placeWarStakes(state, firstPlayerId);
            placeWarStakes(state, secondPlayerId);
            state.setWarPhase(KrigState.WarPhase.AWAITING_WAR_FLIP);
            state.setPresentationEventId(state.presentationEventId() + 1);
            state.setLastTrick(new KrigState.TrickResult(
                    state.trickNumber(),
                    firstPlayerId, firstCard.toString(),
                    secondPlayerId, secondCard.toString(),
                    null, "TIE",
                    state.centerPile().size(),
                    state.warDepth()
            ));
            state.setStatusText("KRIG igen! Flip your war card again!");
            return;
        }

        state.setWarPhase(KrigState.WarPhase.NONE);
        finalizeResolution(state, firstPlayerId, firstCard, secondPlayerId, secondCard, winnerId, outcome);
    }

    private void finalizeResolution(KrigState state, String firstPlayerId, Card firstCard,
                                    String secondPlayerId, Card secondCard, String winnerId, String outcome) {
        int cardsWon = state.centerPile().size();
        awardCenterPile(state, winnerId);
        state.setPresentationEventId(state.presentationEventId() + 1);
        state.setLastTrick(new KrigState.TrickResult(
                state.trickNumber(),
                firstPlayerId, firstCard == null ? null : firstCard.toString(),
                secondPlayerId, secondCard == null ? null : secondCard.toString(),
                winnerId, outcome,
                cardsWon,
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
        state.setWarPhase(KrigState.WarPhase.NONE);
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

    private static String readDeckMode() {
        String propertyValue = System.getProperty("bodegadk.krig.deck");
        if (propertyValue != null && !propertyValue.isBlank()) {
            return propertyValue;
        }
        return System.getenv("BODEGADK_KRIG_DECK");
    }

    private List<List<Card>> warDemoHands() {
        List<Card> firstPile = new ArrayList<>(List.of(
                new Card("H", "7"),
                new Card("H", "2"),
                new Card("H", "3"),
                new Card("H", "4"),
                new Card("H", "A")
        ));
        List<Card> secondPile = new ArrayList<>(List.of(
                new Card("S", "7"),
                new Card("S", "2"),
                new Card("S", "3"),
                new Card("S", "4"),
                new Card("S", "K")
        ));

        for (Card card : Deck.standard52().deal(1).getFirst()) {
            if (firstPile.contains(card) || secondPile.contains(card)) {
                continue;
            }
            if (firstPile.size() < 26) {
                firstPile.add(card);
            } else if (secondPile.size() < 26) {
                secondPile.add(card);
            }
        }

        return List.of(firstPile, secondPile);
    }
}
