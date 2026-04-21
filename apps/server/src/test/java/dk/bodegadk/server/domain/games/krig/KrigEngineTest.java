package dk.bodegadk.server.domain.games.krig;

import dk.bodegadk.server.domain.engine.GameEngine.GameRuleException;
import dk.bodegadk.server.domain.engine.GameState;
import dk.bodegadk.server.domain.primitives.Card;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

class KrigEngineTest {

    private final KrigEngine engine = new KrigEngine();

    @Test
    void initDealsTwentySixHiddenCardsToEachPlayer() {
        KrigState state = engine.init(List.of("p1", "p2"));

        assertEquals(GameState.Phase.PLAYING, state.phase());
        assertEquals(26, state.drawPiles().get("p1").size());
        assertEquals(26, state.drawPiles().get("p2").size());
        assertTrue(state.currentFaceUpCards().isEmpty());
        assertTrue(state.centerPile().isEmpty());
    }

    @Test
    void firstFlipMarksPlayerReadyWithoutRevealingCard() {
        KrigState state = buildState(
                List.of(new Card("H", "A")),
                List.of(new Card("S", "3"))
        );

        KrigState waiting = engine.apply(new KrigAction("p1"), state);

        assertEquals(Set.of("p1"), waiting.readyPlayerIds());
        assertEquals(1, waiting.drawPiles().get("p1").size());
        assertTrue(waiting.centerPile().isEmpty());
        assertTrue(waiting.currentFaceUpCards().isEmpty());
    }

    @Test
    void secondFlipRevealsCardsAndWinnerTakesTrick() {
        KrigState state = buildState(
                List.of(new Card("H", "A")),
                List.of(new Card("S", "3"))
        );
        KrigState waiting = engine.apply(new KrigAction("p1"), state);

        KrigState resolved = engine.apply(new KrigAction("p2"), waiting);

        assertTrue(resolved.readyPlayerIds().isEmpty());
        assertEquals("HA", resolved.currentFaceUpCards().get("p1").toString());
        assertEquals("S3", resolved.currentFaceUpCards().get("p2").toString());
        assertEquals("p1", resolved.lastTrick().winnerPlayerId());
        assertEquals(2, resolved.lastTrick().cardsWon());
        assertEquals(2, resolved.drawPiles().get("p1").size());
        assertEquals(0, resolved.drawPiles().get("p2").size());
        assertTrue(resolved.isFinished());
        assertEquals("p1", engine.getWinner(resolved));
    }

    @Test
    void playerCannotFlipTwiceBeforeOpponent() {
        KrigState state = buildState(
                List.of(new Card("H", "A")),
                List.of(new Card("S", "3"))
        );
        KrigState waiting = engine.apply(new KrigAction("p1"), state);

        assertThrows(GameRuleException.class, () -> engine.apply(new KrigAction("p1"), waiting));
    }

    @Test
    void nextFlipClearsPreviousCenterReveal() {
        KrigState state = buildState(
                List.of(new Card("H", "A"), new Card("H", "2")),
                List.of(new Card("S", "3"), new Card("S", "4"))
        );
        KrigState resolved = engine.apply(new KrigAction("p1"), state);
        resolved = engine.apply(new KrigAction("p2"), resolved);

        KrigState waiting = engine.apply(new KrigAction("p1"), resolved);

        assertEquals(2, waiting.trickNumber());
        assertTrue(waiting.centerPile().isEmpty());
        assertTrue(waiting.currentFaceUpCards().isEmpty());
        assertNull(waiting.lastTrick());
        assertEquals(Set.of("p1"), waiting.readyPlayerIds());
    }

    @Test
    void tieStartsWarAndWinnerTakesAllCenterCards() {
        KrigState state = buildState(
                List.of(
                        new Card("H", "7"),
                        new Card("H", "2"),
                        new Card("H", "3"),
                        new Card("H", "4"),
                        new Card("H", "A")
                ),
                List.of(
                        new Card("S", "7"),
                        new Card("S", "2"),
                        new Card("S", "3"),
                        new Card("S", "4"),
                        new Card("S", "K")
                )
        );

        KrigState waiting = engine.apply(new KrigAction("p1"), state);
        KrigState resolved = engine.apply(new KrigAction("p2"), waiting);

        assertEquals(1, resolved.lastTrick().warDepth());
        assertEquals("p1", resolved.lastTrick().winnerPlayerId());
        assertEquals(10, resolved.lastTrick().cardsWon());
        assertEquals(10, resolved.centerPile().size());
        assertEquals(10, resolved.drawPiles().get("p1").size());
        assertEquals(0, resolved.drawPiles().get("p2").size());
        assertTrue(resolved.isFinished());
    }

    @Test
    void shortWarUsesAvailableStakeCardsAndStillFlipsFinalCard() {
        KrigState state = buildState(
                List.of(new Card("H", "7"), new Card("H", "A")),
                List.of(new Card("S", "7"), new Card("S", "K"))
        );

        KrigState waiting = engine.apply(new KrigAction("p1"), state);
        KrigState resolved = engine.apply(new KrigAction("p2"), waiting);

        assertEquals(1, resolved.lastTrick().warDepth());
        assertEquals("p1", resolved.lastTrick().winnerPlayerId());
        assertEquals(4, resolved.lastTrick().cardsWon());
        assertEquals(4, resolved.drawPiles().get("p1").size());
    }

    @Test
    void firstRematchVoteMarksPlayerReadyWithoutResettingGame() {
        KrigState finished = buildState(List.of(), List.of());
        finished.setPhase(GameState.Phase.FINISHED);
        finished.setWinnerPlayerId("p1");
        finished.drawPiles().get("p1").add(new Card("H", "A"));

        KrigState waiting = engine.requestRematch("p1", finished);

        assertTrue(waiting.isFinished());
        assertEquals(Set.of("p1"), waiting.rematchPlayerIds());
        assertEquals(1, waiting.drawPiles().get("p1").size());
    }

    @Test
    void secondRematchVoteResetsMatchWithFreshPiles() {
        KrigState finished = buildState(List.of(), List.of());
        finished.setPhase(GameState.Phase.FINISHED);
        finished.setWinnerPlayerId("p1");
        finished.rematchPlayerIds().add("p1");

        KrigState restarted = engine.requestRematch("p2", finished);

        assertEquals(GameState.Phase.PLAYING, restarted.phase());
        assertNull(restarted.winnerPlayerId());
        assertEquals(1, restarted.trickNumber());
        assertEquals(26, restarted.drawPiles().get("p1").size());
        assertEquals(26, restarted.drawPiles().get("p2").size());
        assertTrue(restarted.rematchPlayerIds().isEmpty());
    }

    private KrigState buildState(List<Card> p1Pile, List<Card> p2Pile) {
        KrigState state = new KrigState(List.of("p1", "p2"));
        state.setPhase(GameState.Phase.PLAYING);
        state.drawPiles().put("p1", new ArrayList<>(p1Pile));
        state.drawPiles().put("p2", new ArrayList<>(p2Pile));
        return state;
    }
}
