import type {
    GameRoomLayoutSpec,
    SeatPositionClass,
    SeatViewModel,
} from './types';

const RING_PRESETS: Record<number, SeatPositionClass[]> = {
    1: ['seat-bottom'],
    2: ['seat-bottom', 'seat-top'],
    3: ['seat-bottom', 'seat-top-right', 'seat-top-left'],
    4: ['seat-bottom', 'seat-right', 'seat-top', 'seat-left'],
    5: ['seat-bottom', 'seat-bottom-right', 'seat-top-right', 'seat-top-left', 'seat-bottom-left'],
    6: ['seat-bottom', 'seat-bottom-right', 'seat-top-right', 'seat-top', 'seat-top-left', 'seat-bottom-left'],
    7: ['seat-bottom', 'seat-bottom-right', 'seat-right', 'seat-top-right', 'seat-top', 'seat-top-left', 'seat-left'],
    8: ['seat-bottom', 'seat-bottom-right', 'seat-right', 'seat-top-right', 'seat-top', 'seat-top-left', 'seat-left', 'seat-bottom-left'],
};

const DUEL_PRESETS: Record<number, SeatPositionClass[]> = {
    1: ['seat-bottom'],
    2: ['seat-bottom', 'seat-top'],
    3: ['seat-bottom', 'seat-top-right', 'seat-top-left'],
    4: ['seat-bottom', 'seat-right', 'seat-top', 'seat-left'],
    5: RING_PRESETS[5],
    6: RING_PRESETS[6],
    7: RING_PRESETS[7],
    8: RING_PRESETS[8],
};

export function arrangeSeats(seats: SeatViewModel[], layout: GameRoomLayoutSpec): SeatViewModel[] {
    const capped = [...seats].slice(0, layout.maxPlayers);
    if (capped.length === 0) {
        return [];
    }

    const selfIndex = capped.findIndex((seat) => seat.isSelf);
    if (selfIndex > 0) {
        const selfSeat = capped.splice(selfIndex, 1)[0];
        capped.unshift(selfSeat);
    }

    const presets = layout.preferredLayout === 'duel' ? DUEL_PRESETS : RING_PRESETS;
    const positions = presets[capped.length] ?? RING_PRESETS[Math.min(capped.length, 8)] ?? RING_PRESETS[8];

    return capped.map((seat, index) => ({
        ...seat,
        positionClass: positions[index] ?? positions[positions.length - 1] ?? 'seat-top',
    }));
}

export function createLayoutSpec(input: Partial<GameRoomLayoutSpec> & Pick<GameRoomLayoutSpec, 'maxPlayers' | 'preferredLayout'>): GameRoomLayoutSpec {
    return {
        tableVariant: 'green-felt',
        centerBoardMode: 'focus',
        hasPrivateTray: true,
        seatRenderMode: 'label-only',
        ...input,
    };
}
