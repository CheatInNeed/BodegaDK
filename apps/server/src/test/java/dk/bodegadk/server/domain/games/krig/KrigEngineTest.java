package dk.bodegadk.server.domain.games.krig;

import dk.bodegadk.server.domain.engine.GameEngine.GameRuleException;
import dk.bodegadk.server.domain.engine.GameState;
import dk.bodegadk.server.domain.primitives.Card;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class KrigEngineTest {

    private final KrigEngine engine = new KrigEngine();

    @Test
    void firstSubmissionStaysHiddenUntilOpponentPlays() {
        KrigState state = buildState(
                List.of(new Card("H", "A"), new Card("H", "2")),
                List.of(new Card("S", "3"))
        );

        KrigState next = engine.apply(new KrigAction("p1", "HA"), state);

        assertEquals(1, next.submittedCards().size());
        assertTrue(next.submittedCards().containsKey("p1"));
        assertTrue(next.revealedCards().isEmpty());
        assertNull(next.lastBattle());
        assertEquals(0, next.scores().get("p1"));
        assertEquals(1, next.hands().get("p1").size());
    }

    @Test
    void secondSubmissionRevealsCardsAndAwardsPoint() {
        KrigState state = buildState(
                List.of(new Card("H", "A")),
                List.of(new Card("S", "3"))
        );
        KrigState waiting = engine.apply(new KrigAction("p1", "HA"), state);

        KrigState resolved = engine.apply(new KrigAction("p2", "S3"), waiting);

        assertTrue(resolved.submittedCards().isEmpty());
        assertEquals("HA", resolved.revealedCards().get("p1").toString());
        assertEquals("S3", resolved.revealedCards().get("p2").toString());
        assertNotNull(resolved.lastBattle());
        assertEquals(1, resolved.lastBattle().round());
        assertEquals("p1", resolved.lastBattle().winnerPlayerId());
        assertEquals(1, resolved.scores().get("p1"));
        assertEquals(0, resolved.scores().get("p2"));
    }

    @Test
    void playerCannotSubmitTwiceInSameRound() {
        KrigState state = buildState(
                List.of(new Card("H", "A"), new Card("H", "2")),
                List.of(new Card("S", "3"))
        );
        KrigState waiting = engine.apply(new KrigAction("p1", "HA"), state);

        assertThrows(GameRuleException.class, () -> engine.apply(new KrigAction("p1", "H2"), waiting));
    }

    @Test
    void nextRoundClearsPreviousRevealWhenNewSubmissionStarts() {
        KrigState state = buildState(
                List.of(new Card("H", "A"), new Card("H", "2")),
                List.of(new Card("S", "3"), new Card("S", "4"))
        );
        KrigState firstResolved = engine.apply(new KrigAction("p1", "HA"), state);
        firstResolved = engine.apply(new KrigAction("p2", "S3"), firstResolved);

        KrigState nextRound = engine.apply(new KrigAction("p1", "H2"), firstResolved);

        assertEquals(2, nextRound.round());
        assertTrue(nextRound.revealedCards().isEmpty());
        assertNull(nextRound.lastBattle());
        assertTrue(nextRound.submittedCards().containsKey("p1"));
    }

    @Test
    void finishedGameSetsWinnerAfterFinalReveal() {
        KrigState state = buildState(
                List.of(new Card("H", "A")),
                List.of(new Card("S", "3"))
        );

        KrigState resolved = engine.apply(new KrigAction("p1", "HA"), state);
        resolved = engine.apply(new KrigAction("p2", "S3"), resolved);

        assertTrue(resolved.isFinished());
        assertEquals(GameState.Phase.FINISHED, resolved.phase());
        assertEquals("p1", engine.getWinner(resolved));
    }

    private KrigState buildState(List<Card> p1Hand, List<Card> p2Hand) {
        KrigState state = new KrigState(List.of("p1", "p2"));
        state.setPhase(GameState.Phase.PLAYING);
        state.scores().put("p1", 0);
        state.scores().put("p2", 0);
        state.hands().put("p1", new ArrayList<>(p1Hand));
        state.hands().put("p2", new ArrayList<>(p2Hand));
        return state;
    }
}
