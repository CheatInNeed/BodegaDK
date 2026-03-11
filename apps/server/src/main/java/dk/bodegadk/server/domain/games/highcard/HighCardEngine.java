package dk.bodegadk.server.domain.games.highcard;

import dk.bodegadk.server.domain.engine.GameEngine;
import dk.bodegadk.server.domain.engine.GameState;
import dk.bodegadk.server.domain.primitives.Card;
import dk.bodegadk.server.domain.primitives.Deck;

import java.util.Collections;
import java.util.List;

/**
 * High Card game engine (1 player vs computer).
 *
 * <p>Rules:
 * <ul>
 *   <li>Player gets 7 cards, computer keeps the remaining 45.</li>
 *   <li>Each round: computer reveals a random card from its deck.</li>
 *   <li>Player must play a card from their hand that is higher (by rank value).</li>
 *   <li>If the player's card is higher → player wins the round.</li>
 *   <li>If equal or lower → player loses the round.</li>
 *   <li>7 rounds total. Game ends when all rounds are played.</li>
 * </ul>
 */
public class HighCardEngine implements GameEngine<HighCardState, HighCardAction> {

    private static final int HAND_SIZE = 7;
    private static final int TOTAL_ROUNDS = 7;

    @Override public String gameId()   { return "highcard"; }
    @Override public int minPlayers()  { return 1; }
    @Override public int maxPlayers()  { return 1; }

    @Override
    public HighCardState init(List<String> playerIds) {
        if (playerIds.size() != 1) {
            throw new GameRuleException("High Card is a 1-player game");
        }

        HighCardState state = new HighCardState(playerIds);
        Deck deck = Deck.standard52().shuffle();

        for (int i = 0; i < HAND_SIZE; i++) {
            state.playerHand().add(deck.draw());
        }

        while (!deck.isEmpty()) {
            state.computerDeck().add(deck.draw());
        }

        state.setPhase(GameState.Phase.PLAYING);
        state.setRound(1);
        revealComputerCard(state);

        return state;
    }

    @Override
    public void validate(HighCardAction action, HighCardState state) throws GameRuleException {
        if (state.isFinished()) {
            throw new GameRuleException("Game is already finished");
        }
        if (state.computerCard() == null) {
            throw new GameRuleException("No computer card to beat");
        }

        Card played = Card.parse(action.cardCode());
        if (!state.playerHand().contains(played)) {
            throw new GameRuleException("You do not own card: " + action.cardCode());
        }
    }

    @Override
    public HighCardState apply(HighCardAction action, HighCardState state) {
        validate(action, state);
        HighCardState next = state.copy();

        Card played = Card.parse(action.cardCode());
        Card computer = next.computerCard();

        next.playerHand().remove(played);
        next.setLastPlayerCard(played);
        next.setLastComputerCard(computer);

        String comparison;
        boolean winRound;
        if (played.value() > computer.value()) {
            comparison = "HIGHER";
            winRound = true;
        } else if (played.value() < computer.value()) {
            comparison = "LOWER";
            winRound = false;
        } else {
            comparison = "EQUAL";
            winRound = false;
        }
        next.setLastComparison(comparison);
        next.setLastResult(winRound ? "WIN" : "LOSS");

        if (winRound) {
            next.setWins(next.wins() + 1);
        } else {
            next.setLosses(next.losses() + 1);
        }

        if (next.round() >= TOTAL_ROUNDS) {
            next.setComputerCard(null);
            next.setPhase(GameState.Phase.FINISHED);
            if (next.wins() > next.losses()) {
                next.setWinnerPlayerId(next.playerIds().getFirst());
            }
        } else {
            next.setRound(next.round() + 1);
            revealComputerCard(next);
        }

        return next;
    }

    @Override
    public boolean isFinished(HighCardState state) {
        return state.isFinished();
    }

    @Override
    public String getWinner(HighCardState state) {
        return state.winnerPlayerId();
    }

    private void revealComputerCard(HighCardState state) {
        List<Card> deck = state.computerDeck();
        Collections.shuffle(deck);
        Card revealed = deck.removeFirst();
        state.setComputerCard(revealed);
    }
}
