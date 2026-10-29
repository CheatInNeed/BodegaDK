<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import type { RoomSessionState } from '@/lib/game-room/types';
import { renderCardFront, renderCardBack, renderHandFan } from '@/lib/games/shared/cards';
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

const router = useRouter();

const CW = 78, CH = 109;
const MW = 51, MH = 71;
const SHADOW = '0 4px 18px rgba(0,0,0,0.6),0 1px 4px rgba(0,0,0,0.3)';

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
    ? `<span class="g500-score-label">${others[0].score} pt</span>`
    : `<span class="g500-score-label">${others.map((o) => `${o.displayName}: ${o.score}`).join(' \u00b7 ')} pt</span>`;

  return `<div class="g500-score-bar">
    ${opponentLabel}
    ${tracks}
    <span class="g500-score-label g500-score-label-amber">${selfScore} pt</span>
  </div>`;
}

function playerBadgeHtml(player: FemPlayer, reversed = false): string {
  const active = player.isCurrentTurn;
  const dir = reversed ? 'row-reverse' : 'row';
  const align = reversed ? 'right' : 'left';
  const nc = active ? '#ffb300' : '#e8ddd7';
  const ab = active ? 'linear-gradient(135deg,#ffb300,#e08000)' : 'rgba(255,255,255,0.1)';
  const abdr = active ? 'rgba(255,179,0,0.65)' : 'rgba(255,255,255,0.13)';
  const ac = active ? '#1a0a00' : '#e8ddd7';
  const sc = player.score >= 400 ? '#f6a46f' : 'rgba(255,255,255,0.65)';
  const init = (player.displayName || '?')[0].toUpperCase();
  const badge = active
    ? `<div class="g500-turn-badge"><div class="g500-pulse-dot"></div><span>Tur</span></div>`
    : '';
  return `<div style="display:flex;align-items:center;gap:10px;flex-direction:${dir};">
    <div style="width:36px;height:36px;border-radius:50%;flex-shrink:0;background:${ab};border:2px solid ${abdr};display:flex;align-items:center;justify-content:center;font-family:Georgia,serif;font-weight:900;font-size:15px;color:${ac};">${init}</div>
    <div style="text-align:${align};">
      <div style="font-family:Georgia,serif;font-weight:900;font-size:14px;text-transform:uppercase;letter-spacing:1.2px;color:${nc};">${player.displayName}</div>
      <div style="font-size:11px;color:rgba(255,255,255,0.45);"><span style="font-weight:700;font-size:13px;color:${sc};">${player.score}</span><span style="margin-left:2px;">/ 500 pt</span></div>
    </div>
    ${badge}
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
    ? `<div style="position:absolute;bottom:-14px;left:0;font-size:8px;letter-spacing:1px;color:rgba(255,179,0,0.7);font-weight:700;">${pts} pt</div>`
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
    `<div style="position:absolute;top:${-off * 2.5}px;left:${-off * 1.5}px;opacity:0.55;">${renderCardBack(`dstk${off}`, 72, 101)}</div>`
  ).join('');
  const overlay = canDraw
    ? `<div data-action="fem-draw-stock" class="g500-pile-overlay" style="cursor:pointer;"><span class="g500-hover-label">Tr\u00e6k</span></div>`
    : '';
  return `<div style="display:flex;flex-direction:column;align-items:center;gap:8px;">
    <div class="g500-pile-wrap${canDraw ? ' g500-pile-hoverable' : ''}">
      ${stacks}
      <div style="position:relative;z-index:4;box-shadow:${SHADOW};border-radius:6px;">${renderCardBack('dtop', 72, 101)}</div>
      ${overlay}
    </div>
    <div style="text-align:center;line-height:1.45;">
      <div class="g500-pile-label">Bunke</div>
      <div class="g500-pile-count">${count} kort</div>
    </div>
  </div>`;
}

function discardPileHtml(): string {
  const top = props.viewModel?.discardPileTop ?? null;
  const canDrawDiscard = props.viewModel?.canDrawDiscard ?? false;
  const topH = top
    ? `<div style="position:relative;z-index:2;">
        ${renderCardFront(top, 72, 101)}
        ${canDrawDiscard ? `<div data-action="fem-draw-discard" class="g500-pile-overlay" style="cursor:pointer;"><span class="g500-hover-label">Tag kort</span></div>` : ''}
      </div>`
    : `<div style="width:72px;height:101px;border-radius:6px;border:2px dashed rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.18);font-size:24px;">\u2014</div>`;
  return `<div style="display:flex;flex-direction:column;align-items:center;gap:8px;">
    <div class="g500-pile-wrap${canDrawDiscard && top ? ' g500-pile-hoverable' : ''}" style="width:72px;height:101px;">
      ${topH}
    </div>
    <div style="text-align:center;line-height:1.45;">
      <div class="g500-pile-label">Aflagning</div>
      ${top ? `<div class="g500-pile-count">${top}</div>` : '<div class="g500-pile-count">tom</div>'}
    </div>
  </div>`;
}

function opponentZoneHtml(opp: FemPlayer): string {
  const melds: FemMeld[] = (props.viewModel?.melds ?? []).filter((m: FemMeld) => m.ownerId === opp.playerId);
  const meldClickAction = props.viewModel?.isMyTurn && props.viewModel?.canExtendMeld ? 'fem-extend-meld' : undefined;
  const oppCount = opponents.value.length;
  const oppFanCw = oppCount >= 3 ? 36 : oppCount === 2 ? 42 : 50;
  const oppFanCh = oppCount >= 3 ? 50 : oppCount === 2 ? 59 : 70;

  return `<div class="g500-zone g500-opponent${opp.isCurrentTurn ? ' g500-zone-active' : ''}">
    <div class="g500-zone-row">
      ${playerBadgeHtml(opp, true)}
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

function selfBadgeHtml(): string {
  return self.value ? playerBadgeHtml(self.value) : '';
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

function leaveTable() {
  router.push('/lobbies');
}

function requestRematch() {
  emit('send-intent', { type: 'REQUEST_REMATCH' });
}
</script>

<template>
  <section class="g500-shell" @click="onContentClick">
    <div class="g500-table">
      <svg class="g500-felt-svg" aria-hidden="true">
        <defs>
          <pattern id="g500felt" width="5" height="5" patternUnits="userSpaceOnUse">
            <circle cx="1.2" cy="1.2" r="0.7" fill="white" />
            <circle cx="3.7" cy="3.7" r="0.7" fill="white" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#g500felt)" />
      </svg>
      <div class="g500-vignette" aria-hidden="true"></div>
      <div class="g500-ring" aria-hidden="true"></div>

      <!-- Win overlay -->
      <WinOverlay
        v-if="viewModel?.postGame"
        :winner-label="viewModel.postGame.winnerLabel"
        subtitle="Vinder af 500!"
        button-label="Nyt spil"
        @action="requestRematch"
      >
        <div class="win-overlay-scores">
          <div
            v-for="s in viewModel.postGame.scores"
            :key="s.name"
            class="win-overlay-score-row"
            :class="{ 'is-winner': s.isWinner }"
          >{{ s.name }}: {{ s.score }} point</div>
        </div>
      </WinOverlay>

      <!-- Topbar -->
      <div class="g500-topbar">
        <button class="game-room-leave-btn" type="button" @click="leaveTable">&larr; Forlad</button>
        <div v-html="scoreBarHtml()"></div>
        <span style="font-size:11px;color:rgba(255,255,255,0.4);letter-spacing:1px;">Runde {{ viewModel?.roundNumber ?? 1 }}</span>
      </div>

      <!-- Opponents -->
      <div :class="['g500-opponents', `g500-opponents-${opponents.length}`]">
        <div v-for="opp in opponents" :key="opp.playerId" v-html="opponentZoneHtml(opp)"></div>
      </div>

      <!-- Center piles -->
      <div class="g500-center">
        <div class="g500-center-oval" aria-hidden="true"></div>
        <div style="position:relative;z-index:2;" v-html="drawPileHtml()"></div>
        <div class="g500-divider" aria-hidden="true"></div>
        <div style="position:relative;z-index:2;" v-html="discardPileHtml()"></div>
      </div>

      <!-- Self zone -->
      <div :class="['g500-zone', 'g500-player', viewModel?.isMyTurn ? 'g500-zone-active g500-player-active' : '']">
        <div v-html="selfMeldsHtml()"></div>
        <div style="display:flex;justify-content:center;margin-bottom:8px;" v-html="selfHandFanHtml()"></div>
        <div class="g500-action-row">
          <div v-html="selfBadgeHtml()"></div>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end;">
            <div
              v-if="viewModel?.isMyTurn && viewModel?.canExtendMeld && (viewModel?.melds ?? []).length > 0"
              style="font-size:10px;color:rgba(255,179,0,0.6);letter-spacing:0.5px;"
            >Klik p&aring; et stik for at tilf&oslash;je dit valgte kort</div>

            <template v-if="viewModel?.phase === 'PLAYING' || !viewModel?.winnerPlayerId">
              <template v-if="viewModel?.isMyTurn">
                <button v-if="viewModel?.canDraw" class="btn primary" @click="emit('send-intent', { type: 'FEM_DRAW_FROM_STOCK' })">Tr&aelig;k fra bunke</button>
                <button v-if="viewModel?.canDrawDiscard && viewModel?.discardPileTop" class="btn" @click="emit('send-intent', { type: 'FEM_DRAW_FROM_DISCARD' })">Tag aflagt kort</button>
                <button v-if="viewModel?.canTakePile" class="btn" @click="emit('send-intent', { type: 'FEM_TAKE_DISCARD_PILE' })">Tag hele bunken</button>
                <button v-if="viewModel?.canLayMeld" class="btn primary" @click="emit('send-intent', { type: 'FEM_LAY_MELD' })">L&aelig;g stik ({{ selCount }} kort)</button>
                <button v-if="viewModel?.canClose" class="btn primary" @click="emit('send-intent', { type: 'FEM_CLOSE_ROUND', card: (viewModel?.hand ?? [])[0] })">Luk</button>
                <button v-else-if="viewModel?.canDiscard && selCount === 1" class="btn" @click="emit('send-intent', { type: 'FEM_DISCARD' })">Afl&aelig;g</button>
              </template>
              <div v-else class="g500-waiting">
                <div class="g500-waiting-dot"></div>
                <span>Venter...</span>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
