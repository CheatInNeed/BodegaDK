package dk.bodegadk.server.domain.primitives;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class CardTest {

    @Test
    void parseStandardCard() {
        Card c = Card.parse("H7");
        assertEquals("H", c.suit());
        assertEquals("7", c.rank());
    }

    @Test
    void parseTen() {
        Card c = Card.parse("S10");
        assertEquals("S", c.suit());
        assertEquals("10", c.rank());
    }

    @Test
    void parseLowercase() {
        Card c = Card.parse("da");
        assertEquals("D", c.suit());
        assertEquals("A", c.rank());
    }

    @Test
    void toStringMatchesProtocol() {
        assertEquals("H7", new Card("H", "7").toString());
        assertEquals("S10", new Card("S", "10").toString());
    }

    @Test
    void equalsByValue() {
        assertEquals(new Card("H", "7"), new Card("H", "7"));
        assertEquals(new Card("H", "7").hashCode(), new Card("H", "7").hashCode());
        assertNotEquals(new Card("H", "7"), new Card("D", "7"));
    }

    @Test
    void parseNullThrows() {
        assertThrows(IllegalArgumentException.class, () -> Card.parse(null));
    }

    @Test
    void parseTooShortThrows() {
        assertThrows(IllegalArgumentException.class, () -> Card.parse("H"));
    }
}

