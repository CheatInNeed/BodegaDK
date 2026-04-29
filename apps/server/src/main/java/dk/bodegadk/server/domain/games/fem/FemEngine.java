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

    private static final List<String> RANK_ORDER = List.of(
            "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"
    );
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
        } else if (action instanceof FemAction.TakeDiscardPile) {
            validateTakeDiscardPile(state);
        } else if (action instanceof FemAction.LayMeld lay) {
            validateHasDrawn(state);
            validateLayMeld(lay, state);
        } else if (action instanceof FemAction.ExtendMeld ext) {
            validateHasDrawn(state);
            validateExtendMeld(ext, state);
        } else if (action instanceof FemAction.Discard disc) {
            validateHasDrawn(state);
            validateDiscard(disc, state);
        } else {
            throw new GameRuleException("Unknown action");
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
        } else if (action instanceof FemAction.Discard disc) {
            applyDiscard(disc, next);
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
        return switch (card.rank()) {
            case "A" -> 15;
            case "10", "J", "Q", "K" -> 10;
            default -> 5; // 2-9
        };
    }

    /* ── Deal a new round ── */

    private void dealRound(FemState state) {
        Deck deck = Deck.standard52().shuffle();

        state.hands().clear();
        state.melds().clear();
        state.stockPile().clear();
        state.discardPile().clear();
        state.setHasDrawnThisTurn(false);
        state.setRoundClosed(false);
        state.setClosedByPlayerId(null);

        for (String pid : state.playerIds()) {
            List<Card> hand = new ArrayList<>();
            for (int i = 0; i < CARDS_PER_HAND; i++) {
                hand.add(deck.draw());
            }
            state.hands().put(pid, hand);
        }

        while (!deck.isEmpty()) {
            state.stockPile().add(deck.draw());
        }

        if (!state.stockPile().isEmpty()) {
            state.discardPile().add(state.stockPile().removeFirst());
        }

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

    private void validateDiscard(FemAction.Discard disc, FemState state) {
        List<Card> hand = state.hands().get(disc.playerId());
        Card card = Card.parse(disc.cardCode());
        if (!hand.contains(card)) {
            throw new GameRuleException("You do not own card: " + disc.cardCode());
        }
        if (hand.size() == 1 && state.firstRound()) {
            throw new GameRuleException("Cannot close the round on the first round");
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
        state.setTookDiscardPileThisTurn(true);
    }

    private void applyLayMeld(FemAction.LayMeld lay, FemState state) {
        List<Card> hand = state.hands().get(lay.playerId());
        List<Card> cards = new ArrayList<>();
        for (String code : lay.cardCodes()) {
            Card c = Card.parse(code);
            hand.remove(c);
            cards.add(c);
        }

        sortMeldCards(cards);

        String suit = determineMeldSuit(cards);
        String meldId = "m" + state.nextMeldId();

        Map<String, List<Card>> contributedBy = new LinkedHashMap<>();
        contributedBy.put(lay.playerId(), new ArrayList<>(cards));

        state.melds().add(new FemState.Meld(meldId, suit, cards, contributedBy, lay.playerId()));
        state.setLaidMeldThisTurn(true);

        checkAutoClose(lay.playerId(), state);
    }

    private void applyExtendMeld(FemAction.ExtendMeld ext, FemState state) {
        List<Card> hand = state.hands().get(ext.playerId());
        Card card = Card.parse(ext.cardCode());
        hand.remove(card);

        FemState.Meld meld = findMeld(state, ext.meldId());
        insertCardIntoMeld(card, meld);

        meld.contributedBy()
                .computeIfAbsent(ext.playerId(), k -> new ArrayList<>())
                .add(card);

        // Transfer ownership to whoever extended — their zone shows this meld
        int idx = state.melds().indexOf(meld);
        state.melds().set(idx, new FemState.Meld(meld.id(), meld.suit(), meld.cards(), meld.contributedBy(), ext.playerId()));

        checkAutoClose(ext.playerId(), state);
    }

    private void applyDiscard(FemAction.Discard disc, FemState state) {
        List<Card> hand = state.hands().get(disc.playerId());
        Card card = Card.parse(disc.cardCode());
        hand.remove(card);

        if (hand.isEmpty() && !state.firstRound()) {
            applyTurnEnd(disc.playerId(), state);
            state.discardPile().add(card);
            closeRound(disc.playerId(), state);
            return;
        }

        state.discardPile().add(card);
        advanceToNextPlayer(state);
    }

    /* ── Turn management ── */

    private void applyTurnEnd(String playerId, FemState state) {
        if (state.tookDiscardPileThisTurn() && !state.laidMeldThisTurn()) {
            state.scores().merge(playerId, -50, Integer::sum);
        }
        state.setTookDiscardPileThisTurn(false);
        state.setLaidMeldThisTurn(false);
    }

    private void advanceToNextPlayer(FemState state) {
        applyTurnEnd(state.currentPlayerId(), state);
        state.advanceTurn();
        state.setHasDrawnThisTurn(false);
    }

    /* ── Round end ── */

    private void checkAutoClose(String playerId, FemState state) {
        List<Card> hand = state.hands().get(playerId);
        if (hand.isEmpty() && !state.firstRound()) {
            applyTurnEnd(playerId, state);
            closeRound(playerId, state);
        }
    }

    private void closeRound(String closerId, FemState state) {
        state.setRoundClosed(true);
        state.setClosedByPlayerId(closerId);

        for (String pid : state.playerIds()) {
            int meldPoints = calculateMeldPoints(pid, state);
            int handPoints = calculateHandPoints(pid, state);
            int roundScore = meldPoints - handPoints;
            state.scores().merge(pid, roundScore, Integer::sum);
        }

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
        String suit = null;
        for (Card c : cards) {
            if (suit == null) {
                suit = c.suit();
            } else if (!suit.equals(c.suit())) {
                throw new GameRuleException("All cards in a meld must be the same suit");
            }
        }

        List<Card> sorted = new ArrayList<>(cards);
        sorted.sort(Comparator.comparingInt(c -> rankIndex(c.rank())));

        if (!canFormSequence(sorted, false) && !canFormSequence(sorted, true)) {
            throw new GameRuleException("Cards must form a consecutive sequence");
        }
    }

    private boolean canFormSequence(List<Card> sortedCards, boolean aceHigh) {
        List<Integer> indices = new ArrayList<>();
        for (Card c : sortedCards) {
            int idx = rankIndex(c.rank());
            if (aceHigh && "A".equals(c.rank())) idx = 13;
            indices.add(idx);
        }
        indices.sort(Integer::compareTo);

        for (int i = 1; i < indices.size(); i++) {
            if (!indices.get(i).equals(indices.get(i - 1) + 1)) {
                return false;
            }
        }
        return true;
    }

    private int rankIndex(String rank) {
        Integer idx = RANK_INDEX.get(rank);
        if (idx == null) throw new GameRuleException("Invalid rank: " + rank);
        return idx;
    }

    private String determineMeldSuit(List<Card> cards) {
        if (cards.isEmpty()) throw new GameRuleException("Meld must have at least one card");
        return cards.getFirst().suit();
    }

    private void sortMeldCards(List<Card> cards) {
        boolean aceHigh = isAceHighSequence(cards);
        cards.sort(Comparator.comparingInt(c -> {
            int idx = rankIndex(c.rank());
            if (aceHigh && "A".equals(c.rank())) return 13;
            return idx;
        }));
    }

    private boolean isAceHighSequence(List<Card> cards) {
        boolean hasAce = false;
        boolean hasKing = false;
        boolean hasTwo = false;
        for (Card c : cards) {
            if ("A".equals(c.rank())) hasAce = true;
            if ("K".equals(c.rank())) hasKing = true;
            if ("2".equals(c.rank())) hasTwo = true;
        }
        return hasAce && hasKing && !hasTwo;
    }

    private FemState.Meld findMeld(FemState state, String meldId) {
        for (FemState.Meld m : state.melds()) {
            if (m.id().equals(meldId)) return m;
        }
        throw new GameRuleException("Meld not found: " + meldId);
    }

    private void validateCardExtendsMeld(Card card, FemState.Meld meld) {
        if (!card.suit().equals(meld.suit())) {
            throw new GameRuleException("Card suit does not match meld");
        }

        List<Integer> meldIndices = getMeldRankIndices(meld);
        int cardIdx = rankIndex(card.rank());

        int lowEnd = meldIndices.getFirst() - 1;
        int highEnd = meldIndices.getLast() + 1;

        // Ace can extend after K (as index 13)
        if ("A".equals(card.rank()) && highEnd == 13) return;
        if (cardIdx == lowEnd || cardIdx == highEnd) return;

        throw new GameRuleException("Card does not extend the meld");
    }

    private void insertCardIntoMeld(Card card, FemState.Meld meld) {
        List<Integer> indices = getMeldRankIndices(meld);
        int cardIdx = rankIndex(card.rank());

        // Ace-high: if meld ends near K, treat ace as 13
        if ("A".equals(card.rank()) && !indices.isEmpty() && indices.getLast() >= 11) {
            meld.cards().add(card);
            return;
        }

        if (cardIdx < indices.getFirst()) {
            meld.cards().addFirst(card);
        } else {
            meld.cards().add(card);
        }
    }

    private List<Integer> getMeldRankIndices(FemState.Meld meld) {
        List<Integer> indices = new ArrayList<>();
        boolean hasHighCards = meld.cards().stream()
                .anyMatch(c -> rankIndex(c.rank()) >= 10);

        for (Card c : meld.cards()) {
            int idx = rankIndex(c.rank());
            if ("A".equals(c.rank()) && hasHighCards) idx = 13;
            indices.add(idx);
        }
        return indices;
    }

    /* ── Stock reshuffle ── */

    private void reshuffleDiscardToStock(FemState state) {
        if (state.discardPile().size() <= 1) return;
        Card top = state.discardPile().removeLast();
        state.stockPile().addAll(state.discardPile());
        state.discardPile().clear();
        state.discardPile().add(top);
        Collections.shuffle(state.stockPile());
    }
}
