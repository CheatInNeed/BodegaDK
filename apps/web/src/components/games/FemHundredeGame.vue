<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { RoomSessionState } from '@/lib/game-room/types';
import { renderCardFront, renderCardBack, renderHandFan } from '@/lib/games/shared/game-cards';
import GameTable from '@/components/game-room/GameTable.vue';
import PlayerBadge from '@/components/game-room/PlayerBadge.vue';
import WinOverlay from '@/components/game-room/WinOverlay.vue';

const props = defineProps<{
  state: RoomSessionState;
  viewModel: any;
}>();

const emit = defineEmits<{
  'toggle-card': [card: string];
  'send-intent': [intent: any];
  'send-message': [message: any];
}>();

const { t } = useI18n();

const CW = 78, CH = 109;
const MW = 51, MH = 71;

type FemPlayer = {
  playerId: string;
  displayName: string;
  score: number;
  cardCount: number;
  isSelf: boolean;
  isCurrentTurn: boolean;
};

type FemMeld = {
  id: string;
  suit: string;
  cards: string[];
  pointsPerPlayer: Record<string, number>;
  ownerId: string;
};

const self = computed(() => {
  const players: FemPlayer[] = props.viewModel?.players ?? [];
  return players.find((p) => p.isSelf) ?? null;
});

const opponents = computed(() => {
  const players: FemPlayer[] = props.viewModel?.players ?? [];
  return players.filter((p) => !p.isSelf);
});

const selectedSet = computed(() => new Set<string>(props.viewModel?.selectedCards ?? props.state.selectedHandCards ?? []));
const selCount = computed(() => selectedSet.value.size);

function scoreBarHtml(): string {
  const players: FemPlayer[] = props.viewModel?.players ?? [];
  if (players.length < 2) return '';
  const selfP = players.find((p) => p.isSelf);
  const others = players.filter((p) => !p.isSelf);
  const selfScore = selfP?.score ?? 0;
  const selfPct = Math.min(selfScore / 500 * 100, 100);

  const tracks = others.map((opp) => {
    const pct = Math.min(opp.score / 500 * 100, 100);
    return `<div class="g500-score-track">
      <div class="g500-score-fill g500-score-p1" style="width:${pct}%"></div>
      <div class="g500-score-fill g500-score-p0" style="width:${selfPct}%"></div>
      <div class="g500-score-mid"></div>
    </div>`;
  }).join('');

  const opponentLabel = others.length === 1
    ? `<span class="g500-score-label">${t('room.fem.points', { count: others[0].score })}</span>`
    : `<span class="g500-score-label">${others.map((o) => `${o.displayName}: ${t('room.fem.points', { count: o.score })}`).join(' \u00b7 ')}</span>`;

  return `<div class="g500-score-bar">
    ${opponentLabel}
    ${tracks}
    <span class="g500-score-label g500-score-label-amber">${t('room.fem.points', { count: selfScore })}</span>
  </div>`;
}

function meldGroupHtml(meld: FemMeld, cw: number, ch: number, action?: string): string {
  const spread = Math.min(cw * 0.52, 20);
  const totalW = cw + (meld.cards.length - 1) * spread;
  const cards = meld.cards.map((code, i) =>
    `<div style="position:absolute;left:${i * spread}px;z-index:${i};">${renderCardFront(code, cw, ch)}</div>`
  ).join('');
  const pts = Object.values(meld.pointsPerPlayer).reduce((s: number, n: number) => s + n, 0);
  const ptsHtml = pts > 0
    ? `<div style="position:absolute;bottom:-14px;left:0;font-size:8px;letter-spacing:1px;color:rgba(255,179,0,0.7);font-weight:700;">${t('room.fem.points', { count: pts })}</div>`
    : '';
  const cursor = action ? 'cursor:pointer;' : '';
  const attrs = action ? `data-action="${action}" data-meld-id="${meld.id}"` : '';
  return `<div ${attrs} style="position:relative;height:${ch}px;width:${totalW}px;flex-shrink:0;${cursor}">${cards}${ptsHtml}</div>`;
}

function meldSectionHtml(melds: FemMeld[], cw: number, ch: number, clickAction?: string): string {
  if (!melds.length) return '';
  return `<div style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap;padding-bottom:14px;">
    ${melds.map((m, gi) => `<div style="position:relative;"><div style="position:absolute;top:-13px;left:0;font-size:8px;letter-spacing:2px;text-transform:uppercase;color:rgba(255,179,0,0.55);font-weight:700;">${m.suit} ${gi + 1}</div>${meldGroupHtml(m, cw, ch, clickAction)}</div>`).join('')}
  </div>`;
}

function drawPileHtml(): string {
  const count = props.viewModel?.stockPileCount ?? 0;
  const canDraw = props.viewModel?.canDraw ?? false;
  const stacks = [3, 2, 1].map((off) =>
    `<div style="position:absolute;top:${-off * 2.5}px;left:${-off * 1.5}px;opacity:0.55;">${renderCardBack(72, 101, `dstk${off}`)}</div>`
  ).join('');
  const overlay = canDraw
    ? `<div data-action="fem-draw-stock" class="g500-pile-overlay" style="cursor:pointer;"><span class="g500-hover-label">${t('room.fem.drawHover')}</span></div>`
    : '';
  return `<div style="display:flex;flex-direction:column;align-items:center;gap:8px;">
    <div class="g500-pile-wrap${canDraw ? ' g500-pile-hoverable' : ''}">
      ${stacks}
      <div style="position:relative;z-index:4;border-radius:12px;">${renderCardBack(72, 101, 'dtop')}</div>
      ${overlay}
    </div>
    <div style="text-align:center;line-height:1.45;">
      <div class="g500-pile-label">${t('room.fem.stock')}</div>
      <div class="g500-pile-count">${t('room.cards', { count })}</div>
    </div>
  </div>`;
}

function discardPileHtml(): string {
  const top = props.viewModel?.discardPileTop ?? null;
  const canDrawDiscard = props.viewModel?.canDrawDiscard ?? false;
  const topH = top
    ? `<div style="position:relative;z-index:2;">
        ${renderCardFront(top, 72, 101)}
        ${canDrawDiscard ? `<div data-action="fem-draw-discard" class="g500-pile-overlay" style="cursor:pointer;"><span class="g500-hover-label">${t('room.fem.takeHover')}</span></div>` : ''}
      </div>`
    : `<div style="width:72px;height:101px;border-radius:12px;border:2px dashed rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.18);font-size:24px;">\u2014</div>`;
  return `<div style="display:flex;flex-direction:column;align-items:center;gap:8px;">
    <div class="g500-pile-wrap${canDrawDiscard && top ? ' g500-pile-hoverable' : ''}" style="width:72px;height:101px;">
      ${topH}
    </div>
    <div style="text-align:center;line-height:1.45;">
      <div class="g500-pile-label">${t('room.fem.discardPile')}</div>
      ${top ? `<div class="g500-pile-count">${top}</div>` : `<div class="g500-pile-count">${t('room.fem.empty')}</div>`}
    </div>
  </div>`;
}

function opponentZoneHtml(opp: FemPlayer): string {
  const melds: FemMeld[] = (props.viewModel?.melds ?? []).filter((m: FemMeld) => m.ownerId === opp.playerId);
  const meldClickAction = props.viewModel?.isMyTurn && props.viewModel?.canExtendMeld ? 'fem-extend-meld' : undefined;
  const oppCount = opponents.value.length;
  const oppFanCw = oppCount >= 3 ? 36 : oppCount === 2 ? 42 : 50;
  const oppFanCh = oppCount >= 3 ? 50 : oppCount === 2 ? 59 : 70;

  return `<div style="padding:10px 18px;border-bottom:1px solid var(--gt-border-subtle);${opp.isCurrentTurn ? 'background:rgba(255,179,0,0.025);' : ''}">
    <div style="display:flex;align-items:center;justify-content:flex-end;margin-bottom:8px;">
      <div class="gt-player-badge ${opp.isCurrentTurn ? 'gt-player-badge--active' : ''} gt-player-badge--reverse">
        <div class="gt-player-avatar">${(opp.displayName || '?')[0].toUpperCase()}</div>
        <div>
          <div class="gt-player-name">${opp.displayName}</div>
          <div class="gt-player-meta"><span style="font-weight:700;font-size:13px;color:${opp.score >= 400 ? '#f6a46f' : 'rgba(255,255,255,0.65)'};">${opp.score}</span> ${t('room.fem.of500')}</div>
        </div>
        ${opp.isCurrentTurn ? `<div class="gt-turn-indicator"><div class="gt-turn-dot"></div><span>${t('room.turn')}</span></div>` : ''}
      </div>
    </div>
    ${melds.length > 0 ? `<div style="padding:6px 0 2px;">${meldSectionHtml(melds, MW, MH, meldClickAction)}</div>` : ''}
    <div style="display:flex;justify-content:center;margin-top:6px;">
      ${renderHandFan(Array.from({ length: opp.cardCount }, (_, i) => `back${i}`), new Set(), false, false, oppFanCw, oppFanCh)}
    </div>
  </div>`;
}

function selfMeldsHtml(): string {
  const selfPlayerId = props.viewModel?.selfPlayerId;
  const melds: FemMeld[] = (props.viewModel?.melds ?? []).filter((m: FemMeld) => m.ownerId === selfPlayerId);
  const meldClickAction = props.viewModel?.isMyTurn && props.viewModel?.canExtendMeld ? 'fem-extend-meld' : undefined;
  if (melds.length === 0) return '';
  return `<div style="padding:2px 0 6px;">${meldSectionHtml(melds, MW, MH, meldClickAction)}</div>`;
}

function selfHandFanHtml(): string {
  const hand: string[] = props.viewModel?.hand ?? [];
  return renderHandFan(hand, selectedSet.value, true, true, CW, CH);
}

function onContentClick(e: Event) {
  const target = e.target as HTMLElement;

  const cardToggle = target.closest('[data-action="toggle-card"]') as HTMLElement | null;
  if (cardToggle?.dataset.card) {
    emit('toggle-card', cardToggle.dataset.card);
    return;
  }

  const drawStock = target.closest('[data-action="fem-draw-stock"]');
  if (drawStock) {
    emit('send-intent', { type: 'FEM_DRAW_FROM_STOCK' });
    return;
  }

  const drawDiscard = target.closest('[data-action="fem-draw-discard"]');
  if (drawDiscard) {
    emit('send-intent', { type: 'FEM_DRAW_FROM_DISCARD' });
    return;
  }

  const extendMeld = target.closest('[data-action="fem-extend-meld"]') as HTMLElement | null;
  if (extendMeld?.dataset.meldId) {
    emit('send-intent', { type: 'FEM_EXTEND_MELD', meldId: extendMeld.dataset.meldId });
    return;
  }
}

function requestRematch() {
  emit('send-intent', { type: 'REQUEST_REMATCH' });
}
</script>

<template>
  <GameTable :state="state" layout="duel" :game-title="t('game.500')" :is-my-turn="!!viewModel?.isMyTurn" @click="onContentClick">
    <!-- Topbar: score bar + round -->
    <template #topbar>
      <div v-html="scoreBarHtml()"></div>
      <span style="font-size:11px;color:rgba(255,255,255,0.4);letter-spacing:1px;">{{ t('room.fem.round', { n: viewModel?.roundNumber ?? 1 }) }}</span>
    </template>

    <!-- Opponents -->
    <template #opponents>
      <div :class="[opponents.length >= 2 ? 'g500-opponents-multi' : '']" style="display:flex;flex-direction:column;">
        <div v-for="opp in opponents" :key="opp.playerId" v-html="opponentZoneHtml(opp)"></div>
      </div>
    </template>

    <!-- Center: draw/discard piles -->
    <template #center>
      <div class="g500-center">
        <div class="g500-center-oval" aria-hidden="true"></div>
        <div style="position:relative;z-index:2;" v-html="drawPileHtml()"></div>
        <div class="g500-divider" aria-hidden="true"></div>
        <div style="position:relative;z-index:2;" v-html="discardPileHtml()"></div>
      </div>
    </template>

    <!-- Self display: melds -->
    <template #self-display>
      <div v-html="selfMeldsHtml()"></div>
    </template>

    <!-- Actions -->
    <template #actions>
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <PlayerBadge
          v-if="self"
          :name="self.displayName"
          :score="t('room.fem.scoreOf500', { score: self.score })"
          :is-current-turn="self.isCurrentTurn"
        />
      </div>
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <div
          v-if="viewModel?.isMyTurn && viewModel?.canExtendMeld && (viewModel?.melds ?? []).length > 0"
          style="font-size:10px;color:rgba(255,179,0,0.6);letter-spacing:0.5px;"
        >{{ t('room.fem.extendHint') }}</div>

        <template v-if="(viewModel?.phase === 'PLAYING' || !viewModel?.winnerPlayerId) && viewModel?.isMyTurn">
          <button v-if="viewModel?.canDraw" class="gt-btn" @click="emit('send-intent', { type: 'FEM_DRAW_FROM_STOCK' })">{{ t('room.fem.drawStock') }}</button>
          <button v-if="viewModel?.canDrawDiscard && viewModel?.discardPileTop" class="gt-btn gt-btn--secondary" @click="emit('send-intent', { type: 'FEM_DRAW_FROM_DISCARD' })">{{ t('room.fem.drawDiscard') }}</button>
          <button v-if="viewModel?.canTakePile" class="gt-btn gt-btn--secondary" @click="emit('send-intent', { type: 'FEM_TAKE_DISCARD_PILE' })">{{ t('room.fem.takePile') }}</button>
          <button v-if="viewModel?.canLayMeld" class="gt-btn" @click="emit('send-intent', { type: 'FEM_LAY_MELD' })">{{ t('room.fem.layMeld', { count: selCount }) }}</button>
          <button v-if="viewModel?.canClose" class="gt-btn" @click="emit('send-intent', { type: 'FEM_CLOSE_ROUND', card: (viewModel?.hand ?? [])[0] })">{{ t('room.fem.close') }}</button>
          <button v-else-if="viewModel?.canDiscard && selCount === 1" class="gt-btn gt-btn--secondary" @click="emit('send-intent', { type: 'FEM_DISCARD' })">{{ t('room.fem.discard') }}</button>
        </template>
      </div>
    </template>

    <!-- Hand -->
    <template #hand>
      <div style="display:flex;justify-content:center;" v-html="selfHandFanHtml()"></div>
    </template>

    <!-- Overlay -->
    <template #overlay>
      <WinOverlay
        v-if="viewModel?.postGame"
        :winner-label="viewModel.postGame.winnerLabel"
        :subtitle="t('room.win.gameOver')"
        :is-victory="!!state.winnerPlayerId && state.winnerPlayerId === state.playerId"
        :button-label="t('room.win.newGame')"
        @action="requestRematch"
      >
        <div class="win-overlay-scores">
          <div
            v-for="s in viewModel.postGame.scores"
            :key="s.name"
            class="win-overlay-score-row"
            :class="{ 'is-winner': s.isWinner }"
          >{{ s.name }}: {{ t('room.fem.points', { count: s.score }) }}</div>
        </div>
      </WinOverlay>
    </template>
  </GameTable>
</template>
