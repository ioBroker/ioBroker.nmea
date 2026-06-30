// NMEA Autopilot — KIP-inspired control widget for the device manager.
// Shows current heading vs. locked target heading on a rotating compass dial with
// port/starboard "no-go" arcs, AWA pointer in Wind mode, rudder bar, and offers
// Standby/Auto/Wind/Track mode buttons plus −10/−1/+1/+10 adjust buttons.

import WidgetGeneric, {
    React,
    MuiMaterial,
    MuiIcons,
    getTileStyles,
    isNeumorphicTheme,
    type WidgetGenericProps,
    type WidgetGenericState,
    type CustomWidgetPlugin,
} from '@iobroker/dm-widgets';
import type {
    BoxProps,
    TypographyProps,
    DialogProps,
    IconButtonProps,
    DialogContentProps,
    DialogTitleProps,
    DialogActionsProps,
    ButtonProps,
    ButtonGroupProps,
} from '@mui/material';
import type { ConfigItemPanel, ConfigItemTabs } from '@iobroker/dm-utils';

// Cyclic ES-module import: NmeaWindComponent also imports this file. ES modules handle
// cycles via live bindings — the reference is undefined while NmeaWindComponent itself is being
// evaluated, but by the time any render() actually USES it, both modules are fully resolved.
// The previous lazy `require()` approach was stripped by Vite, leaving the companion area empty.
import NmeaWindCompass from './NmeaWindComponent';

// Resolve MUI components from the host bridge — `@iobroker/dm-widgets` re-exports React/MUI
// from `window.__iobrokerShared__` so all plugins use the same instance as the host (avoids
// dual-instance issues in module federation). For the standalone Vite dev harness, the same
// global is populated by `dev-shim.ts` (imported first in `index.tsx`) so the bridge works
// there too — keeping this widget aligned with `NmeaWindComponent` and `NmeaHistoryChartComponent`.
const Box: React.ComponentType<BoxProps> = MuiMaterial?.Box;
const Typography: React.ComponentType<TypographyProps> = MuiMaterial?.Typography;
const Dialog: React.ComponentType<DialogProps> = MuiMaterial?.Dialog;
const DialogContent: React.ComponentType<DialogContentProps> = MuiMaterial?.DialogContent;
const DialogTitle: React.ComponentType<DialogTitleProps> = MuiMaterial?.DialogTitle;
const DialogActions: React.ComponentType<DialogActionsProps> = MuiMaterial?.DialogActions;
const IconButton: React.ComponentType<IconButtonProps> = MuiMaterial?.IconButton;
const Button: React.ComponentType<ButtonProps> = MuiMaterial?.Button;
const ButtonGroup: React.ComponentType<ButtonGroupProps> = MuiMaterial?.ButtonGroup;
const CloseIcon: React.ComponentType<any> = MuiIcons?.Close;
// Toggle icons for companion split view — `ViewColumn` (two columns) reads as "show two side
// by side" for landscape, `ViewStream` (stacked bars) reads as "stack two" for portrait. We
// pick the one matching current orientation and reuse it for "back to single view" toggle.
const ViewColumnIcon: React.ComponentType<any> = MuiIcons?.ViewColumn;
const ViewStreamIcon: React.ComponentType<any> = MuiIcons?.ViewStream;
const ViewAgendaIcon: React.ComponentType<any> = MuiIcons?.ViewAgenda;

interface AutopilotSettings extends CustomWidgetPlugin {
    /** e.g. 'nmea.0' */
    instance?: string;
    /** Show AWA digital readout + dial pointer in Wind mode. */
    showAwa?: boolean;
    /** Show the rudder bar at the bottom of the dial. */
    showRudder?: boolean;
    /** Allow the user to split the fullscreen dialog and show the Wind compass alongside. */
    enableCompanion?: boolean;
    /**
     * Internal: when set, the widget renders only its inline dialog body (no tile, no Dialog).
     *  Used by the other widget when it embeds this one in companion split view.
     */
    _renderInline?: boolean;
}

interface AutopilotComponentState extends WidgetGenericState {
    mode: number | null; // 0=Standby, 1=Auto, 2=Wind, 3=Track, 4=NoDrift
    heading: number | null; // current compass heading (deg)
    lockedHeading: number | null; // autoPilot.heading (deg)
    awa: number | null; // apparent wind angle (deg, ±)
    rudder: number | null; // rudder position (deg, ±, port negative)
    /** Speed Through Water — knots, from `speed.speedWaterReferenced` (PGN 128259). */
    stw: number | null;
    /** Speed Over Ground — knots, from `cogSogRapidUpdate.sog` (PGN 129026). */
    sog: number | null;
    /** Mirrored autoPilot.windAngle in degrees — current wind-angle datum. */
    windAngle: number | null;
    dialogOpen: boolean;
    /**
     * Companion split-view toggle inside the open dialog. Only meaningful when
     *  settings.enableCompanion is true.
     */
    companionMode: boolean;
    /** Cached orientation of the open dialog (window aspect). Updated on resize while open. */
    dialogLandscape: boolean;
    /** True while a finger/mouse drag is in progress on the dial. */
    dragging: boolean;
    /** Drag-target angle in SVG-frame degrees (0=up=bow, +clockwise). null when idle. */
    dragAngle: number | null;
    /** Pending setpoint awaiting confirmation (only set when delta > LARGE_DELTA_DEG). */
    pendingAngle: number | null;
    /**
     * Mode the pending setpoint applies to — kept in case the autopilot mode flips while the
     *  confirmation dialog is open. We refuse to apply the value if the mode has changed.
     */
    pendingMode: 1 | 2 | null;
    /** Wall-clock deadline (ms epoch) at which the pending confirmation auto-cancels. */
    pendingDeadline: number | null;
}

const MODE_LABELS: Record<number, string> = {
    0: 'Standby',
    1: 'Auto',
    2: 'Wind',
    3: 'Track',
    4: 'NoDrift',
};

// Per-mode accent colour — shared between the in-dial mode label and the mode button row so a
// glance at either one tells you which mode the autopilot is in.
//   Standby red (off / safety), Auto green (engaged on heading), Wind light blue (wind-follow),
//   Track orange (route follow), NoDrift purple (rare, distinct).
const MODE_COLORS: Record<number, string> = {
    0: '#d32f2f',
    1: '#2e7d32',
    2: '#29b6f6',
    3: '#ed6c02',
    4: '#9c27b0',
};

const COLORS = {
    bg: '#191c1d',
    cardBg: '#0E1F2A',
    cardBgLight: '#FFFFFF',
    grey: '#B5B5B5',
    contrast: '#FFFFFF',
    contrastLight: '#0E1F2A',
    dim: '#9AA8B8',
    dimLight: '#5C6E80',
    port: '#c62828',
    starboard: '#2e7d32',
    yellow: '#FFD700',
    yellowDark: '#B38600',
} as const;

// Half-circle dial geometry — base dial fills 1000×500. We then stack two optional bands
// underneath for the rudder bar (+80 px) and the STW/SOG readouts (+140 px). Total viewBox
// height grows by whichever bands are enabled. CY (the dial pivot) stays at 500 regardless,
// so the half-circle and SVG transforms are independent of these add-ons.
const VIEWBOX_W = 1000;
const VIEWBOX_H_DIAL = 500; // dial-only — viewBox bottom is the dial diameter
const RUDDER_BAND_H = 80; // gutter under the dial for the rudder bar
const CX = 500;
const CY = 500; // pivot at the bottom edge of the dial-only viewBox
const R_OUTER = 480; // outer ring radius — top of arc at y = CY - R_OUTER = 20
const R_RING = 465; // numbered scale radius
const R_INNER = 370; // inside edge of the ring band
const POINTER_TIP_Y = CY - R_OUTER + 85; // top triangle tip just inside the outer edge
// Rudder bar matches the compass diameter (2 * R_OUTER) and is centred under the dial,
// so its left/right edges align with the leftmost / rightmost points of the outer ring.
const RUDDER_W = R_OUTER * 2;
const RUDDER_X = CX - R_OUTER;
const RUDDER_Y = VIEWBOX_H_DIAL + 30; // sits below the dial in the rudder-enabled viewBox
const RUDDER_H = 32;
const RUDDER_MAX_DEG = 35;
// Colour scheme matches the Wind widget's STW/SOG bottom blocks: STW blue (water-frame motion,
// same hue as a SET arrow would use) and SOG pink (ground-frame motion, same hue as a COG bug).
const STW_COLOR = '#3298ff';
const SOG_COLOR = '#FC0FC0';
// The nmea adapter already converts speed states (sog, speedWaterReferenced, …) from m/s
// to knots in main.ts before writing them, so no unit conversion happens in this widget.

function pad3(n: number | null): string {
    if (n == null || !isFinite(n)) {
        return '---';
    }
    const v = ((Math.round(n) % 360) + 360) % 360;
    return v.toString().padStart(3, '0');
}

function fmtSigned(n: number | null): string {
    if (n == null || !isFinite(n)) {
        return '--';
    }
    return Math.abs(Math.round(n)).toString();
}

// Port/starboard single-letter abbreviations per language, used to render the autopilot
// wind-angle datum the way a Raymarine pilot head does (e.g. "130°P", in German "130°B").
// Port = wind from the left side (datum 180…360°), starboard = from the right (0…180°).
// Conventional nautical abbreviations; falls back to English P/S.
const WIND_SIDE_ABBR: Record<string, { port: string; starboard: string }> = {
    en: { port: 'P', starboard: 'S' }, // Port / Starboard
    de: { port: 'B', starboard: 'S' }, // Backbord / Steuerbord
    ru: { port: 'Л', starboard: 'П' }, // Левый борт / Правый борт
    uk: { port: 'Л', starboard: 'П' }, // Лівий борт / Правий борт
    pl: { port: 'L', starboard: 'P' }, // Lewa burta / Prawa burta
    nl: { port: 'B', starboard: 'S' }, // Bakboord / Stuurboord
    fr: { port: 'B', starboard: 'T' }, // Bâbord / Tribord
    it: { port: 'B', starboard: 'T' }, // Babordo / Tribordo
    pt: { port: 'B', starboard: 'E' }, // Bombordo / Estibordo
    es: { port: 'B', starboard: 'E' }, // Babor / Estribor
    'zh-cn': { port: '左', starboard: '右' }, // 左舷 / 右舷
};

/**
 * Render a wind-angle datum (degrees, 0…360) the way a Raymarine pilot head shows it:
 * 0…180° → starboard, 180…360° → port, each as a ≤180° magnitude plus a language-dependent
 * side letter (e.g. datum 230° → "130°P" in English, "130°B" in German). 0° (dead ahead) and
 * 180° (dead astern) carry no side letter. The magnitude digits and the side letter are
 * returned separately so the caller can size them independently inside the SVG.
 */
function formatWindDatumDeg(deg: number | null, lang: string): { digits: string; side: string } {
    if (deg == null || !isFinite(deg)) {
        return { digits: '---', side: '' };
    }
    const abbr = WIND_SIDE_ABBR[lang] || WIND_SIDE_ABBR.en;
    const d = ((Math.round(deg) % 360) + 360) % 360;
    if (d === 0) {
        return { digits: '0', side: '' };
    }
    if (d === 180) {
        return { digits: '180', side: '' };
    }
    return d < 180 ? { digits: String(d), side: abbr.starboard } : { digits: String(360 - d), side: abbr.port };
}

/**
 * Smallest angular distance between two compass-style angles (deg), always 0..180.
 * Used to decide whether a drag-to-set commit needs an "are you sure?" prompt — large
 * course or wind-angle changes from the dial can be safety-critical (sudden gybe, broach,
 * collision with the bow), so anything beyond ~20° gets a confirmation gate.
 */
function angularDiff(a: number, b: number): number {
    const d = Math.abs(((a - b) % 360) + 360) % 360;
    return d > 180 ? 360 - d : d;
}

/** Threshold (deg) above which a drag-to-set requires explicit operator confirmation. */
const LARGE_DELTA_DEG = 20;
/** Auto-cancel timeout (ms) for the confirmation dialog when the operator doesn't react. */
const CONFIRM_TIMEOUT_MS = 10_000;

export class NmeaAutopilotComponent extends WidgetGeneric<AutopilotComponentState, AutopilotSettings> {
    private stateHandlers: Map<string, (id: string, state: ioBroker.State | null | undefined) => void> = new Map();

    /** Auto-cancel timer for the large-delta confirmation dialog. */
    private pendingConfirmTimer: ReturnType<typeof setTimeout> | null = null;

    /** 500-ms tick that re-renders the confirmation dialog so the countdown stays current. */
    private pendingTickInterval: ReturnType<typeof setInterval> | null = null;

    /**
     * Per-key monotonically-increasing rotation angles. CSS animates `transform` linearly,
     *  so feeding it raw 0..360° angles makes the compass spin a long way at every 359°↔0°
     *  wrap. We unwrap by tracking each angle's "extended" value: each frame we pick the
     *  equivalent target within ±180° of the last value and store it. The visible rotation
     *  number can drift arbitrarily far from 0 over a long session — that's fine, CSS doesn't
     *  care, and the modulo-360 visual position stays correct.
     */
    private unwrappedAngles: Record<string, number> = {};

    private unwrap(key: string, target: number | null | undefined): number {
        if (target == null || !Number.isFinite(target)) {
            // No data — return whatever we last had (or 0 on first call) so the transform stays
            // put rather than snapping back to zero.
            return this.unwrappedAngles[key] ?? 0;
        }
        const current = this.unwrappedAngles[key];
        if (current === undefined) {
            this.unwrappedAngles[key] = target;
            return target;
        }
        // Shortest signed delta in (-180, 180].
        const delta = ((((target - current) % 360) + 540) % 360) - 180;
        const next = current + delta;
        this.unwrappedAngles[key] = next;
        return next;
    }

    constructor(props: WidgetGenericProps<AutopilotSettings>) {
        super(props);
        this.state = {
            ...this.state,
            mode: null,
            heading: null,
            lockedHeading: null,
            awa: null,
            rudder: null,
            stw: null,
            sog: null,
            windAngle: null,
            dialogOpen: false,
            // Restore the split-view preference saved the last time the operator toggled it.
            // Each widget instance gets its own slot keyed by widget id, so two autopilot
            // tiles on the same page can be configured independently.
            companionMode: NmeaAutopilotComponent.loadCompanionPref(props),
            dialogLandscape: typeof window !== 'undefined' ? window.innerWidth >= window.innerHeight : true,
            dragging: false,
            dragAngle: null,
            pendingAngle: null,
            pendingMode: null,
            pendingDeadline: null,
        };
    }

    /** localStorage key for the persisted companion split-view preference. */
    private static companionStorageKey(props: WidgetGenericProps<AutopilotSettings>): string | null {
        const id = props.widget?.id;
        if (id == null) {
            return null;
        }
        return `nmea-autopilot-companion-${id}`;
    }

    private static loadCompanionPref(props: WidgetGenericProps<AutopilotSettings>): boolean {
        if (typeof window === 'undefined') {
            return false;
        }
        const key = NmeaAutopilotComponent.companionStorageKey(props);
        if (!key) {
            return false;
        }
        try {
            return window.localStorage.getItem(key) === '1';
        } catch {
            // Private mode / disabled storage — silently fall through.
            return false;
        }
    }

    private saveCompanionPref(on: boolean): void {
        if (typeof window === 'undefined') {
            return;
        }
        const key = NmeaAutopilotComponent.companionStorageKey(this.props);
        if (!key) {
            return;
        }
        try {
            if (on) {
                window.localStorage.setItem(key, '1');
            } else {
                window.localStorage.removeItem(key);
            }
        } catch {
            // ignore — storage unavailable
        }
    }

    static override getConfigSchema(): { name: string; schema: ConfigItemPanel | ConfigItemTabs } {
        return {
            name: 'NmeaAutopilot',
            schema: {
                type: 'panel',
                items: {
                    instance: {
                        type: 'instance',
                        adapter: 'nmea',
                        label: 'nmeaap_instance',
                        default: 'nmea.0',
                    },
                    showAwa: {
                        type: 'checkbox',
                        label: 'nmeaap_showAwa',
                        default: true,
                        sm: 6,
                    },
                    showRudder: {
                        type: 'checkbox',
                        label: 'nmeaap_showRudder',
                        default: true,
                        sm: 6,
                    },
                    enableCompanion: {
                        newLine: true,
                        type: 'checkbox',
                        label: 'nmeaap_enableCompanion',
                        help: 'nmeaap_enableCompanion_help',
                        default: false,
                        sm: 12,
                    },
                },
            },
        };
    }

    /** Window-resize handler — kept as a stable arrow so add/remove pair up correctly. */
    private onWindowResize = (): void => {
        if (typeof window === 'undefined') {
            return;
        }
        const landscape = window.innerWidth >= window.innerHeight;
        if (landscape !== this.state.dialogLandscape) {
            this.setState({ dialogLandscape: landscape } as AutopilotComponentState);
        }
    };

    componentDidMount(): void {
        super.componentDidMount?.();
        this.subscribeAll();
    }

    componentDidUpdate(
        prevProps: Readonly<WidgetGenericProps<AutopilotSettings>>,
        prevState: Readonly<AutopilotComponentState>,
    ): void {
        super.componentDidUpdate?.(prevProps, this.state);
        if (prevProps.settings.instance !== this.props.settings.instance) {
            this.unsubscribeAll();
            this.subscribeAll();
        }
        // Manage the resize listener only while the dialog is open — saves a per-window-resize
        // forceUpdate on every widget instance on the page.
        if (prevState.dialogOpen !== this.state.dialogOpen) {
            if (this.state.dialogOpen) {
                window.addEventListener('resize', this.onWindowResize);
                this.onWindowResize();
            } else {
                window.removeEventListener('resize', this.onWindowResize);
            }
        }
    }

    componentWillUnmount(): void {
        super.componentWillUnmount?.();
        this.unsubscribeAll();
        this.clearPendingTimers();
        window.removeEventListener('resize', this.onWindowResize);
    }

    private subscribeAll(): void {
        const instance = this.props.settings.instance || 'nmea.0';
        const ctx = this.props.stateContext;

        const bind = (id: string, update: (v: number | null) => void): void => {
            const handler = (_id: string, state: ioBroker.State | null | undefined): void => {
                update(state?.val != null ? Number(state.val) : null);
            };
            ctx.getState(id, handler);
            this.stateHandlers.set(id, handler);
        };

        bind(`${instance}.autoPilot.state`, v => this.setState({ mode: v } as AutopilotComponentState));
        bind(`${instance}.autoPilot.heading`, v => this.setState({ lockedHeading: v } as AutopilotComponentState));
        // Prefer true heading; fall back to seatalk pilot heading sources.
        bind(`${instance}.vesselHeading.headingTrue`, v => this.setState({ heading: v } as AutopilotComponentState));
        bind(`${instance}.windData.windAngleApparent`, v => this.setState({ awa: v } as AutopilotComponentState));
        bind(`${instance}.rudder.position`, v => this.setState({ rudder: v } as AutopilotComponentState));
        // STW (Speed Through Water — log/paddlewheel) and SOG (Speed Over Ground — GPS)
        // shown as auxiliary readouts beneath the dial (same style as the Wind compass widget).
        bind(`${instance}.speed.speedWaterReferenced`, v => this.setState({ stw: v } as AutopilotComponentState));
        bind(`${instance}.cogSogRapidUpdate.sog`, v => this.setState({ sog: v } as AutopilotComponentState));
        // Wind-angle datum mirrored from the autopilot — used in Wind mode as the "current"
        // setpoint shown next to the new value during a drag-to-set gesture on the dial.
        bind(`${instance}.autoPilot.windAngle`, v => this.setState({ windAngle: v } as AutopilotComponentState));
    }

    private unsubscribeAll(): void {
        const ctx = this.props.stateContext;
        for (const [id, handler] of this.stateHandlers) {
            ctx.removeState(id, handler);
        }
        this.stateHandlers.clear();
    }

    private writeState(suffix: string, value: ioBroker.StateValue): void {
        const instance = this.props.settings.instance || 'nmea.0';
        try {
            void this.props.stateContext.getSocket().setState(`${instance}.${suffix}`, value);
        } catch (e) {
            // ignore — host catches it as well
            console.warn('[NmeaAutopilot] setState failed', e);
        }
    }

    private setMode(mode: number): void {
        this.writeState('autoPilot.state', mode);
    }

    private adjust(delta: 1 | -1 | 10 | -10): void {
        if (this.state.mode === 2) {
            // Wind mode → use signed magnitude on windAngleChange
            this.writeState('autoPilot.windAngleChange', delta);
            return;
        }
        // Otherwise use the dedicated heading +/− buttons
        if (delta === 1) {
            this.writeState('autoPilot.headingPlus1', true);
        } else if (delta === -1) {
            this.writeState('autoPilot.headingMinus1', true);
        } else if (delta === 10) {
            this.writeState('autoPilot.headingPlus10', true);
        } else if (delta === -10) {
            this.writeState('autoPilot.headingMinus10', true);
        }
    }

    protected isTileActive(): boolean {
        return this.state.mode != null && this.state.mode !== 0;
    }

    /**
     * Convert a pointer event's client coordinates into the SVG-frame angle in degrees,
     * measured from "up" (12 o'clock = bow direction) clockwise. Returns null for the exact
     * dial centre (degenerate) or when the SVG viewBox is unreadable. Touches in the lower
     * half of the SVG (below CY) wrap to angles around 180°, which is fine for our purposes —
     * the operator can still drag through the bottom of the visible half-disc to flip ±90°.
     */
    private pointerToAngle(e: React.PointerEvent<SVGSVGElement>): number | null {
        const svg = e.currentTarget;
        const rect = svg.getBoundingClientRect();
        const viewBox = svg.viewBox.baseVal;
        if (!viewBox || viewBox.width <= 0 || viewBox.height <= 0 || rect.width <= 0) {
            return null;
        }
        const xScale = viewBox.width / rect.width;
        const yScale = viewBox.height / rect.height;
        const svgX = (e.clientX - rect.left) * xScale;
        const svgY = (e.clientY - rect.top) * yScale;
        const dx = svgX - CX;
        const dy = CY - svgY; // flip — SVG y grows down
        if (dx === 0 && dy === 0) {
            return null;
        }
        let deg = (Math.atan2(dx, dy) * 180) / Math.PI;
        deg = ((deg % 360) + 360) % 360;
        return deg;
    }

    /**
     * Drag-to-set on the dial. Only enabled in Auto (mode 1) — the operator pulls the locked
     * compass heading by dragging anywhere on the disc. Wind mode (2) is intentionally NOT
     * draggable: a stray finger swipe on a wind-following autopilot could gybe the boat hard,
     * so wind-angle changes go exclusively through the ±1 / ±10 buttons (which write
     * `autoPilot.windAngleChange` in small increments). Standby / Track / unknown modes have
     * no setpoint to update, so we ignore the pointer there too.
     */
    private handlePointerDown = (e: React.PointerEvent<SVGSVGElement>): void => {
        if (this.state.mode !== 1) {
            return;
        }
        const angle = this.pointerToAngle(e);
        if (angle === null) {
            return;
        }
        try {
            e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
            // setPointerCapture may not be supported in some embedded contexts — fall through.
        }
        e.preventDefault();
        this.setState({ dragging: true, dragAngle: angle } as AutopilotComponentState);
    };

    private handlePointerMove = (e: React.PointerEvent<SVGSVGElement>): void => {
        if (!this.state.dragging) {
            return;
        }
        const angle = this.pointerToAngle(e);
        if (angle === null) {
            return;
        }
        this.setState({ dragAngle: angle } as AutopilotComponentState);
    };

    private handlePointerEnd = (e: React.PointerEvent<SVGSVGElement>): void => {
        if (!this.state.dragging) {
            return;
        }
        try {
            e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
            // ignore
        }
        const finalAngle = this.state.dragAngle;
        const mode = this.state.mode;
        this.setState({ dragging: false, dragAngle: null } as AutopilotComponentState);
        if (finalAngle === null) {
            return;
        }
        if (mode === 1) {
            // Auto: SVG-frame drag angle is bow-relative. Locked heading (compass) is the
            // current heading plus that bow-relative offset, normalised to 0..360.
            const heading = this.state.heading ?? 0;
            const newAngle = (((heading + finalAngle) % 360) + 360) % 360;
            this.commitOrConfirm(1, newAngle, this.state.lockedHeading);
        }
        // Wind mode (2) is excluded by handlePointerDown — drag-to-set is disabled there
        // by design (see comment on handlePointerDown).
    };

    /**
     * Apply the new setpoint immediately when it's a small change, or open a confirmation
     * dialog when the operator just dragged through a big jump (> LARGE_DELTA_DEG). Marine
     * autopilots can swing the boat hard on a large course change, so anything over ~20° is
     * gated behind an explicit OK to prevent accidental gybes / collisions / rudder slamming.
     */
    private commitOrConfirm(mode: 1 | 2, newAngle: number, currentAngle: number | null): void {
        const rounded = Math.round(newAngle);
        if (currentAngle == null || angularDiff(rounded, currentAngle) <= LARGE_DELTA_DEG) {
            // Small change (or no current value to compare against) — write straight through.
            this.writeState(mode === 1 ? 'autoPilot.heading' : 'autoPilot.windAngle', rounded);
            return;
        }
        this.startConfirmation(mode, rounded);
    }

    private startConfirmation(mode: 1 | 2, angle: number): void {
        this.clearPendingTimers();
        this.pendingConfirmTimer = setTimeout(() => this.cancelConfirmation(), CONFIRM_TIMEOUT_MS);
        // Re-render twice a second so the visible countdown stays in sync without burning CPU.
        this.pendingTickInterval = setInterval(() => this.forceUpdate(), 500);
        this.setState({
            pendingMode: mode,
            pendingAngle: angle,
            pendingDeadline: Date.now() + CONFIRM_TIMEOUT_MS,
        } as AutopilotComponentState);
    }

    private clearPendingTimers(): void {
        if (this.pendingConfirmTimer) {
            clearTimeout(this.pendingConfirmTimer);
            this.pendingConfirmTimer = null;
        }
        if (this.pendingTickInterval) {
            clearInterval(this.pendingTickInterval);
            this.pendingTickInterval = null;
        }
    }

    /** Operator hit Cancel — or the auto-cancel timeout fired. Drop the pending value. */
    private cancelConfirmation = (): void => {
        this.clearPendingTimers();
        this.setState({
            pendingMode: null,
            pendingAngle: null,
            pendingDeadline: null,
        } as AutopilotComponentState);
    };

    /** Operator hit Confirm — apply the pending value (only if mode hasn't drifted). */
    private confirmPending = (): void => {
        const { pendingMode, pendingAngle } = this.state;
        this.clearPendingTimers();
        this.setState({
            pendingMode: null,
            pendingAngle: null,
            pendingDeadline: null,
        } as AutopilotComponentState);
        if (pendingAngle == null || pendingMode == null) {
            return;
        }
        // If the mode flipped while the dialog was open, the pending angle no longer applies
        // (e.g. operator switched from Wind to Auto and our 270° wind angle would set heading).
        if (this.state.mode !== pendingMode) {
            return;
        }
        this.writeState(pendingMode === 1 ? 'autoPilot.heading' : 'autoPilot.windAngle', pendingAngle);
    };

    /**
     * The setpoint the drag would commit to right now: compass heading in Auto mode (current
     * heading + bow-relative drag offset). Wind mode doesn't support drag-to-set, so this is
     * only meaningful in Auto.
     */
    private computeDragTarget(): number | null {
        if (!this.state.dragging || this.state.dragAngle == null) {
            return null;
        }
        if (this.state.mode === 1) {
            const heading = this.state.heading ?? 0;
            return (((heading + this.state.dragAngle) % 360) + 360) % 360;
        }
        return null;
    }

    /** The setpoint currently in effect on the autopilot, for the active mode. */
    private getCurrentSetpoint(): number | null {
        if (this.state.mode === 1) {
            return this.state.lockedHeading;
        }
        return null;
    }

    /**
     * Half-circle autopilot dial — only the upper 180° of the compass rose is visible.
     * The pivot CY sits at the bottom edge of the dial viewBox; everything below CY is
     * cropped via a clipPath so the rotating rose, AWA pointer, and inner plate become
     * a clean half-disc. HDG / AWA / mode / locked-heading text sit fixed inside the
     * lower interior of the disc.
     *
     * `compact=true` drops the corner HDG/AWA blocks (used by the small tile).
     */
    protected renderDialSvg(size: number | string, compact = false, dark = true): React.JSX.Element {
        const { heading, lockedHeading, awa, mode, rudder, windAngle } = this.state;
        const lang = this.props.stateContext.language || 'en';
        // Unwrap heading and AWA so the CSS transition takes the shortest path across 360°↔0°
        // wraps instead of spinning the long way (e.g. 359° → 1° should be +2°, not -358°).
        const headingDeg = heading != null ? this.unwrap('heading', heading) : 0;
        const awaDeg = this.unwrap('awa', awa);
        const fg = dark ? COLORS.contrast : COLORS.contrastLight;
        const bgRing = dark ? '#1B2733' : '#E8EEF3';
        const dimmed = dark ? COLORS.dim : COLORS.dimLight;

        const showRudder = !compact && this.props.settings.showRudder !== false;
        const showAwa = !compact && this.props.settings.showAwa !== false;
        // SVG viewBox height is just dial + (optional) rudder band; the STW/SOG readout lives
        // OUTSIDE the SVG (in the HTML controls block) so it can sit at the very bottom of the
        // widget regardless of dial size.
        const viewH = VIEWBOX_H_DIAL + (showRudder ? RUDDER_BAND_H : 0);

        const triangleD = `M ${CX} ${POINTER_TIP_Y - 14}
            L ${CX - 26} ${POINTER_TIP_Y + 26}
            L ${CX + 26} ${POINTER_TIP_Y + 26} Z`;

        // Polar helper — 0° is "up", clockwise positive.
        const polar = (r: number, deg: number): { x: number; y: number } => {
            const rad = (deg * Math.PI) / 180;
            return { x: CX + Math.sin(rad) * r, y: CY - Math.cos(rad) * r };
        };

        // tick marks every 10°, major every 30° (the rotating group is clipped to the
        // upper half so we render the full 360° here without conditionals).
        const ticks: React.JSX.Element[] = [];
        for (let a = 0; a < 360; a += 10) {
            const major = a % 30 === 0;
            const len = major ? 22 : 12;
            const stroke = major ? 6 : 3;
            const inner = polar(R_RING - len / 2, a);
            const outer = polar(R_RING + len / 2, a);
            ticks.push(
                <line
                    key={`tk${a}`}
                    x1={inner.x}
                    y1={inner.y}
                    x2={outer.x}
                    y2={outer.y}
                    stroke={fg}
                    strokeWidth={stroke}
                    strokeLinecap="square"
                />,
            );
        }
        const labelPoints: { angle: number; text: string; bold?: boolean }[] = [
            { angle: 0, text: 'N', bold: true },
            { angle: 30, text: '30' },
            { angle: 60, text: '60' },
            { angle: 90, text: 'E', bold: true },
            { angle: 120, text: '120' },
            { angle: 150, text: '150' },
            { angle: 180, text: 'S', bold: true },
            { angle: 210, text: '210' },
            { angle: 240, text: '240' },
            { angle: 270, text: 'W', bold: true },
            { angle: 300, text: '300' },
            { angle: 330, text: '330' },
        ];
        const labels = labelPoints.map(l => {
            const pos = polar(R_RING - 50, l.angle);
            // Classic magnetic-compass colouring: N in blue (north-seeking end), S in red
            // (south pole) — matches the convention in the Wind compass widget. E and W stay
            // in foreground colour, numeric labels likewise.
            const labelFill = l.text === 'N' ? '#3a8dff' : l.text === 'S' ? '#ff3b3b' : fg;
            // Counter-rotate each label so it stays upright relative to the bow regardless of heading.
            return (
                <text
                    key={`lbl${l.angle}`}
                    x={pos.x}
                    y={pos.y}
                    fill={labelFill}
                    fontSize={l.bold ? 38 : 32}
                    fontWeight={l.bold ? 700 : 400}
                    textAnchor="middle"
                    dominantBaseline="central"
                    transform={`rotate(${l.angle} ${pos.x} ${pos.y})`}
                >
                    {l.text}
                </text>
            );
        });

        // Port (red) + starboard (green) bow-fixed "no-go" arcs — drawn in the upper half only.
        // Arc on the port side spans from -90° (left horizon) to -30° (left of bow); starboard
        // mirrors from +30° to +90°. Stroke radius slightly inside the outer edge so it sits on
        // top of the ring band without hiding it.
        const ARC_R = R_OUTER - 15;
        const portStart = polar(ARC_R, -66);
        const portEnd = polar(ARC_R, -30);
        const stbdStart = polar(ARC_R, 30);
        const stbdEnd = polar(ARC_R, 66);
        const portArc = `M ${portStart.x} ${portStart.y} A ${ARC_R} ${ARC_R} 0 0 1 ${portEnd.x} ${portEnd.y}`;
        const stbdArc = `M ${stbdStart.x} ${stbdStart.y} A ${ARC_R} ${ARC_R} 0 0 1 ${stbdEnd.x} ${stbdEnd.y}`;

        const start = polar(ARC_R, -90);
        const end = polar(ARC_R, 90);
        const lightGreyArc = `M ${start.x} ${start.y} A ${ARC_R} ${ARC_R} 0 0 1 ${end.x} ${end.y}`;

        // Half-disc paths: outer ring band (annulus, top half) and inner plate (semi-disc, top half).
        const ringPath = `M ${CX - R_OUTER} ${CY}
            A ${R_OUTER} ${R_OUTER} 0 0 1 ${CX + R_OUTER} ${CY}
            L ${CX + R_INNER} ${CY}
            A ${R_INNER} ${R_INNER} 0 0 0 ${CX - R_INNER} ${CY} Z`;

        // Rudder bar geometry (only computed when shown).
        const rudderCenter = RUDDER_X + RUDDER_W / 2;
        const halfRudderW = RUDDER_W / 2;
        let barX = rudderCenter;
        let barW = 0;
        let barColor: string = COLORS.grey;
        if (rudder != null && isFinite(rudder)) {
            const clamped = Math.max(-RUDDER_MAX_DEG, Math.min(RUDDER_MAX_DEG, rudder));
            const px = (clamped / RUDDER_MAX_DEG) * halfRudderW;
            if (px >= 0) {
                barX = rudderCenter;
                barW = px;
                barColor = COLORS.starboard;
            } else {
                barX = rudderCenter + px;
                barW = -px;
                barColor = COLORS.port;
            }
        }

        const clipId = `apdial-clip-${String(this.props.widget?.id ?? 'dev')}`;
        // Drag-to-set is only wired up on the full-size dial. The compact tile is wrapped in a
        // click-to-open Box and would conflict with a drag gesture; the wide-bar variant doesn't
        // even render this SVG path.
        const dragEnabled = !compact && this.state.mode === 1;
        const { dragging, dragAngle } = this.state;
        const dragTarget = this.computeDragTarget();
        const currentSetpoint = this.getCurrentSetpoint();
        return (
            <svg
                viewBox={`0 0 ${VIEWBOX_W} ${viewH}`}
                preserveAspectRatio="xMidYMid meet"
                style={{
                    width: '100%',
                    height: size,
                    display: 'block',
                    // Disable browser touch scrolling on the dial so drag gestures don't scroll
                    // the surrounding page. Only matters when drag is enabled.
                    touchAction: !compact ? 'none' : undefined,
                    cursor: dragEnabled ? 'pointer' : undefined,
                }}
                onPointerDown={!compact ? this.handlePointerDown : undefined}
                onPointerMove={!compact ? this.handlePointerMove : undefined}
                onPointerUp={!compact ? this.handlePointerEnd : undefined}
                onPointerCancel={!compact ? this.handlePointerEnd : undefined}
            >
                <defs>
                    {/* Clip everything that belongs inside the half-disc to y ∈ [0, CY]. */}
                    <clipPath id={clipId}>
                        <rect
                            x={0}
                            y={0}
                            width={VIEWBOX_W}
                            height={CY}
                        />
                    </clipPath>
                </defs>

                {/* Transparent overlay across the full SVG viewport so pointer events fire on
                    "empty" interior areas too — without this, taps inside the inner dimmed disc
                    wouldn't register because there's no painted shape under the finger. */}
                {!compact ? (
                    <rect
                        x={0}
                        y={0}
                        width={VIEWBOX_W}
                        height={viewH}
                        fill="transparent"
                        style={{ pointerEvents: 'all' }}
                    />
                ) : null}

                {/* Outer ring (top-half annulus). */}
                <path
                    d={ringPath}
                    fill={bgRing}
                    stroke={fg}
                    strokeWidth={3}
                />

                <path
                    d={lightGreyArc}
                    fill="none"
                    stroke={'#888'}
                    strokeWidth={30}
                    strokeLinecap="butt"
                />
                {/* Port + starboard "no-go" arcs over the ring band. */}
                <path
                    d={portArc}
                    fill="none"
                    stroke={COLORS.port}
                    strokeWidth={30}
                    strokeLinecap="butt"
                />
                <path
                    d={stbdArc}
                    fill="none"
                    stroke={COLORS.starboard}
                    strokeWidth={30}
                    strokeLinecap="butt"
                />

                {/* Rotating compass rose — only the upper half is visible thanks to the clipPath.
                    IMPORTANT: clipPath and transform must NOT live on the same element. SVG's
                    clip-path is interpreted in the element's local coordinate system, which means
                    if we put both on one <g>, the clip rect rotates along with the contents — so
                    at HDG=180° the clip rect ends up over the lower half and everything visible
                    gets culled. Splitting into an outer (clipping, no transform) and inner
                    (rotating, no clip) group keeps the clip rect locked to the upper half of the
                    SVG while the dial spins inside it.
                    Rotation uses the SVG `transform` ATTRIBUTE (not CSS) so the pivot is always
                    (CX, CY) in user coordinates regardless of how the SVG is scaled. */}
                <g clipPath={`url(#${clipId})`}>
                    <g
                        transform={`rotate(${-headingDeg} ${CX} ${CY})`}
                        style={{ transition: 'transform 0.4s linear' }}
                    >
                        {ticks}
                        {labels}
                    </g>
                </g>

                {/* AWA pointer (Wind mode) — same outer-clip / inner-rotate split. */}
                {mode === 2 && awa != null && isFinite(awa) ? (
                    <g clipPath={`url(#${clipId})`}>
                        <g
                            transform={`rotate(${awaDeg} ${CX} ${CY})`}
                            style={{ transition: 'transform 0.4s linear' }}
                        >
                            <path
                                d={`M ${CX} ${CY - R_OUTER + 5}
                                    L ${CX - 18} ${CY - R_OUTER + 50}
                                    L ${CX + 18} ${CY - R_OUTER + 50} Z`}
                                fill={COLORS.yellow}
                                stroke={COLORS.yellowDark}
                                strokeWidth={3}
                            />
                        </g>
                    </g>
                ) : null}

                {/* Drag marker — orange triangle + radial line at the bow-relative drag angle.
                    Only visible while a drag is in progress. The angle is interpreted in the
                    SVG/bow frame regardless of mode (compass-vs-wind is resolved in the centre
                    text below); rendering inside the same clipPath keeps it confined to the
                    upper half-disc, matching the rose and AWA pointer. */}
                {dragging && dragAngle != null ? (
                    <g clipPath={`url(#${clipId})`}>
                        <g transform={`rotate(${dragAngle} ${CX} ${CY})`}>
                            <line
                                x1={CX}
                                y1={CY - R_INNER + 30}
                                x2={CX}
                                y2={CY - R_OUTER + 50}
                                stroke="#ff7a00"
                                strokeWidth={6}
                                strokeLinecap="round"
                                opacity={0.8}
                            />
                            <path
                                d={`M ${CX} ${CY - R_OUTER + 5}
                                    L ${CX - 22} ${CY - R_OUTER + 56}
                                    L ${CX + 22} ${CY - R_OUTER + 56} Z`}
                                fill="#ff7a00"
                                stroke="#a04a00"
                                strokeWidth={3}
                            />
                        </g>
                    </g>
                ) : null}

                {/* Inner plate — half-disc that masks anything inside R_INNER. */}
                {/*<path
                    d={innerHalfDisc}
                    //fill={cardBg}
                    stroke={fg}
                    strokeWidth={2}
                />*/}

                {/* Fixed top triangle pointer (current heading lives at the very top of the bow). */}
                <path
                    d={triangleD}
                    fill={fg}
                    opacity={0.5}
                    stroke={fg}
                />

                {/* HDG label/value — top-left corner, above the dial. */}
                {!compact ? (
                    <>
                        <text
                            x={90}
                            y={50}
                            fill={dimmed}
                            fontSize={28}
                            fontWeight={700}
                            textAnchor="middle"
                        >
                            HDG
                        </text>
                        <text
                            x={90}
                            y={108}
                            fill={fg}
                            fontSize={56}
                            fontWeight={700}
                            textAnchor="middle"
                        >
                            {`${pad3(heading)}°`}
                        </text>
                    </>
                ) : null}

                {/* AWA label/value — top-right corner. */}
                {showAwa ? (
                    <>
                        <text
                            x={VIEWBOX_W - 90}
                            y={50}
                            fill={mode === 2 ? COLORS.yellowDark : dimmed}
                            fontSize={28}
                            fontWeight={700}
                            textAnchor="middle"
                        >
                            AWA
                        </text>
                        <text
                            x={VIEWBOX_W - 90}
                            y={108}
                            fill={mode === 2 ? COLORS.yellow : dimmed}
                            fontSize={56}
                            fontWeight={700}
                            textAnchor="middle"
                        >
                            {`${fmtSigned(awa)}°`}
                        </text>
                    </>
                ) : null}

                {/* Mode label — sits inside the lower interior of the half-disc. Uses the same
                    accent colour as the corresponding mode button so the active state is
                    recognisable from the dial alone. Falls back to `dimmed` when mode is unknown. */}
                <text
                    x={CX}
                    y={CY - 200}
                    fill={mode != null && MODE_COLORS[mode] ? MODE_COLORS[mode] : dimmed}
                    fontSize={42}
                    fontWeight={700}
                    textAnchor="middle"
                >
                    {mode == null ? '---' : (MODE_LABELS[mode] || 'Unknown').toUpperCase()}
                </text>

                {/* Big setpoint number — central inside the half-disc.
                    Idle: shows the locked heading when the autopilot is engaged (Auto/Wind/Track/
                    NoDrift), or the current compass heading when the autopilot is off / not
                    connected (mode null or Standby) — in those modes there is no live setpoint
                    and the locked-heading register would be stale or zero.
                    Dragging: the new target dominates in orange and the unchanged "current"
                    setpoint sits beneath it in dimmed text so the operator can see both at a
                    glance and judge how much they're shifting it before committing. */}
                {dragging && dragTarget != null ? (
                    <>
                        <text
                            x={CX}
                            y={CY - 100}
                            fill="#ff7a00"
                            fontSize={140}
                            fontWeight={700}
                            textAnchor="middle"
                        >
                            {pad3(dragTarget)}
                            <tspan
                                fontSize={92}
                                fontWeight={400}
                                dy={-22}
                            >
                                °
                            </tspan>
                        </text>
                        <text
                            x={CX}
                            y={CY - 30}
                            fill={dimmed}
                            fontSize={48}
                            fontWeight={500}
                            textAnchor="middle"
                        >
                            {`now ${currentSetpoint == null ? '---' : pad3(currentSetpoint)}°`}
                        </text>
                    </>
                ) : (
                    <>
                        {/* Wind mode — small sail icon to the left of the value, signalling that
                            the central number is a wind angle (datum) rather than a compass
                            heading. Mast in foreground, billowing sail in yellow (matches the
                            AWA pointer), tiny hull underneath. */}
                        {mode === 2 ? (
                            <g transform={`translate(${CX - 240}, ${CY - 170})`}>
                                <line
                                    x1={8}
                                    y1={0}
                                    x2={8}
                                    y2={110}
                                    stroke={fg}
                                    strokeWidth={5}
                                    strokeLinecap="round"
                                />
                                <path
                                    d="M 8 5 Q 55 55 8 95 Z"
                                    fill={COLORS.yellow}
                                    stroke={COLORS.yellowDark}
                                    strokeWidth={2}
                                />
                                <path
                                    d="M -10 102 L 48 102 Q 38 118 -5 112 Z"
                                    fill={fg}
                                />
                            </g>
                        ) : null}
                        <text
                            x={CX}
                            y={CY - 60}
                            fill={fg}
                            fontSize={150}
                            fontWeight={700}
                            textAnchor="middle"
                        >
                            {(() => {
                                // Wind mode shows the wind-angle datum (autoPilot.windAngle) the
                                // way the Raymarine pilot head does: a ≤180° magnitude plus a
                                // port/starboard side letter (e.g. datum 230° → "130°P"), with the
                                // letter localised to the UI language. Other engaged modes show the
                                // locked heading; Standby / unknown falls back to the live compass
                                // heading so the dial isn't blank.
                                if (mode === 2) {
                                    const { digits, side } = formatWindDatumDeg(windAngle, lang);
                                    return (
                                        <>
                                            {digits}
                                            <tspan
                                                fontSize={100}
                                                fontWeight={400}
                                                dy={-25}
                                            >
                                                °
                                            </tspan>
                                            {side ? (
                                                <tspan
                                                    fontSize={110}
                                                    fontWeight={700}
                                                    dy={25}
                                                >
                                                    {side}
                                                </tspan>
                                            ) : null}
                                        </>
                                    );
                                }
                                const autopilotActive = mode != null && mode !== 0;
                                const centerValue = autopilotActive ? lockedHeading : heading;
                                return (
                                    <>
                                        {centerValue == null ? '---' : pad3(centerValue)}
                                        <tspan
                                            fontSize={100}
                                            fontWeight={400}
                                            dy={-25}
                                        >
                                            °
                                        </tspan>
                                    </>
                                );
                            })()}
                        </text>
                    </>
                )}

                {/* Rudder bar — sits in the gutter below the half-disc. */}
                {showRudder ? (
                    <g>
                        <rect
                            x={RUDDER_X}
                            y={RUDDER_Y}
                            width={RUDDER_W}
                            height={RUDDER_H}
                            fill="none"
                            stroke={fg}
                            strokeWidth={2}
                        />
                        {[0.25, 0.5, 0.75].map(p => (
                            <line
                                key={`d${p}`}
                                x1={RUDDER_X + RUDDER_W * p}
                                y1={RUDDER_Y}
                                x2={RUDDER_X + RUDDER_W * p}
                                y2={RUDDER_Y + RUDDER_H}
                                stroke={fg}
                                strokeWidth={2}
                            />
                        ))}
                        {rudder != null ? (
                            <rect
                                x={barX}
                                y={RUDDER_Y + 2}
                                width={barW}
                                height={RUDDER_H - 4}
                                fill={barColor}
                                style={{ transition: 'all 0.3s linear' }}
                            />
                        ) : null}
                    </g>
                ) : null}

                {/* STW / SOG are rendered in HTML below the mode/adjust buttons (see
                    `renderControls`) so they sit at the very bottom of the widget rather than
                    competing with the dial for vertical space. */}
            </svg>
        );
    }

    protected renderControls(): React.JSX.Element {
        const mode = this.state.mode;
        const { stw, sog } = this.state;
        const adjustDisabled = mode == null || mode === 0 || mode === 3;
        // Each mode gets a distinct accent colour (shared with the in-dial mode label via
        // `MODE_COLORS`). Active button: filled with the mode colour; inactive: outline only.
        const modes: { val: number; label: string }[] = [
            { val: 0, label: 'Standby' },
            { val: 1, label: 'Auto' },
            { val: 2, label: 'Wind' },
            { val: 3, label: 'Track' },
        ];
        // Uniform width across both rows — `Standby` (longest) sets the floor; +/-1, +/-10 use
        // the same width so the four-button rows line up edge-to-edge.
        const BTN_WIDTH = 110;
        const adjustValues: { delta: 1 | -1 | 10 | -10; label: string }[] = [
            { delta: -10, label: '−10' },
            { delta: -1, label: '−1' },
            { delta: 1, label: '+1' },
            { delta: 10, label: '+10' },
        ];
        const isFloatComma = this.props.stateContext.isFloatComma;
        const fmtKn = (v: number | null): string => {
            if (v == null || !isFinite(v)) {
                return '—';
            }
            const s = v.toFixed(1);
            return isFloatComma ? s.replace('.', ',') : s;
        };
        return (
            <Box
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1.5,
                    alignItems: 'center',
                    width: '100%',
                    py: 1,
                }}
            >
                <ButtonGroup size="medium">
                    {modes.map(m => {
                        const active = mode === m.val;
                        const accent = MODE_COLORS[m.val];
                        return (
                            <Button
                                key={m.val}
                                variant={active ? 'contained' : 'outlined'}
                                onClick={() => this.setMode(m.val)}
                                sx={{
                                    minWidth: BTN_WIDTH,
                                    width: BTN_WIDTH,
                                    color: active ? '#fff' : accent,
                                    backgroundColor: active ? accent : 'transparent',
                                    borderColor: accent,
                                    fontWeight: active ? 700 : 500,
                                    '&:hover': {
                                        backgroundColor: active ? accent : `${accent}22`,
                                        borderColor: accent,
                                    },
                                }}
                            >
                                {m.label}
                            </Button>
                        );
                    })}
                </ButtonGroup>
                <ButtonGroup
                    size="medium"
                    disabled={adjustDisabled}
                >
                    {adjustValues.map(a => (
                        <Button
                            key={a.delta}
                            color="inherit"
                            onClick={() => this.adjust(a.delta)}
                            sx={{ minWidth: BTN_WIDTH, width: BTN_WIDTH }}
                        >
                            {a.label}
                        </Button>
                    ))}
                </ButtonGroup>
                {/* STW / SOG row at the very bottom — sits below all controls so the dial and
                    button rows stay tightly grouped. STW blue (water-frame motion), SOG pink
                    (ground-frame motion); same colour scheme as the Wind compass widget. Hidden
                    when this widget is rendered as a companion inside the wind compass's split
                    view, because the wind compass already shows STW + SOG in its four corners. */}
                {!this.props.settings._renderInline ? (
                    <Box
                        sx={{
                            display: 'flex',
                            flexDirection: 'row',
                            justifyContent: 'space-around',
                            alignItems: 'flex-start',
                            width: '100%',
                            pt: 1.5,
                            gap: 4,
                        }}
                    >
                        {/* Larger value typography so the speed readout is legible at a glance from
                            across the cockpit — matches the visual weight of the Wind compass widget. */}
                        <Box sx={{ textAlign: 'center', color: STW_COLOR }}>
                            <Typography sx={{ fontSize: 24, fontWeight: 700, lineHeight: 1.1 }}>STW</Typography>
                            <Typography sx={{ fontSize: 56, fontWeight: 800, lineHeight: 1 }}>{fmtKn(stw)}</Typography>
                            <Typography sx={{ fontSize: 18, fontWeight: 500, lineHeight: 1.1, opacity: 0.8 }}>
                                kn
                            </Typography>
                        </Box>
                        <Box sx={{ textAlign: 'center', color: SOG_COLOR }}>
                            <Typography sx={{ fontSize: 24, fontWeight: 700, lineHeight: 1.1 }}>SOG</Typography>
                            <Typography sx={{ fontSize: 56, fontWeight: 800, lineHeight: 1 }}>{fmtKn(sog)}</Typography>
                            <Typography sx={{ fontSize: 18, fontWeight: 500, lineHeight: 1.1, opacity: 0.8 }}>
                                kn
                            </Typography>
                        </Box>
                    </Box>
                ) : null}
            </Box>
        );
    }

    /** Square tile — small dial with mode badge (no controls). */
    renderCompact(): React.JSX.Element {
        const isActive = this.isTileActive();
        const accent = this.getAccentColor();
        const settingsButton = this.renderSettingsButton();
        const indicators = this.renderIndicators(settingsButton);
        return (
            <Box
                id={String(this.props.widget.id)}
                className={this.getWidgetClass()}
                sx={theme => WidgetGeneric.getStyleCompact(theme)}
            >
                <Box
                    onClick={() => this.setState({ dialogOpen: true } as AutopilotComponentState)}
                    sx={theme => ({
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                        width: '100%',
                        aspectRatio: '1',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        ...(getTileStyles(theme, isActive, accent) as any),
                        padding: isNeumorphicTheme(theme) ? '4px' : '6px',
                    })}
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{ display: 'contents' }}
                    >
                        {indicators}
                    </div>
                    {/* Half-circle dial is 2:1 (or 1.72:1 with rudder); compact tile shows the
                        compact-only variant which is rudder-less so 2:1 fits cleanly. */}
                    <Box sx={{ width: '100%', aspectRatio: '2' }}>{this.renderDialSvg('100%', true)}</Box>
                    {this.props.settings.name ? (
                        <Typography
                            variant="caption"
                            sx={{
                                fontWeight: 600,
                                overflow: 'hidden',
                                whiteSpace: 'nowrap',
                                textOverflow: 'ellipsis',
                                maxWidth: '100%',
                            }}
                        >
                            {this.props.settings.name}
                        </Typography>
                    ) : null}
                </Box>
            </Box>
        );
    }

    /** 2×0.5 bar — mode + locked heading numerical only. */
    renderWide(): React.JSX.Element {
        const isActive = this.isTileActive();
        const accent = this.getAccentColor();
        const { mode, heading, lockedHeading } = this.state;
        const settingsButton = this.renderSettingsButton();
        const indicators = this.renderIndicators(settingsButton);
        return (
            <Box
                id={String(this.props.widget.id)}
                className={this.getWidgetClass()}
                sx={theme => ({ ...WidgetGeneric.getStyleWide(theme), height: 80 })}
            >
                <Box
                    onClick={() => this.setState({ dialogOpen: true })}
                    sx={theme => ({
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-around',
                        width: '100%',
                        height: '100%',
                        cursor: 'pointer',
                        ...(getTileStyles(theme, isActive, accent) as any),
                        px: 2,
                    })}
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{ display: 'contents' }}
                    >
                        {indicators}
                    </div>
                    <Box sx={{ textAlign: 'center' }}>
                        <Typography sx={{ fontSize: 12, color: 'text.secondary', fontWeight: 700 }}>HDG</Typography>
                        <Typography sx={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>
                            {heading != null ? `${pad3(heading)}°` : '—'}
                        </Typography>
                    </Box>
                    <Box sx={{ textAlign: 'center' }}>
                        <Typography sx={{ fontSize: 12, color: 'text.secondary', fontWeight: 700 }}>MODE</Typography>
                        <Typography sx={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>
                            {mode == null ? '—' : (MODE_LABELS[mode] || '?').toUpperCase()}
                        </Typography>
                    </Box>
                    <Box sx={{ textAlign: 'center' }}>
                        <Typography sx={{ fontSize: 12, color: 'text.secondary', fontWeight: 700 }}>LOCK</Typography>
                        <Typography sx={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>
                            {lockedHeading != null ? `${pad3(lockedHeading)}°` : '—'}
                        </Typography>
                    </Box>
                </Box>
            </Box>
        );
    }

    /** 2×1 — full dial. */
    renderWideTall(): React.JSX.Element {
        const isActive = this.isTileActive();
        const accent = this.getAccentColor();
        const settingsButton = this.renderSettingsButton();
        const indicators = this.renderIndicators(settingsButton);
        return (
            <Box
                id={String(this.props.widget.id)}
                className={this.getWidgetClass()}
                sx={theme => WidgetGeneric.getStyleWideTall(theme)}
            >
                <Box
                    onClick={() => this.setState({ dialogOpen: true })}
                    sx={theme => ({
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '100%',
                        aspectRatio: '2',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        ...(getTileStyles(theme, isActive, accent) as any),
                        padding: isNeumorphicTheme(theme) ? '8px' : '12px',
                    })}
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{ display: 'contents' }}
                    >
                        {indicators}
                    </div>
                    {/* Aspect must match the SVG height computed at render time:
                          dial (500) + rudder band (80) + speed band (140) = up to 720.
                        We compute the same expression here so the Box reserves a matching
                        rectangle and the SVG fills it without letterboxing. */}
                    <Box
                        sx={{
                            aspectRatio: (() => {
                                const showRudder = this.props.settings.showRudder !== false;
                                const h = VIEWBOX_H_DIAL + (showRudder ? RUDDER_BAND_H : 0);
                                return `${VIEWBOX_W} / ${h}`;
                            })(),
                            height: '100%',
                            maxHeight: 320,
                        }}
                    >
                        {this.renderDialSvg('100%')}
                    </Box>
                </Box>
            </Box>
        );
    }

    /**
     * Inline dialog body — dial + controls without a Dialog wrapper. Used by the parent
     * dialog (single view) and by the other widget when it embeds the autopilot in companion
     * split view. The Box stretches to fit whatever container hosts it.
     */
    protected renderInlineContent(): React.JSX.Element {
        return (
            <Box
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '100%',
                    height: '100%',
                    minHeight: 0,
                    gap: 2,
                }}
            >
                <Box sx={{ flex: 1, width: '100%', minHeight: 0, display: 'flex', justifyContent: 'center' }}>
                    {this.renderDialSvg('100%')}
                </Box>
                {this.renderControls()}
            </Box>
        );
    }

    /**
     * Build the companion widget element — NmeaWindCompass rendered inline. The import is a
     *  cyclic ES import that resolves at render time (see top of file).
     */
    private renderCompanion(): React.JSX.Element | null {
        if (!NmeaWindCompass) {
            return null;
        }
        // Companion inherits the parent's settings (so it keeps the required widget id/type/size/
        // name the base class needs) and overrides only what differs: `_renderInline` tells it to
        // skip its tile + dialog and just emit the body. The shared `instance` carries over via
        // the spread. Both settings interfaces extend the same CustomWidgetPlugin base, so the
        // autopilot-only extras are harmless to the wind compass.
        const companionSettings = {
            ...this.props.settings,
            _renderInline: true,
        };
        return (
            <NmeaWindCompass
                widget={this.props.widget}
                stateContext={this.props.stateContext}
                settings={companionSettings}
                onHide={this.props.onHide}
            />
        );
    }

    private renderDialog(): React.JSX.Element | null {
        if (!this.state.dialogOpen) {
            return null;
        }
        const enableCompanion = !!this.props.settings.enableCompanion;
        const inSplit = enableCompanion && this.state.companionMode;
        const landscape = this.state.dialogLandscape;
        // Toggle-button position — top-right (landscape) tucked next to the close icon, or
        // bottom-right (portrait) so neither button hides anything important.
        const toggleSx = landscape
            ? { position: 'absolute' as const, top: 8, right: 56, zIndex: 1, color: 'white' }
            : { position: 'absolute' as const, bottom: 8, right: 8, zIndex: 1, color: 'white' };
        const ToggleIcon = inSplit ? ViewAgendaIcon : landscape ? ViewColumnIcon : ViewStreamIcon;
        return (
            <Dialog
                open
                onClose={() => this.setState({ dialogOpen: false } as AutopilotComponentState)}
                maxWidth={false}
                fullWidth
                slotProps={{
                    paper: {
                        sx: {
                            width: '95vw',
                            height: '95vh',
                            maxWidth: '95vw',
                            maxHeight: '95vh',
                            m: 1,
                            bgcolor: COLORS.bg,
                        },
                    },
                }}
            >
                <IconButton
                    onClick={() => this.setState({ dialogOpen: false } as AutopilotComponentState)}
                    sx={{ position: 'absolute', top: 8, right: 8, zIndex: 1, color: 'white' }}
                >
                    <CloseIcon />
                </IconButton>
                {enableCompanion && ToggleIcon ? (
                    <IconButton
                        onClick={() => {
                            const next = !inSplit;
                            this.saveCompanionPref(next);
                            this.setState({ companionMode: next } as AutopilotComponentState);
                        }}
                        sx={toggleSx}
                        title={inSplit ? 'Single view' : 'Show wind compass alongside'}
                    >
                        <ToggleIcon />
                    </IconButton>
                ) : null}
                <DialogContent
                    sx={{
                        display: 'flex',
                        flexDirection: inSplit ? (landscape ? 'row' : 'column') : 'column',
                        alignItems: 'stretch',
                        justifyContent: 'center',
                        gap: 2,
                        p: 2,
                        overflow: 'hidden',
                    }}
                >
                    {/* Current instrument first (left in landscape, top in portrait) — the user
                        opened *this* widget's dialog, so its view should anchor the layout. */}
                    <Box
                        sx={{
                            flex: 1,
                            minHeight: 0,
                            minWidth: 0,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: inSplit ? 1 : 2,
                        }}
                    >
                        {!inSplit ? (
                            this.renderInlineContent()
                        ) : (
                            <>
                                <Box
                                    sx={{
                                        flex: 1,
                                        width: '100%',
                                        minHeight: 0,
                                        display: 'flex',
                                        justifyContent: 'center',
                                    }}
                                >
                                    {this.renderDialSvg('100%')}
                                </Box>
                                {this.renderControls()}
                            </>
                        )}
                    </Box>
                    {inSplit ? (
                        <Box
                            sx={{
                                flex: 1,
                                minHeight: 0,
                                minWidth: 0,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                // Companion renders at 80 % of its natural size — the operator
                                // opened the autopilot dialog, the wind compass is the secondary view.
                                transform: 'scale(0.8)',
                                transformOrigin: 'center',
                            }}
                        >
                            {this.renderCompanion()}
                        </Box>
                    ) : null}
                </DialogContent>
            </Dialog>
        );
    }

    protected renderConfirmDialog(): React.JSX.Element | null {
        const { pendingAngle, pendingMode, pendingDeadline } = this.state;
        if (pendingAngle == null || pendingMode == null) {
            return null;
        }
        const current = pendingMode === 1 ? this.state.lockedHeading : this.state.windAngle;
        const delta = current != null ? Math.round(angularDiff(pendingAngle, current)) : null;
        const remainingMs = pendingDeadline != null ? Math.max(0, pendingDeadline - Date.now()) : 0;
        const remainingSec = Math.ceil(remainingMs / 1000);
        const accent = MODE_COLORS[pendingMode] ?? '#ff7a00';
        const label = pendingMode === 1 ? 'Locked heading' : 'Wind angle';
        return (
            <Dialog
                open
                onClose={this.cancelConfirmation}
                maxWidth="xs"
                fullWidth
            >
                <DialogTitle sx={{ color: accent, fontWeight: 700 }}>Confirm large change</DialogTitle>
                <DialogContent>
                    <Typography sx={{ fontSize: 16, mb: 1 }}>{label}:</Typography>
                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-around',
                            my: 2,
                            gap: 2,
                        }}
                    >
                        <Box sx={{ textAlign: 'center' }}>
                            <Typography sx={{ fontSize: 12, opacity: 0.7 }}>now</Typography>
                            <Typography sx={{ fontSize: 36, fontWeight: 600 }}>
                                {current == null ? '---' : pad3(current)}°
                            </Typography>
                        </Box>
                        <Typography sx={{ fontSize: 28, opacity: 0.5 }}>→</Typography>
                        <Box sx={{ textAlign: 'center' }}>
                            <Typography sx={{ fontSize: 12, opacity: 0.7, color: accent }}>new</Typography>
                            <Typography sx={{ fontSize: 36, fontWeight: 700, color: accent }}>
                                {pad3(pendingAngle)}°
                            </Typography>
                        </Box>
                    </Box>
                    {delta != null ? (
                        <Typography sx={{ fontSize: 14, textAlign: 'center', opacity: 0.7 }}>
                            {`Δ ${delta}° change`}
                        </Typography>
                    ) : null}
                    <Typography sx={{ fontSize: 13, textAlign: 'center', mt: 2, opacity: 0.7 }}>
                        {`Auto-cancel in ${remainingSec}s`}
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={this.cancelConfirmation}
                        color="inherit"
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={this.confirmPending}
                        variant="contained"
                        sx={{ backgroundColor: accent, '&:hover': { backgroundColor: accent } }}
                    >
                        Confirm
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }

    render(): React.JSX.Element {
        // Companion-embed mode — skip tile/dialog rendering and emit only the inline body
        // sized to fit whatever container the host widget put us into.
        if (this.props.settings._renderInline) {
            return this.renderInlineContent();
        }
        const widget = super.render();
        const dialog = this.renderDialog();
        const confirm = this.renderConfirmDialog();
        if (dialog || confirm) {
            return (
                <>
                    {widget}
                    {dialog}
                    {confirm}
                </>
            );
        }
        return widget;
    }
}

export default NmeaAutopilotComponent;
