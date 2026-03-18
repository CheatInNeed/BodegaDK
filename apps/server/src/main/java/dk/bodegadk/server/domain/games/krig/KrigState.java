package dk.bodegadk.server.domain.games.krig;

import dk.bodegadk.server.domain.engine.GameState;
import dk.bodegadk.server.domain.primitives.Card;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class KrigState extends GameState {
    private final Map<String, List<Card>> hands;
    private final Map<String, Integer> scores;
    private final Map<String, Card> tableCards;
    private BattleResult lastBattle;
    private int round;

    public KrigState(List<String> playerIds) {
        super(playerIds);
        this.hands = new LinkedHashMap<>();
        this.scores = new LinkedHashMap<>();
        this.tableCards = new LinkedHashMap<>();
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
        this.tableCards = new LinkedHashMap<>(other.tableCards);
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

    public Map<String, Card> tableCards() {
        return tableCards;
    }

    public BattleResult lastBattle() {
        return lastBattle;
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
            String firstPlayerId,
            String firstCard,
            String secondPlayerId,
            String secondCard,
            String winnerPlayerId,
            String outcome
    ) {
    }
}
