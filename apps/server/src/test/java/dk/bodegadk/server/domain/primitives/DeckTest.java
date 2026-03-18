package dk.bodegadk.server.domain.primitives;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class DeckTest {

    @Test
    void standard52Has52Cards() {
        assertEquals(52, Deck.standard52().remaining());
    }

    @Test
    void drawReducesCount() {
        Deck deck = Deck.standard52();
        deck.draw();
        assertEquals(51, deck.remaining());
    }

    @Test
    void drawFromEmptyThrows() {
        assertThrows(IllegalStateException.class, () -> new Deck(List.of()).draw());
    }

    @Test
    void peekDoesNotRemove() {
        Deck deck = Deck.standard52();
        Card first = deck.peek();
        assertEquals(52, deck.remaining());
        assertEquals(first, deck.peek());
    }

    @Test
    void dealDistributesEvenly() {
        List<List<Card>> hands = Deck.standard52().shuffle().deal(4);
        assertEquals(4, hands.size());
        hands.forEach(h -> assertEquals(13, h.size()));
    }

    @Test
    void dealDrainsDeck() {
        Deck deck = Deck.standard52();
        deck.deal(2);
        assertTrue(deck.isEmpty());
    }
}

