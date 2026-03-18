package dk.bodegadk.server.domain.games.casino;

import dk.bodegadk.server.domain.engine.GameEngine;
import dk.bodegadk.server.domain.engine.GameState;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

public class CasinoEngine implements GameEngine<CasinoState, CasinoAction> {
    private static final List<String> SUITS = List.of("H", "D", "C", "S");
    private static final List<String> RANKS = List.of("A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K");

    @Override
    public String gameId() {
        return "casino";
    }

    @Override
    public int minPlayers() {
        return 2;
    }

    @Override
    public int maxPlayers() {
        return 2;
    }

    @Override
    public CasinoState init(List<String> playerIds) {
        return init("", playerIds, playerIds.size() > 1 ? playerIds.get(1) : playerIds.getFirst(), defaultValueMap());
    }

    public CasinoState init(
            String roomCode,
            List<String> playerIds,
            String dealerPlayerId,
            Map<String, List<Integer>> valueMap
    ) {
        String valueMapError = validateValueMap(valueMap);
        if (valueMapError != null) {
            throw new GameRuleException(valueMapError);
        }
        if (playerIds.size() != 2) {
            throw new GameRuleException("Casino requires exactly 2 players");
        }

        CasinoState state = new CasinoState(roomCode, playerIds, dealerPlayerId, valueMap);
        state.deck().addAll(createShuffledDeck(roomCode));
        startRound(state);
        return state;
    }

    @Override
    public void validate(CasinoAction action, CasinoState state) throws GameRuleException {
        if (!state.started()) {
            throw new GameRuleException("Game has not started yet");
        }
        if (state.isFinished()) {
            throw new GameRuleException("Game is already finished");
        }
        if (!Objects.equals(state.currentPlayerId(), action.playerId())) {
            throw new GameRuleException("Not your turn");
        }

        switch (action) {
            case CasinoAction.PlayMove playMove -> validatePlayMove(playMove, state);
            case CasinoAction.BuildStack buildStack -> validateBuildStack(buildStack, state);
            case CasinoAction.MergeStacks mergeStacks -> validateMergeStacks(mergeStacks, state);
        }
    }

    @Override
    public CasinoState apply(CasinoAction action, CasinoState state) {
        validate(action, state);
        CasinoState next = state.copy();

        switch (action) {
            case CasinoAction.PlayMove playMove -> applyPlayMove(playMove, next);
            case CasinoAction.BuildStack buildStack -> applyBuildStack(buildStack, next);
            case CasinoAction.MergeStacks mergeStacks -> applyMergeStacks(mergeStacks, next);
        }

        return next;
    }

    @Override
    public boolean isFinished(CasinoState state) {
        return state.isFinished();
    }

    @Override
    public String getWinner(CasinoState state) {
        return state.winnerPlayerId();
    }

    public void startRound(CasinoState state) {
        if (state.playerIds().size() != 2) {
            throw new GameRuleException("Casino requires exactly 2 players");
        }
        if (state.started()) {
            return;
        }
        String dealer = state.dealerPlayerId() != null ? state.dealerPlayerId() : state.playerIds().get(1);
        String nonDealer = state.playerIds().stream().filter(playerId -> !playerId.equals(dealer)).findFirst().orElse(state.playerIds().getFirst());
        state.setDealerPlayerId(dealer);
        state.setTurnToPlayer(nonDealer);
        state.setPhase(GameState.Phase.PLAYING);
        state.setStarted(true);
        drawMany(state.deck(), 4).forEach(card -> state.tableStacks().add(makeSingleCardStack(state, card)));
        dealHands(state, 4);
    }

    public void finishGame(CasinoState state) {
        if (state.isFinished()) {
            return;
        }
        if (!state.tableStacks().isEmpty() && state.lastCapturePlayerId() != null) {
            List<String> leftovers = state.tableStacks().stream().flatMap(stack -> stack.cards().stream()).toList();
            state.capturedCards().get(state.lastCapturePlayerId()).addAll(leftovers);
            state.capturedCounts().computeIfPresent(state.lastCapturePlayerId(), (key, count) -> count + leftovers.size());
            state.tableStacks().clear();
        }

        String p1 = state.playerIds().getFirst();
        String p2 = state.playerIds().get(1);
        int c1 = state.capturedCounts().getOrDefault(p1, 0);
        int c2 = state.capturedCounts().getOrDefault(p2, 0);
        state.setWinnerPlayerId(c1 == c2 ? null : (c1 > c2 ? p1 : p2));
        state.setPhase(GameState.Phase.FINISHED);
    }

    public static String validateValueMap(Map<String, List<Integer>> valueMap) {
        if (valueMap == null) {
            return "Missing setup.casinoRules.valueMap";
        }
        for (String suit : SUITS) {
            for (String rank : RANKS) {
                String cardCode = suit + rank;
                List<Integer> values = valueMap.get(cardCode);
                if (values == null || values.isEmpty() || values.stream().anyMatch(Objects::isNull)) {
                    return "Invalid or missing valueMap entry for " + cardCode;
                }
            }
        }
        return null;
    }

    public static Map<String, List<Integer>> defaultValueMap() {
        Map<String, List<Integer>> valueMap = new LinkedHashMap<>();
        for (String suit : SUITS) {
            for (String rank : RANKS) {
                valueMap.put(suit + rank, rankToValues(rank));
            }
        }
        return valueMap;
    }

    private void validatePlayMove(CasinoAction.PlayMove move, CasinoState state) {
        List<String> hand = state.hands().get(move.playerId());
        if (hand == null || !hand.contains(move.handCard())) {
            throw new GameRuleException("You do not have that card in hand");
        }
        List<Integer> cardValues = resolveCardValues(state.valueMap(), move.handCard());
        if (cardValues.isEmpty()) {
            throw new GameRuleException("No configured value for card " + move.handCard());
        }

        List<String> captureIds = dedupe(move.captureStackIds());
        if (captureIds.isEmpty()) {
            return;
        }

        List<CasinoState.TableStack> stacks = new ArrayList<>();
        for (String stackId : captureIds) {
            CasinoState.TableStack stack = findStack(state, stackId);
            if (stack == null) {
                throw new GameRuleException("Capture stack " + stackId + " is not on table");
            }
            stacks.add(stack);
        }
        int captureTotal = stacks.stream().mapToInt(CasinoState.TableStack::total).sum();
        List<Integer> allowedValues = resolvePlayedValues(cardValues, move.playedValue());
        if (!allowedValues.contains(captureTotal)) {
            throw new GameRuleException("Capture stacks do not match the played card value");
        }
    }

    private void validateBuildStack(CasinoAction.BuildStack move, CasinoState state) {
        List<String> hand = state.hands().get(move.playerId());
        if (hand == null || !hand.contains(move.handCard())) {
            throw new GameRuleException("You do not have that card in hand");
        }
        CasinoState.TableStack stack = findStack(state, move.targetStackId());
        if (stack == null) {
            throw new GameRuleException("Target stack not found");
        }
        if (stack.locked()) {
            throw new GameRuleException("This stack is locked and cannot change value");
        }
        List<Integer> chosenValues = resolvePlayedValues(resolveCardValues(state.valueMap(), move.handCard()), move.playedValue());
        boolean legal = chosenValues.stream()
                .map(value -> stack.total() + value)
                .anyMatch(total -> playerHasTotalCardInHand(state.valueMap(), hand, move.handCard(), total));
        if (!legal) {
            throw new GameRuleException("Build requires holding the resulting total card in hand");
        }
    }

    private void validateMergeStacks(CasinoAction.MergeStacks move, CasinoState state) {
        List<String> stackIds = dedupe(move.stackIds());
        if (stackIds.size() < 2) {
            throw new GameRuleException("Select at least two stacks");
        }
        List<CasinoState.TableStack> stacks = new ArrayList<>();
        for (String stackId : stackIds) {
            CasinoState.TableStack stack = findStack(state, stackId);
            if (stack == null) {
                throw new GameRuleException("Selected stack not found");
            }
            if (stack.locked()) {
                throw new GameRuleException("Cannot merge locked stacks");
            }
            stacks.add(stack);
        }
        int total = stacks.stream().mapToInt(CasinoState.TableStack::total).sum();
        boolean hasTotal = state.hands().getOrDefault(move.playerId(), List.of()).stream()
                .map(card -> resolveCardValues(state.valueMap(), card))
                .anyMatch(values -> values.contains(total));
        if (!hasTotal) {
            throw new GameRuleException("Merge requires holding a " + total + "-value card in hand");
        }
    }

    private void applyPlayMove(CasinoAction.PlayMove move, CasinoState state) {
        List<String> hand = state.hands().get(move.playerId());
        List<String> captureIds = dedupe(move.captureStackIds());
        hand.remove(move.handCard());

        if (captureIds.isEmpty()) {
            state.tableStacks().add(makeSingleCardStack(state, move.handCard()));
            endTurnOrDeal(state, move.playerId());
            return;
        }

        List<CasinoState.TableStack> capturedStacks = state.tableStacks().stream()
                .filter(stack -> captureIds.contains(stack.stackId()))
                .toList();
        state.tableStacks().removeIf(stack -> captureIds.contains(stack.stackId()));

        List<String> capturedFromTable = capturedStacks.stream().flatMap(stack -> stack.cards().stream()).toList();
        state.capturedCards().get(move.playerId()).add(move.handCard());
        state.capturedCards().get(move.playerId()).addAll(capturedFromTable);
        state.capturedCounts().computeIfPresent(move.playerId(), (key, count) -> count + capturedFromTable.size() + 1);
        state.setLastCapturePlayerId(move.playerId());
        endTurnOrDeal(state, move.playerId());
    }

    private void applyBuildStack(CasinoAction.BuildStack move, CasinoState state) {
        CasinoState.TableStack stack = findStack(state, move.targetStackId());
        List<String> hand = state.hands().get(move.playerId());
        List<Integer> chosenValues = resolvePlayedValues(resolveCardValues(state.valueMap(), move.handCard()), move.playedValue());

        int resolvedValue = chosenValues.stream()
                .filter(value -> playerHasTotalCardInHand(state.valueMap(), hand, move.handCard(), stack.total() + value))
                .findFirst()
                .orElseThrow(() -> new GameRuleException("Build requires holding the resulting total card in hand"));

        hand.remove(move.handCard());
        stack.setCards(appendCard(stack.cards(), move.handCard()));
        stack.setTotal(stack.total() + resolvedValue);
        stack.setLocked(stack.total() == 7 || stack.total() == resolvedValue);
        endTurnOrDeal(state, move.playerId());
    }

    private void applyMergeStacks(CasinoAction.MergeStacks move, CasinoState state) {
        List<String> stackIds = dedupe(move.stackIds());
        List<CasinoState.TableStack> selected = state.tableStacks().stream()
                .filter(stack -> stackIds.contains(stack.stackId()))
                .toList();
        CasinoState.TableStack base = selected.getFirst();
        List<String> mergedCards = selected.stream().flatMap(stack -> stack.cards().stream()).toList();
        int total = selected.stream().mapToInt(CasinoState.TableStack::total).sum();

        base.setCards(mergedCards);
        base.setTotal(total);
        base.setLocked(total == 7);
        state.tableStacks().removeIf(stack -> stackIds.contains(stack.stackId()) && !stack.stackId().equals(base.stackId()));
    }

    private void endTurnOrDeal(CasinoState state, String actorPlayerId) {
        if (allHandsEmpty(state)) {
            if (!state.deck().isEmpty()) {
                dealHands(state, 4);
                String nonDealer = state.playerIds().stream()
                        .filter(playerId -> !playerId.equals(state.dealerPlayerId()))
                        .findFirst()
                        .orElse(state.playerIds().getFirst());
                state.setTurnToPlayer(nonDealer);
                return;
            }
            finishGame(state);
            return;
        }
        state.setTurnToPlayer(nextPlayer(state.playerIds(), actorPlayerId));
    }

    private boolean playerHasTotalCardInHand(
            Map<String, List<Integer>> valueMap,
            List<String> hand,
            String playedCard,
            int total
    ) {
        boolean skippedPlayedCard = false;
        for (String card : hand) {
            if (!skippedPlayedCard && card.equals(playedCard)) {
                skippedPlayedCard = true;
                continue;
            }
            if (resolveCardValues(valueMap, card).contains(total)) {
                return true;
            }
        }
        return false;
    }

    private CasinoState.TableStack makeSingleCardStack(CasinoState state, String card) {
        int value = resolveSingleValue(state.valueMap(), card);
        return new CasinoState.TableStack(state.nextStackId(), List.of(card), value, value == 7);
    }

    private List<Integer> resolvePlayedValues(List<Integer> values, Integer playedValue) {
        if (playedValue == null) {
            return values;
        }
        if (!values.contains(playedValue)) {
            throw new GameRuleException("Invalid playedValue for selected hand card");
        }
        return List.of(playedValue);
    }

    private List<Integer> resolveCardValues(Map<String, List<Integer>> valueMap, String card) {
        return valueMap.getOrDefault(card, List.of());
    }

    private int resolveSingleValue(Map<String, List<Integer>> valueMap, String card) {
        List<Integer> values = resolveCardValues(valueMap, card);
        if (values.isEmpty()) {
            throw new GameRuleException("No configured value for card " + card);
        }
        return values.getFirst();
    }

    private void dealHands(CasinoState state, int cardsPerPlayer) {
        for (int i = 0; i < cardsPerPlayer; i++) {
            for (String playerId : state.playerIds()) {
                if (state.deck().isEmpty()) {
                    return;
                }
                state.hands().get(playerId).add(state.deck().removeFirst());
            }
        }
    }

    private List<String> drawMany(List<String> deck, int count) {
        List<String> drawn = new ArrayList<>();
        for (int i = 0; i < count && !deck.isEmpty(); i++) {
            drawn.add(deck.removeFirst());
        }
        return drawn;
    }

    private boolean allHandsEmpty(CasinoState state) {
        return state.playerIds().stream().allMatch(playerId -> state.hands().getOrDefault(playerId, List.of()).isEmpty());
    }

    private CasinoState.TableStack findStack(CasinoState state, String stackId) {
        return state.tableStacks().stream().filter(stack -> stack.stackId().equals(stackId)).findFirst().orElse(null);
    }

    private List<String> appendCard(List<String> cards, String card) {
        List<String> next = new ArrayList<>(cards);
        next.add(card);
        return next;
    }

    private String nextPlayer(List<String> players, String currentPlayerId) {
        int index = players.indexOf(currentPlayerId);
        if (index < 0 || players.isEmpty()) {
            throw new GameRuleException("Player not in game: " + currentPlayerId);
        }
        return players.get((index + 1) % players.size());
    }

    private List<String> createShuffledDeck(String seedSource) {
        List<String> deck = new ArrayList<>();
        for (String suit : SUITS) {
            for (String rank : RANKS) {
                deck.add(suit + rank);
            }
        }
        long seed = hashSeed(seedSource == null ? "" : seedSource);
        for (int i = deck.size() - 1; i > 0; i--) {
            seed = nextSeed(seed);
            int j = (int) (seed % (i + 1));
            String swap = deck.get(i);
            deck.set(i, deck.get(j));
            deck.set(j, swap);
        }
        return deck;
    }

    private List<String> dedupe(List<String> values) {
        if (values == null) {
            return List.of();
        }
        Set<String> unique = new LinkedHashSet<>();
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                unique.add(value);
            }
        }
        return List.copyOf(unique);
    }

    private static long hashSeed(String seed) {
        long hash = 0;
        for (int i = 0; i < seed.length(); i++) {
            hash = (hash * 31 + seed.charAt(i)) & 0xffffffffL;
        }
        return hash == 0 ? 1 : hash;
    }

    private static long nextSeed(long seed) {
        return (seed * 1664525L + 1013904223L) & 0xffffffffL;
    }

    private static List<Integer> rankToValues(String rank) {
        return switch (rank) {
            case "A" -> List.of(1, 14);
            case "J" -> List.of(11);
            case "Q" -> List.of(12);
            case "K" -> List.of(13);
            default -> List.of(Integer.parseInt(rank));
        };
    }
}
