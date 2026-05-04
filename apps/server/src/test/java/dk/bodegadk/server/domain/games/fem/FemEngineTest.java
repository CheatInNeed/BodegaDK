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
        // 52 total - 14 dealt - 1 discard = 37 stock
        assertEquals(37, state.stockPile().size());
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
        // 52 - 21 dealt - 1 discard = 30 stock
        assertEquals(30, state.stockPile().size());
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
        assertEquals(5, next.hands().get("alice").size());
        assertEquals("alice", next.melds().getFirst().ownerPlayerId());
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

        FemState next = engine.apply(
                new FemAction.ExtendMeld("alice", "m1", "H6"), state);

        assertEquals(4, next.melds().getFirst().cards().size());
        assertFalse(next.hands().get("alice").contains(new Card("H", "6")));
    }

    @Test
    void extendMeldWithInvalidCardThrows() {
        FemState state = buildStateWithMeld();

        assertThrows(GameRuleException.class, () ->
                engine.apply(new FemAction.ExtendMeld("alice", "m1", "D7"), state));
    }

    @Test
    void extendingAnotherPlayersMeldTransfersOwnership() {
        // Alice owns H3H4H5; move H6 to Bob so Bob can extend
        FemState state = buildStateWithMeld();
        state.hands().get("alice").remove(new Card("H", "6"));
        state.hands().get("bob").add(new Card("H", "6"));
        state.advanceTurn(); // Bob's turn
        state.setHasDrawnThisTurn(true);

        FemState afterBob = engine.apply(new FemAction.ExtendMeld("bob", "m1", "H6"), state);

        assertEquals("bob", afterBob.melds().getFirst().ownerPlayerId());
        assertEquals(4, afterBob.melds().getFirst().cards().size());
        assertTrue(afterBob.melds().getFirst().contributedBy().containsKey("bob"));
    }

    @Test
    void extendAceHighMeldWithJackOnLowEnd() {
        FemState state = buildStateWithDrawn();
        state.melds().add(new FemState.Meld("m1", "S", new ArrayList<>(List.of(
                new Card("S", "Q"), new Card("S", "K"), new Card("S", "A"))),
                new LinkedHashMap<>(Map.of("alice", new ArrayList<>(List.of(
                        new Card("S", "Q"), new Card("S", "K"), new Card("S", "A"))))),
                "alice"));
        state.hands().get("alice").clear();
        state.hands().get("alice").addAll(List.of(
                new Card("S", "J"), new Card("D", "7"), new Card("D", "8"),
                new Card("D", "9"), new Card("C", "2")));

        FemState next = engine.apply(new FemAction.ExtendMeld("alice", "m1", "SJ"), state);

        assertEquals(4, next.melds().getFirst().cards().size());
        assertEquals("SJ", next.melds().getFirst().cards().getFirst().toString());
    }

    @Test
    void extendAceHighMeldWithTwoWrapsToHighEnd() {
        FemState state = buildStateWithDrawn();
        state.melds().add(new FemState.Meld("m1", "S", new ArrayList<>(List.of(
                new Card("S", "Q"), new Card("S", "K"), new Card("S", "A"))),
                new LinkedHashMap<>(Map.of("alice", new ArrayList<>(List.of(
                        new Card("S", "Q"), new Card("S", "K"), new Card("S", "A"))))),
                "alice"));
        state.hands().get("alice").clear();
        state.hands().get("alice").addAll(List.of(
                new Card("S", "2"), new Card("D", "7"), new Card("D", "8"),
                new Card("D", "9"), new Card("C", "2")));

        FemState next = engine.apply(new FemAction.ExtendMeld("alice", "m1", "S2"), state);

        assertEquals(4, next.melds().getFirst().cards().size());
        assertEquals("S2", next.melds().getFirst().cards().getLast().toString());
    }

    @Test
    void extendWrappedMeldFurtherWithThree() {
        FemState state = buildStateWithDrawn();
        // Meld already wrapped: QS KS AS 2S
        state.melds().add(new FemState.Meld("m1", "S", new ArrayList<>(List.of(
                new Card("S", "Q"), new Card("S", "K"), new Card("S", "A"), new Card("S", "2"))),
                new LinkedHashMap<>(Map.of("alice", new ArrayList<>(List.of(
                        new Card("S", "Q"), new Card("S", "K"), new Card("S", "A"), new Card("S", "2"))))),
                "alice"));
        state.hands().get("alice").clear();
        state.hands().get("alice").addAll(List.of(
                new Card("S", "3"), new Card("D", "7"), new Card("D", "8"),
                new Card("D", "9"), new Card("C", "2")));

        FemState next = engine.apply(new FemAction.ExtendMeld("alice", "m1", "S3"), state);

        assertEquals(5, next.melds().getFirst().cards().size());
        assertEquals("S3", next.melds().getFirst().cards().getLast().toString());
    }

    @Test
    void anyPlayerCanFurtherExtendMeldAfterOwnershipTransfer() {
        // Alice owns H3H4H5; Bob extends with H6 (becomes owner); Alice then extends with H7
        FemState state = buildStateWithMeld();
        state.hands().get("alice").remove(new Card("H", "6"));
        state.hands().get("bob").add(new Card("H", "6"));
        state.advanceTurn(); // Bob's turn
        state.setHasDrawnThisTurn(true);

        FemState afterBob = engine.apply(new FemAction.ExtendMeld("bob", "m1", "H6"), state);

        // Alice's turn — give her H7 and let her extend Bob's meld
        afterBob.advanceTurn(); // Alice's turn
        afterBob.setHasDrawnThisTurn(true);
        afterBob.hands().get("alice").add(new Card("H", "7"));

        FemState afterAlice = engine.apply(new FemAction.ExtendMeld("alice", "m1", "H7"), afterBob);

        assertEquals(5, afterAlice.melds().getFirst().cards().size());
        assertEquals("alice", afterAlice.melds().getFirst().ownerPlayerId());
        assertFalse(afterAlice.hands().get("alice").contains(new Card("H", "7")));
    }

    /* ══════════════════════════════════════════════════════════════
       TAKE DISCARD PILE TESTS
       ══════════════════════════════════════════════════════════════ */

    @Test
    void takingDiscardPileWithoutLayingMeldCostsFiftyPoints() {
        FemState state = buildBasicState();
        state.setFirstRound(false);
        state.scores().put("alice", 100);

        FemState afterTake = engine.apply(new FemAction.TakeDiscardPile("alice"), state);
        assertTrue(afterTake.tookDiscardPileThisTurn());

        // Alice discards without laying a meld — penalty applies
        String discard = afterTake.hands().get("alice").getLast().toString();
        FemState afterDiscard = engine.apply(new FemAction.Discard("alice", discard), afterTake);

        assertEquals(50, afterDiscard.scores().get("alice")); // 100 - 50
        assertFalse(afterDiscard.tookDiscardPileThisTurn()); // flag reset
    }

    @Test
    void takingDiscardPileAndLayingMeldIncursNoPenalty() {
        FemState state = buildBasicState();
        state.setFirstRound(false);
        state.scores().put("alice", 100);
        // Give alice a hand that has a valid meld plus extras
        state.hands().put("alice", new ArrayList<>(List.of(
                new Card("H", "3"), new Card("H", "4"), new Card("H", "5"),
                new Card("D", "7"), new Card("D", "8"))));

        FemState afterTake = engine.apply(new FemAction.TakeDiscardPile("alice"), state);

        FemState afterMeld = engine.apply(
                new FemAction.LayMeld("alice", List.of("H3", "H4", "H5")), afterTake);

        String discard = afterMeld.hands().get("alice").getLast().toString();
        FemState afterDiscard = engine.apply(new FemAction.Discard("alice", discard), afterMeld);

        assertEquals(100, afterDiscard.scores().get("alice")); // no penalty
    }

    @Test
    void normalDrawAndDiscardIncursNoPenalty() {
        FemState state = buildBasicState();
        state.scores().put("alice", 100);

        FemState afterDraw = engine.apply(new FemAction.DrawFromStock("alice"), state);
        String discard = afterDraw.hands().get("alice").getLast().toString();
        FemState afterDiscard = engine.apply(new FemAction.Discard("alice", discard), afterDraw);

        assertEquals(100, afterDiscard.scores().get("alice")); // no penalty
    }

    /* ══════════════════════════════════════════════════════════════
       DISCARD AND TURN FLOW TESTS
       ══════════════════════════════════════════════════════════════ */

    @Test
    void discardEndsPlayerTurn() {
        FemState state = buildBasicState();

        FemState afterDraw = engine.apply(new FemAction.DrawFromStock("alice"), state);
        String cardToDiscard = afterDraw.hands().get("alice").getLast().toString();

        FemState afterDiscard = engine.apply(
                new FemAction.Discard("alice", cardToDiscard), afterDraw);

        assertEquals("bob", afterDiscard.currentPlayerId());
        assertFalse(afterDiscard.hasDrawnThisTurn());
    }

    @Test
    void discardWithMeldsOnTableStillAdvancesTurn() {
        FemState state = buildStateWithMeld();
        String cardToDiscard = state.hands().get("alice").getLast().toString();

        FemState afterDiscard = engine.apply(
                new FemAction.Discard("alice", cardToDiscard), state);

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
        state.hands().get("alice").clear();
        state.hands().get("alice").add(new Card("H", "7"));

        assertThrows(GameRuleException.class, () ->
                engine.apply(new FemAction.Discard("alice", "H7"), state));
    }

    @Test
    void discardLastCardClosesRound() {
        FemState state = buildStateWithDrawn();
        state.setFirstRound(false);
        state.hands().get("alice").clear();
        state.hands().get("alice").add(new Card("H", "7"));

        FemState next = engine.apply(new FemAction.Discard("alice", "H7"), state);

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

        FemState next = engine.apply(new FemAction.Discard("alice", "H7"), state);

        assertEquals(15, next.scores().get("alice"));
        assertEquals(-40, next.scores().get("bob"));
    }

    @Test
    void gameEndsWhenPlayerReaches500() {
        FemState state = buildStateForScoring();
        state.scores().put("alice", 490);

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

        assertEquals(-140, next.scores().get("bob"));
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
       MULTI-ROUND TESTS
       ══════════════════════════════════════════════════════════════ */

    @Test
    void newRoundResetsHandsAndMelds() {
        FemState state = buildStateForScoring();

        FemState next = engine.apply(new FemAction.Discard("alice", "H7"), state);

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

    @Test
    void publicViewMeldIncludesOwnerId() {
        FemState state = buildStateForScoring();
        FemViewProjector projector = new FemViewProjector();

        Map<String, Object> view = projector.toPublicView(state);

        @SuppressWarnings("unchecked")
        var melds = (List<Map<String, Object>>) view.get("melds");
        assertFalse(melds.isEmpty());
        assertEquals("alice", melds.getFirst().get("ownerId"));
    }

    /* ══════════════════════════════════════════════════════════════
       HELPERS — deterministic states for testing
       ══════════════════════════════════════════════════════════════ */

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

    private FemState buildStateWithDrawn() {
        FemState state = buildBasicState();
        state.setFirstRound(false);
        state.setHasDrawnThisTurn(true);
        return state;
    }

    private FemState buildStateWithMeld() {
        FemState state = buildStateWithDrawn();
        state.melds().add(new FemState.Meld("m1", "H", new ArrayList<>(List.of(
                new Card("H", "3"), new Card("H", "4"), new Card("H", "5"))),
                new LinkedHashMap<>(Map.of("alice", new ArrayList<>(List.of(
                        new Card("H", "3"), new Card("H", "4"), new Card("H", "5"))))),
                "alice"));
        state.hands().get("alice").clear();
        state.hands().get("alice").addAll(List.of(
                new Card("H", "6"), new Card("D", "7"), new Card("D", "8"),
                new Card("D", "9"), new Card("S", "K")));
        return state;
    }

    private FemState buildStateForScoring() {
        FemState state = new FemState(List.of("alice", "bob"));
        state.setPhase(GameState.Phase.PLAYING);
        state.setFirstRound(false);
        state.setHasDrawnThisTurn(true);

        state.hands().put("alice", new ArrayList<>(List.of(new Card("H", "7"))));
        state.hands().put("bob", new ArrayList<>(List.of(
                new Card("D", "7"), new Card("D", "8"), new Card("D", "9"),
                new Card("S", "K"), new Card("C", "2"), new Card("C", "3"), new Card("C", "4"))));

        state.melds().add(new FemState.Meld("m1", "H", new ArrayList<>(List.of(
                new Card("H", "3"), new Card("H", "4"), new Card("H", "5"))),
                new LinkedHashMap<>(Map.of("alice", new ArrayList<>(List.of(
                        new Card("H", "3"), new Card("H", "4"), new Card("H", "5"))))),
                "alice"));

        state.stockPile().addAll(List.of(new Card("H", "10"), new Card("H", "J")));
        state.discardPile().add(new Card("H", "9"));
        state.scores().put("alice", 0);
        state.scores().put("bob", 0);
        return state;
    }
}
