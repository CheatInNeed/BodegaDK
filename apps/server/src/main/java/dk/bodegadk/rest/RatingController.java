package dk.bodegadk.rest;

import dk.bodegadk.auth.AuthSupport;
import dk.bodegadk.auth.AuthenticatedUser;
import dk.bodegadk.rating.PlayerGameRating;
import dk.bodegadk.rating.RatingChange;
import dk.bodegadk.rating.RatingQueryService;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.validation.annotation.Validated;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import java.util.List;

@RestController
@RequestMapping("/ratings")
@Validated
public class RatingController {
    private final RatingQueryService queryService;

    public RatingController(RatingQueryService queryService) {
        this.queryService = queryService;
    }

    @GetMapping
    public List<PlayerGameRating> all(Authentication authentication) {
        return queryService.allRatings(AuthSupport.requireUser(authentication).userId());
    }

    @GetMapping("/{gameType}")
    public PlayerGameRating rating(Authentication authentication, @PathVariable String gameType) {
        AuthenticatedUser user = AuthSupport.requireUser(authentication);
        try {
            return queryService.rating(user.userId(), gameType)
                    .orElseThrow(() -> new ResponseStatusException(
                            HttpStatus.NOT_FOUND, "No ranked rating exists for " + gameType
                    ));
        } catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, exception.getMessage(), exception);
        }
    }

    @GetMapping("/{gameType}/leaderboard")
    public RatingQueryService.Page<RatingQueryService.LeaderboardEntry> leaderboard(
            @PathVariable String gameType,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size
    ) {
        try {
            return queryService.leaderboard(gameType, page, size);
        } catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, exception.getMessage(), exception);
        }
    }

    @GetMapping("/{gameType}/history")
    public RatingQueryService.Page<RatingChange> history(
            Authentication authentication,
            @PathVariable String gameType,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size
    ) {
        try {
            return queryService.history(
                    AuthSupport.requireUser(authentication).userId(), gameType, page, size
            );
        } catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, exception.getMessage(), exception);
        }
    }
}
