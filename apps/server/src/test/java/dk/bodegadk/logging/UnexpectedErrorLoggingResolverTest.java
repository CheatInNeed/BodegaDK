package dk.bodegadk.logging;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.access.AccessDeniedException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

@ExtendWith(OutputCaptureExtension.class)
class UnexpectedErrorLoggingResolverTest {
    private final UnexpectedErrorLoggingResolver resolver = new UnexpectedErrorLoggingResolver();

    @Test
    void logsUnexpectedErrorAndAnswers500(CapturedOutput output) {
        MockHttpServletResponse response = new MockHttpServletResponse();

        var result = resolver.resolveException(
                new MockHttpServletRequest("GET", "/leaderboard"), response, null, new IllegalStateException("db down"));

        assertNotNull(result);
        assertEquals(500, response.getStatus());
        assertTrue(output.getAll().contains("Unexpected error handling GET /leaderboard"));
        assertTrue(output.getAll().contains("db down"));
    }

    @Test
    void leavesSecurityExceptionsToSpringSecurity() {
        MockHttpServletResponse response = new MockHttpServletResponse();

        var result = resolver.resolveException(
                new MockHttpServletRequest("GET", "/me"), response, null, new AccessDeniedException("no"));

        assertNull(result);
        assertEquals(200, response.getStatus());
    }
}
