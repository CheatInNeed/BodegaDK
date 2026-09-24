package dk.bodegadk.rest;

import dk.bodegadk.auth.AuthSupport;
import dk.bodegadk.auth.AuthenticatedUser;
import dk.bodegadk.runtime.MatchHistoryQueryStore;
import dk.bodegadk.runtime.UserGameStatsQueryStore;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.time.format.DateTimeParseException;

@RestController
@RequestMapping("/me")
public class MeController {
    private static final int DEFAULT_MATCH_LIMIT = 20;

    private final MatchHistoryQueryStore matchHistoryQueryStore;
    private final UserGameStatsQueryStore userGameStatsQueryStore;

    public MeController(MatchHistoryQueryStore matchHistoryQueryStore, UserGameStatsQueryStore userGameStatsQueryStore) {
        this.matchHistoryQueryStore = matchHistoryQueryStore;
        this.userGameStatsQueryStore = userGameStatsQueryStore;
    }

    @GetMapping("/matches")
    public MatchHistoryQueryStore.MatchHistoryPage recentMatches(
            Authentication authentication,
            @RequestParam(required = false) Integer limit,
            @RequestParam(required = false) String before
    ) {
        AuthenticatedUser user = AuthSupport.requireUser(authentication);
        return matchHistoryQueryStore.recentMatchesForUser(
                user.userId(),
                limit == null ? DEFAULT_MATCH_LIMIT : limit,
                parseBefore(before)
        );
    }

    @GetMapping("/stats")
    public UserGameStatsQueryStore.UserGameStatsPage userGameStats(
            Authentication authentication,
            @RequestParam(required = false) String game
    ) {
        AuthenticatedUser user = AuthSupport.requireUser(authentication);
        return userGameStatsQueryStore.statsForUser(user.userId(), normalizeGameSlug(game));
    }

    private Instant parseBefore(String before) {
        if (before == null || before.isBlank()) {
            return null;
        }
        try {
            return Instant.parse(before);
        } catch (DateTimeParseException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "before must be an ISO-8601 instant");
        }
    }

    private String normalizeGameSlug(String game) {
        if (game == null || game.isBlank()) {
            return null;
        }
        return game.trim();
    }
}
