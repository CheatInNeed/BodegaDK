package dk.bodegadk.rating;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import dk.bodegadk.runtime.GameCatalogService;

@Configuration
public class RatingConfiguration {
    @Bean
    RatingRepository ratingRepository(JdbcTemplate jdbcTemplate) {
        return new JdbcRatingRepository(jdbcTemplate);
    }

    @Bean
    RatingCalculator ratingCalculator(RatingProperties properties) {
        return new EloRatingCalculator(properties.calculatorConfig());
    }

    @Bean
    RatingService ratingService(RatingRepository repository, RatingCalculator calculator) {
        return new RatingService(repository, calculator);
    }

    @Bean
    RatingQueryService ratingQueryService(
            JdbcTemplate jdbcTemplate,
            RatingRepository repository,
            GameCatalogService gameCatalogService
    ) {
        return new RatingQueryService(jdbcTemplate, repository, gameCatalogService);
    }
}
