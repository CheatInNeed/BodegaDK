package dk.bodegadk.rest;

import dk.bodegadk.auth.AuthSupport;
import dk.bodegadk.auth.AuthenticatedUser;
import dk.bodegadk.runtime.DatabaseCacheService;
import dk.bodegadk.runtime.LeaderboardQueryStore;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class LeaderboardController {
    private static final int DEFAULT_LIMIT = 20;

    private final LeaderboardQueryStore leaderboardQueryStore;
    private final DatabaseCacheService cacheService;

    public LeaderboardController(LeaderboardQueryStore leaderboardQueryStore, DatabaseCacheService cacheService) {
        this.leaderboardQueryStore = leaderboardQueryStore;
        this.cacheService = cacheService;
    }

    @GetMapping("/leaderboard")
    public LeaderboardQueryStore.LeaderboardPage leaderboard(
            Authentication authentication,
            @RequestParam(required = false) String game,
            @RequestParam(required = false) String mode,
            @RequestParam(required = false) Integer limit
    ) {
        AuthenticatedUser user = AuthSupport.requireUser(authentication);
        String gameSlug = normalizeRequiredGame(game);
        try {
            return cacheService.getLeaderboard(
                    user.userId(),
                    gameSlug,
                    mode == null || mode.isBlank() ? "standard" : mode.trim(),
                    limit == null ? DEFAULT_LIMIT : limit
            );
        } catch (LeaderboardQueryStore.UnknownGameException exception) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, exception.getMessage());
        }
    }

    private String normalizeRequiredGame(String game) {
        if (game == null || game.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "game is required");
        }
        return game.trim();
    }
}
