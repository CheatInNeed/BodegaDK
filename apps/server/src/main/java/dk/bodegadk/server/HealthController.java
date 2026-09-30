package dk.bodegadk.server;

import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthController {

    private final String version;

    public HealthController(@Value("${bodegadk.version:dev}") String version) {
        this.version = version;
    }

    /** The version is the deployed commit SHA; the CD pipeline polls it to confirm a rollout. */
    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "ok", "version", version);
    }
}
