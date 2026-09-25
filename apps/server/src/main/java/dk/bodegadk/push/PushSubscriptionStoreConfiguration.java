package dk.bodegadk.push;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

@Configuration
public class PushSubscriptionStoreConfiguration {

    @Bean
    PushSubscriptionStore pushSubscriptionStore(JdbcTemplate jdbcTemplate) {
        return new JdbcPushSubscriptionStore(jdbcTemplate);
    }
}
