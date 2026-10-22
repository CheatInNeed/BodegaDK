package dk.bodegadk.logging;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerExceptionResolver;
import org.springframework.web.servlet.ModelAndView;

import java.io.IOException;

/**
 * Last-resort handler for REST exceptions nobody else handled (bugs, database outages, ...).
 *
 * <p>It runs after Spring's own resolvers, so expected errors such as {@code ResponseStatusException}
 * (404, 409, ...) never reach it. It logs the stack trace while the request ID is still on the thread,
 * then answers 500 through Spring Boot's normal {@code /error} page, so the JSON error body clients
 * receive is unchanged.
 */
@Component
public class UnexpectedErrorLoggingResolver implements HandlerExceptionResolver, Ordered {
    private static final Logger log = LoggerFactory.getLogger(UnexpectedErrorLoggingResolver.class);

    @Override
    public ModelAndView resolveException(HttpServletRequest request, HttpServletResponse response, Object handler, Exception exception) {
        if (exception instanceof AccessDeniedException || exception instanceof AuthenticationException) {
            // Spring Security turns these into 401/403 further out; leave them alone.
            return null;
        }

        log.error("Unexpected error handling {} {}", request.getMethod(), request.getRequestURI(), exception);
        if (!response.isCommitted()) {
            try {
                response.sendError(HttpServletResponse.SC_INTERNAL_SERVER_ERROR);
            } catch (IOException sendFailure) {
                log.debug("Could not send 500 response", sendFailure);
            }
        }
        return new ModelAndView();
    }

    @Override
    public int getOrder() {
        return Ordered.LOWEST_PRECEDENCE;
    }
}
