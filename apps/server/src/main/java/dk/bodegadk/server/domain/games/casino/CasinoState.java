package dk.bodegadk.server.domain.games.casino;

import dk.bodegadk.server.domain.engine.GameState;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class CasinoState extends GameState {
    private final String roomCode;
    private String dealerPlayerId;
    private final List<TableStack> tableStacks;
    private final List<String> deck;
    private final Map<String, List<String>> hands;
    private final Map<String, List<String>> capturedCards;
    private final Map<String, Integer> capturedCounts;
    private String lastCapturePlayerId;
    private boolean started;
    private final Map<String, List<Integer>> valueMap;
    private int nextStackSeq;

    public CasinoState(
            String roomCode,
            List<String> playerIds,
            String dealerPlayerId,
            Map<String, List<Integer>> valueMap
    ) {
        super(playerIds);
        this.roomCode = roomCode;
        this.dealerPlayerId = dealerPlayerId;
        this.tableStacks = new ArrayList<>();
        this.deck = new ArrayList<>();
        this.hands = new LinkedHashMap<>();
        this.capturedCards = new LinkedHashMap<>();
        this.capturedCounts = new LinkedHashMap<>();
        for (String playerId : playerIds) {
            this.hands.put(playerId, new ArrayList<>());
            this.capturedCards.put(playerId, new ArrayList<>());
            this.capturedCounts.put(playerId, 0);
        }
        this.lastCapturePlayerId = null;
        this.started = false;
        this.valueMap = copyValueMap(valueMap);
        this.nextStackSeq = 1;
    }

    private CasinoState(CasinoState other) {
        super(other);
        this.roomCode = other.roomCode;
        this.dealerPlayerId = other.dealerPlayerId;
        this.tableStacks = other.tableStacks.stream().map(TableStack::copy).collect(java.util.stream.Collectors.toCollection(ArrayList::new));
        this.deck = new ArrayList<>(other.deck);
        this.hands = copyCardMap(other.hands);
        this.capturedCards = copyCardMap(other.capturedCards);
        this.capturedCounts = new LinkedHashMap<>(other.capturedCounts);
        this.lastCapturePlayerId = other.lastCapturePlayerId;
        this.started = other.started;
        this.valueMap = copyValueMap(other.valueMap);
        this.nextStackSeq = other.nextStackSeq;
    }

    @Override
    public CasinoState copy() {
        return new CasinoState(this);
    }

    public String roomCode() {
        return roomCode;
    }

    public String dealerPlayerId() {
        return dealerPlayerId;
    }

    public void setDealerPlayerId(String dealerPlayerId) {
        this.dealerPlayerId = dealerPlayerId;
    }

    public List<TableStack> tableStacks() {
        return tableStacks;
    }

    public List<String> deck() {
        return deck;
    }

    public Map<String, List<String>> hands() {
        return hands;
    }

    public Map<String, List<String>> capturedCards() {
        return capturedCards;
    }

    public Map<String, Integer> capturedCounts() {
        return capturedCounts;
    }

    public String lastCapturePlayerId() {
        return lastCapturePlayerId;
    }

    public void setLastCapturePlayerId(String lastCapturePlayerId) {
        this.lastCapturePlayerId = lastCapturePlayerId;
    }

    public boolean started() {
        return started;
    }

    public void setStarted(boolean started) {
        this.started = started;
    }

    public Map<String, List<Integer>> valueMap() {
        return valueMap;
    }

    public int nextStackSeq() {
        return nextStackSeq;
    }

    public String nextStackId() {
        return "s" + nextStackSeq++;
    }

    public static final class TableStack {
        private final String stackId;
        private List<String> cards;
        private int total;
        private boolean locked;

        public TableStack(String stackId, List<String> cards, int total, boolean locked) {
            this.stackId = stackId;
            this.cards = new ArrayList<>(cards);
            this.total = total;
            this.locked = locked;
        }

        public TableStack copy() {
            return new TableStack(stackId, cards, total, locked);
        }

        public String stackId() {
            return stackId;
        }

        public List<String> cards() {
            return cards;
        }

        public void setCards(List<String> cards) {
            this.cards = new ArrayList<>(cards);
        }

        public int total() {
            return total;
        }

        public void setTotal(int total) {
            this.total = total;
        }

        public boolean locked() {
            return locked;
        }

        public void setLocked(boolean locked) {
            this.locked = locked;
        }

        public String topCard() {
            return cards.isEmpty() ? null : cards.getLast();
        }
    }

    private static Map<String, List<String>> copyCardMap(Map<String, List<String>> input) {
        Map<String, List<String>> copy = new LinkedHashMap<>();
        for (Map.Entry<String, List<String>> entry : input.entrySet()) {
            copy.put(entry.getKey(), new ArrayList<>(entry.getValue()));
        }
        return copy;
    }

    private static Map<String, List<Integer>> copyValueMap(Map<String, List<Integer>> input) {
        Map<String, List<Integer>> copy = new LinkedHashMap<>();
        for (Map.Entry<String, List<Integer>> entry : input.entrySet()) {
            copy.put(entry.getKey(), List.copyOf(entry.getValue()));
        }
        return copy;
    }
}
