package dk.bodegadk.runtime;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "bodegadk.matchmaking")
public record MatchmakingProperties(
        int initialWindow,
        int wideningPerTenSeconds,
        int maximumWindow
) {
    public MatchmakingWindow window() {
        return new MatchmakingWindow(initialWindow, wideningPerTenSeconds, maximumWindow);
    }
}
