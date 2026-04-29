package dk.bodegadk.rest;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import dk.bodegadk.auth.AuthSupport;
import dk.bodegadk.auth.AuthenticatedUser;
import dk.bodegadk.runtime.ChallengesStore;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

@RestController
@RequestMapping("/challenges")
public class ChallengesController {
    private final ChallengesStore challengesStore;

    public ChallengesController(ChallengesStore challengesStore) {
        this.challengesStore = challengesStore;
    }

    @PostMapping
    public ChallengesStore.ChallengeSummary create(Authentication authentication, @RequestBody ChallengeRequest request) {
        AuthenticatedUser user = AuthSupport.requireUser(authentication);
        if (request == null || blank(request.username())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "username is required");
        }
        try {
            return challengesStore.createChallenge(user.userId(), request.username(), request.gameType());
        } catch (ChallengesStore.ChallengeValidationException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, exception.getMessage());
        } catch (ChallengesStore.ChallengeNotFoundException exception) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, exception.getMessage());
        }
    }

    @PostMapping("/{id}/accept")
    public ChallengesStore.ChallengeAcceptResult accept(Authentication authentication, @PathVariable String id) {
        AuthenticatedUser user = AuthSupport.requireUser(authentication);
        validateUuid(id);
        try {
            return challengesStore.acceptChallenge(user.userId(), id);
        } catch (ChallengesStore.ChallengeNotFoundException exception) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, exception.getMessage());
        } catch (ChallengesStore.ChallengeConflictException exception) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, exception.getMessage());
        }
    }

    @PostMapping("/{id}/decline")
    public ChallengesStore.ChallengeSummary decline(Authentication authentication, @PathVariable String id) {
        AuthenticatedUser user = AuthSupport.requireUser(authentication);
        validateUuid(id);
        try {
            return challengesStore.declineChallenge(user.userId(), id);
        } catch (ChallengesStore.ChallengeNotFoundException exception) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, exception.getMessage());
        } catch (ChallengesStore.ChallengeConflictException exception) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, exception.getMessage());
        }
    }

    @PostMapping("/{id}/cancel")
    public ChallengesStore.ChallengeSummary cancel(Authentication authentication, @PathVariable String id) {
        AuthenticatedUser user = AuthSupport.requireUser(authentication);
        validateUuid(id);
        try {
            return challengesStore.cancelChallenge(user.userId(), id);
        } catch (ChallengesStore.ChallengeNotFoundException exception) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, exception.getMessage());
        } catch (ChallengesStore.ChallengeConflictException exception) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, exception.getMessage());
        }
    }

    private void validateUuid(String id) {
        try {
            UUID.fromString(id);
        } catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid challenge id");
        }
    }

    private boolean blank(String value) {
        return value == null || value.isBlank();
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ChallengeRequest(String username, String gameType) {
    }
}
