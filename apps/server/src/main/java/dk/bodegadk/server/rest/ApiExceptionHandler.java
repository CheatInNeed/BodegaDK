package dk.bodegadk.server.rest;

import dk.bodegadk.server.domain.engine.GameEngine;
import dk.bodegadk.server.domain.rooms.RoomService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(RoomService.RoomNotFoundException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    public Map<String, String> handleNotFound(RoomService.RoomNotFoundException exception) {
        return Map.of("message", exception.getMessage());
    }

    @ExceptionHandler({RoomService.RoomConflictException.class, GameEngine.GameRuleException.class})
    @ResponseStatus(HttpStatus.CONFLICT)
    public Map<String, String> handleConflict(RuntimeException exception) {
        return Map.of("message", exception.getMessage());
    }
}
