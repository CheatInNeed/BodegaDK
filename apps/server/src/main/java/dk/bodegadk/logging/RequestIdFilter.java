package dk.bodegadk.logging;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Gives every HTTP request a request ID, tags all log lines written while handling it,
 * and returns the ID in the {@code X-Request-Id} response header.
 *
 * <p>If nginx (or another trusted proxy) already sent an {@code X-Request-Id}, that value is reused
 * so proxy access logs and server logs share the same ID. Runs before Spring Security, so
 * authentication failures are tagged too.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestIdFilter extends OncePerRequestFilter {
    public static final String HEADER = "X-Request-Id";

    private static final Logger log = LoggerFactory.getLogger(RequestIdFilter.class);
    private static final Pattern SAFE_REQUEST_ID = Pattern.compile("[A-Za-z0-9._-]{1,64}");

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String requestId = resolveRequestId(request.getHeader(HEADER));
        response.setHeader(HEADER, requestId);

        try (LogContext ignored = LogContext.open().with(LogContext.REQUEST_ID, requestId)) {
            long startedAt = System.nanoTime();
            try {
                chain.doFilter(request, response);
            } finally {
                if (log.isDebugEnabled()) {
                    long elapsedMs = (System.nanoTime() - startedAt) / 1_000_000;
                    log.debug("{} {} -> {} ({} ms)", request.getMethod(), request.getRequestURI(), response.getStatus(), elapsedMs);
                }
            }
        }
    }

    static String resolveRequestId(String incoming) {
        if (incoming != null && SAFE_REQUEST_ID.matcher(incoming).matches()) {
            return incoming;
        }
        return UUID.randomUUID().toString();
    }
}
