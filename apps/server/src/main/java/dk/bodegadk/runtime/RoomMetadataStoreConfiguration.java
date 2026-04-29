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

    @Bean
    MatchHistoryQueryStore matchHistoryQueryStore(JdbcTemplate jdbcTemplate) {
        return new JdbcMatchHistoryQueryStore(jdbcTemplate);
    }

    @Bean
    UserGameStatsQueryStore userGameStatsQueryStore(JdbcTemplate jdbcTemplate) {
        return new JdbcUserGameStatsQueryStore(jdbcTemplate);
    }

    @Bean
    LeaderboardQueryStore leaderboardQueryStore(JdbcTemplate jdbcTemplate) {
        return new JdbcLeaderboardQueryStore(jdbcTemplate);
    }

    @Bean
    NotificationsStore notificationsStore(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        return new JdbcNotificationsStore(jdbcTemplate, objectMapper);
    }

    @Bean
    FriendsStore friendsStore(JdbcTemplate jdbcTemplate, NotificationsStore notificationsStore) {
        return new JdbcFriendsStore(jdbcTemplate, notificationsStore);
    }

    @Bean
    ChallengesStore challengesStore(
            JdbcTemplate jdbcTemplate,
            GameCatalogService gameCatalogService,
            RoomMetadataStore roomMetadataStore,
            InMemoryRuntimeStore runtimeStore,
            NotificationsStore notificationsStore
    ) {
        return new JdbcChallengesStore(jdbcTemplate, gameCatalogService, roomMetadataStore, runtimeStore, notificationsStore);
    }
}
