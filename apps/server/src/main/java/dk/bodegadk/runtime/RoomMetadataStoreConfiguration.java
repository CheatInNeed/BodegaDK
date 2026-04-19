package dk.bodegadk.runtime;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

@Configuration
public class RoomMetadataStoreConfiguration {

    @Bean
    @ConditionalOnBean(JdbcTemplate.class)
    RoomMetadataStore jdbcRoomMetadataStore(JdbcTemplate jdbcTemplate) {
        return new JdbcRoomMetadataStore(jdbcTemplate);
    }

    @Bean
    @ConditionalOnMissingBean(RoomMetadataStore.class)
    RoomMetadataStore inMemoryRoomMetadataStore() {
        return new InMemoryRoomMetadataStore();
    }
}
