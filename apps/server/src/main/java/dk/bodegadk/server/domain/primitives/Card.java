package dk.bodegadk.server.domain.primitives;

import java.util.Objects;

/**
 * Immutable playing card with suit and rank.
 * Protocol format: first char = suit (H/D/S/C), remainder = rank.
 * Examples: "H7" (Hearts 7), "DA" (Diamonds Ace), "S10" (Spades 10).
 */
public final class Card {

    private final String suit;
    private final String rank;

    public Card(String suit, String rank) {
        this.suit = Objects.requireNonNull(suit);
        this.rank = Objects.requireNonNull(rank);
    }

    public String suit() { return suit; }
    public String rank() { return rank; }

    /** Numeric value for comparison: 2=2, 3=3, ..., 10=10, J=11, Q=12, K=13, A=14. Joker=0. */
    public int value() {
        if ("JK".equals(suit)) return 0;
        return switch (rank) {
            case "J" -> 11;
            case "Q" -> 12;
            case "K" -> 13;
            case "A" -> 14;
            default -> Integer.parseInt(rank);
        };
    }

    /**
     * Parse a protocol card code ("H7", "DA", "S10", "JK1", "JK2") into a Card.
     */
    public static Card parse(String code) {
        if (code == null || code.length() < 2) {
            throw new IllegalArgumentException("Invalid card code: " + code);
        }
        String upper = code.toUpperCase();
        if (upper.startsWith("JK")) {
            return new Card("JK", upper.substring(2));
        }
        String s = upper.substring(0, 1);
        String r = upper.substring(1);
        return new Card(s, r);
    }

    /** Protocol-compatible string: "H7", "DA", etc. */
    @Override
    public String toString() {
        return suit + rank;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Card c)) return false;
        return suit.equals(c.suit) && rank.equals(c.rank);
    }

    @Override
    public int hashCode() {
        return Objects.hash(suit, rank);
    }
}

