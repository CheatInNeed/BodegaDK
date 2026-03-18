package dk.bodegadk.server.domain.primitives;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Mutable card deck. Supports shuffle, draw, peek, deal, and remaining count.
 * Factory method for standard 52-card deck.
 */
public final class Deck {

    private static final String[] SUITS = {"H", "D", "S", "C"};
    private static final String[] RANKS = {"2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"};

    private final List<Card> cards;

    public Deck(List<Card> cards) {
        this.cards = new ArrayList<>(cards);
    }

    /** Create a standard 52-card deck (unshuffled). */
    public static Deck standard52() {
        List<Card> cards = new ArrayList<>(52);
        for (String suit : SUITS) {
            for (String rank : RANKS) {
                cards.add(new Card(suit, rank));
            }
        }
        return new Deck(cards);
    }

    /** Shuffle in-place. Returns self for chaining: {@code Deck.standard52().shuffle()} */
    public Deck shuffle() {
        Collections.shuffle(cards);
        return this;
    }

    /** Draw (remove and return) the top card. */
    public Card draw() {
        if (cards.isEmpty()) throw new IllegalStateException("Deck is empty");
        return cards.removeFirst();
    }

    /** Peek at the top card without removing it. */
    public Card peek() {
        if (cards.isEmpty()) throw new IllegalStateException("Deck is empty");
        return cards.getFirst();
    }

    public int remaining() { return cards.size(); }
    public boolean isEmpty() { return cards.isEmpty(); }

    /**
     * Deal entire deck as evenly as possible into {@code handCount} hands.
     * Drains the deck completely.
     */
    public List<List<Card>> deal(int handCount) {
        List<List<Card>> hands = new ArrayList<>();
        for (int i = 0; i < handCount; i++) {
            hands.add(new ArrayList<>());
        }
        int idx = 0;
        while (!cards.isEmpty()) {
            hands.get(idx % handCount).add(cards.removeFirst());
            idx++;
        }
        return hands;
    }
}

