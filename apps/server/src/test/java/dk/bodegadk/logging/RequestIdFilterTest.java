package dk.bodegadk.logging;

import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

class RequestIdFilterTest {
    private final RequestIdFilter filter = new RequestIdFilter();

    @Test
    void generatesRequestIdAndTagsLogsDuringTheRequest() throws Exception {
        AtomicReference<String> seenDuringRequest = new AtomicReference<>();
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(new MockHttpServletRequest("GET", "/rooms"), response,
                new MockFilterChain(new jakarta.servlet.http.HttpServlet() {
                    @Override
                    protected void service(jakarta.servlet.http.HttpServletRequest req, jakarta.servlet.http.HttpServletResponse res) {
                        seenDuringRequest.set(MDC.get(LogContext.REQUEST_ID));
                    }
                }));

        String header = response.getHeader(RequestIdFilter.HEADER);
        assertNotNull(header);
        assertEquals(header, seenDuringRequest.get());
        assertNull(MDC.get(LogContext.REQUEST_ID), "tag must not leak to the next request on this thread");
    }

    @Test
    void reusesSafeIncomingRequestIdFromNginx() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/rooms");
        request.addHeader(RequestIdFilter.HEADER, "0123456789abcdef0123456789abcdef");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        assertEquals("0123456789abcdef0123456789abcdef", response.getHeader(RequestIdFilter.HEADER));
    }

    @Test
    void replacesUnsafeIncomingRequestId() {
        assertNotEquals("bad\nid", RequestIdFilter.resolveRequestId("bad\nid"));
        assertNotEquals("x".repeat(65), RequestIdFilter.resolveRequestId("x".repeat(65)));
        assertNotNull(RequestIdFilter.resolveRequestId(null));
    }
}
