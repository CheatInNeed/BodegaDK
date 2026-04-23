package dk.bodegadk.server.domain.games.fem;

import dk.bodegadk.server.domain.engine.GameEngine;
import dk.bodegadk.server.domain.engine.GameState;
import dk.bodegadk.server.domain.primitives.Card;
import dk.bodegadk.server.domain.primitives.Deck;

import java.util.*;

/**
 * Server-authoritative Danish 500 (Femhundrede) game engine.
 * Pure game logic — no Spring, no networking.
 *
 * <p>Rummy-style melding game: draw, lay melds (3+ consecutive same-suit),
 * extend melds, discard. First to 500 cumulative points wins.
 *
 * <p>{@code apply()} returns a NEW state — does not mutate input.
 */
public class FemEngine implements GameEngine<FemState, FemAction> {

    private static final int CARDS_PER_HAND = 7;
    private static final int WINNING_SCORE = 500;
    private static final int TAKE_PILE_PENALTY = 50;

    private static final List<String> RANK_ORDER = List.of(
            "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"
    );
    // For lookup: rank → index (low ace=0, 2=1, ..., K=12). High ace handled separately.
    private static final Map<String, Integer> RANK_INDEX;
    static {
        RANK_INDEX = new LinkedHashMap<>();
        RANK_INDEX.put("A", 0);
        RANK_INDEX.put("2", 1);
        RANK_INDEX.put("3", 2);
        RANK_INDEX.put("4", 3);
        RANK_INDEX.put("5", 4);
        RANK_INDEX.put("6", 5);
        RANK_INDEX.put("7", 6);
        RANK_INDEX.put("8", 7);
        RANK_INDEX.put("9", 8);
        RANK_INDEX.put("10", 9);
        RANK_INDEX.put("J", 10);
        RANK_INDEX.put("Q", 11);
        RANK_INDEX.put("K", 12);
    }

    @Override public String gameId()    { return "fem"; }
    @Override public int minPlayers()   { return 2; }
    @Override public int maxPlayers()   { return 6; }

    @Override
    public FemState init(List<String> playerIds) {
        if (playerIds.size() < minPlayers()) {
            throw new GameRuleException("Need at least " + minPlayers() + " players");
        }
        if (playerIds.size() > maxPlayers()) {
            throw new GameRuleException("Max " + maxPlayers() + " players");
        }

        FemState state = new FemState(playerIds);
        dealRound(state);
        state.setPhase(GameState.Phase.PLAYING);
        return state;
    }

    @Override
    public void validate(FemAction action, FemState state) throws GameRuleException {
        if (state.isFinished()) {
            throw new GameRuleException("Game is already finished");
        }

        // Grab phase: only ClaimDiscard or PassGrab allowed, and only by priority player
        if (state.discardGrabPhase()) {
            validateGrabPhase(action, state);
            return;
        }

        // Normal turn: must be current player
        if (!action.playerId().equals(state.currentPlayerId())) {
            throw new GameRuleException("Not your turn");
        }

        if (action instanceof FemAction.DrawFromStock) {
            validateDraw(state);
        } else if (action instanceof FemAction.DrawFromDiscard) {
            validateDraw(state);
            if (state.discardPile().isEmpty()) {
                throw new GameRuleException("Discard pile is empty");
            }
        } else if (action instanceof FemAction.TakeDiscardPile take) {
            validateTakeDiscardPile(state);
        } else if (action instanceof FemAction.LayMeld lay) {
            validateHasDrawn(state);
            validateLayMeld(lay, state);
        } else if (action instanceof FemAction.ExtendMeld ext) {
            validateHasDrawn(state);
            validateExtendMeld(ext, state);
        } else if (action instanceof FemAction.SwapJoker swap) {
            validateHasDrawn(state);
            validateSwapJoker(swap, state);
        } else if (action instanceof FemAction.Discard disc) {
            validateHasDrawn(state);
            validateDiscard(disc, state);
        } else {
            throw new GameRuleException("Invalid action outside grab phase");
        }
    }

    @Override
    public FemState apply(FemAction action, FemState state) {
        validate(action, state);
        FemState next = state.copy();

        if (action instanceof FemAction.DrawFromStock) {
            applyDrawFromStock(next);
        } else if (action instanceof FemAction.DrawFromDiscard) {
            applyDrawFromDiscard(next);
        } else if (action instanceof FemAction.TakeDiscardPile) {
            applyTakeDiscardPile(action.playerId(), next);
        } else if (action instanceof FemAction.LayMeld lay) {
            applyLayMeld(lay, next);
        } else if (action instanceof FemAction.ExtendMeld ext) {
            applyExtendMeld(ext, next);
        } else if (action instanceof FemAction.SwapJoker swap) {
            applySwapJoker(swap, next);
        } else if (action instanceof FemAction.Discard disc) {
            applyDiscard(disc, next);
        } else if (action instanceof FemAction.ClaimDiscard claim) {
            applyClaimDiscard(claim, next);
        } else if (action instanceof FemAction.PassGrab pass) {
            applyPassGrab(pass, next);
        }

        return next;
    }

    @Override
    public boolean isFinished(FemState state) {
        return state.isFinished();
    }

    @Override
    public String getWinner(FemState state) {
        return state.winnerPlayerId();
    }

    /* ── Point values ── */

    public static int cardPoints(Card card) {
        if ("JK".equals(card.suit())) return 25;
        return switch (card.rank()) {
            case "A" -> 15;
            case "10", "J", "Q", "K" -> 10;
            default -> 5; // 2-9
        };
    }

    /* ── Deal a new round ── */

    private void dealRound(FemState state) {
        Deck deck = Deck.standard52WithJokers().shuffle();

        state.hands().clear();
        state.melds().clear();
        state.stockPile().clear();
        state.discardPile().clear();
        state.setHasDrawnThisTurn(false);
        state.setRoundClosed(false);
        state.setClosedByPlayerId(null);
        state.setDiscardGrabPhase(false);
        state.setDiscardGrabCard(null);

        // Deal 7 cards to each player
        for (String pid : state.playerIds()) {
            List<Card> hand = new ArrayList<>();
            for (int i = 0; i < CARDS_PER_HAND; i++) {
                hand.add(deck.draw());
            }
            state.hands().put(pid, hand);
        }

        // Remaining cards to stock pile
        while (!deck.isEmpty()) {
            state.stockPile().add(deck.draw());
        }

        // Flip top of stock to start discard pile
        if (!state.stockPile().isEmpty()) {
            state.discardPile().add(state.stockPile().removeFirst());
        }

        // Initialize scores for new players
        for (String pid : state.playerIds()) {
            state.scores().putIfAbsent(pid, 0);
        }
    }

    /* ── Validation helpers ── */

    private void validateDraw(FemState state) {
        if (state.hasDrawnThisTurn()) {
            throw new GameRuleException("Already drew this turn");
        }
    }

    private void validateHasDrawn(FemState state) {
        if (!state.hasDrawnThisTurn()) {
            throw new GameRuleException("Must draw before melding or discarding");
        }
    }

    private void validateTakeDiscardPile(FemState state) {
        validateDraw(state);
        if (state.firstRound()) {
            throw new GameRuleException("Cannot take entire discard pile on first round");
        }
        if (state.discardPile().isEmpty()) {
            throw new GameRuleException("Discard pile is empty");
        }
    }

    private void validateLayMeld(FemAction.LayMeld lay, FemState state) {
        List<Card> hand = state.hands().get(lay.playerId());
        List<Card> cards = parseAndValidateOwnership(lay.cardCodes(), hand);

        if (cards.size() < 3) {
            throw new GameRuleException("Meld must have at least 3 cards");
        }

        validateConsecutiveSameSuit(cards);
    }

    private void validateExtendMeld(FemAction.ExtendMeld ext, FemState state) {
        List<Card> hand = state.hands().get(ext.playerId());
        Card card = Card.parse(ext.cardCode());
        if (!hand.contains(card)) {
            throw new GameRuleException("You do not own card: " + ext.cardCode());
        }

        FemState.Meld meld = findMeld(state, ext.meldId());
        validateCardExtendsMeld(card, meld);
    }

    private void validateSwapJoker(FemAction.SwapJoker swap, FemState state) {
        List<Card> hand = state.hands().get(swap.playerId());
        Card realCard = Card.parse(swap.realCardCode());
        if (!hand.contains(realCard)) {
            throw new GameRuleException("You do not own card: " + swap.realCardCode());
        }

        Card joker = Card.parse(swap.jokerCode());
        if (!"JK".equals(joker.suit())) {
            throw new GameRuleException("Not a joker: " + swap.jokerCode());
        }

        FemState.Meld meld = findMeld(state, swap.meldId());
        if (!meld.cards().contains(joker)) {
            throw new GameRuleException("Joker not found in meld: " + swap.meldId());
        }

        // The real card must fit the position the joker occupies
        int jokerIdx = meld.cards().indexOf(joker);
        String expectedRank = inferJokerRank(meld, jokerIdx);
        if (!realCard.rank().equals(expectedRank) || !realCard.suit().equals(meld.suit())) {
            throw new GameRuleException("Card does not match joker position in meld");
        }
    }

    private void validateDiscard(FemAction.Discard disc, FemState state) {
        List<Card> hand = state.hands().get(disc.playerId());
        Card card = Card.parse(disc.cardCode());
        if (!hand.contains(card)) {
            throw new GameRuleException("You do not own card: " + disc.cardCode());
        }
        // Cannot close (discard last card) on first round
        if (hand.size() == 1 && state.firstRound()) {
            throw new GameRuleException("Cannot close the round on the first round");
        }
    }

    private void validateGrabPhase(FemAction action, FemState state) {
        String priorityPlayer = state.playerIds().get(state.grabPriorityIndex());
        if (!action.playerId().equals(priorityPlayer)) {
            throw new GameRuleException("Not your turn to claim/pass during grab phase");
        }

        if (action instanceof FemAction.ClaimDiscard claim) {
            FemState.Meld meld = findMeld(state, claim.meldId());
            validateCardExtendsMeld(state.discardGrabCard(), meld);
        } else if (action instanceof FemAction.PassGrab) {
            // always valid for priority player
        } else {
            throw new GameRuleException("Only ClaimDiscard or PassGrab allowed during grab phase");
        }
    }

    /* ── Apply helpers ── */

    private void applyDrawFromStock(FemState state) {
        String pid = state.currentPlayerId();
        if (state.stockPile().isEmpty()) {
            reshuffleDiscardToStock(state);
        }
        if (!state.stockPile().isEmpty()) {
            state.hands().get(pid).add(state.stockPile().removeFirst());
        }
        state.setHasDrawnThisTurn(true);
    }

    private void applyDrawFromDiscard(FemState state) {
        String pid = state.currentPlayerId();
        Card top = state.discardPile().removeLast();
        state.hands().get(pid).add(top);
        state.setHasDrawnThisTurn(true);
    }

    private void applyTakeDiscardPile(String playerId, FemState state) {
        List<Card> hand = state.hands().get(playerId);
        hand.addAll(state.discardPile());
        state.discardPile().clear();
        state.setHasDrawnThisTurn(true);
        // Player must now lay a meld; if they don't by the time they discard,
        // penalty is handled at discard time (simplified: we trust the client flow,
        // but the penalty could be applied if no meld is laid before discard).
    }

    private void applyLayMeld(FemAction.LayMeld lay, FemState state) {
        List<Card> hand = state.hands().get(lay.playerId());
        List<Card> cards = new ArrayList<>();
        for (String code : lay.cardCodes()) {
            Card c = Card.parse(code);
            hand.remove(c);
            cards.add(c);
        }

        // Sort cards into consecutive order
        sortMeldCards(cards);

        String suit = determineMeldSuit(cards);
        String meldId = "m" + state.nextMeldId();

        Map<String, List<Card>> contributedBy = new LinkedHashMap<>();
        contributedBy.put(lay.playerId(), new ArrayList<>(cards));

        state.melds().add(new FemState.Meld(meldId, suit, cards, contributedBy));

        checkAutoClose(lay.playerId(), state);
    }

    private void applyExtendMeld(FemAction.ExtendMeld ext, FemState state) {
        List<Card> hand = state.hands().get(ext.playerId());
        Card card = Card.parse(ext.cardCode());
        hand.remove(card);

        FemState.Meld meld = findMeld(state, ext.meldId());
        insertCardIntoMeld(card, meld);

        // Track contribution
        meld.contributedBy()
                .computeIfAbsent(ext.playerId(), k -> new ArrayList<>())
                .add(card);

        checkAutoClose(ext.playerId(), state);
    }

    private void applySwapJoker(FemAction.SwapJoker swap, FemState state) {
        List<Card> hand = state.hands().get(swap.playerId());
        Card realCard = Card.parse(swap.realCardCode());
        Card joker = Card.parse(swap.jokerCode());

        hand.remove(realCard);

        FemState.Meld meld = findMeld(state, swap.meldId());
        int jokerIdx = meld.cards().indexOf(joker);
        meld.cards().set(jokerIdx, realCard);

        // Update contributions: remove joker from whoever contributed it, add real card for this player
        for (var entry : meld.contributedBy().entrySet()) {
            if (entry.getValue().remove(joker)) break;
        }
        meld.contributedBy()
                .computeIfAbsent(swap.playerId(), k -> new ArrayList<>())
                .add(realCard);

        // Player gets the joker
        hand.add(joker);
    }

    private void applyDiscard(FemAction.Discard disc, FemState state) {
        List<Card> hand = state.hands().get(disc.playerId());
        Card card = Card.parse(disc.cardCode());
        hand.remove(card);

        // Check if this closes the round (last card discarded)
        if (hand.isEmpty() && !state.firstRound()) {
            state.discardPile().add(card);
            closeRound(disc.playerId(), state);
            return;
        }

        state.discardPile().add(card);

        // Start grab phase
        startGrabPhase(disc.playerId(), card, state);
    }

    private void applyClaimDiscard(FemAction.ClaimDiscard claim, FemState state) {
        Card card = state.discardGrabCard();
        // Remove from discard pile
        state.discardPile().remove(card);

        FemState.Meld meld = findMeld(state, claim.meldId());
        insertCardIntoMeld(card, meld);

        // Track contribution
        meld.contributedBy()
                .computeIfAbsent(claim.playerId(), k -> new ArrayList<>())
                .add(card);

        // End grab phase, turn passes to next player after the discarder
        endGrabPhase(state);
    }

    private void applyPassGrab(FemAction.PassGrab pass, FemState state) {
        // Move priority to next player
        int discarderIndex = state.playerIds().indexOf(state.currentPlayerId());
        int nextPriority = (state.grabPriorityIndex() + 1) % state.playerCount();

        // If we've gone all the way around back to the discarder, end grab phase
        if (nextPriority == discarderIndex) {
            endGrabPhase(state);
        } else {
            state.setGrabPriorityIndex(nextPriority);
        }
    }

    /* ── Grab phase management ── */

    private void startGrabPhase(String discarderId, Card card, FemState state) {
        int discarderIdx = state.playerIds().indexOf(discarderId);
        int nextIdx = (discarderIdx + 1) % state.playerCount();

        // Only start grab phase if there are melds to extend
        if (state.melds().isEmpty()) {
            advanceToNextPlayer(state);
            return;
        }

        state.setDiscardGrabPhase(true);
        state.setDiscardGrabCard(card);
        state.setGrabPriorityIndex(nextIdx);
    }

    private void endGrabPhase(FemState state) {
        state.setDiscardGrabPhase(false);
        state.setDiscardGrabCard(null);
        advanceToNextPlayer(state);
    }

    private void advanceToNextPlayer(FemState state) {
        state.advanceTurn();
        state.setHasDrawnThisTurn(false);
    }

    /* ── Round end ── */

    private void checkAutoClose(String playerId, FemState state) {
        List<Card> hand = state.hands().get(playerId);
        if (hand.isEmpty() && !state.firstRound()) {
            closeRound(playerId, state);
        }
    }

    private void closeRound(String closerId, FemState state) {
        state.setRoundClosed(true);
        state.setClosedByPlayerId(closerId);

        // Score each player
        for (String pid : state.playerIds()) {
            int meldPoints = calculateMeldPoints(pid, state);
            int handPoints = calculateHandPoints(pid, state);
            int roundScore = meldPoints - handPoints;
            state.scores().merge(pid, roundScore, Integer::sum);
        }

        // Check if any player reached 500
        String winner = null;
        int highestScore = Integer.MIN_VALUE;
        for (var entry : state.scores().entrySet()) {
            if (entry.getValue() >= WINNING_SCORE && entry.getValue() > highestScore) {
                highestScore = entry.getValue();
                winner = entry.getKey();
            }
        }

        if (winner != null) {
            state.setWinnerPlayerId(winner);
            state.setPhase(GameState.Phase.FINISHED);
        } else {
            // Start new round
            state.setRoundNumber(state.roundNumber() + 1);
            state.setFirstRound(false);
            dealRound(state);
            state.setCurrentTurnIndex(0);
        }
    }

    private int calculateMeldPoints(String playerId, FemState state) {
        int total = 0;
        for (FemState.Meld meld : state.melds()) {
            List<Card> contributed = meld.contributedBy().getOrDefault(playerId, List.of());
            for (Card c : contributed) {
                total += cardPoints(c);
            }
        }
        return total;
    }

    private int calculateHandPoints(String playerId, FemState state) {
        int total = 0;
        for (Card c : state.hands().getOrDefault(playerId, List.of())) {
            total += cardPoints(c);
        }
        return total;
    }

    /* ── Meld validation & manipulation ── */

    private List<Card> parseAndValidateOwnership(List<String> codes, List<Card> hand) {
        List<Card> cards = new ArrayList<>();
        List<Card> handCopy = new ArrayList<>(hand);
        for (String code : codes) {
            Card c = Card.parse(code);
            if (!handCopy.remove(c)) {
                throw new GameRuleException("You do not own card: " + code);
            }
            cards.add(c);
        }
        return cards;
    }

    private void validateConsecutiveSameSuit(List<Card> cards) {
        // Separate jokers and real cards
        List<Card> realCards = new ArrayList<>();
        int jokerCount = 0;
        String suit = null;

        for (Card c : cards) {
            if ("JK".equals(c.suit())) {
                jokerCount++;
            } else {
                realCards.add(c);
                if (suit == null) {
                    suit = c.suit();
                } else if (!suit.equals(c.suit())) {
                    throw new GameRuleException("All cards in a meld must be the same suit");
                }
            }
        }

        if (realCards.isEmpty()) {
            throw new GameRuleException("Meld must have at least one non-joker card");
        }

        // Sort real cards by rank index
        realCards.sort(Comparator.comparingInt(c -> rankIndex(c.rank())));

        // Check if they can form a consecutive sequence with jokers filling gaps
        // Try both ace-low and ace-high interpretations
        if (!canFormSequence(realCards, jokerCount, false) && !canFormSequence(realCards, jokerCount, true)) {
            throw new GameRuleException("Cards must form a consecutive sequence");
        }
    }

    private boolean canFormSequence(List<Card> sortedRealCards, int jokerCount, boolean aceHigh) {
        List<Integer> indices = new ArrayList<>();
        for (Card c : sortedRealCards) {
            int idx = rankIndex(c.rank());
            if (aceHigh && "A".equals(c.rank())) {
                idx = 13; // ace high (after K=12)
            }
            indices.add(idx);
        }
        indices.sort(Integer::compareTo);

        // Check for duplicates
        for (int i = 1; i < indices.size(); i++) {
            if (indices.get(i).equals(indices.get(i - 1))) {
                return false;
            }
        }

        // Count gaps that need jokers
        int gapsNeeded = 0;
        for (int i = 1; i < indices.size(); i++) {
            int gap = indices.get(i) - indices.get(i - 1) - 1;
            if (gap < 0) return false;
            gapsNeeded += gap;
        }

        // Remaining jokers extend the sequence at either end — that's always valid
        return gapsNeeded <= jokerCount;
    }

    private int rankIndex(String rank) {
        Integer idx = RANK_INDEX.get(rank);
        if (idx == null) throw new GameRuleException("Invalid rank: " + rank);
        return idx;
    }

    private String determineMeldSuit(List<Card> cards) {
        for (Card c : cards) {
            if (!"JK".equals(c.suit())) {
                return c.suit();
            }
        }
        throw new GameRuleException("Meld must have at least one non-joker card");
    }

    private void sortMeldCards(List<Card> cards) {
        // Separate jokers
        List<Card> jokers = new ArrayList<>();
        List<Card> realCards = new ArrayList<>();
        for (Card c : cards) {
            if ("JK".equals(c.suit())) jokers.add(c);
            else realCards.add(c);
        }

        // Check if ace-high sequence
        boolean aceHigh = isAceHighSequence(realCards);

        realCards.sort(Comparator.comparingInt(c -> {
            int idx = rankIndex(c.rank());
            if (aceHigh && "A".equals(c.rank())) return 13;
            return idx;
        }));

        // Rebuild: insert jokers into gaps
        cards.clear();
        if (jokers.isEmpty()) {
            cards.addAll(realCards);
        } else {
            // Place real cards and fill gaps with jokers
            List<Integer> indices = new ArrayList<>();
            for (Card c : realCards) {
                int idx = rankIndex(c.rank());
                if (aceHigh && "A".equals(c.rank())) idx = 13;
                indices.add(idx);
            }

            int jokerIdx = 0;
            for (int i = 0; i < realCards.size(); i++) {
                cards.add(realCards.get(i));
                if (i < realCards.size() - 1) {
                    int gap = indices.get(i + 1) - indices.get(i) - 1;
                    for (int g = 0; g < gap && jokerIdx < jokers.size(); g++) {
                        cards.add(jokers.get(jokerIdx++));
                    }
                }
            }
            // Remaining jokers go at the ends
            while (jokerIdx < jokers.size()) {
                cards.add(jokers.get(jokerIdx++));
            }
        }
    }

    private boolean isAceHighSequence(List<Card> realCards) {
        boolean hasAce = false;
        boolean hasKing = false;
        boolean hasTwo = false;
        for (Card c : realCards) {
            if ("A".equals(c.rank())) hasAce = true;
            if ("K".equals(c.rank())) hasKing = true;
            if ("2".equals(c.rank())) hasTwo = true;
        }
        // Ace-high if we have K (or Q) and A but not 2
        return hasAce && hasKing && !hasTwo;
    }

    private FemState.Meld findMeld(FemState state, String meldId) {
        for (FemState.Meld m : state.melds()) {
            if (m.id().equals(meldId)) return m;
        }
        throw new GameRuleException("Meld not found: " + meldId);
    }

    private void validateCardExtendsMeld(Card card, FemState.Meld meld) {
        // Card must be same suit as meld (or joker)
        if (!"JK".equals(card.suit()) && !card.suit().equals(meld.suit())) {
            throw new GameRuleException("Card suit does not match meld");
        }

        if ("JK".equals(card.suit())) {
            // Jokers can always extend
            return;
        }

        // Card must be consecutive at either end of the meld
        List<Card> meldCards = meld.cards();
        int cardIdx = rankIndex(card.rank());

        // Find the effective rank indices of the meld
        List<Integer> meldIndices = getMeldRankIndices(meld);

        int lowEnd = meldIndices.getFirst() - 1;
        int highEnd = meldIndices.getLast() + 1;

        // Handle ace-high: if meld ends at K (12), ace (as 13) can extend
        boolean aceHigh = cardIdx == 0 && highEnd == 13; // ace extending after K
        if (aceHigh || cardIdx == lowEnd || cardIdx == highEnd) {
            return;
        }

        // Also check ace as high (13)
        if ("A".equals(card.rank()) && highEnd == 13) {
            return;
        }

        throw new GameRuleException("Card does not extend the meld");
    }

    private void insertCardIntoMeld(Card card, FemState.Meld meld) {
        List<Card> meldCards = meld.cards();
        List<Integer> indices = getMeldRankIndices(meld);

        int cardIdx;
        if ("JK".equals(card.suit())) {
            // Add joker at the end that makes more sense (high end by default)
            meldCards.add(card);
            return;
        }

        cardIdx = rankIndex(card.rank());

        // Check if ace-high
        if ("A".equals(card.rank()) && !indices.isEmpty() && indices.getLast() >= 11) {
            cardIdx = 13;
        }

        if (cardIdx < indices.getFirst()) {
            meldCards.addFirst(card);
        } else {
            meldCards.add(card);
        }
    }

    private List<Integer> getMeldRankIndices(FemState.Meld meld) {
        List<Integer> indices = new ArrayList<>();
        boolean hasHighCards = false;

        // First pass: check if meld contains high cards (J, Q, K)
        for (Card c : meld.cards()) {
            if (!"JK".equals(c.suit())) {
                int idx = rankIndex(c.rank());
                if (idx >= 10) hasHighCards = true;
            }
        }

        int jokerOffset = 0;
        Integer lastReal = null;
        for (Card c : meld.cards()) {
            if ("JK".equals(c.suit())) {
                // Infer joker position from surroundings
                if (lastReal != null) {
                    indices.add(lastReal + 1 + jokerOffset);
                    jokerOffset++;
                } else {
                    jokerOffset++;
                }
            } else {
                int idx = rankIndex(c.rank());
                if ("A".equals(c.rank()) && hasHighCards) {
                    idx = 13; // ace-high
                }
                // Fill in joker positions before this card
                if (lastReal == null && jokerOffset > 0) {
                    for (int j = jokerOffset; j > 0; j--) {
                        indices.add(idx - j);
                    }
                }
                indices.add(idx);
                lastReal = idx;
                jokerOffset = 0;
            }
        }
        // Handle trailing jokers
        if (jokerOffset > 0 && lastReal != null) {
            for (int j = 1; j <= jokerOffset; j++) {
                indices.add(lastReal + j);
            }
        }

        return indices;
    }

    private String inferJokerRank(FemState.Meld meld, int jokerIdx) {
        List<Integer> indices = getMeldRankIndices(meld);
        int rankIdx = indices.get(jokerIdx);
        // Reverse lookup
        if (rankIdx == 13) return "A";
        for (var entry : RANK_INDEX.entrySet()) {
            if (entry.getValue() == rankIdx) return entry.getKey();
        }
        throw new GameRuleException("Cannot determine joker rank");
    }

    /* ── Stock reshuffle ── */

    private void reshuffleDiscardToStock(FemState state) {
        if (state.discardPile().size() <= 1) return;
        // Keep top card, shuffle rest into stock
        Card top = state.discardPile().removeLast();
        state.stockPile().addAll(state.discardPile());
        state.discardPile().clear();
        state.discardPile().add(top);
        Collections.shuffle(state.stockPile());
    }
}
