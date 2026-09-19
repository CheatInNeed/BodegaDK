package dk.bodegadk.push;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

@Configuration
public class PushSubscriptionStoreConfiguration {

    @Bean
    PushSubscriptionStore pushSubscriptionStore(ObjectProvider<JdbcTemplate> jdbcTemplateProvider) {
        JdbcTemplate jdbcTemplate = jdbcTemplateProvider.getIfAvailable();
        if (jdbcTemplate != null) {
            return new JdbcPushSubscriptionStore(jdbcTemplate);
        }
        return new InMemoryPushSubscriptionStore();
    }
}
