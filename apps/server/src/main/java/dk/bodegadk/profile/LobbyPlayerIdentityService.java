package dk.bodegadk.profile;

import org.springframework.stereotype.Service;

import java.util.Optional;
import java.util.UUID;

@Service
public class LobbyPlayerIdentityService {
    private static final String UNKNOWN_PLAYER = "Unknown Player";

    private final Optional<UserProfileRepository> userProfileRepository;

    public LobbyPlayerIdentityService(Optional<UserProfileRepository> userProfileRepository) {
        this.userProfileRepository = userProfileRepository;
    }

    public ResolvedPlayerIdentity resolve(UUID userId) {
        String username = userProfileRepository
                .flatMap(repository -> loadUsername(repository, userId))
                .filter(value -> !value.isBlank())
                .orElseGet(() -> fallbackUsername(userId));

        return new ResolvedPlayerIdentity(userId.toString(), username);
    }

    private Optional<String> loadUsername(UserProfileRepository repository, UUID userId) {
        try {
            return repository.findById(userId).map(UserProfile::getUsername);
        } catch (RuntimeException ignored) {
            return Optional.empty();
        }
    }

    private String fallbackUsername(UUID userId) {
        String raw = userId.toString().replace("-", "");
        if (raw.length() >= 8) {
            return "Player " + raw.substring(0, 8);
        }
        return UNKNOWN_PLAYER;
    }

    public record ResolvedPlayerIdentity(String userId, String username) {
    }
}
