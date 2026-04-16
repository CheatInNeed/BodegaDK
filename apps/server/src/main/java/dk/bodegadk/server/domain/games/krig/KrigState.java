package dk.bodegadk.server.domain.games.krig;

import dk.bodegadk.server.domain.engine.GameState;
import dk.bodegadk.server.domain.primitives.Card;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

public class KrigState extends GameState {
    private final Map<String, List<Card>> hands;
    private final Map<String, Integer> scores;
    private final Map<String, Card> submittedCards;
    private final Map<String, Card> revealedCards;
    private final Set<String> rematchPlayerIds;
    private BattleResult lastBattle;
    private int round;

    public KrigState(List<String> playerIds) {
        super(playerIds);
        this.hands = new LinkedHashMap<>();
        this.scores = new LinkedHashMap<>();
        this.submittedCards = new LinkedHashMap<>();
        this.revealedCards = new LinkedHashMap<>();
        this.rematchPlayerIds = new LinkedHashSet<>();
        this.lastBattle = null;
        this.round = 1;
    }

    private KrigState(KrigState other) {
        super(other);
        this.hands = new LinkedHashMap<>();
        for (var entry : other.hands.entrySet()) {
            this.hands.put(entry.getKey(), new ArrayList<>(entry.getValue()));
        }
        this.scores = new LinkedHashMap<>(other.scores);
        this.submittedCards = new LinkedHashMap<>(other.submittedCards);
        this.revealedCards = new LinkedHashMap<>(other.revealedCards);
        this.rematchPlayerIds = new LinkedHashSet<>(other.rematchPlayerIds);
        this.lastBattle = other.lastBattle;
        this.round = other.round;
    }

    @Override
    public KrigState copy() {
        return new KrigState(this);
    }

    public Map<String, List<Card>> hands() {
        return hands;
    }

    public Map<String, Integer> scores() {
        return scores;
    }

    public Map<String, Card> submittedCards() {
        return submittedCards;
    }

    public Map<String, Card> revealedCards() {
        return revealedCards;
    }

    public BattleResult lastBattle() {
        return lastBattle;
    }

    public Set<String> rematchPlayerIds() {
        return rematchPlayerIds;
    }

    public void setLastBattle(BattleResult lastBattle) {
        this.lastBattle = lastBattle;
    }

    public int round() {
        return round;
    }

    public void setRound(int round) {
        this.round = round;
    }

    public record BattleResult(
            int round,
            String firstPlayerId,
            String firstCard,
            String secondPlayerId,
            String secondCard,
            String winnerPlayerId,
            String outcome
    ) {
    }
}
