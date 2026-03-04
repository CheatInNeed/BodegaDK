package dk.bodegadk.server.domain.primitives;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class DiceTest {

    @Test
    void d6RollsInRange() {
        Dice d = Dice.d6();
        for (int i = 0; i < 100; i++) {
            int val = d.roll();
            assertTrue(val >= 1 && val <= 6);
        }
    }

    @Test
    void holdLocksValue() {
        Dice d = Dice.d6();
        d.roll();
        int locked = d.value();
        d.hold();

        for (int i = 0; i < 50; i++) {
            d.roll();
            assertEquals(locked, d.value());
        }
    }

    @Test
    void releaseUnlocks() {
        Dice d = Dice.d6();
        d.hold();
        assertTrue(d.isHeld());
        d.release();
        assertFalse(d.isHeld());
    }

    @Test
    void lessThan2FacesThrows() {
        assertThrows(IllegalArgumentException.class, () -> new Dice(1));
    }
}

