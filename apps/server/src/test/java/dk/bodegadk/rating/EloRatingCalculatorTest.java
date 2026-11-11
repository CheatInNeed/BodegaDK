package dk.bodegadk.rating;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class EloRatingCalculatorTest {
    private final EloRatingCalculator calculator = new EloRatingCalculator(
            EloRatingCalculator.Config.defaults()
    );

    @Test
    void equalRatingsProduceOppositeChanges() {
        Map<String, Integer> result = calculator.calculate(List.of(
                participant("a", 1200, 0, 1),
                participant("b", 1200, 0, 2)
        ));

        assertEquals(1220, result.get("a"));
        assertEquals(1180, result.get("b"));
    }

    @Test
    void bigUpsetUsesExpectedScore() {
        Map<String, Integer> result = calculator.calculate(List.of(
                participant("underdog", 1000, 30, 1),
                participant("favorite", 1600, 30, 2)
        ));

        assertEquals(1019, result.get("underdog"));
        assertEquals(1581, result.get("favorite"));
    }

    @Test
    void drawMovesRatingsTowardEachOther() {
        Map<String, Integer> result = calculator.calculate(List.of(
                participant("a", 1200, 30, 1),
                participant("b", 1600, 30, 1)
        ));

        assertEquals(1208, result.get("a"));
        assertEquals(1592, result.get("b"));
    }

    @Test
    void multiplayerUsesPairwiseResultsAndBalancesChanges() {
        Map<String, Integer> result = calculator.calculate(List.of(
                participant("first", 1200, 30, 1),
                participant("second", 1200, 30, 2),
                participant("third", 1200, 30, 3)
        ));

        assertEquals(1210, result.get("first"));
        assertEquals(1200, result.get("second"));
        assertEquals(1190, result.get("third"));
    }

    @Test
    void ratingFloorIsApplied() {
        Map<String, Integer> result = calculator.calculate(List.of(
                participant("loser", 100, 30, 2),
                participant("winner", 2400, 30, 1)
        ));

        assertEquals(100, result.get("loser"));
    }

    @Test
    void provisionalKFactorEndsAfterConfiguredNumberOfGames() {
        Map<String, Integer> result = calculator.calculate(List.of(
                participant("new", 1200, 29, 1),
                participant("experienced", 1200, 30, 2)
        ));

        assertEquals(1215, result.get("new"));
        assertEquals(1185, result.get("experienced"));
    }

    @Test
    void requiresTwoParticipants() {
        assertThrows(IllegalArgumentException.class, () -> calculator.calculate(List.of(
                participant("only", 1200, 0, 1)
        )));
    }

    private RatingParticipant participant(String id, int rating, int gamesPlayed, int placement) {
        return new RatingParticipant(id, rating, gamesPlayed, placement, false);
    }
}
