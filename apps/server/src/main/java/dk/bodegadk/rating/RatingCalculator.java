package dk.bodegadk.rating;

import java.util.List;
import java.util.Map;

public interface RatingCalculator {
    Map<String, Integer> calculate(List<RatingParticipant> participants);
}
