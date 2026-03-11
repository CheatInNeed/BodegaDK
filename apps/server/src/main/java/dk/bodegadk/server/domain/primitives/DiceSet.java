package dk.bodegadk.server.domain.primitives;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * A group of dice. Roll all, hold/release individual dice by index.
 * Useful for Yahtzee-style, Meyer, or any multi-dice game.
 */
public final class DiceSet {

    private final List<Dice> dice;

    public DiceSet(List<Dice> dice) {
        this.dice = new ArrayList<>(dice);
    }

    /** Create a set of N standard d6 dice. */
    public static DiceSet of(int count) {
        List<Dice> dice = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            dice.add(Dice.d6());
        }
        return new DiceSet(dice);
    }

    /** Roll all non-held dice. Returns all current values. */
    public List<Integer> rollAll() {
        List<Integer> values = new ArrayList<>();
        for (Dice d : dice) {
            values.add(d.roll());
        }
        return values;
    }

    /** Get all current values (without rolling). */
    public List<Integer> values() {
        return dice.stream().map(Dice::value).toList();
    }

    public void hold(int index)    { dice.get(index).hold(); }
    public void release(int index) { dice.get(index).release(); }
    public void releaseAll()       { dice.forEach(Dice::release); }

    public int size() { return dice.size(); }

    public List<Dice> all() {
        return Collections.unmodifiableList(dice);
    }
}

