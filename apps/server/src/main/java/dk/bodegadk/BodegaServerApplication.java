package dk.bodegadk;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.scheduling.annotation.EnableScheduling;
import dk.bodegadk.rating.RatingProperties;
import dk.bodegadk.runtime.MatchmakingProperties;

@SpringBootApplication
@EnableScheduling
@EnableConfigurationProperties({RatingProperties.class, MatchmakingProperties.class})
public class BodegaServerApplication {
    public static void main(String[] args) {
        SpringApplication.run(BodegaServerApplication.class, args);
    }
}
