import { onBeforeUnmount, onMounted, type Ref } from 'vue';

const HOVER_CLASS = 'is-hovered';

/**
 * Slay-the-Spire style hover for the player's hand fan (rendered by renderHandFan).
 *
 * The hovered card is picked from the pointer's x position against the fan's resting
 * slots, not from what the browser hit-tests. A popped card covers its neighbours, so
 * hit-testing would make them hard to reach; slot-based picking steps through every
 * card in order. Clicks are routed to the picked card so what pops is what selects.
 *
 * Mouse only: touch keeps plain tap-to-select.
 */
export function useHandHover(containerRef: Ref<HTMLElement | null>) {
  let hoveredIndex: number | null = null;
  let observer: MutationObserver | null = null;

  function fan(): HTMLElement | null {
    return containerRef.value?.querySelector<HTMLElement>('.hand-fan') ?? null;
  }

  function cards(fanEl: HTMLElement): HTMLElement[] {
    return Array.from(fanEl.querySelectorAll<HTMLElement>(':scope > .hand-card'));
  }

  /** Card index whose resting slot contains clientX, or null outside the fan. */
  function indexAt(clientX: number): number | null {
    const fanEl = fan();
    if (!fanEl) return null;
    const all = cards(fanEl);
    const count = all.length;
    if (count === 0) return null;
    // Spacing is set by CSS and changes with window width, so measure it. offsetLeft
    // ignores transforms, so the fan angles and the hover pop don't skew it.
    const slotWidth = count > 1 ? all[1].offsetLeft - all[0].offsetLeft : all[0].offsetWidth;
    if (slotWidth <= 0) return null;

    // Each card owns the strip up to where the next card starts; the last card owns its full width.
    const rect = fanEl.getBoundingClientRect();
    const x = clientX - rect.left;
    if (x < 0 || x > rect.width) return null;
    return Math.min(Math.floor(x / slotWidth), count - 1);
  }

  /** Put the hover class on the current index; safe to call after every re-render. */
  function apply() {
    const fanEl = fan();
    if (!fanEl) return;
    cards(fanEl).forEach((card, i) => card.classList.toggle(HOVER_CLASS, i === hoveredIndex));
  }

  function setHovered(index: number | null) {
    if (index === hoveredIndex) return;
    hoveredIndex = index;
    apply();
  }

  function onPointerMove(event: PointerEvent) {
    if (event.pointerType !== 'mouse') return;
    setHovered(indexAt(event.clientX));
  }

  function onPointerLeave(event: PointerEvent) {
    if (event.pointerType !== 'mouse') return;
    setHovered(null);
  }

  // Capture phase: runs before the games' own click handlers on the hand.
  function onClickCapture(event: MouseEvent) {
    const fanEl = fan();
    if (hoveredIndex === null || !fanEl || !fanEl.contains(event.target as Node)) return;
    const hoveredCard = cards(fanEl)[hoveredIndex];
    if (!hoveredCard || hoveredCard.contains(event.target as Node)) return;
    // The click landed on a different card than the one popped; re-send it to the popped one.
    event.stopPropagation();
    event.preventDefault();
    hoveredCard.click();
  }

  onMounted(() => {
    const el = containerRef.value;
    if (!el) return;
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerleave', onPointerLeave);
    el.addEventListener('click', onClickCapture, true);
    // The hand is re-rendered via v-html on every state change (e.g. selecting a card),
    // which drops the class. Re-apply before the browser paints so the card doesn't dip.
    observer = new MutationObserver(apply);
    observer.observe(el, { childList: true, subtree: true });
  });

  onBeforeUnmount(() => {
    const el = containerRef.value;
    observer?.disconnect();
    if (!el) return;
    el.removeEventListener('pointermove', onPointerMove);
    el.removeEventListener('pointerleave', onPointerLeave);
    el.removeEventListener('click', onClickCapture, true);
  });
}
