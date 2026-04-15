package dk.bodegadk.server.domain.games.casino;

import dk.bodegadk.server.domain.engine.GameAction;

import java.util.List;

public sealed abstract class CasinoAction extends GameAction permits CasinoAction.PlayMove, CasinoAction.BuildStack, CasinoAction.MergeStacks {
    protected CasinoAction(String playerId) {
        super(playerId);
    }

    public static final class PlayMove extends CasinoAction {
        private final String handCard;
        private final List<String> captureStackIds;
        private final Integer playedValue;

        public PlayMove(String playerId, String handCard, List<String> captureStackIds, Integer playedValue) {
            super(playerId);
            this.handCard = handCard;
            this.captureStackIds = List.copyOf(captureStackIds);
            this.playedValue = playedValue;
        }

        public String handCard() {
            return handCard;
        }

        public List<String> captureStackIds() {
            return captureStackIds;
        }

        public Integer playedValue() {
            return playedValue;
        }
    }

    public static final class BuildStack extends CasinoAction {
        private final String handCard;
        private final String targetStackId;
        private final Integer playedValue;

        public BuildStack(String playerId, String handCard, String targetStackId, Integer playedValue) {
            super(playerId);
            this.handCard = handCard;
            this.targetStackId = targetStackId;
            this.playedValue = playedValue;
        }

        public String handCard() {
            return handCard;
        }

        public String targetStackId() {
            return targetStackId;
        }

        public Integer playedValue() {
            return playedValue;
        }
    }

    public static final class MergeStacks extends CasinoAction {
        private final List<String> stackIds;

        public MergeStacks(String playerId, List<String> stackIds) {
            super(playerId);
            this.stackIds = List.copyOf(stackIds);
        }

        public List<String> stackIds() {
            return stackIds;
        }
    }
}
