package dk.bodegadk.server.domain.games.casino;

import dk.bodegadk.server.domain.engine.GameEngine.GameRuleException;
import dk.bodegadk.server.domain.engine.GameState;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CasinoEngineTest {
    private final CasinoEngine engine = new CasinoEngine();

    @Test
    void initDealsFourTableCardsAndFourCardsPerPlayer() {
        CasinoState state = engine.init("ROOM1", List.of("alice", "bob"), "bob", CasinoEngine.defaultValueMap());

        assertTrue(state.started());
        assertEquals(GameState.Phase.PLAYING, state.phase());
        assertEquals("alice", state.currentPlayerId());
        assertEquals("bob", state.dealerPlayerId());
        assertEquals(4, state.tableStacks().size());
        assertEquals(4, state.hands().get("alice").size());
        assertEquals(4, state.hands().get("bob").size());
        assertEquals(40, state.deck().size());
    }

    @Test
    void mergeDoesNotEndTurnAndAceCanRepresentFourteen() {
        CasinoState state = emptyStartedState();
        state.hands().put("alice", new ArrayList<>(List.of("HA")));
        state.tableStacks().add(new CasinoState.TableStack("s1", List.of("H3"), 3, false));
        state.tableStacks().add(new CasinoState.TableStack("s2", List.of("D3"), 3, false));
        state.tableStacks().add(new CasinoState.TableStack("s3", List.of("C8"), 8, false));

        CasinoState next = engine.apply(new CasinoAction.MergeStacks("alice", List.of("s1", "s2", "s3")), state);

        assertEquals("alice", next.currentPlayerId());
        assertEquals(1, next.tableStacks().size());
        assertEquals(14, next.tableStacks().getFirst().total());
    }

    @Test
    void buildRequiresHoldingResultingTotalInHand() {
        CasinoState illegal = emptyStartedState();
        illegal.hands().put("alice", new ArrayList<>(List.of("H4")));
        illegal.tableStacks().add(new CasinoState.TableStack("s1", List.of("H3"), 3, false));

        assertThrows(
                GameRuleException.class,
                () -> engine.apply(new CasinoAction.BuildStack("alice", "H4", "s1", null), illegal)
        );

        CasinoState legal = emptyStartedState();
        legal.hands().put("alice", new ArrayList<>(List.of("H4", "S7")));
        legal.tableStacks().add(new CasinoState.TableStack("s1", List.of("H3"), 3, false));

        CasinoState next = engine.apply(new CasinoAction.BuildStack("alice", "H4", "s1", null), legal);

        assertEquals("bob", next.currentPlayerId());
        assertEquals(7, next.tableStacks().getFirst().total());
        assertTrue(next.tableStacks().getFirst().locked());
        assertEquals(List.of("S7"), next.hands().get("alice"));
    }

    @Test
    void finishAwardsLeftoversToLastCapturerAndSupportsDraws() {
        CasinoState state = emptyStartedState();
        state.capturedCounts().put("alice", 5);
        state.capturedCounts().put("bob", 7);
        state.setLastCapturePlayerId("alice");
        state.tableStacks().add(new CasinoState.TableStack("s1", List.of("H2", "D5"), 7, true));

        engine.finishGame(state);

        assertTrue(state.isFinished());
        assertNull(state.winnerPlayerId());
        assertEquals(7, state.capturedCounts().get("alice"));
        assertTrue(state.tableStacks().isEmpty());
        assertEquals(List.of("H2", "D5"), state.capturedCards().get("alice"));
    }

    private CasinoState emptyStartedState() {
        CasinoState state = new CasinoState("ROOM1", List.of("alice", "bob"), "bob", CasinoEngine.defaultValueMap());
        state.setStarted(true);
        state.setPhase(GameState.Phase.PLAYING);
        state.setTurnToPlayer("alice");
        return state;
    }
}
