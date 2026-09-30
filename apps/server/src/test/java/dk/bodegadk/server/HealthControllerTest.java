package dk.bodegadk.server;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

class HealthControllerTest {

    @Test
    void healthReportsStatusAndDeployedVersion() {
        HealthController controller = new HealthController("25690fd");

        Map<String, String> response = controller.health();

        assertEquals("ok", response.get("status"));
        assertEquals("25690fd", response.get("version"));
    }
}
