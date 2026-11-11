package dk.bodegadk.rating;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "bodegadk.rating")
public record RatingProperties(
        int provisionalGames,
        double provisionalK,
        double standardK,
        int minimumRating,
        boolean abandonedCountsAsLoss
) {
    public RatingProperties {
        if (provisionalGames < 0 || provisionalK <= 0 || standardK <= 0 || minimumRating < 0) {
            throw new IllegalArgumentException("Invalid rating properties");
        }
    }

    public EloRatingCalculator.Config calculatorConfig() {
        return new EloRatingCalculator.Config(
                provisionalGames, provisionalK, standardK, minimumRating, abandonedCountsAsLoss
        );
    }
}
