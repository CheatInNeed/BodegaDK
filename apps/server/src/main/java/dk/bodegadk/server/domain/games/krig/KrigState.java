package dk.bodegadk.server.domain.games.krig;

import dk.bodegadk.server.domain.engine.GameState;
import dk.bodegadk.server.domain.primitives.Card;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public class KrigState extends GameState {
    private final Map<String, List<Card>> drawPiles;
    private final Set<String> readyPlayerIds;
    private final Set<String> rematchPlayerIds;
    private final List<CenterCard> centerPile;
    private final Map<String, Card> currentFaceUpCards;
    private final Map<String, Integer> drawPileCountsBeforeTrick;
    private TrickResult lastTrick;
    private int trickNumber;
    private int warDepth;
    private String statusText;

    public KrigState(List<String> playerIds) {
        super(playerIds);
        this.drawPiles = new LinkedHashMap<>();
        this.readyPlayerIds = new LinkedHashSet<>();
        this.rematchPlayerIds = new LinkedHashSet<>();
        this.centerPile = new ArrayList<>();
        this.currentFaceUpCards = new LinkedHashMap<>();
        this.drawPileCountsBeforeTrick = new LinkedHashMap<>();
        this.lastTrick = null;
        this.trickNumber = 1;
        this.warDepth = 0;
        this.statusText = "Ready to flip.";
    }

    private KrigState(KrigState other) {
        super(other);
        this.drawPiles = new LinkedHashMap<>();
        for (var entry : other.drawPiles.entrySet()) {
            this.drawPiles.put(entry.getKey(), new ArrayList<>(entry.getValue()));
        }
        this.readyPlayerIds = new LinkedHashSet<>(other.readyPlayerIds);
        this.rematchPlayerIds = new LinkedHashSet<>(other.rematchPlayerIds);
        this.centerPile = new ArrayList<>(other.centerPile);
        this.currentFaceUpCards = new LinkedHashMap<>(other.currentFaceUpCards);
        this.drawPileCountsBeforeTrick = new LinkedHashMap<>(other.drawPileCountsBeforeTrick);
        this.lastTrick = other.lastTrick;
        this.trickNumber = other.trickNumber;
        this.warDepth = other.warDepth;
        this.statusText = other.statusText;
    }

    @Override
    public KrigState copy() {
        return new KrigState(this);
    }

    public Map<String, List<Card>> drawPiles() {
        return drawPiles;
    }

    public Set<String> readyPlayerIds() {
        return readyPlayerIds;
    }

    public Set<String> rematchPlayerIds() {
        return rematchPlayerIds;
    }

    public List<CenterCard> centerPile() {
        return centerPile;
    }

    public Map<String, Card> currentFaceUpCards() {
        return currentFaceUpCards;
    }

    public Map<String, Integer> drawPileCountsBeforeTrick() {
        return drawPileCountsBeforeTrick;
    }

    public TrickResult lastTrick() {
        return lastTrick;
    }

    public void setLastTrick(TrickResult lastTrick) {
        this.lastTrick = lastTrick;
    }

    public int trickNumber() {
        return trickNumber;
    }

    public void setTrickNumber(int trickNumber) {
        this.trickNumber = trickNumber;
    }

    public int warDepth() {
        return warDepth;
    }

    public void setWarDepth(int warDepth) {
        this.warDepth = warDepth;
    }

    public String statusText() {
        return statusText;
    }

    public void setStatusText(String statusText) {
        this.statusText = statusText;
    }

    public record CenterCard(String playerId, String card, boolean faceUp) {
    }

    public record TrickResult(
            int trickNumber,
            String firstPlayerId,
            String firstCard,
            String secondPlayerId,
            String secondCard,
            String winnerPlayerId,
            String outcome,
            int cardsWon,
            int warDepth
    ) {
    }
}
