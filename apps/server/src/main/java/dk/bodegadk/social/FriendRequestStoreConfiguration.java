package dk.bodegadk.social;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

@Configuration
public class FriendRequestStoreConfiguration {

    @Bean
    FriendRequestStore friendRequestStore(ObjectProvider<JdbcTemplate> jdbcTemplateProvider) {
        JdbcTemplate jdbcTemplate = jdbcTemplateProvider.getIfAvailable();
        if (jdbcTemplate != null) {
            return new JdbcFriendRequestStore(jdbcTemplate);
        }
        return new InMemoryFriendRequestStore();
    }
}
