package dk.bodegadk;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.actuate.observability.AutoConfigureObservability;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalManagementPort;
import org.springframework.boot.test.web.server.LocalServerPort;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Starts the real application (with an unreachable database) and checks that Actuator is served on the
 * internal management port only, without authentication, and exposes our metrics.
 */
// Spring Boot tests disable metrics export unless asked; without this there is no /actuator/prometheus.
@AutoConfigureObservability(tracing = false)
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
                "management.server.port=0",
                "spring.datasource.url=jdbc:postgresql://127.0.0.1:1/none",
                "spring.datasource.username=test",
                "spring.datasource.password=test",
                "spring.security.oauth2.resourceserver.jwt.issuer-uri=https://example.invalid/auth/v1"
        }
)
class ActuatorEndpointsTest {
    private final HttpClient http = HttpClient.newHttpClient();

    @LocalServerPort
    private int appPort;

    @LocalManagementPort
    private int managementPort;

    @Test
    void prometheusEndpointExposesBodegaMetricsOnManagementPort() throws Exception {
        HttpResponse<String> response = get(managementPort, "/actuator/prometheus");

        assertEquals(200, response.statusCode());
        assertTrue(response.body().contains("bodegadk_ws_sessions"));
        assertTrue(response.body().contains("bodegadk_rooms{"));
        assertTrue(response.body().contains("application=\"bodegadk\""));
    }

    @Test
    void livenessIsUpWithoutDatabase() throws Exception {
        HttpResponse<String> response = get(managementPort, "/actuator/health/liveness");

        assertEquals(200, response.statusCode());
        assertTrue(response.body().contains("\"UP\""));
    }

    @Test
    void readinessIsDownWhenDatabaseIsUnreachable() throws Exception {
        HttpResponse<String> response = get(managementPort, "/actuator/health/readiness");

        assertEquals(503, response.statusCode());
    }

    @Test
    void actuatorIsNotServedOnThePublicPort() throws Exception {
        HttpResponse<String> response = get(appPort, "/actuator/prometheus");

        assertNotEquals(200, response.statusCode());
    }

    @Test
    void legacyHealthEndpointStillWorks() throws Exception {
        HttpResponse<String> response = get(appPort, "/health");

        assertEquals(200, response.statusCode());
    }

    private HttpResponse<String> get(int port, String path) throws Exception {
        return http.send(HttpRequest.newBuilder(URI.create("http://localhost:" + port + path)).GET().build(),
                HttpResponse.BodyHandlers.ofString());
    }
}
