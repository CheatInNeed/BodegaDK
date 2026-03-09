package dk.bodegadk.server.domain.games.highcard;

import dk.bodegadk.server.domain.engine.GameState;
import dk.bodegadk.server.domain.primitives.Card;

import java.util.ArrayList;
import java.util.List;

/**
 * State for the High Card game.
 *
 * <p>Setup: player gets 7 cards, computer keeps the remaining 45.
 * Each round the computer reveals a random card from its deck.
 * The player must beat it with a card from their hand.
 * 7 rounds total.
 */
public class HighCardState extends GameState {

    private final List<Card> playerHand;
    private final List<Card> computerDeck;
    private Card computerCard;      // the card the computer played this round
    private int round;              // current round (1-7)
    private int wins;               // rounds the player won
    private int losses;             // rounds the player lost

    public HighCardState(List<String> playerIds) {
        super(playerIds);
        this.playerHand = new ArrayList<>();
        this.computerDeck = new ArrayList<>();
        this.computerCard = null;
        this.round = 0;
        this.wins = 0;
        this.losses = 0;
    }

    /** Copy constructor for immutable apply. */
    private HighCardState(HighCardState other) {
        super(other);
        this.playerHand = new ArrayList<>(other.playerHand);
        this.computerDeck = new ArrayList<>(other.computerDeck);
        this.computerCard = other.computerCard;
        this.round = other.round;
        this.wins = other.wins;
        this.losses = other.losses;
    }

    @Override
    public HighCardState copy() {
        return new HighCardState(this);
    }

    /* ── Getters ── */

    public List<Card> playerHand()    { return playerHand; }
    public List<Card> computerDeck()  { return computerDeck; }
    public Card computerCard()        { return computerCard; }
    public int round()                { return round; }
    public int wins()                 { return wins; }
    public int losses()               { return losses; }

    /* ── Setters ── */

    public void setComputerCard(Card card) { this.computerCard = card; }
    public void setRound(int round)        { this.round = round; }
    public void setWins(int wins)          { this.wins = wins; }
    public void setLosses(int losses)      { this.losses = losses; }
}

