package dk.bodegadk.server.domain.primitives;

import java.util.concurrent.ThreadLocalRandom;

/**
 * A single die with configurable face count.
 * Supports roll, hold (lock value), and release.
 */
public final class Dice {

    private final int faces;
    private int value;
    private boolean held;

    public Dice(int faces) {
        if (faces < 2) throw new IllegalArgumentException("Dice must have at least 2 faces");
        this.faces = faces;
        this.value = 1;
        this.held = false;
    }

    /** Standard 6-sided die. */
    public static Dice d6() { return new Dice(6); }

    /** Roll (unless held). Returns the value. */
    public int roll() {
        if (!held) {
            value = ThreadLocalRandom.current().nextInt(1, faces + 1);
        }
        return value;
    }

    public int value()     { return value; }
    public int faces()     { return faces; }
    public boolean isHeld() { return held; }

    /** Lock this die so it won't change on roll. */
    public void hold()    { held = true; }

    /** Unlock this die so it can be rolled again. */
    public void release() { held = false; }

    @Override
    public String toString() {
        return "d" + faces + "=" + value + (held ? " (held)" : "");
    }
}

