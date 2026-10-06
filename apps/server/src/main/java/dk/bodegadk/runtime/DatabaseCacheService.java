package dk.bodegadk.runtime;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;

@Service
public class DatabaseCacheService {

    private static final Logger log = LoggerFactory.getLogger(DatabaseCacheService.class);

    // ── Read caches ──
    private volatile List<RoomMetadataStore.StoredRoom> roomsSnapshot = List.of();
    private final ConcurrentHashMap<String, CachedLeaderboard> leaderboardCache = new ConcurrentHashMap<>();

    // ── Write-behind buffers ──
    private final ConcurrentLinkedQueue<DeferredStats> statsBuffer = new ConcurrentLinkedQueue<>();
    private final ConcurrentLinkedQueue<DeferredLeaderboard> leaderboardBuffer = new ConcurrentLinkedQueue<>();

    // ── Dependencies ──
    private final JdbcTemplate jdbcTemplate;
    private final RoomMetadataStore roomMetadataStore;
    private final LeaderboardQueryStore leaderboardQueryStore;

    public DatabaseCacheService(JdbcTemplate jdbcTemplate,
                                RoomMetadataStore roomMetadataStore,
                                LeaderboardQueryStore leaderboardQueryStore) {
        this.jdbcTemplate = jdbcTemplate;
        this.roomMetadataStore = roomMetadataStore;
        this.leaderboardQueryStore = leaderboardQueryStore;
    }

    // ── Scheduled tick ──

    @Scheduled(fixedDelay = 2000)
    public void tick() {
        refreshRooms();
        refreshLeaderboards();
        flushStats();
        flushLeaderboard();
    }

    // ── Read cache: rooms ──

    public List<RoomMetadataStore.StoredRoom> getRooms() {
        return roomsSnapshot;
    }

    void refreshRooms() {
        if (roomMetadataStore == null) return;
        try {
            roomsSnapshot = roomMetadataStore.publicRooms();
        } catch (Exception e) {
            log.warn("Failed to refresh rooms snapshot, serving stale data", e);
        }
    }

    // ── Read cache: leaderboard ──

    public LeaderboardQueryStore.LeaderboardPage getLeaderboard(String userId, String gameSlug, String mode, int limit) {
        String cacheKey = gameSlug + ":" + mode;
        CachedLeaderboard cached = leaderboardCache.get(cacheKey);

        if (cached == null) {
            // Cold start: query delegate directly, cache the result
            if (leaderboardQueryStore == null) {
                throw new LeaderboardQueryStore.UnknownGameException(gameSlug);
            }
            LeaderboardQueryStore.LeaderboardPage page = leaderboardQueryStore.leaderboard(userId, gameSlug, mode, limit);
            leaderboardCache.put(cacheKey, new CachedLeaderboard(
                    page.game(), page.mode(), page.items(), Instant.now()
            ));
            return page;
        }

        // Cache hit: slice items to limit, compute currentUserRank from cached list
        List<LeaderboardQueryStore.LeaderboardEntry> items = cached.items();
        int boundedLimit = Math.max(1, Math.min(limit, 100));
        List<LeaderboardQueryStore.LeaderboardEntry> sliced = items.size() <= boundedLimit
                ? items
                : items.subList(0, boundedLimit);

        LeaderboardQueryStore.CurrentUserRank currentUser = null;
        for (LeaderboardQueryStore.LeaderboardEntry entry : items) {
            if (entry.userId().equals(userId)) {
                currentUser = new LeaderboardQueryStore.CurrentUserRank(entry.rank(), entry.score());
                break;
            }
        }

        return new LeaderboardQueryStore.LeaderboardPage(cached.game(), cached.mode(), sliced, currentUser, boundedLimit);
    }

    void refreshLeaderboards() {
        if (leaderboardQueryStore == null) return;
        for (String key : leaderboardCache.keySet()) {
            try {
                String[] parts = key.split(":", 2);
                String gameSlug = parts[0];
                String mode = parts[1];
                // Use a placeholder userId; we only need the global items list
                LeaderboardQueryStore.LeaderboardPage page = leaderboardQueryStore.leaderboard(
                        "00000000-0000-0000-0000-000000000000", gameSlug, mode, 100);
                leaderboardCache.put(key, new CachedLeaderboard(
                        page.game(), page.mode(), page.items(), Instant.now()
                ));
            } catch (Exception e) {
                log.warn("Failed to refresh leaderboard cache for key={}, serving stale data", key, e);
            }
        }
    }

    // ── Write-behind: stats buffer ──

    public void enqueueStats(String userId, String gameId, String result, Integer score, Instant completedAt) {
        statsBuffer.add(new DeferredStats(userId, gameId, result, score, completedAt));
    }

    void flushStats() {
        if (jdbcTemplate == null) return;
        List<DeferredStats> batch = new ArrayList<>();
        DeferredStats entry;
        while ((entry = statsBuffer.poll()) != null) {
            batch.add(entry);
        }
        if (batch.isEmpty()) return;

        try {
            String sql = """
                insert into public.user_game_stats (
                  user_id,
                  game_id,
                  games_played,
                  wins,
                  losses,
                  draws,
                  high_score,
                  current_streak,
                  best_streak,
                  last_played_at
                )
                values (?::uuid, ?::uuid, 1, ?, ?, ?, ?, ?, ?, ?)
                on conflict (user_id, game_id) do update set
                  games_played = public.user_game_stats.games_played + 1,
                  wins = public.user_game_stats.wins + excluded.wins,
                  losses = public.user_game_stats.losses + excluded.losses,
                  draws = public.user_game_stats.draws + excluded.draws,
                  high_score = case
                    when ?::int is null then public.user_game_stats.high_score
                    else greatest(public.user_game_stats.high_score, excluded.high_score)
                  end,
                  current_streak = case
                    when ? = 'WIN' then public.user_game_stats.current_streak + 1
                    else 0
                  end,
                  best_streak = greatest(
                    public.user_game_stats.best_streak,
                    case
                      when ? = 'WIN' then public.user_game_stats.current_streak + 1
                      else 0
                    end
                  ),
                  last_played_at = greatest(
                    coalesce(public.user_game_stats.last_played_at, excluded.last_played_at),
                    excluded.last_played_at
                  )
                """;

            List<Object[]> batchArgs = new ArrayList<>();
            for (DeferredStats s : batch) {
                int wins = "WIN".equals(s.result()) ? 1 : 0;
                int losses = "LOSS".equals(s.result()) ? 1 : 0;
                int draws = "DRAW".equals(s.result()) ? 1 : 0;
                int streak = "WIN".equals(s.result()) ? 1 : 0;
                long highScore = s.score() == null ? 0 : s.score();

                batchArgs.add(new Object[]{
                        s.userId(),
                        s.gameId(),
                        wins,
                        losses,
                        draws,
                        highScore,
                        streak,
                        streak,
                        Timestamp.from(s.completedAt()),
                        s.score(),
                        s.result(),
                        s.result()
                });
            }
            jdbcTemplate.batchUpdate(sql, batchArgs);
        } catch (Exception e) {
            log.error("Failed to flush stats buffer ({} entries lost)", batch.size(), e);
        }
    }

    // ── Write-behind: leaderboard buffer ──

    public void enqueueLeaderboard(String userId, String gameId, UUID matchId, String result) {
        leaderboardBuffer.add(new DeferredLeaderboard(userId, gameId, matchId, result));
    }

    void flushLeaderboard() {
        if (jdbcTemplate == null) return;
        List<DeferredLeaderboard> batch = new ArrayList<>();
        DeferredLeaderboard entry;
        while ((entry = leaderboardBuffer.poll()) != null) {
            batch.add(entry);
        }
        if (batch.isEmpty()) return;

        try {
            String sql = """
                insert into public.leaderboard_scores (game_id, user_id, match_id, score, mode, username_snapshot)
                values (?::uuid, ?::uuid, ?,
                        coalesce((select wins from public.user_game_stats
                                  where user_id = ?::uuid and game_id = ?::uuid), 0),
                        'standard',
                        coalesce((select username from public.profiles where user_id = ?::uuid), ?))
                on conflict (game_id, user_id, mode) do update set
                  match_id = excluded.match_id,
                  score = greatest(public.leaderboard_scores.score, excluded.score),
                  username_snapshot = excluded.username_snapshot
                """;

            List<Object[]> batchArgs = new ArrayList<>();
            for (DeferredLeaderboard lb : batch) {
                batchArgs.add(new Object[]{
                        lb.gameId(),
                        lb.userId(),
                        lb.matchId(),
                        lb.userId(),
                        lb.gameId(),
                        lb.userId(),
                        lb.userId()
                });
            }
            jdbcTemplate.batchUpdate(sql, batchArgs);
        } catch (Exception e) {
            log.error("Failed to flush leaderboard buffer ({} entries lost)", batch.size(), e);
        }
    }

    // ── Records ──

    private record CachedLeaderboard(
            LeaderboardQueryStore.GameSummary game,
            String mode,
            List<LeaderboardQueryStore.LeaderboardEntry> items,
            Instant refreshedAt
    ) {}

    private record DeferredStats(
            String userId, String gameId, String result,
            Integer score, Instant completedAt
    ) {}

    private record DeferredLeaderboard(
            String userId, String gameId, UUID matchId, String result
    ) {}
}
