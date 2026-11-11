package dk.bodegadk.rating;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Stateless Elo implementation. Multiplayer results are calculated as all
 * pairwise results and normalized by the number of opponents.
 */
public final class EloRatingCalculator implements RatingCalculator {
    private final Config config;

    public EloRatingCalculator(Config config) {
        this.config = config;
    }

    @Override
    public Map<String, Integer> calculate(List<RatingParticipant> participants) {
        if (participants == null || participants.size() < 2) {
            throw new IllegalArgumentException("At least two participants are required");
        }

        int opponents = participants.size() - 1;
        Map<String, Double> deltas = new LinkedHashMap<>();
        for (RatingParticipant participant : participants) {
            deltas.put(participant.playerId(), 0.0);
        }

        for (int first = 0; first < participants.size(); first++) {
            RatingParticipant left = participants.get(first);
            for (int second = first + 1; second < participants.size(); second++) {
                RatingParticipant right = participants.get(second);
                double expectedLeft = expectedScore(left.rating(), right.rating());
                double actualLeft = score(left, right);
                double pairK = (kFactor(left) + kFactor(right)) / 2.0;
                double pairDelta = pairK * (actualLeft - expectedLeft) / opponents;
                deltas.compute(left.playerId(), (key, value) -> value + pairDelta);
                deltas.compute(right.playerId(), (key, value) -> value - pairDelta);
            }
        }

        Map<String, Integer> result = new LinkedHashMap<>();
        for (RatingParticipant participant : participants) {
            int roundedDelta = (int) Math.round(deltas.get(participant.playerId()));
            result.put(participant.playerId(), Math.max(config.minimumRating(),
                    participant.rating() + roundedDelta));
        }
        return result;
    }

    double expectedScore(int playerRating, int opponentRating) {
        return 1.0 / (1.0 + Math.pow(10.0, (opponentRating - playerRating) / 400.0));
    }

    private double kFactor(RatingParticipant participant) {
        return participant.gamesPlayed() < config.provisionalGames()
                ? config.provisionalK()
                : config.standardK();
    }

    private double score(RatingParticipant left, RatingParticipant right) {
        if (config.abandonedCountsAsLoss() && left.abandoned() && !right.abandoned()) {
            return 0.0;
        }
        if (config.abandonedCountsAsLoss() && right.abandoned() && !left.abandoned()) {
            return 1.0;
        }
        if (left.placement() == right.placement()) {
            return 0.5;
        }
        return left.placement() < right.placement() ? 1.0 : 0.0;
    }

    public record Config(
            int provisionalGames,
            double provisionalK,
            double standardK,
            int minimumRating,
            boolean abandonedCountsAsLoss
    ) {
        public Config(int provisionalGames, double provisionalK, double standardK, int minimumRating) {
            this(provisionalGames, provisionalK, standardK, minimumRating, true);
        }

        public Config {
            if (provisionalGames < 0 || provisionalK <= 0 || standardK <= 0 || minimumRating < 0) {
                throw new IllegalArgumentException("Invalid Elo configuration");
            }
        }

        public static Config defaults() {
            return new Config(30, 40, 20, 100, true);
        }
    }
}
