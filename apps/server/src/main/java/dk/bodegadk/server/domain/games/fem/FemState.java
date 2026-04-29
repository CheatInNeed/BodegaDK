package dk.bodegadk.server.domain.games.fem;

import dk.bodegadk.server.domain.engine.GameState;
import dk.bodegadk.server.domain.primitives.Card;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * State for Danish 500 (Femhundrede).
 * Multi-round rummy-style melding game with cumulative scoring.
 */
public class FemState extends GameState {

    private final Map<String, List<Card>> hands;
    private final List<Meld> melds;
    private final List<Card> stockPile;
    private final List<Card> discardPile;
    private final Map<String, Integer> scores;
    private int roundNumber;
    private boolean hasDrawnThisTurn;
    private boolean roundClosed;
    private String closedByPlayerId;
    private boolean firstRound;

    public FemState(List<String> playerIds) {
        super(playerIds);
        this.hands = new LinkedHashMap<>();
        this.melds = new ArrayList<>();
        this.stockPile = new ArrayList<>();
        this.discardPile = new ArrayList<>();
        this.scores = new LinkedHashMap<>();
        this.roundNumber = 1;
        this.hasDrawnThisTurn = false;
        this.roundClosed = false;
        this.closedByPlayerId = null;
        this.firstRound = true;
    }

    /** Copy constructor for immutable apply. */
    private FemState(FemState other) {
        super(other);
        this.hands = new LinkedHashMap<>();
        for (var entry : other.hands.entrySet()) {
            this.hands.put(entry.getKey(), new ArrayList<>(entry.getValue()));
        }
        this.melds = new ArrayList<>();
        for (Meld m : other.melds) {
            Map<String, List<Card>> contribCopy = new LinkedHashMap<>();
            for (var e : m.contributedBy().entrySet()) {
                contribCopy.put(e.getKey(), new ArrayList<>(e.getValue()));
            }
            this.melds.add(new Meld(m.id(), m.suit(), new ArrayList<>(m.cards()), contribCopy, m.ownerPlayerId()));
        }
        this.stockPile = new ArrayList<>(other.stockPile);
        this.discardPile = new ArrayList<>(other.discardPile);
        this.scores = new LinkedHashMap<>(other.scores);
        this.roundNumber = other.roundNumber;
        this.hasDrawnThisTurn = other.hasDrawnThisTurn;
        this.roundClosed = other.roundClosed;
        this.closedByPlayerId = other.closedByPlayerId;
        this.firstRound = other.firstRound;
    }

    @Override
    public FemState copy() {
        return new FemState(this);
    }

    /* ── Getters ── */

    public Map<String, List<Card>> hands()      { return hands; }
    public List<Meld> melds()                    { return melds; }
    public List<Card> stockPile()                { return stockPile; }
    public List<Card> discardPile()              { return discardPile; }
    public Map<String, Integer> scores()         { return scores; }
    public int roundNumber()                     { return roundNumber; }
    public boolean hasDrawnThisTurn()            { return hasDrawnThisTurn; }
    public boolean roundClosed()                 { return roundClosed; }
    public String closedByPlayerId()             { return closedByPlayerId; }
    public boolean firstRound()                  { return firstRound; }

    /* ── Setters ── */

    public void setRoundNumber(int roundNumber)             { this.roundNumber = roundNumber; }
    public void setHasDrawnThisTurn(boolean drawn)          { this.hasDrawnThisTurn = drawn; }
    public void setRoundClosed(boolean closed)              { this.roundClosed = closed; }
    public void setClosedByPlayerId(String id)              { this.closedByPlayerId = id; }
    public void setFirstRound(boolean firstRound)           { this.firstRound = firstRound; }

    /* ── Helpers ── */

    public Map<String, Integer> cardCounts() {
        Map<String, Integer> counts = new LinkedHashMap<>();
        for (String p : playerIds()) {
            counts.put(p, hands.getOrDefault(p, List.of()).size());
        }
        return counts;
    }

    public int nextMeldId() {
        return melds.size() + 1;
    }

    /** A meld on the table: consecutive same-suit cards with contribution tracking. */
    public record Meld(String id, String suit, List<Card> cards, Map<String, List<Card>> contributedBy, String ownerPlayerId) {}
}
