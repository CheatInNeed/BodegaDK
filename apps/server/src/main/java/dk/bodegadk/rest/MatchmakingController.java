package dk.bodegadk.rest;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import dk.bodegadk.auth.AuthSupport;
import dk.bodegadk.auth.AuthenticatedUser;
import dk.bodegadk.runtime.MatchmakingService;
import dk.bodegadk.match.MatchMode;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.validation.annotation.Validated;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;

import java.util.UUID;

@RestController
@RequestMapping("/matchmaking")
@Validated
public class MatchmakingController {
    private final MatchmakingService matchmakingService;

    public MatchmakingController(MatchmakingService matchmakingService) {
        this.matchmakingService = matchmakingService;
    }

    @PostMapping("/queue")
    public MatchmakingResponse enqueue(Authentication authentication, @Valid @RequestBody QueueRequest request) {
        AuthenticatedUser user = AuthSupport.requireUser(authentication);
        if (request == null || blank(request.gameType())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "gameType is required");
        }
        try {
            String clientSessionId = blank(request.clientSessionId()) ? UUID.randomUUID().toString() : request.clientSessionId();
            MatchMode mode;
            try {
                mode = request.mode() == null
                        ? MatchMode.UNRANKED
                        : MatchMode.valueOf(request.mode().trim().toUpperCase());
            } catch (IllegalArgumentException exception) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "mode must be RANKED or UNRANKED");
            }
            return MatchmakingResponse.from(matchmakingService.enqueue(
                    request.gameType(), mode, user.userId(), request.username(), clientSessionId
            ));
        } catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, exception.getMessage());
        } catch (IllegalStateException exception) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, exception.getMessage());
        }
    }

    @GetMapping("/queue/{ticketId}")
    public MatchmakingResponse ticket(Authentication authentication, @PathVariable String ticketId) {
        AuthenticatedUser user = AuthSupport.requireUser(authentication);
        UUID parsed = parseTicketId(ticketId);
        return matchmakingService.ticketStatus(parsed)
                .filter(snapshot -> user.userId().equals(snapshot.playerId()))
                .map(MatchmakingResponse::from)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Matchmaking ticket not found"));
    }

    @DeleteMapping("/queue/{ticketId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void cancel(Authentication authentication, @PathVariable String ticketId) {
        AuthenticatedUser user = AuthSupport.requireUser(authentication);
        UUID parsed = parseTicketId(ticketId);
        MatchmakingService.MatchmakingSnapshot snapshot = matchmakingService.ticketStatus(parsed)
                .filter(value -> user.userId().equals(value.playerId()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Matchmaking ticket not found"));
        if (!matchmakingService.cancel(parsed)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Matchmaking ticket not found");
        }
    }

    private UUID parseTicketId(String ticketId) {
        try {
            return UUID.fromString(ticketId);
        } catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid ticket id");
        }
    }

    private boolean blank(String value) {
        return value == null || value.isBlank();
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record QueueRequest(
            @NotBlank String gameType,
            String username,
            String clientSessionId,
            String mode
    ) {
    }

    public record MatchmakingResponse(
            String ticketId,
            String gameType,
            String mode,
            String status,
            String roomCode,
            String playerId,
            int queuedPlayers,
            int playersNeeded,
            int minPlayers,
            int maxPlayers,
            boolean strictCount,
            long estimatedWaitSeconds
    ) {
        static MatchmakingResponse from(MatchmakingService.MatchmakingSnapshot snapshot) {
            return new MatchmakingResponse(
                    snapshot.ticketId().toString(),
                    snapshot.gameType(),
                    snapshot.mode(),
                    snapshot.status().name(),
                    snapshot.roomCode(),
                    snapshot.playerId(),
                    snapshot.queuedPlayers(),
                    snapshot.playersNeeded(),
                    snapshot.minPlayers(),
                    snapshot.maxPlayers(),
                    snapshot.strictCount(),
                    snapshot.estimatedWaitSeconds()
            );
        }
    }
}
