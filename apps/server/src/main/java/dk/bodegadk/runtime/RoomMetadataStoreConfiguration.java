package dk.bodegadk.runtime;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.beans.factory.ObjectProvider;
import com.fasterxml.jackson.databind.ObjectMapper;

@Configuration
public class RoomMetadataStoreConfiguration {

    @Bean
    RoomMetadataStore roomMetadataStore(ObjectProvider<JdbcTemplate> jdbcTemplateProvider) {
        JdbcTemplate jdbcTemplate = jdbcTemplateProvider.getIfAvailable();
        if (jdbcTemplate != null) {
            return new JdbcRoomMetadataStore(jdbcTemplate);
        }
        return new InMemoryRoomMetadataStore();
    }

    @Bean
    MatchHistoryStore matchHistoryStore(ObjectProvider<JdbcTemplate> jdbcTemplateProvider, ObjectMapper objectMapper) {
        JdbcTemplate jdbcTemplate = jdbcTemplateProvider.getIfAvailable();
        if (jdbcTemplate != null) {
            return new JdbcMatchHistoryStore(jdbcTemplate, objectMapper);
        }
        return new NoopMatchHistoryStore();
    }
}
