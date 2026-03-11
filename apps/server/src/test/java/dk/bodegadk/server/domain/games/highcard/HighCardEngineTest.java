package dk.bodegadk.server.domain.games.highcard;

import dk.bodegadk.server.domain.engine.GameEngine.GameRuleException;
import dk.bodegadk.server.domain.engine.GameState;
import dk.bodegadk.server.domain.primitives.Card;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class HighCardEngineTest {

    private final HighCardEngine engine = new HighCardEngine();

    @Test
    void initDeals7CardsAndRevealsComputerCard() {
        HighCardState state = engine.init(List.of("player1"));
        assertEquals(GameState.Phase.PLAYING, state.phase());
        assertEquals(7, state.playerHand().size());
        assertEquals(44, state.computerDeck().size());
        assertNotNull(state.computerCard());
        assertEquals(1, state.round());
    }

    @Test
    void initWith2PlayersThrows() {
        assertThrows(GameRuleException.class, () -> engine.init(List.of("a", "b")));
    }

    @Test
    void playHigherCardWinsRound() {
        HighCardState state = buildState(new Card("H", "A"), new Card("D", "3"));
        HighCardState next = engine.apply(new HighCardAction("p1", "HA"), state);
        assertEquals(1, next.wins());
        assertEquals(0, next.losses());
    }

    @Test
    void playLowerCardLosesRound() {
        HighCardState state = buildState(new Card("H", "2"), new Card("D", "K"));
        HighCardState next = engine.apply(new HighCardAction("p1", "H2"), state);
        assertEquals(0, next.wins());
        assertEquals(1, next.losses());
    }

    @Test
    void playEqualCardLosesRound() {
        HighCardState state = buildState(new Card("H", "7"), new Card("D", "7"));
        HighCardState next = engine.apply(new HighCardAction("p1", "H7"), state);
        assertEquals(0, next.wins());
        assertEquals(1, next.losses());
    }

    @Test
    void applyDoesNotMutateOriginal() {
        HighCardState state = buildState(new Card("H", "A"), new Card("D", "3"));
        int originalSize = state.playerHand().size();
        engine.apply(new HighCardAction("p1", "HA"), state);
        assertEquals(originalSize, state.playerHand().size());
        assertEquals(0, state.wins());
    }

    @Test
    void playCardNotOwnedThrows() {
        HighCardState state = buildState(new Card("H", "7"), new Card("D", "3"));
        assertThrows(GameRuleException.class, () ->
                engine.apply(new HighCardAction("p1", "SA"), state));
    }

    @Test
    void gameEndsAfter7Rounds() {
        HighCardState state = engine.init(List.of("player1"));
        for (int i = 0; i < 7; i++) {
            assertFalse(engine.isFinished(state));
            String card = state.playerHand().getFirst().toString();
            state = engine.apply(new HighCardAction("player1", card), state);
        }
        assertTrue(engine.isFinished(state));
        assertEquals(7, state.wins() + state.losses());
    }

    @Test
    void cannotPlayAfterFinished() {
        HighCardState state = engine.init(List.of("player1"));
        for (int i = 0; i < 7; i++) {
            String card = state.playerHand().getFirst().toString();
            state = engine.apply(new HighCardAction("player1", card), state);
        }
        HighCardState finalState = state;
        assertThrows(GameRuleException.class, () ->
                engine.apply(new HighCardAction("player1", "H2"), finalState));
    }

    @Test
    void winnerSetWhenMoreWinsThanLosses() {
        HighCardState state = buildState(new Card("H", "A"), new Card("D", "2"));
        state.setRound(7);
        state.setWins(4);
        state.setLosses(2);
        HighCardState finished = engine.apply(new HighCardAction("p1", "HA"), state);
        assertTrue(finished.isFinished());
        assertEquals("p1", engine.getWinner(finished));
    }

    @Test
    void noWinnerWhenMoreLosses() {
        HighCardState state = buildState(new Card("H", "2"), new Card("D", "A"));
        state.setRound(7);
        state.setWins(2);
        state.setLosses(4);
        HighCardState finished = engine.apply(new HighCardAction("p1", "H2"), state);
        assertTrue(finished.isFinished());
        assertNull(engine.getWinner(finished));
    }

    private HighCardState buildState(Card playerCard, Card computerCard) {
        HighCardState state = new HighCardState(List.of("p1"));
        state.playerHand().add(playerCard);
        state.computerDeck().add(new Card("S", "5"));
        state.computerDeck().add(new Card("C", "9"));
        state.setComputerCard(computerCard);
        state.setRound(1);
        state.setPhase(GameState.Phase.PLAYING);
        return state;
    }
}

