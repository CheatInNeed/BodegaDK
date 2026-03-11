package dk.bodegadk.server.domain.games.snyd;

import dk.bodegadk.server.domain.engine.GameEngine.GameRuleException;
import dk.bodegadk.server.domain.engine.GameState;
import dk.bodegadk.server.domain.primitives.Card;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class SnydEngineTest {

    private final SnydEngine engine = new SnydEngine();

    /* ── init ── */

    @Test
    void initDealsCardsAndSetsPlaying() {
        SnydState state = engine.init(List.of("alice", "bob"));

        assertEquals(GameState.Phase.PLAYING, state.phase());
        assertEquals("alice", state.currentPlayerId());
        assertFalse(state.hands().get("alice").isEmpty());
        assertFalse(state.hands().get("bob").isEmpty());
        assertEquals(52, state.hands().get("alice").size() + state.hands().get("bob").size());
    }

    @Test
    void initWith1PlayerThrows() {
        assertThrows(GameRuleException.class, () -> engine.init(List.of("solo")));
    }

    /* ── playCards ── */

    @Test
    void playCardsRemovesFromHandAndAdvancesTurn() {
        SnydState state = engine.init(List.of("alice", "bob"));
        String card = state.hands().get("alice").getFirst().toString();

        SnydState next = engine.apply(
                new SnydAction.PlayCards("alice", List.of(card), "A"), state);

        assertEquals("bob", next.currentPlayerId());
        assertEquals(1, next.pileCount());
        assertNotNull(next.lastClaim());
        assertEquals("alice", next.lastClaim().playerId());
    }

    @Test
    void playCardsDoesNotMutateOriginalState() {
        SnydState state = engine.init(List.of("alice", "bob"));
        int originalHandSize = state.hands().get("alice").size();
        String card = state.hands().get("alice").getFirst().toString();

        engine.apply(new SnydAction.PlayCards("alice", List.of(card), "A"), state);

        // original unchanged
        assertEquals(originalHandSize, state.hands().get("alice").size());
        assertEquals(0, state.pileCount());
    }

    @Test
    void playCardsWrongTurnThrows() {
        SnydState state = engine.init(List.of("alice", "bob"));
        String card = state.hands().get("bob").getFirst().toString();

        assertThrows(GameRuleException.class, () ->
                engine.apply(new SnydAction.PlayCards("bob", List.of(card), "A"), state));
    }

    @Test
    void playCardNotOwnedThrows() {
        SnydState state = engine.init(List.of("alice", "bob"));
        // bob's card played by alice
        String bobCard = state.hands().get("bob").getFirst().toString();

        // only throws if alice doesn't also have that card — use a fake one
        assertThrows(GameRuleException.class, () ->
                engine.apply(new SnydAction.PlayCards("alice", List.of("X9"), "9"), state));
    }

    @Test
    void playEmptyCardsThrows() {
        SnydState state = engine.init(List.of("alice", "bob"));

        assertThrows(GameRuleException.class, () ->
                engine.apply(new SnydAction.PlayCards("alice", List.of(), "A"), state));
    }

    /* ── callSnyd ── */

    @Test
    void callSnydWithNoClaimThrows() {
        SnydState state = engine.init(List.of("alice", "bob"));

        assertThrows(GameRuleException.class, () ->
                engine.apply(new SnydAction.CallSnyd("alice"), state));
    }

    @Test
    void callSnydOnLiarGivesPileToLiar() {
        SnydState state = buildStateWithKnownHands();

        // alice plays H7 but claims "A" (lie)
        SnydState afterPlay = engine.apply(
                new SnydAction.PlayCards("alice", List.of("H7"), "A"), state);

        // bob calls snyd — alice lied, so alice picks up pile
        SnydState afterSnyd = engine.apply(
                new SnydAction.CallSnyd("bob"), afterPlay);

        // alice should have picked up the pile (her H7 back)
        assertTrue(afterSnyd.hands().get("alice").contains(new Card("H", "7")));
        assertEquals(0, afterSnyd.pileCount());
        assertNull(afterSnyd.lastClaim());
        // turn goes to loser (alice)
        assertEquals("alice", afterSnyd.currentPlayerId());
    }

    @Test
    void callSnydOnTruthfulGivesPileToChallenger() {
        SnydState state = buildStateWithKnownHands();

        // alice plays H7 and truthfully claims "7"
        SnydState afterPlay = engine.apply(
                new SnydAction.PlayCards("alice", List.of("H7"), "7"), state);

        // bob calls snyd — alice was truthful, so bob picks up pile
        SnydState afterSnyd = engine.apply(
                new SnydAction.CallSnyd("bob"), afterPlay);

        assertTrue(afterSnyd.hands().get("bob").contains(new Card("H", "7")));
        assertEquals(0, afterSnyd.pileCount());
        // turn goes to loser (bob)
        assertEquals("bob", afterSnyd.currentPlayerId());
    }

    /* ── win condition ── */

    @Test
    void playerWinsWhenHandEmpty() {
        SnydState state = buildStateWithKnownHands();

        // alice plays all her cards (H7, DA)
        SnydState s1 = engine.apply(
                new SnydAction.PlayCards("alice", List.of("H7", "DA"), "A"), state);

        assertTrue(engine.isFinished(s1));
        assertEquals("alice", engine.getWinner(s1));
    }

    @Test
    void cannotPlayAfterGameFinished() {
        SnydState state = buildStateWithKnownHands();

        SnydState finished = engine.apply(
                new SnydAction.PlayCards("alice", List.of("H7", "DA"), "A"), state);

        assertThrows(GameRuleException.class, () ->
                engine.apply(new SnydAction.CallSnyd("bob"), finished));
    }

    /* ── helper: deterministic state with known hands ── */

    private SnydState buildStateWithKnownHands() {
        SnydState state = new SnydState(List.of("alice", "bob"));
        state.hands().put("alice", new ArrayList<>(List.of(new Card("H", "7"), new Card("D", "A"))));
        state.hands().put("bob", new ArrayList<>(List.of(new Card("S", "K"), new Card("C", "3"))));
        state.setPhase(GameState.Phase.PLAYING);
        return state;
    }
}

