package dk.bodegadk.runtime;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import com.fasterxml.jackson.databind.ObjectMapper;

@Configuration
public class RoomMetadataStoreConfiguration {

    @Bean
    RoomMetadataStore roomMetadataStore(JdbcTemplate jdbcTemplate) {
        return new JdbcRoomMetadataStore(jdbcTemplate);
    }

    @Bean
    MatchHistoryStore matchHistoryStore(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        return new JdbcMatchHistoryStore(jdbcTemplate, objectMapper);
    }
}
