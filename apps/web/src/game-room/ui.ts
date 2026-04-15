import type {
    CardDisplayModel,
    GameRoomLayoutSpec,
    GameRoomSectionModel,
    SeatPositionClass,
    SeatViewModel,
    TableLayoutMode,
} from './types.js';

type ParsedCard = {
    rank: string;
    suit: string;
    suitColor: 'red' | 'black';
};

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

export function renderGameRoomSections(model: GameRoomSectionModel): string {
    const roomClassName = model.roomClassName ? ` ${model.roomClassName}` : '';
    const tableClassName = model.tableClassName ? ` ${model.tableClassName}` : '';
    const seats = arrangeSeats(model.seats, model.layout);
    const headerHtml = model.headerPills.map((pill) => `<div class="pill room-header-pill">${pill}</div>`).join('');
    const seatsHtml = seats.map(renderSeat).join('');
    const trayHtml = model.layout.hasPrivateTray
        ? `
      <div class="private-panel">
        ${model.trayTitle ? `<div class="card-title">${model.trayTitle}</div>` : ''}
        ${model.trayDescription ? `<p class="card-desc private-panel-copy">${model.trayDescription}</p>` : ''}
        ${model.trayBodyHtml ?? ''}
        ${model.trayFooterHtml ?? ''}
      </div>
    `
        : '';

    return `
    <section class="card room-card room-table-card${roomClassName}">
      <div class="room-header-row">
        ${headerHtml}
      </div>

      <div class="table-stage game-room-table game-room-table--${model.layout.preferredLayout}${tableClassName}">
        <div class="table-bg-grain"></div>
        <div class="table-top">
          <div class="table-felt"></div>
          <div class="table-center-shell table-center-shell--${model.layout.centerBoardMode}">
            ${model.centerHtml}
          </div>
        </div>
        ${seatsHtml}
      </div>

      ${trayHtml}
    </section>
  `;
}

export function renderHandCards(cards: Array<{ card: string; selected: boolean }>, options?: { offsetStep?: number }): string {
    const offsetStep = options?.offsetStep ?? 16;
    return cards.map((item, index) => `
      <button class="play-card ${item.selected ? 'selected' : ''}" data-action="toggle-card" data-card="${item.card}" style="--card-offset:${index * offsetStep}px">
        ${renderCard({ kind: 'face', cardCode: item.card, selected: item.selected, interactive: true })}
      </button>
    `).join('');
}

export function renderCard(model: CardDisplayModel): string {
    if (model.kind === 'stack') {
        return renderCardStack(model.count ?? 1);
    }

    if (model.kind === 'back') {
        return `
      <span class="play-card-slot play-card-slot-back ${sizeClass(model)}">
        <span class="play-card-slot-label">${model.label ?? 'Hidden'}</span>
      </span>
    `;
    }

    if (model.kind === 'empty') {
        return `
      <span class="play-card-slot ${sizeClass(model)}">
        <span class="play-card-slot-label">${model.label ?? '-'}</span>
      </span>
    `;
    }

    const parsed = parseCardCode(model.cardCode ?? '--');
    const colorClass = parsed.suitColor === 'red' ? 'red' : 'black';

    return `
    <span class="play-card-face ${colorClass} ${sizeClass(model)} ${model.selected ? 'selected' : ''}">
      <span class="play-card-corner">${parsed.rank}${parsed.suit}</span>
      <span class="play-card-center">${parsed.suit}</span>
      <span class="play-card-corner rotate">${parsed.rank}${parsed.suit}</span>
    </span>
  `;
}

function renderCardStack(count: number): string {
    const displayCount = Math.max(1, Math.min(count, 8));
    let html = '';

    for (let i = 0; i < displayCount; i++) {
        html += `<span class="mini-card-back" style="--stack-offset:${i * 10}px"></span>`;
    }

    return `<span class="card-stack">${html}</span>`;
}

function renderSeat(seat: SeatViewModel): string {
    const badgeClass = seat.isSelf ? 'seat-badge self' : 'seat-badge';
    const tags = [
        ...(seat.badges ?? []),
        seat.isCurrentTurn ? 'Current turn' : '',
    ].filter(Boolean).map((badge) => `<span class="table-seat-tag">${badge}</span>`).join('');
    const bodyHtml = seat.tableCard
        ? `<div class="table-seat-card">${renderCard(seat.tableCard)}</div>`
        : typeof seat.stackCount === 'number'
            ? `<div class="table-seat-card">${renderCard({ kind: 'stack', count: seat.stackCount })}</div>`
            : '';

    return `
    <div class="table-seat ${seat.positionClass ?? 'seat-top'}">
      <div class="table-seat-panel ${seat.isCurrentTurn ? 'current-turn' : ''}">
        <div class="table-seat-badge-row">
          <div class="${badgeClass}">${seat.label}</div>
          ${tags}
        </div>
        ${seat.meta ? `<div class="table-seat-meta">${seat.meta}</div>` : ''}
        ${bodyHtml}
      </div>
    </div>
  `;
}

function sizeClass(model: CardDisplayModel): string {
    if (model.size === 'sm') return 'play-card-face-sm';
    if (model.size === 'lg') return 'play-card-face-lg';
    return '';
}

function parseCardCode(cardCode: string): ParsedCard {
    const normalized = cardCode.trim().toUpperCase();
    const suitKey = normalized.charAt(0);
    const rank = normalized.slice(1) || '?';

    if (suitKey === 'H') return { rank, suit: '♥', suitColor: 'red' };
    if (suitKey === 'D') return { rank, suit: '♦', suitColor: 'red' };
    if (suitKey === 'S') return { rank, suit: '♠', suitColor: 'black' };
    if (suitKey === 'C') return { rank, suit: '♣', suitColor: 'black' };

    return { rank: normalized, suit: '•', suitColor: 'black' };
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

export function fallbackLayoutMode(playerCount: number): TableLayoutMode {
    return playerCount <= 2 ? 'duel' : 'ring';
}
