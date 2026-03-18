package dk.bodegadk.server.domain.games.snyd;

import dk.bodegadk.server.domain.engine.GameEngine;
import dk.bodegadk.server.domain.engine.GameState;
import dk.bodegadk.server.domain.primitives.Card;
import dk.bodegadk.server.domain.primitives.Deck;

import java.util.ArrayList;
import java.util.List;

/**
 * Server-authoritative Snyd (Cheat/Bullshit) game engine.
 * Pure game logic — no Spring, no networking.
 *
 * <p>Rules:
 * <ul>
 *   <li>Players take turns playing 1+ cards face-down, claiming a rank.</li>
 *   <li>Next player may play cards (new claim) or call "Snyd" (challenge).</li>
 *   <li>Challenge: if ALL actual cards match claimed rank → challenger picks up pile.
 *       Otherwise → claimer (liar) picks up pile.</li>
 *   <li>First player to empty their hand wins.</li>
 * </ul>
 *
 * <p>{@code apply()} returns a NEW state — it does not mutate the input.
 */
public class SnydEngine implements GameEngine<SnydState, SnydAction> {

    @Override public String gameId()   { return "snyd"; }
    @Override public int minPlayers()  { return 2; }
    @Override public int maxPlayers()  { return 8; }

    @Override
    public SnydState init(List<String> playerIds) {
        if (playerIds.size() < minPlayers()) {
            throw new GameRuleException("Need at least " + minPlayers() + " players");
        }
        if (playerIds.size() > maxPlayers()) {
            throw new GameRuleException("Max " + maxPlayers() + " players");
        }

        SnydState state = new SnydState(playerIds);
        Deck deck = Deck.standard52().shuffle();
        List<List<Card>> dealt = deck.deal(playerIds.size());

        for (int i = 0; i < playerIds.size(); i++) {
            state.hands().put(playerIds.get(i), dealt.get(i));
        }

        state.setPhase(GameState.Phase.PLAYING);
        return state;
    }

    @Override
    public void validate(SnydAction action, SnydState state) throws GameRuleException {
        if (state.isFinished()) {
            throw new GameRuleException("Game is already finished");
        }
        if (!action.playerId().equals(state.currentPlayerId())) {
            throw new GameRuleException("Not your turn");
        }

        if (action instanceof SnydAction.PlayCards play) {
            validatePlayCards(play, state);
        }
        if (action instanceof SnydAction.CallSnyd) {
            if (state.lastClaim() == null) {
                throw new GameRuleException("No claim to challenge");
            }
        }
    }

    @Override
    public SnydState apply(SnydAction action, SnydState state) {
        validate(action, state);
        SnydState next = state.copy();

        if (action instanceof SnydAction.PlayCards play) {
            applyPlayCards(play, next);
        } else if (action instanceof SnydAction.CallSnyd call) {
            applyCallSnyd(call, next);
        } else {
            throw new GameRuleException("Unknown action type");
        }

        return next;
    }

    @Override
    public boolean isFinished(SnydState state) {
        return state.isFinished();
    }

    @Override
    public String getWinner(SnydState state) {
        return state.winnerPlayerId();
    }

    /* ── Private: validation ── */

    private void validatePlayCards(SnydAction.PlayCards play, SnydState state) {
        if (play.cardCodes().isEmpty()) {
            throw new GameRuleException("Must play at least one card");
        }
        List<Card> hand = state.hands().get(play.playerId());
        if (hand == null) {
            throw new GameRuleException("Player not in game");
        }
        for (String code : play.cardCodes()) {
            Card c = Card.parse(code);
            if (!hand.contains(c)) {
                throw new GameRuleException("You do not own card: " + code);
            }
        }
    }

    /* ── Private: PLAY_CARDS ── */

    private void applyPlayCards(SnydAction.PlayCards play, SnydState state) {
        String playerId = play.playerId();
        List<Card> hand = state.hands().get(playerId);

        List<Card> playedCards = new ArrayList<>();
        for (String code : play.cardCodes()) {
            Card c = Card.parse(code);
            hand.remove(c);
            playedCards.add(c);
        }
        state.pile().addAll(playedCards);

        state.setLastClaim(new SnydState.Claim(
                playerId,
                play.claimRank().toUpperCase(),
                playedCards.size(),
                List.copyOf(playedCards)
        ));

        state.advanceTurn();

        if (hand.isEmpty()) {
            state.setWinnerPlayerId(playerId);
            state.setPhase(GameState.Phase.FINISHED);
        }
    }

    /* ── Private: CALL_SNYD ── */

    private void applyCallSnyd(SnydAction.CallSnyd call, SnydState state) {
        SnydState.Claim claim = state.lastClaim();

        // Truthful = ALL actual cards match the claimed rank
        boolean truthful = claim.actualCards().stream()
                .allMatch(c -> c.rank().equalsIgnoreCase(claim.claimRank()));

        // Loser picks up pile
        String loserId = truthful ? call.playerId() : claim.playerId();
        List<Card> loserHand = state.hands().get(loserId);
        loserHand.addAll(state.pile());
        state.pile().clear();
        state.setLastClaim(null);

        // Turn goes to the loser
        state.setTurnToPlayer(loserId);

        // Check win (unlikely after picking up pile, but be safe)
        for (var entry : state.hands().entrySet()) {
            if (entry.getValue().isEmpty()) {
                state.setWinnerPlayerId(entry.getKey());
                state.setPhase(GameState.Phase.FINISHED);
                break;
            }
        }
    }
}

