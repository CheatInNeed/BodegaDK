package dk.bodegadk.rating;

import dk.bodegadk.match.Match;
import dk.bodegadk.match.MatchMode;
import dk.bodegadk.match.MatchParticipant;
import dk.bodegadk.match.MatchStatus;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;

class RatingServiceTest {
    @Test
    void rankedResultUpdatesRatingsAndSecondCallIsIdempotent() {
        FakeRepository repository = new FakeRepository();
        RatingService service = new RatingService(repository, new EloRatingCalculator(
                new EloRatingCalculator.Config(30, 40, 20, 100)
        ));
        Match match = match(MatchMode.RANKED);

        service.applyResult(match);
        int firstRating = repository.find("a", "casino").orElseThrow().rating();
        service.applyResult(match);

        assertEquals(1220, firstRating);
        assertEquals(firstRating, repository.find("a", "casino").orElseThrow().rating());
        assertEquals(2, repository.changes.size());
    }

    @Test
    void unrankedResultDoesNotCreateOrChangeRatings() {
        FakeRepository repository = new FakeRepository();
        RatingService service = new RatingService(repository, new EloRatingCalculator(
                EloRatingCalculator.Config.defaults()
        ));

        service.applyResult(match(MatchMode.UNRANKED));

        assertEquals(0, repository.ratings.size());
        assertEquals(0, repository.changes.size());
    }

    private Match match(MatchMode mode) {
        return new Match(
                UUID.randomUUID(), "casino", mode, MatchStatus.COMPLETED,
                Instant.now(), Instant.now(),
                List.of(new MatchParticipant("a", 1, false), new MatchParticipant("b", 2, false))
        );
    }

    private static class FakeRepository implements RatingRepository {
        private final List<PlayerGameRating> ratings = new ArrayList<>();
        private final List<RatingChange> changes = new ArrayList<>();

        @Override
        public PlayerGameRating findOrCreate(String playerId, String gameType) {
            return find(playerId, gameType).orElseGet(() -> {
                PlayerGameRating created = PlayerGameRating.provisional(playerId, gameType, Instant.now());
                ratings.add(created);
                return created;
            });
        }

        @Override
        public Optional<PlayerGameRating> find(String playerId, String gameType) {
            return ratings.stream()
                    .filter(value -> value.playerId().equals(playerId) && value.gameType().equals(gameType))
                    .findFirst();
        }

        @Override
        public List<PlayerGameRating> findAll(String playerId) {
            return ratings.stream().filter(value -> value.playerId().equals(playerId)).toList();
        }

        @Override
        public boolean hasChanges(UUID matchId) {
            return changes.stream().anyMatch(value -> value.matchId().equals(matchId));
        }

        @Override
        public void lockMatch(UUID matchId) {
        }

        @Override
        public void update(PlayerGameRating rating, int newRating, int newGamesPlayed, int newPeakRating) {
            ratings.remove(rating);
            ratings.add(new PlayerGameRating(
                    rating.playerId(), rating.gameType(), newRating, newGamesPlayed,
                    newPeakRating, rating.version() + 1, Instant.now()
            ));
        }

        @Override
        public void insertChange(RatingChange change) {
            changes.add(change);
        }
    }
}
