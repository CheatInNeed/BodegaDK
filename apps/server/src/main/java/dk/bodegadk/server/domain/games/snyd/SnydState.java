package dk.bodegadk.server.domain.games.snyd;

import dk.bodegadk.server.domain.engine.GameState;
import dk.bodegadk.server.domain.primitives.Card;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Snyd game state. Extends generic GameState with:
 * - player hands (private per player)
 * - face-down pile
 * - last claim (with actual cards for challenge resolution)
 */
public class SnydState extends GameState {

    private final Map<String, List<Card>> hands;
    private final List<Card> pile;
    private Claim lastClaim;

    public SnydState(List<String> playerIds) {
        super(playerIds);
        this.hands = new LinkedHashMap<>();
        this.pile = new ArrayList<>();
        this.lastClaim = null;
    }

    /** Copy constructor for immutable apply. */
    private SnydState(SnydState other) {
        super(other);
        this.hands = new LinkedHashMap<>();
        for (var entry : other.hands.entrySet()) {
            this.hands.put(entry.getKey(), new ArrayList<>(entry.getValue()));
        }
        this.pile = new ArrayList<>(other.pile);
        this.lastClaim = other.lastClaim; // record is immutable
    }

    @Override
    public SnydState copy() {
        return new SnydState(this);
    }

    /* ── Getters ── */

    public Map<String, List<Card>> hands() { return hands; }
    public List<Card> pile()               { return pile; }
    public Claim lastClaim()               { return lastClaim; }

    /* ── Setters ── */

    public void setLastClaim(Claim claim) { this.lastClaim = claim; }

    /* ── Helpers ── */

    public int pileCount() { return pile.size(); }

    public Map<String, Integer> cardCounts() {
        Map<String, Integer> counts = new LinkedHashMap<>();
        for (String p : playerIds()) {
            counts.put(p, hands.getOrDefault(p, List.of()).size());
        }
        return counts;
    }

    /** A recorded claim: who played, what rank, how many, and the actual cards (secret until challenged). */
    public record Claim(String playerId, String claimRank, int count, List<Card> actualCards) {}
}

