package dk.bodegadk.server.domain.games.fem;

import dk.bodegadk.server.domain.engine.GameEngine.GameRuleException;
import dk.bodegadk.server.domain.engine.GameState;
import dk.bodegadk.server.domain.primitives.Card;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class FemEngineTest {

    private final FemEngine engine = new FemEngine();

    /* ══════════════════════════════════════════════════════════════
       INIT TESTS
       ══════════════════════════════════════════════════════════════ */

    @Test
    void initDealsSevenCardsEachAndSetsPlaying() {
        FemState state = engine.init(List.of("alice", "bob"));

        assertEquals(GameState.Phase.PLAYING, state.phase());
        assertEquals("alice", state.currentPlayerId());
        assertEquals(7, state.hands().get("alice").size());
        assertEquals(7, state.hands().get("bob").size());
        // 54 total - 14 dealt - 1 discard = 39 stock
        assertEquals(39, state.stockPile().size());
        assertEquals(1, state.discardPile().size());
        assertEquals(1, state.roundNumber());
        assertTrue(state.firstRound());
    }

    @Test
    void initWithThreePlayersDealsCorrectly() {
        FemState state = engine.init(List.of("a", "b", "c"));

        assertEquals(7, state.hands().get("a").size());
        assertEquals(7, state.hands().get("b").size());
        assertEquals(7, state.hands().get("c").size());
        // 54 - 21 dealt - 1 discard = 32 stock
        assertEquals(32, state.stockPile().size());
    }

    @Test
    void initWithOnePlayerThrows() {
        assertThrows(GameRuleException.class, () -> engine.init(List.of("solo")));
    }

    @Test
    void initWithSevenPlayersThrows() {
        assertThrows(GameRuleException.class, () ->
                engine.init(List.of("a", "b", "c", "d", "e", "f", "g")));
    }

    @Test
    void initSetsScoresToZero() {
        FemState state = engine.init(List.of("alice", "bob"));
        assertEquals(0, state.scores().get("alice"));
        assertEquals(0, state.scores().get("bob"));
    }

    /* ══════════════════════════════════════════════════════════════
       DRAW TESTS
       ══════════════════════════════════════════════════════════════ */

    @Test
    void drawFromStockAddsCardToHand() {
        FemState state = buildBasicState();

        FemState next = engine.apply(new FemAction.DrawFromStock("alice"), state);

        assertEquals(8, next.hands().get("alice").size());
        assertEquals(state.stockPile().size() - 1, next.stockPile().size());
        assertTrue(next.hasDrawnThisTurn());
    }

    @Test
    void drawFromDiscardTakesTopCard() {
        FemState state = buildBasicState();
        Card topDiscard = state.discardPile().getLast();

        FemState next = engine.apply(new FemAction.DrawFromDiscard("alice"), state);

        assertEquals(8, next.hands().get("alice").size());
        assertTrue(next.hands().get("alice").contains(topDiscard));
        assertEquals(state.discardPile().size() - 1, next.discardPile().size());
    }

    @Test
    void cannotDrawTwiceInOneTurn() {
        FemState state = buildBasicState();

        FemState next = engine.apply(new FemAction.DrawFromStock("alice"), state);

        assertThrows(GameRuleException.class, () ->
                engine.apply(new FemAction.DrawFromStock("alice"), next));
    }

    @Test
    void takeEntireDiscardPileBlockedOnFirstRound() {
        FemState state = buildBasicState();
        state.setFirstRound(true);

        assertThrows(GameRuleException.class, () ->
                engine.apply(new FemAction.TakeDiscardPile("alice"), state));
    }

    @Test
    void takeEntireDiscardPileAddsAllCardsToHand() {
        FemState state = buildBasicState();
        state.setFirstRound(false);
        // Add more cards to discard pile
        state.discardPile().add(new Card("H", "5"));
        state.discardPile().add(new Card("H", "6"));
        int discardSize = state.discardPile().size();

        FemState next = engine.apply(new FemAction.TakeDiscardPile("alice"), state);

        assertEquals(7 + discardSize, next.hands().get("alice").size());
        assertTrue(next.discardPile().isEmpty());
        assertTrue(next.hasDrawnThisTurn());
    }

    @Test
    void drawFromStockDoesNotMutateOriginalState() {
        FemState state = buildBasicState();
        int originalHandSize = state.hands().get("alice").size();
        int originalStockSize = state.stockPile().size();

        engine.apply(new FemAction.DrawFromStock("alice"), state);

        assertEquals(originalHandSize, state.hands().get("alice").size());
        assertEquals(originalStockSize, state.stockPile().size());
    }

    @Test
    void cannotMeldBeforeDrawing() {
        FemState state = buildBasicState();
        // Give alice a valid meld hand
        state.hands().get("alice").clear();
        state.hands().get("alice").addAll(List.of(
                new Card("H", "3"), new Card("H", "4"), new Card("H", "5"),
                new Card("D", "7"), new Card("D", "8"), new Card("D", "9"), new Card("S", "K")));

        assertThrows(GameRuleException.class, () ->
                engine.apply(new FemAction.LayMeld("alice", List.of("H3", "H4", "H5")), state));
    }

    /* ══════════════════════════════════════════════════════════════
       MELD TESTS
       ══════════════════════════════════════════════════════════════ */

    @Test
    void layValidMeldOf3ConsecutiveCards() {
        FemState state = buildStateWithDrawn();
        state.hands().get("alice").clear();
        state.hands().get("alice").addAll(List.of(
                new Card("H", "3"), new Card("H", "4"), new Card("H", "5"),
                new Card("D", "7"), new Card("D", "8"), new Card("D", "9"),
                new Card("S", "K"), new Card("C", "2")));

        FemState next = engine.apply(
                new FemAction.LayMeld("alice", List.of("H3", "H4", "H5")), state);

        assertEquals(1, next.melds().size());
        assertEquals("H", next.melds().getFirst().suit());
        assertEquals(3, next.melds().getFirst().cards().size());
        assertEquals(5, next.hands().get("alice").size()); // 8 - 3
    }

    @Test
    void layMeldWithAceLow() {
        FemState state = buildStateWithDrawn();
        state.hands().get("alice").clear();
        state.hands().get("alice").addAll(List.of(
                new Card("H", "A"), new Card("H", "2"), new Card("H", "3"),
                new Card("D", "7"), new Card("D", "8"), new Card("D", "9"),
                new Card("S", "K"), new Card("C", "2")));

        FemState next = engine.apply(
                new FemAction.LayMeld("alice", List.of("HA", "H2", "H3")), state);

        assertEquals(1, next.melds().size());
        assertEquals(5, next.hands().get("alice").size());
    }

    @Test
    void layMeldWithAceHigh() {
        FemState state = buildStateWithDrawn();
        state.hands().get("alice").clear();
        state.hands().get("alice").addAll(List.of(
                new Card("H", "Q"), new Card("H", "K"), new Card("H", "A"),
                new Card("D", "7"), new Card("D", "8"), new Card("D", "9"),
                new Card("S", "K"), new Card("C", "2")));

        FemState next = engine.apply(
                new FemAction.LayMeld("alice", List.of("HQ", "HK", "HA")), state);

        assertEquals(1, next.melds().size());
    }

    @Test
    void rejectMeldWithAceWrapAround() {
        FemState state = buildStateWithDrawn();
        state.hands().get("alice").clear();
        state.hands().get("alice").addAll(List.of(
                new Card("H", "K"), new Card("H", "A"), new Card("H", "2"),
                new Card("D", "7"), new Card("D", "8"), new Card("D", "9"),
                new Card("S", "K"), new Card("C", "2")));

        assertThrows(GameRuleException.class, () ->
                engine.apply(new FemAction.LayMeld("alice", List.of("HK", "HA", "H2")), state));
    }

    @Test
    void layMeldWithJokerAsGap() {
        FemState state = buildStateWithDrawn();
        state.hands().get("alice").clear();
        state.hands().get("alice").addAll(List.of(
                new Card("H", "3"), new Card("JK", "1"), new Card("H", "5"),
                new Card("D", "7"), new Card("D", "8"), new Card("D", "9"),
                new Card("S", "K"), new Card("C", "2")));

        FemState next = engine.apply(
                new FemAction.LayMeld("alice", List.of("H3", "JK1", "H5")), state);

        assertEquals(1, next.melds().size());
        assertEquals("H", next.melds().getFirst().suit());
        assertEquals(3, next.melds().getFirst().cards().size());
    }

    @Test
    void rejectMeldWithFewerThan3Cards() {
        FemState state = buildStateWithDrawn();
        state.hands().get("alice").clear();
        state.hands().get("alice").addAll(List.of(
                new Card("H", "3"), new Card("H", "4"),
                new Card("D", "7"), new Card("D", "8"), new Card("D", "9"),
                new Card("S", "K"), new Card("C", "2"), new Card("C", "3")));

        assertThrows(GameRuleException.class, () ->
                engine.apply(new FemAction.LayMeld("alice", List.of("H3", "H4")), state));
    }

    @Test
    void rejectMeldWithMixedSuits() {
        FemState state = buildStateWithDrawn();
        state.hands().get("alice").clear();
        state.hands().get("alice").addAll(List.of(
                new Card("H", "3"), new Card("D", "4"), new Card("H", "5"),
                new Card("D", "7"), new Card("D", "8"), new Card("D", "9"),
                new Card("S", "K"), new Card("C", "2")));

        assertThrows(GameRuleException.class, () ->
                engine.apply(new FemAction.LayMeld("alice", List.of("H3", "D4", "H5")), state));
    }

    @Test
    void rejectMeldWithNonConsecutiveCards() {
        FemState state = buildStateWithDrawn();
        state.hands().get("alice").clear();
        state.hands().get("alice").addAll(List.of(
                new Card("H", "3"), new Card("H", "5"), new Card("H", "7"),
                new Card("D", "7"), new Card("D", "8"), new Card("D", "9"),
                new Card("S", "K"), new Card("C", "2")));

        assertThrows(GameRuleException.class, () ->
                engine.apply(new FemAction.LayMeld("alice", List.of("H3", "H5", "H7")), state));
    }

    @Test
    void extendExistingMeldWithValidCard() {
        FemState state = buildStateWithMeld();

        // Meld is H3-H4-H5 (id "m1"). Alice has H6 in hand. Extend with H6.
        FemState next = engine.apply(
                new FemAction.ExtendMeld("alice", "m1", "H6"), state);

        assertEquals(4, next.melds().getFirst().cards().size());
        assertFalse(next.hands().get("alice").contains(new Card("H", "6")));
    }

    @Test
    void extendMeldWithInvalidCardThrows() {
        FemState state = buildStateWithMeld();

        // Meld is H3-H4-H5. Try to extend with H8 (not consecutive).
        assertThrows(GameRuleException.class, () ->
                engine.apply(new FemAction.ExtendMeld("alice", "m1", "D7"), state));
    }

    @Test
    void swapJokerWithRealCard() {
        FemState state = buildStateWithDrawn();
        // Create a meld with a joker: H3-JK1-H5
        state.hands().get("alice").clear();
        state.hands().get("alice").addAll(List.of(
                new Card("H", "3"), new Card("JK", "1"), new Card("H", "5"),
                new Card("H", "4"), // the real card to swap in
                new Card("D", "8"), new Card("D", "9"), new Card("S", "K"), new Card("C", "2")));

        // First lay the meld with joker
        FemState afterMeld = engine.apply(
                new FemAction.LayMeld("alice", List.of("H3", "JK1", "H5")), state);

        // Now swap the joker with H4
        FemState afterSwap = engine.apply(
                new FemAction.SwapJoker("alice", "m1", "JK1", "H4"), afterMeld);

        // Joker should be in hand, H4 in meld
        assertTrue(afterSwap.hands().get("alice").contains(new Card("JK", "1")));
        assertTrue(afterSwap.melds().getFirst().cards().contains(new Card("H", "4")));
        assertFalse(afterSwap.melds().getFirst().cards().contains(new Card("JK", "1")));
    }

    /* ══════════════════════════════════════════════════════════════
       DISCARD AND TURN FLOW TESTS
       ══════════════════════════════════════════════════════════════ */

    @Test
    void discardEndsPlayerTurn() {
        FemState state = buildBasicState();

        // Draw first
        FemState afterDraw = engine.apply(new FemAction.DrawFromStock("alice"), state);
        String cardToDiscard = afterDraw.hands().get("alice").getLast().toString();

        FemState afterDiscard = engine.apply(
                new FemAction.Discard("alice", cardToDiscard), afterDraw);

        // No grab phase because no melds exist
        assertEquals("bob", afterDiscard.currentPlayerId());
        assertFalse(afterDiscard.hasDrawnThisTurn());
    }

    @Test
    void cannotDiscardWithoutDrawing() {
        FemState state = buildBasicState();
        String card = state.hands().get("alice").getFirst().toString();

        assertThrows(GameRuleException.class, () ->
                engine.apply(new FemAction.Discard("alice", card), state));
    }

    @Test
    void closeRoundBlockedOnFirstRound() {
        FemState state = buildStateWithDrawn();
        state.setFirstRound(true);
        // Give alice only one card
        state.hands().get("alice").clear();
        state.hands().get("alice").add(new Card("H", "7"));

        assertThrows(GameRuleException.class, () ->
                engine.apply(new FemAction.Discard("alice", "H7"), state));
    }

    @Test
    void discardLastCardClosesRound() {
        FemState state = buildStateWithDrawn();
        state.setFirstRound(false);
        // Alice has one card left
        state.hands().get("alice").clear();
        state.hands().get("alice").add(new Card("H", "7"));

        FemState next = engine.apply(new FemAction.Discard("alice", "H7"), state);

        // Round should have closed and a new round should have started
        // (since no one has 500 points)
        assertEquals(2, next.roundNumber());
        assertFalse(next.firstRound());
        assertEquals(7, next.hands().get("alice").size());
        assertEquals(7, next.hands().get("bob").size());
    }

    @Test
    void wrongPlayerCannotAct() {
        FemState state = buildBasicState();

        assertThrows(GameRuleException.class, () ->
                engine.apply(new FemAction.DrawFromStock("bob"), state));
    }

    /* ══════════════════════════════════════════════════════════════
       SCORING TESTS
       ══════════════════════════════════════════════════════════════ */

    @Test
    void roundScoringCalculatesCorrectPoints() {
        FemState state = buildStateForScoring();

        // Close the round
        FemState next = engine.apply(new FemAction.Discard("alice", "H7"), state);

        // Alice: melded H3(5)+H4(5)+H5(5)=15, hand was H7(5) -> now 0. Score: 15 - 0 = 15
        // But H7 was discarded to close, so hand=0 at scoring.
        // Bob: melded 0, hand has D7(5)+D8(5)+D9(5)+SK(10)+C2(5)+C3(5)+C4(5) = 40. Score: 0 - 40 = -40
        assertEquals(15, next.scores().get("alice"));
        assertEquals(-40, next.scores().get("bob"));
    }

    @Test
    void gameEndsWhenPlayerReaches500() {
        FemState state = buildStateForScoring();
        state.scores().put("alice", 490); // 490 + 15 = 505 >= 500

        FemState next = engine.apply(new FemAction.Discard("alice", "H7"), state);

        assertTrue(next.isFinished());
        assertEquals("alice", next.winnerPlayerId());
        assertEquals(505, next.scores().get("alice"));
    }

    @Test
    void negativeScoresPossible() {
        FemState state = buildStateForScoring();
        state.scores().put("bob", -100);

        FemState next = engine.apply(new FemAction.Discard("alice", "H7"), state);

        // Bob: -100 + (0 - 40) = -140
        assertEquals(-140, next.scores().get("bob"));
    }

    @Test
    void jokerWorth25Points() {
        assertEquals(25, FemEngine.cardPoints(new Card("JK", "1")));
        assertEquals(25, FemEngine.cardPoints(new Card("JK", "2")));
    }

    @Test
    void aceWorth15Points() {
        assertEquals(15, FemEngine.cardPoints(new Card("H", "A")));
        assertEquals(15, FemEngine.cardPoints(new Card("D", "A")));
    }

    @Test
    void faceCardsWorth10Points() {
        assertEquals(10, FemEngine.cardPoints(new Card("H", "10")));
        assertEquals(10, FemEngine.cardPoints(new Card("H", "J")));
        assertEquals(10, FemEngine.cardPoints(new Card("H", "Q")));
        assertEquals(10, FemEngine.cardPoints(new Card("H", "K")));
    }

    @Test
    void numberCardsWorth5Points() {
        assertEquals(5, FemEngine.cardPoints(new Card("H", "2")));
        assertEquals(5, FemEngine.cardPoints(new Card("H", "5")));
        assertEquals(5, FemEngine.cardPoints(new Card("H", "9")));
    }

    /* ══════════════════════════════════════════════════════════════
       GRAB PHASE TESTS
       ══════════════════════════════════════════════════════════════ */

    @Test
    void discardStartsGrabPhaseWhenMeldsExist() {
        FemState state = buildStateWithMeld();
        String cardToDiscard = state.hands().get("alice").getLast().toString();

        FemState next = engine.apply(
                new FemAction.Discard("alice", cardToDiscard), state);

        assertTrue(next.discardGrabPhase());
        assertNotNull(next.discardGrabCard());
        // Priority should be bob (next after alice)
        assertEquals("bob", next.playerIds().get(next.grabPriorityIndex()));
    }

    @Test
    void claimDiscardExtendsExistingMeld() {
        FemState state = buildStateWithMeld();
        // Clear discard pile and set H2 as the grab card
        state.discardPile().clear();
        state.discardPile().add(new Card("H", "2"));
        state.setDiscardGrabPhase(true);
        state.setDiscardGrabCard(new Card("H", "2"));
        // Meld is H3-H4-H5, so H2 extends at low end
        int bobIdx = state.playerIds().indexOf("bob");
        state.setGrabPriorityIndex(bobIdx);

        FemState next = engine.apply(
                new FemAction.ClaimDiscard("bob", "m1"), state);

        assertFalse(next.discardGrabPhase());
        assertEquals(4, next.melds().getFirst().cards().size());
        // H2 should no longer be in discard pile
        assertFalse(next.discardPile().contains(new Card("H", "2")));
    }

    @Test
    void passGrabMovesToNextPlayer() {
        FemState state = buildStateWithMeld();
        state.setDiscardGrabPhase(true);
        state.setDiscardGrabCard(new Card("H", "2"));
        state.discardPile().add(new Card("H", "2"));
        int bobIdx = state.playerIds().indexOf("bob");
        state.setGrabPriorityIndex(bobIdx);

        FemState next = engine.apply(new FemAction.PassGrab("bob"), state);

        // With 2 players, after bob passes, priority goes back to alice (the discarder).
        // Since alice is the discarder, grab phase ends.
        assertFalse(next.discardGrabPhase());
    }

    @Test
    void allPassEndGrabPhase() {
        // 3-player game
        FemState state = new FemState(List.of("alice", "bob", "charlie"));
        state.setPhase(GameState.Phase.PLAYING);
        state.hands().put("alice", new ArrayList<>(List.of(
                new Card("D", "7"), new Card("D", "8"), new Card("D", "9"),
                new Card("S", "K"), new Card("C", "2"), new Card("C", "3"), new Card("C", "4"))));
        state.hands().put("bob", new ArrayList<>(List.of(
                new Card("S", "3"), new Card("S", "4"), new Card("S", "5"),
                new Card("S", "6"), new Card("S", "7"), new Card("S", "8"), new Card("S", "9"))));
        state.hands().put("charlie", new ArrayList<>(List.of(
                new Card("D", "2"), new Card("D", "3"), new Card("D", "4"),
                new Card("D", "5"), new Card("D", "6"), new Card("C", "7"), new Card("C", "8"))));
        state.stockPile().addAll(List.of(new Card("H", "10"), new Card("H", "J")));
        state.discardPile().add(new Card("H", "9"));
        state.scores().put("alice", 0);
        state.scores().put("bob", 0);
        state.scores().put("charlie", 0);

        // Create a meld on the table
        state.melds().add(new FemState.Meld("m1", "H", new ArrayList<>(List.of(
                new Card("H", "3"), new Card("H", "4"), new Card("H", "5"))),
                new LinkedHashMap<>(Map.of("alice", new ArrayList<>(List.of(
                        new Card("H", "3"), new Card("H", "4"), new Card("H", "5")))))));

        // Set up grab phase: alice discarded, bob has priority
        state.setDiscardGrabPhase(true);
        state.setDiscardGrabCard(new Card("H", "9"));
        state.setGrabPriorityIndex(1); // bob
        state.setCurrentTurnIndex(0); // alice is the discarder

        // Bob passes
        FemState afterBobPass = engine.apply(new FemAction.PassGrab("bob"), state);
        assertTrue(afterBobPass.discardGrabPhase());
        assertEquals(2, afterBobPass.grabPriorityIndex()); // charlie

        // Charlie passes
        FemState afterCharliePass = engine.apply(new FemAction.PassGrab("charlie"), afterBobPass);
        assertFalse(afterCharliePass.discardGrabPhase()); // back to discarder => end
    }

    @Test
    void wrongPlayerCannotActDuringGrabPhase() {
        FemState state = buildStateWithMeld();
        state.setDiscardGrabPhase(true);
        state.setDiscardGrabCard(new Card("H", "2"));
        state.discardPile().add(new Card("H", "2"));
        int bobIdx = state.playerIds().indexOf("bob");
        state.setGrabPriorityIndex(bobIdx);

        assertThrows(GameRuleException.class, () ->
                engine.apply(new FemAction.PassGrab("alice"), state));
    }

    @Test
    void cannotDrawDuringGrabPhase() {
        FemState state = buildStateWithMeld();
        state.setDiscardGrabPhase(true);
        state.setDiscardGrabCard(new Card("H", "2"));
        int bobIdx = state.playerIds().indexOf("bob");
        state.setGrabPriorityIndex(bobIdx);

        assertThrows(GameRuleException.class, () ->
                engine.apply(new FemAction.DrawFromStock("bob"), state));
    }

    /* ══════════════════════════════════════════════════════════════
       MULTI-ROUND TESTS
       ══════════════════════════════════════════════════════════════ */

    @Test
    void newRoundResetsHandsAndMelds() {
        FemState state = buildStateForScoring();

        FemState next = engine.apply(new FemAction.Discard("alice", "H7"), state);

        // New round should have fresh hands and no melds
        assertEquals(2, next.roundNumber());
        assertEquals(7, next.hands().get("alice").size());
        assertEquals(7, next.hands().get("bob").size());
        assertTrue(next.melds().isEmpty());
        assertFalse(next.isFinished());
    }

    @Test
    void scoresAccumulateAcrossRounds() {
        FemState state = buildStateForScoring();
        state.scores().put("alice", 100);
        state.scores().put("bob", 50);

        FemState next = engine.apply(new FemAction.Discard("alice", "H7"), state);

        // alice: 100 + 15 = 115, bob: 50 + (-40) = 10
        assertEquals(115, next.scores().get("alice"));
        assertEquals(10, next.scores().get("bob"));
    }

    /* ══════════════════════════════════════════════════════════════
       VIEW PROJECTOR TESTS
       ══════════════════════════════════════════════════════════════ */

    @Test
    void publicViewContainsExpectedFields() {
        FemState state = buildBasicState();
        FemViewProjector projector = new FemViewProjector();

        Map<String, Object> view = projector.toPublicView(state);

        assertNotNull(view.get("players"));
        assertNotNull(view.get("turnPlayerId"));
        assertNotNull(view.get("roundNumber"));
        assertNotNull(view.get("scores"));
        assertNotNull(view.get("stockPileCount"));
        assertNotNull(view.get("melds"));
        assertNotNull(view.get("playerCardCounts"));
        assertNotNull(view.get("phase"));
    }

    @Test
    void privateViewContainsHand() {
        FemState state = buildBasicState();
        FemViewProjector projector = new FemViewProjector();

        Map<String, Object> view = projector.toPrivateView(state, "alice");

        assertEquals("alice", view.get("playerId"));
        assertNotNull(view.get("hand"));
        assertNotNull(view.get("projectedRoundScore"));
    }

    /* ══════════════════════════════════════════════════════════════
       CARD PRIMITIVE TESTS (Joker support)
       ══════════════════════════════════════════════════════════════ */

    @Test
    void parseJokerCodes() {
        Card j1 = Card.parse("JK1");
        assertEquals("JK", j1.suit());
        assertEquals("1", j1.rank());

        Card j2 = Card.parse("JK2");
        assertEquals("JK", j2.suit());
        assertEquals("2", j2.rank());
    }

    @Test
    void jokerValueIsZero() {
        assertEquals(0, new Card("JK", "1").value());
        assertEquals(0, new Card("JK", "2").value());
    }

    @Test
    void jokerToStringRoundTrips() {
        Card j1 = new Card("JK", "1");
        assertEquals("JK1", j1.toString());
        assertEquals(j1, Card.parse(j1.toString()));
    }

    /* ══════════════════════════════════════════════════════════════
       HELPERS — deterministic states for testing
       ══════════════════════════════════════════════════════════════ */

    /** Basic state: two players, 7 cards each, stock and discard ready, alice's turn. */
    private FemState buildBasicState() {
        FemState state = new FemState(List.of("alice", "bob"));
        state.setPhase(GameState.Phase.PLAYING);
        state.setFirstRound(true);
        state.hands().put("alice", new ArrayList<>(List.of(
                new Card("H", "3"), new Card("H", "4"), new Card("H", "5"),
                new Card("D", "7"), new Card("D", "8"), new Card("D", "9"), new Card("S", "K"))));
        state.hands().put("bob", new ArrayList<>(List.of(
                new Card("S", "3"), new Card("S", "4"), new Card("S", "5"),
                new Card("C", "7"), new Card("C", "8"), new Card("C", "9"), new Card("C", "K"))));
        state.stockPile().addAll(List.of(
                new Card("H", "6"), new Card("H", "7"), new Card("H", "8"),
                new Card("D", "2"), new Card("D", "3"), new Card("D", "4")));
        state.discardPile().add(new Card("H", "2"));
        state.scores().put("alice", 0);
        state.scores().put("bob", 0);
        return state;
    }

    /** State where alice has already drawn (hasDrawnThisTurn = true). */
    private FemState buildStateWithDrawn() {
        FemState state = buildBasicState();
        state.setHasDrawnThisTurn(true);
        return state;
    }

    /** State with an existing meld on the table, alice has drawn. */
    private FemState buildStateWithMeld() {
        FemState state = buildStateWithDrawn();
        // Meld: H3-H4-H5
        state.melds().add(new FemState.Meld("m1", "H", new ArrayList<>(List.of(
                new Card("H", "3"), new Card("H", "4"), new Card("H", "5"))),
                new LinkedHashMap<>(Map.of("alice", new ArrayList<>(List.of(
                        new Card("H", "3"), new Card("H", "4"), new Card("H", "5")))))));
        // Remove those cards from alice's hand and give her H6 + extras
        state.hands().get("alice").clear();
        state.hands().get("alice").addAll(List.of(
                new Card("H", "6"), new Card("D", "7"), new Card("D", "8"),
                new Card("D", "9"), new Card("S", "K")));
        return state;
    }

    /** State ready for round close: alice has 1 card, meld on table, not first round. */
    private FemState buildStateForScoring() {
        FemState state = new FemState(List.of("alice", "bob"));
        state.setPhase(GameState.Phase.PLAYING);
        state.setFirstRound(false);
        state.setHasDrawnThisTurn(true);

        // Alice has just one card left
        state.hands().put("alice", new ArrayList<>(List.of(new Card("H", "7"))));
        // Bob has a full hand
        state.hands().put("bob", new ArrayList<>(List.of(
                new Card("D", "7"), new Card("D", "8"), new Card("D", "9"),
                new Card("S", "K"), new Card("C", "2"), new Card("C", "3"), new Card("C", "4"))));

        // Meld contributed by alice: H3+H4+H5
        state.melds().add(new FemState.Meld("m1", "H", new ArrayList<>(List.of(
                new Card("H", "3"), new Card("H", "4"), new Card("H", "5"))),
                new LinkedHashMap<>(Map.of("alice", new ArrayList<>(List.of(
                        new Card("H", "3"), new Card("H", "4"), new Card("H", "5")))))));

        state.stockPile().addAll(List.of(new Card("H", "10"), new Card("H", "J")));
        state.discardPile().add(new Card("H", "9"));
        state.scores().put("alice", 0);
        state.scores().put("bob", 0);
        return state;
    }
}
