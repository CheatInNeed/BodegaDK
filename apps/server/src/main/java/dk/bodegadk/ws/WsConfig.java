package dk.bodegadk.ws;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
public class WsConfig implements WebSocketConfigurer {
    private final GameWsHandler gameWsHandler;

    public WsConfig(GameWsHandler gameWsHandler) {
        this.gameWsHandler = gameWsHandler;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(gameWsHandler, "/ws").setAllowedOriginPatterns("*");
    }
}
