package dk.bodegadk.rest;

import com.fasterxml.jackson.databind.ObjectMapper;
import dk.bodegadk.runtime.GameLoopService;
import dk.bodegadk.runtime.InMemoryRuntimeStore;
import dk.bodegadk.ws.GameWsHandler;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

import java.time.Instant;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

class RoomControllerSecurityTest {
    private static final String USER_ID = "8e40cdb3-8d10-41aa-99b8-4a8764db16cb";

    @Test
    void joinRoomUsesJwtSubAsPlayerId() {
        InMemoryRuntimeStore runtimeStore = new InMemoryRuntimeStore();
        JwtDecoder jwtDecoder = token -> Jwt.withTokenValue(token)
                .subject(USER_ID)
                .header("alg", "RS256")
                .claim("sub", USER_ID)
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(300))
                .build();
        GameWsHandler gameWsHandler = new GameWsHandler(
                new ObjectMapper(),
                runtimeStore,
                new GameLoopService(runtimeStore, null),
                jwtDecoder
        );
        RoomController controller = new RoomController(runtimeStore, gameWsHandler);

        String roomCode = runtimeStore.createRoom("highcard", false, USER_ID);
        JwtAuthenticationToken authentication = new JwtAuthenticationToken(supabaseJwt(USER_ID));

        RoomController.JoinRoomResponse response = controller.joinRoom(
                authentication,
                roomCode,
                new RoomController.JoinRoomRequest("forged-player-id", "room-session-token")
        );

        assertEquals(USER_ID, response.playerId());
        assertEquals(USER_ID, runtimeStore.roomSnapshot(roomCode).orElseThrow().participants().getFirst());
    }

    private Jwt supabaseJwt(String subject) {
        Instant issuedAt = Instant.now();
        return new Jwt(
                "mock-supabase-jwt",
                issuedAt,
                issuedAt.plusSeconds(300),
                Map.of("alg", "RS256"),
                Map.of("sub", subject)
        );
    }
}
