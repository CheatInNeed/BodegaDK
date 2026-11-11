package dk.bodegadk.rating;

import dk.bodegadk.match.Match;
import dk.bodegadk.match.MatchMode;
import dk.bodegadk.match.MatchParticipant;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public class RatingService {
    private final RatingRepository repository;
    private final RatingCalculator calculator;

    public RatingService(RatingRepository repository, RatingCalculator calculator) {
        this.repository = repository;
        this.calculator = calculator;
    }

    /**
     * The advisory lock serializes concurrent result notifications for one match.
     * The unique history key remains the durable idempotency constraint.
     */
    @Transactional
    public void applyResult(Match match) {
        if (match.mode() == MatchMode.UNRANKED || match.status() != dk.bodegadk.match.MatchStatus.COMPLETED) {
            return;
        }
        lockMatch(match.id());
        if (repository.hasChanges(match.id())) {
            return;
        }

        List<PlayerGameRating> currentRatings = new ArrayList<>();
        for (MatchParticipant participant : match.participants()) {
            currentRatings.add(repository.findOrCreate(participant.playerId(), match.gameType()));
        }

        List<RatingParticipant> inputs = new ArrayList<>();
        for (int index = 0; index < match.participants().size(); index++) {
            MatchParticipant participant = match.participants().get(index);
            PlayerGameRating rating = currentRatings.get(index);
            inputs.add(new RatingParticipant(
                    participant.playerId(),
                    rating.rating(),
                    rating.gamesPlayed(),
                    participant.placement(),
                    participant.abandoned()
            ));
        }

        Map<String, Integer> updatedRatings = calculator.calculate(inputs);
        Instant now = Instant.now();
        for (PlayerGameRating current : currentRatings) {
            int after = updatedRatings.get(current.playerId());
            repository.update(current, after, current.gamesPlayed() + 1,
                    Math.max(current.peakRating(), after));
            repository.insertChange(new RatingChange(
                    match.id(), current.playerId(), match.gameType(),
                    current.rating(), after, after - current.rating(), now
            ));
        }
    }

    private void lockMatch(UUID matchId) {
        // PostgreSQL advisory locks are transaction-scoped and require no schema object.
        // Hash collisions only serialize unrelated matches; they cannot corrupt ratings.
        repository.lockMatch(matchId);
    }
}
