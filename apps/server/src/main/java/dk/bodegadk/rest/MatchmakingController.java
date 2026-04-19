package dk.bodegadk.rest;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import dk.bodegadk.runtime.MatchmakingService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

@RestController
@RequestMapping("/matchmaking")
public class MatchmakingController {
    private final MatchmakingService matchmakingService;

    public MatchmakingController(MatchmakingService matchmakingService) {
        this.matchmakingService = matchmakingService;
    }

    @PostMapping("/queue")
    public MatchmakingResponse enqueue(@RequestBody QueueRequest request) {
        if (request == null || blank(request.gameType()) || blank(request.playerId()) || blank(request.token())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "gameType, playerId, and token are required");
        }
        try {
            return MatchmakingResponse.from(matchmakingService.enqueue(request.gameType(), request.playerId(), request.username(), request.token()));
        } catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, exception.getMessage());
        } catch (IllegalStateException exception) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, exception.getMessage());
        }
    }

    @GetMapping("/queue/{ticketId}")
    public MatchmakingResponse ticket(@PathVariable String ticketId) {
        UUID parsed = parseTicketId(ticketId);
        return matchmakingService.ticketStatus(parsed)
                .map(MatchmakingResponse::from)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Matchmaking ticket not found"));
    }

    @DeleteMapping("/queue/{ticketId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void cancel(@PathVariable String ticketId) {
        UUID parsed = parseTicketId(ticketId);
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
    public record QueueRequest(String gameType, String playerId, String username, String token) {
    }

    public record MatchmakingResponse(
            String ticketId,
            String gameType,
            String status,
            String roomCode,
            String playerId,
            String token,
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
                    snapshot.status().name(),
                    snapshot.roomCode(),
                    snapshot.playerId(),
                    snapshot.token(),
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
