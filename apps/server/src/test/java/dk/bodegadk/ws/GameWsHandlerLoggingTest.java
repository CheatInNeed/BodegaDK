package dk.bodegadk.ws;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import dk.bodegadk.runtime.GameLoopService;
import dk.bodegadk.runtime.InMemoryRuntimeStore;
import dk.bodegadk.runtime.MatchHistoryStore;
import dk.bodegadk.runtime.RoomMetadataStore;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketMessage;
import org.springframework.web.socket.WebSocketSession;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(OutputCaptureExtension.class)
class GameWsHandlerLoggingTest {
    private static final String ROOM = "ROOM1";
    private static final String USER = "user-1";

    private InMemoryRuntimeStore runtimeStore;
    private GameLoopService gameLoopService;
    private MatchHistoryStore matchHistoryStore;
    private WebSocketSession session;
    private GameWsHandler handler;

    @BeforeEach
    void setUp() throws Exception {
        runtimeStore = new InMemoryRuntimeStore();
        gameLoopService = mock(GameLoopService.class);
        matchHistoryStore = mock(MatchHistoryStore.class);
        RoomMetadataStore roomMetadataStore = mock(RoomMetadataStore.class);
        JwtDecoder jwtDecoder = mock(JwtDecoder.class);

        when(roomMetadataStore.room(ROOM)).thenReturn(Optional.of(new RoomMetadataStore.StoredRoom(
                ROOM,
                USER,
                RoomMetadataStore.RoomVisibility.PUBLIC,
                "snyd",
                InMemoryRuntimeStore.RoomStatus.LOBBY,
                List.of(new InMemoryRuntimeStore.PlayerSummary(USER, "alice"))
        )));
        when(jwtDecoder.decode("token")).thenReturn(Jwt.withTokenValue("token").header("alg", "none").subject(USER).build());
        when(gameLoopService.handleConnect(eq(ROOM), any())).thenReturn(Optional.empty());
        when(gameLoopService.prepareSnapshot(eq(ROOM), anyString())).thenReturn(
                new GameLoopService.RoomState(ROOM, 0, JsonNodeFactory.instance.objectNode(), Map.of()));

        session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn("ws-1");
        when(session.isOpen()).thenReturn(true);

        handler = new GameWsHandler(new ObjectMapper(), runtimeStore, gameLoopService, roomMetadataStore, matchHistoryStore, jwtDecoder);
        handler.afterConnectionEstablished(session);
        handler.handleTextMessage(session, new TextMessage(
                "{\"type\":\"CONNECT\",\"payload\":{\"roomCode\":\"" + ROOM + "\",\"accessToken\":\"token\"}}"));
        verify(session).sendMessage(messageContaining("STATE_SNAPSHOT"));
    }

    @AfterEach
    void tearDown() {
        runtimeStore.shutdownExecutors();
    }

    @Test
    void crashingGameActionIsLoggedAndReportedToThePlayer(CapturedOutput output) throws Exception {
        when(gameLoopService.handleAction(any())).thenThrow(new NullPointerException("engine bug"));

        handler.handleTextMessage(session, new TextMessage("{\"type\":\"PLAY_CARDS\",\"payload\":{}}"));

        // Before: the exception vanished inside the room executor and the player never got an answer.
        verify(session, timeout(2000)).sendMessage(messageContaining("action failed on server"));
        assertTrue(output.getAll().contains("Game action PLAY_CARDS failed"));
        assertTrue(output.getAll().contains("engine bug"));
    }

    @Test
    void gameFinishedIsStillBroadcastWhenSavingMatchHistoryFails(CapturedOutput output) throws Exception {
        when(gameLoopService.handleAction(any())).thenReturn(GameLoopService.LoopResult.success(
                null, JsonNodeFactory.instance.objectNode(), Map.of(), true, USER));
        doThrow(new IllegalStateException("database down"))
                .when(matchHistoryStore).recordCompletedMatch(eq(ROOM), eq(USER), any());

        handler.handleTextMessage(session, new TextMessage("{\"type\":\"PLAY_CARDS\",\"payload\":{}}"));

        verify(session, timeout(2000)).sendMessage(messageContaining("GAME_FINISHED"));
        assertTrue(output.getAll().contains("Failed to save match history"));
    }

    private static WebSocketMessage<?> messageContaining(String text) {
        return argThat(message -> message != null && message.getPayload().toString().contains(text));
    }
}
