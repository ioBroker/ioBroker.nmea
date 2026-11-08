/**
 * The styles every shadow root starts with. An element fills the box of the host, has a transparent background
 * and inherits `color` and `font`; colors come from the theme of the host (`--iob-primary`, `--iob-text`, ...), so
 * it looks right in light and dark. Sizes follow the box with container queries (`cqmin`), nothing is measured.
 *
 * The dials are instruments with a dark face of their own, as on board and in the native widgets; what lies on the
 * page around them takes the `--nmea-*` colors, which are darker on a light page (`.light`).
 */
export const BASE_STYLES = `
:host {
    display: block;
    width: 100%;
    height: 100%;
}
.mount {
    position: relative;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    /* the size of the box does not depend on what is in it */
    container-type: size;
    overflow: hidden;
    color: inherit;
    font: inherit;
    --nmea-orange: #ff9100;
    --nmea-yellow: #ffdf00;
    --nmea-pink: #fc0fc0;
    --nmea-blue: #3298ff;
    --nmea-dim: #9aa8b8;
}
.mount.light {
    --nmea-orange: #e65100;
    --nmea-yellow: #a07800;
    --nmea-pink: #c2008f;
    --nmea-blue: #1565c0;
    --nmea-dim: #5c6e80;
}
.mount.dialog {
    min-height: 60vh;
}
.mount.dialog.fit {
    height: auto;
    min-height: 0;
    container-type: inline-size;
}
.edit {
    pointer-events: none;
}
.fill {
    position: absolute;
    inset: 0;
}
svg {
    display: block;
}
svg text {
    font-family: inherit;
}
.clickable {
    cursor: pointer;
}
.clickable:focus-visible {
    outline: 2px solid var(--iob-primary);
    outline-offset: -2px;
}
.hint {
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    padding: 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    text-align: center;
    color: var(--iob-text-secondary);
    font-size: clamp(11px, 7cqmin, 16px);
}
.hint svg {
    width: clamp(20px, 20cqmin, 48px);
    height: clamp(20px, 20cqmin, 48px);
    fill: currentColor;
    opacity: 0.6;
}
button.btn {
    font: inherit;
    font-size: 14px;
    min-width: 44px;
    min-height: 36px;
    padding: 4px 12px;
    border-radius: var(--iob-border-radius, 4px);
    border: 1px solid var(--iob-divider);
    background: transparent;
    color: inherit;
    cursor: pointer;
}
button.btn:hover:not(:disabled) {
    background: color-mix(in srgb, currentColor 10%, transparent);
}
button.btn:disabled {
    opacity: 0.4;
    cursor: default;
}
button.btn.primary {
    background: var(--iob-primary);
    border-color: var(--iob-primary);
    color: var(--iob-primary-contrast, #fff);
}
`;
