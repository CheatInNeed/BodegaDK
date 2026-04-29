export type WinOverlayOpts = {
    winnerLabel: string;
    subtitle: string;
    quip?: string;
    buttonLabel: string;
    buttonAction: string;
    buttonDisabled?: boolean;
    /** Extra HTML inserted between the subtitle/quip and the button */
    extraHtml?: string;
};

export function renderWinOverlay(opts: WinOverlayOpts): string {
    const quip = opts.quip
        ? `<div class="win-overlay-quip">${escapeHtml(opts.quip)}</div>`
        : '';
    const extra = opts.extraHtml ?? '';
    return `
<div class="win-overlay">
  <div class="win-overlay-title">${escapeHtml(opts.winnerLabel)}</div>
  <div class="win-overlay-sub">${escapeHtml(opts.subtitle)}</div>
  ${quip}
  ${extra}
  <button class="win-overlay-btn" data-action="${opts.buttonAction}"${opts.buttonDisabled ? ' disabled' : ''}>${escapeHtml(opts.buttonLabel)}</button>
</div>`;
}

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
