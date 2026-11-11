package dk.bodegadk.runtime;

import java.time.Duration;
import java.time.Instant;

public record MatchmakingWindow(int initial, int wideningPerTenSeconds, int maximum) {
    public MatchmakingWindow {
        if (initial < 0 || wideningPerTenSeconds < 0 || maximum < initial) {
            throw new IllegalArgumentException("Invalid matchmaking window");
        }
    }

    public int forWait(Duration waited) {
        long tenSecondPeriods = Math.max(0, waited.toSeconds() / 10);
        long widened = initial + tenSecondPeriods * wideningPerTenSeconds;
        return (int) Math.min(maximum, widened);
    }

    public int forJoinedAt(Instant joinedAt, Instant now) {
        return forWait(Duration.between(joinedAt, now));
    }
}
