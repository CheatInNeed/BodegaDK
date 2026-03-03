package dk.bodegadk.server.domain.engine;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class TurnManagerTest {

    @Test
    void startsAtFirstPlayer() {
        var tm = new TurnManager(List.of("a", "b", "c"));
        assertEquals("a", tm.current());
    }

    @Test
    void advanceCycles() {
        var tm = new TurnManager(List.of("a", "b", "c"));
        assertEquals("b", tm.advance());
        assertEquals("c", tm.advance());
        assertEquals("a", tm.advance());
    }

    @Test
    void peekDoesNotMove() {
        var tm = new TurnManager(List.of("a", "b"));
        assertEquals("b", tm.peekNext());
        assertEquals("a", tm.current());
    }

    @Test
    void reverseGoesBackward() {
        var tm = new TurnManager(List.of("a", "b", "c"));
        tm.advance(); // b
        tm.reverse();
        assertEquals("a", tm.advance());
        assertEquals("c", tm.advance());
    }

    @Test
    void setToSpecificPlayer() {
        var tm = new TurnManager(List.of("a", "b", "c"));
        tm.setTo("c");
        assertEquals("c", tm.current());
    }

    @Test
    void setToUnknownThrows() {
        var tm = new TurnManager(List.of("a", "b"));
        assertThrows(IllegalArgumentException.class, () -> tm.setTo("z"));
    }
}

