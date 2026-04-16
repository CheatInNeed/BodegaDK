package dk.bodegadk.server.domain.games.krig;

import dk.bodegadk.server.domain.engine.GameEngine;
import dk.bodegadk.server.domain.engine.GameState;
import dk.bodegadk.server.domain.primitives.Card;
import dk.bodegadk.server.domain.primitives.Deck;

import java.util.ArrayList;
import java.util.List;

public class KrigEngine implements GameEngine<KrigState, KrigAction> {
    private static final int PLAYER_COUNT = 2;
    private static final int CARDS_PER_PLAYER = 5;

    @Override public String gameId() { return "krig"; }
    @Override public int minPlayers() { return PLAYER_COUNT; }
    @Override public int maxPlayers() { return PLAYER_COUNT; }

    @Override
    public KrigState init(List<String> playerIds) {
        if (playerIds.size() != PLAYER_COUNT) {
            throw new GameRuleException("Krig requires exactly 2 players.");
        }

        KrigState state = new KrigState(playerIds);
        Deck deck = Deck.standard52().shuffle();

        for (String playerId : playerIds) {
            List<Card> hand = new ArrayList<>();
            for (int i = 0; i < CARDS_PER_PLAYER; i++) {
                hand.add(deck.draw());
            }
            state.hands().put(playerId, hand);
            state.scores().put(playerId, 0);
        }

        state.setPhase(GameState.Phase.PLAYING);
        return state;
    }

    @Override
    public void validate(KrigAction action, KrigState state) throws GameRuleException {
        if (state.isFinished()) {
            throw new GameRuleException("Game is already finished.");
        }

        List<Card> hand = state.hands().get(action.playerId());
        if (hand == null) {
            throw new GameRuleException("Player not in game.");
        }
        if (state.submittedCards().containsKey(action.playerId())) {
            throw new GameRuleException("You have already locked in a card this round.");
        }

        Card played = Card.parse(action.cardCode());
        if (!hand.contains(played)) {
            throw new GameRuleException("You do not own card: " + action.cardCode());
        }
    }

    @Override
    public KrigState apply(KrigAction action, KrigState state) {
        validate(action, state);
        KrigState next = state.copy();
        prepareNextRound(next);

        Card played = Card.parse(action.cardCode());
        List<Card> hand = next.hands().get(action.playerId());
        hand.remove(played);
        next.submittedCards().put(action.playerId(), played);

        if (next.submittedCards().size() < PLAYER_COUNT) {
            return next;
        }

        resolveRound(next);
        return next;
    }

    @Override
    public boolean isFinished(KrigState state) {
        return state.isFinished();
    }

    @Override
    public String getWinner(KrigState state) {
        return state.winnerPlayerId();
    }

    private void prepareNextRound(KrigState state) {
        if (!state.revealedCards().isEmpty()) {
            state.revealedCards().clear();
            state.setLastBattle(null);
            state.setRound(state.round() + 1);
        }
    }

    private void resolveRound(KrigState state) {
        String firstPlayerId = state.playerIds().get(0);
        String secondPlayerId = state.playerIds().get(1);
        Card firstCard = state.submittedCards().get(firstPlayerId);
        Card secondCard = state.submittedCards().get(secondPlayerId);

        String winnerPlayerId = null;
        String outcome = "TIE";
        if (firstCard.value() > secondCard.value()) {
            winnerPlayerId = firstPlayerId;
            outcome = "FIRST";
        } else if (secondCard.value() > firstCard.value()) {
            winnerPlayerId = secondPlayerId;
            outcome = "SECOND";
        }

        if (winnerPlayerId != null) {
            state.scores().put(winnerPlayerId, state.scores().getOrDefault(winnerPlayerId, 0) + 1);
        }

        state.revealedCards().clear();
        state.revealedCards().put(firstPlayerId, firstCard);
        state.revealedCards().put(secondPlayerId, secondCard);
        state.setLastBattle(new KrigState.BattleResult(
                state.round(),
                firstPlayerId,
                firstCard.toString(),
                secondPlayerId,
                secondCard.toString(),
                winnerPlayerId,
                outcome
        ));
        state.submittedCards().clear();

        boolean finished = state.hands().values().stream().allMatch(List::isEmpty);
        if (finished) {
            state.setPhase(GameState.Phase.FINISHED);
            int firstScore = state.scores().getOrDefault(firstPlayerId, 0);
            int secondScore = state.scores().getOrDefault(secondPlayerId, 0);
            if (firstScore > secondScore) {
                state.setWinnerPlayerId(firstPlayerId);
            } else if (secondScore > firstScore) {
                state.setWinnerPlayerId(secondPlayerId);
            }
        }
    }
}
