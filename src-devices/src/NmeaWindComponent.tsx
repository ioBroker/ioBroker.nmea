// NMEA wind compass — head-up sailing instrument.
// Shows apparent/true wind angle and speed, heading, COG/SOG, and compass rose
// with North and True-Wind-Direction pointers.
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
import type { BoxProps, TypographyProps, DialogProps, IconButtonProps, DialogContentProps } from '@mui/material';
import type { ConfigItemPanel, ConfigItemTabs } from '@iobroker/json-config';

// Cyclic ES-module import: NmeaAutopilotComponent also imports this file. ES modules handle
// cycles via live bindings — `NmeaAutopilotComponent` is undefined while NmeaAutopilotComponent
// itself is being evaluated, but by the time any render() actually USES this reference, both
// modules are fully resolved. The previous lazy `require()` approach didn't survive Vite/MF
// bundling (the require was stripped, leaving the companion area empty).
import NmeaAutopilotComponent from './NmeaAutopilotComponent';

const Box: React.ComponentType<BoxProps> = MuiMaterial?.Box;
const Typography: React.ComponentType<TypographyProps> = MuiMaterial?.Typography;
const Dialog: React.ComponentType<DialogProps> = MuiMaterial?.Dialog;
const DialogContent: React.ComponentType<DialogContentProps> = MuiMaterial?.DialogContent;
const IconButton: React.ComponentType<IconButtonProps> = MuiMaterial?.IconButton;
const CloseIcon: React.ComponentType<any> = MuiIcons?.Close;
// Toggle icons for companion split view — `ViewColumn` (two columns) reads as "show two side
// by side" for landscape, `ViewStream` (stacked bars) reads as "stack two" for portrait. We
// pick the one matching current orientation and reuse it for "back to single view" toggle.
const ViewColumnIcon: React.ComponentType<any> = MuiIcons?.ViewColumn;
const ViewStreamIcon: React.ComponentType<any> = MuiIcons?.ViewStream;
const ViewAgendaIcon: React.ComponentType<any> = MuiIcons?.ViewAgenda;

const DEG = Math.PI / 180;

type SpeedUnit = 'knots' | 'm/s' | 'km/h';

interface WindCompassSettings extends CustomWidgetPlugin {
    /** e.g. 'nmea.0' */
    instance?: string;
    /** Seconds of history for min/max wind shift sectors. 0 - disabled. */
    historySeconds?: number;
    /** Display unit for AWS/TWS/SOG. */
    speedUnit?: SpeedUnit;
    /** Close-hauled half-angle in degrees (outer port/stbd color bands). */
    closeHauledAngle?: number;
    /** Overlay the mainsail at its optimal trim angle for the current apparent wind. */
    showSail?: boolean;
    /** Allow the user to split the fullscreen dialog and show the Autopilot alongside. */
    enableCompanion?: boolean;
    /** Internal: when set, the widget renders only its inline dialog body (no tile, no Dialog).
     *  Used by the other widget when it embeds this one in companion split view. */
    _renderInline?: boolean;
}

interface WindCompassState extends WidgetGenericState {
    heading: number | null; // compass degrees (true), 0-360
    aws: number | null; // knots (raw from state)
    awa: number | null; // rel to bow, signed ±180° (starboard +)
    tws: number | null;
    twa: number | null;
    twd: number | null; // compass, where wind is FROM
    cog: number | null; // compass
    sog: number | null; // knots (speed over ground)
    stw: number | null; // knots (speed through water — log/paddlewheel)
    awaHistory: { val: number; ts: number }[];
    twaHistory: { val: number; ts: number }[];
    dialogOpen: boolean;
    /** Companion split-view toggle inside the open dialog. Only meaningful when
     *  settings.enableCompanion is true. */
    companionMode: boolean;
    /** Cached orientation of the open dialog (window aspect). Updated on resize while open. */
    dialogLandscape: boolean;
}

const DEFAULT_HISTORY_SECONDS = 60;
const DEFAULT_CLOSE_HAULED = 60;

function normDeg(d: number): number {
    return ((d % 360) + 360) % 360;
}

function signedDeg(d: number): number {
    const a = normDeg(d);
    return a > 180 ? a - 360 : a;
}

function formatNum(val: number | null, decimals = 1, isFloatComma?: boolean): string {
    if (val == null || !isFinite(val)) {
        return '—';
    }
    const s = val.toFixed(decimals);
    return isFloatComma ? s.replace('.', ',') : s;
}

/** Polar-to-Cartesian in compass convention (0°=up, clockwise positive). */
function polar(cx: number, cy: number, r: number, angleDeg: number): { x: number; y: number } {
    const a = angleDeg * DEG;
    return { x: cx + r * Math.sin(a), y: cy - r * Math.cos(a) };
}

/** Build an annular sector path between two bearings (both in compass degrees). */
function sectorPath(cx: number, cy: number, rInner: number, rOuter: number, fromDeg: number, toDeg: number): string {
    const sweep = normDeg(toDeg - fromDeg);
    const largeArc = sweep > 180 ? 1 : 0;
    const p1 = polar(cx, cy, rOuter, fromDeg);
    const p2 = polar(cx, cy, rOuter, toDeg);
    const p3 = polar(cx, cy, rInner, toDeg);
    const p4 = polar(cx, cy, rInner, fromDeg);
    return [
        `M ${p1.x} ${p1.y}`,
        `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${p2.x} ${p2.y}`,
        `L ${p3.x} ${p3.y}`,
        `A ${rInner} ${rInner} 0 ${largeArc} 0 ${p4.x} ${p4.y}`,
        'Z',
    ].join(' ');
}

/** Dark-theme palette for the dial — tuned for the black card + bright bow-fixed pointers. */
const COLORS = {
    bg: '#191c1d',
    cardBg: '#000000',
    grey: '#B5B5B5',
    contrast: '#FFFFFF',
    port: '#8F0000',
    starboard: '#008700',
    yellow: '#ffdf00',
    yellowDim: '#ffdf00b6',
    orange: '#ff9100',
    orangeDim: '#ff9100b6',
    pink: '#FC0FC0',
    green: '#00d000',
    blue: '#3298ff',
} as const;

// Dial geometry — 1000×1000 viewBox.
const CX = 500;
const CY = 500;
const R_OUTER = 451;
const R_RING_STROKE = 25;
const R_INNER = R_OUTER - R_RING_STROKE; // 356 — inner edge of the grey ring
const R_LABEL = 390; // middle of the ring
const R_TICK_OUT = R_OUTER - 4;
const R_TICK_MAJOR_IN = R_INNER + 4;
const R_TICK_MINOR_IN = R_INNER + 35;
const R_HISTORY_OUTER = 346; // slightly inside the dial inner edge
const R_HISTORY_INNER = 120;
const R_CLOSE_HAULED_OUT = R_OUTER - 6;
const R_CLOSE_HAULED_IN = R_INNER + 2;

/** Tapered-arrow pointer path — tip near y≈55, base near y≈280, centered on x=500. */
const POINTER_PATH =
    'm 451.77021,55.078207 42.08541,-33.202814 a 12.555638,12.555638 0.26446337 0 1 15.64423,0.07221 l 42.20046,33.930296 a 15.557694,15.557694 71.53185 0 1 5.32954,15.957795 L 504.17034,279.76529 a 2.5373267,2.5373267 0.02614114 0 1 -4.91879,-0.002 L 446.37431,70.966036 a 15.416336,15.416336 108.75875 0 1 5.3959,-15.887829 z';

/**
 * Animation duration per angle key. TWA is deliberately slower than AWA — true wind is a
 * "strategic" bearing the skipper steers to, so we smooth harder to suppress short-term
 * fluctuations, while AWA tracks the actual feel of the wind on the boat more directly.
 */
const ANIM_DURATION_MS: Record<string, number> = {
    dial: 600,
    twd: 600,
    awa: 600,
    twa: 900,
    cog: 600,
    // SET / drift direction changes slowly (current flow) — use a heavier smoothing so short-lived
    // STW noise doesn't make the arrow jitter.
    set: 1500,
};
const ANIM_DURATION_DEFAULT = 600;

/** Cubic ease-in-out — slow at boundaries, fast in the middle. */
function cubicEaseInOut(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

type SvgRef = { current: SVGGElement | null };

interface AnimEntry {
    ref: SvgRef;
    current: number; // unwrapped, currently rendered
    startAngle: number;
    target: number; // unwrapped destination
    startTime: number;
    rafId: number | null;
}

export class NmeaWindCompass extends WidgetGeneric<WindCompassState, WindCompassSettings> {
    private stateHandlers: Map<string, (id: string, state: ioBroker.State | null | undefined) => void> = new Map();

    // Refs on the rotating <g> elements — angle updates are written directly to the ` transform ` attribute.
    // Plain objects to sidestep a generic-typing quirk in the dm-widgets React re-export.
    private dialRef: { current: SVGGElement | null } = { current: null };
    private twdRef: { current: SVGGElement | null } = { current: null };
    private awaRef: { current: SVGGElement | null } = { current: null };
    private twaRef: { current: SVGGElement | null } = { current: null };
    private cogRef: { current: SVGGElement | null } = { current: null };
    private setRef: { current: SVGGElement | null } = { current: null };

    private animations: Record<string, AnimEntry> = {};

    /** Periodic re-render so the heat-map fade progresses even when no new AWA samples arrive. */
    private heatmapTick: ReturnType<typeof setInterval> | null = null;

    constructor(props: WidgetGenericProps<WindCompassSettings>) {
        super(props);
        this.state = {
            ...this.state,
            heading: null,
            aws: null,
            awa: null,
            tws: null,
            twa: null,
            twd: null,
            cog: null,
            sog: null,
            stw: null,
            awaHistory: [],
            twaHistory: [],
            dialogOpen: false,
            // Restore the split-view preference saved the last time the operator toggled it.
            // Each widget instance gets its own slot keyed by widget id, so two wind compass
            // tiles on the same page can be configured independently.
            companionMode: NmeaWindCompass.loadCompanionPref(props),
            dialogLandscape: typeof window !== 'undefined' ? window.innerWidth >= window.innerHeight : true,
        };
    }

    /** localStorage key for the persisted companion split-view preference. */
    private static companionStorageKey(props: WidgetGenericProps<WindCompassSettings>): string | null {
        const id = props.widget?.id;
        if (id == null) {
            return null;
        }
        return `nmea-wind-companion-${id}`;
    }

    private static loadCompanionPref(props: WidgetGenericProps<WindCompassSettings>): boolean {
        if (typeof window === 'undefined') {
            return false;
        }
        const key = NmeaWindCompass.companionStorageKey(props);
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
        const key = NmeaWindCompass.companionStorageKey(this.props);
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
            name: 'NmeaWindCompass',
            schema: {
                type: 'panel',
                items: {
                    instance: {
                        type: 'instance',
                        adapter: 'nmea',
                        label: 'nmeawc_instance',
                        default: 'nmea.0',
                    },
                    historySeconds: {
                        type: 'number',
                        label: 'nmeawc_historySeconds',
                        help: 'nmeawc_historySeconds_help',
                        default: DEFAULT_HISTORY_SECONDS,
                        min: 0,
                        max: 600,
                        sm: 6,
                    },
                    closeHauledAngle: {
                        type: 'number',
                        label: 'nmeawc_closeHauledAngle',
                        help: 'nmeawc_closeHauledAngle_help',
                        default: DEFAULT_CLOSE_HAULED,
                        min: 0,
                        max: 90,
                        sm: 6,
                    },
                    speedUnit: {
                        newLine: true,
                        type: 'select',
                        label: 'nmeawc_speedUnit',
                        options: [
                            { value: 'knots', label: 'kn' },
                            { value: 'm/s', label: 'm/s' },
                            { value: 'km/h', label: 'km/h' },
                        ],
                        default: 'knots',
                        format: 'radio',
                        horizontal: true,
                    },
                    showSail: {
                        newLine: true,
                        type: 'checkbox',
                        label: 'nmeawc_showSail',
                        help: 'nmeawc_showSail_help',
                        default: false,
                        sm: 12,
                    },
                    enableCompanion: {
                        newLine: true,
                        type: 'checkbox',
                        label: 'nmeawc_enableCompanion',
                        help: 'nmeawc_enableCompanion_help',
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
            this.setState({ dialogLandscape: landscape } as WindCompassState);
        }
    };

    componentDidMount(): void {
        super.componentDidMount?.();
        this.subscribeAll();
        // Snap to initial values without animation — avoids the "starts at 0, spins to heading" effect.
        this.syncAnimations(true);
        // Tick every 500ms so age-based opacities on the AWA heat-map keep decaying even when no
        // new wind packets arrive. `forceUpdate` re-runs the render method; pointer animations
        // stay untouched because they're driven via refs + setAttribute, not React props.
        this.heatmapTick = setInterval(() => {
            if (this.state.awaHistory.length > 0) {
                this.forceUpdate();
            }
        }, 500);
    }

    componentDidUpdate(
        prevProps: Readonly<WidgetGenericProps<WindCompassSettings>>,
        prevState: Readonly<WindCompassState>,
    ): void {
        super.componentDidUpdate?.(prevProps, prevState);
        if (prevProps.settings.instance !== this.props.settings.instance) {
            this.unsubscribeAll();
            this.subscribeAll();
        }
        if (
            prevState.heading !== this.state.heading ||
            prevState.awa !== this.state.awa ||
            prevState.twa !== this.state.twa ||
            prevState.twd !== this.state.twd ||
            prevState.cog !== this.state.cog ||
            prevState.sog !== this.state.sog ||
            prevState.stw !== this.state.stw ||
            prevState.dialogOpen !== this.state.dialogOpen ||
            prevState.companionMode !== this.state.companionMode
        ) {
            // Dialog open/close (or companion-mode toggle) swaps the SVG tree → refs point to
            // new nodes, re-anchor them.
            this.syncAnimations(
                prevState.dialogOpen !== this.state.dialogOpen ||
                    prevState.companionMode !== this.state.companionMode,
            );
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
        for (const anim of Object.values(this.animations)) {
            if (anim.rafId != null) {
                cancelAnimationFrame(anim.rafId);
            }
        }
        this.animations = {};
        if (this.heatmapTick) {
            clearInterval(this.heatmapTick);
            this.heatmapTick = null;
        }
        window.removeEventListener('resize', this.onWindowResize);
    }

    /** Push latest state values as new animation targets. */
    private syncAnimations(immediate: boolean): void {
        const { heading, awa, twa, twd, cog } = this.state;
        this.startAnim('dial', this.dialRef, heading != null ? -heading : null, immediate);
        this.startAnim('twd', this.twdRef, twd, immediate);
        this.startAnim('awa', this.awaRef, awa, immediate);
        this.startAnim('twa', this.twaRef, twa, immediate);
        const cogRel = cog != null && heading != null ? signedDeg(cog - heading) : null;
        this.startAnim('cog', this.cogRef, cogRel, immediate);
        // SET/DRIFT indicator — rotation target = bow-relative direction of current/tidal drift.
        const set = this.computeSet();
        this.startAnim('set', this.setRef, set ? set.setRel : null, immediate);
    }

    /**
     * Compute SET (direction of current) and DRIFT (magnitude) from the vector difference between
     * ground-frame motion (COG + SOG from GPS) and water-frame motion (HDG + STW from log/compass).
     * Returns `null` when any of the four inputs is missing — without STW we cannot isolate the
     * current's contribution to the net motion.
     */
    private computeSet(): { setRel: number; drift: number } | null {
        const { heading, cog, sog, stw } = this.state;
        if (heading == null || cog == null || sog == null || stw == null) {
            return null;
        }
        const gE = sog * Math.sin(cog * DEG);
        const gN = sog * Math.cos(cog * DEG);
        const wE = stw * Math.sin(heading * DEG);
        const wN = stw * Math.cos(heading * DEG);
        const sE = gE - wE;
        const sN = gN - wN;
        const drift = Math.sqrt(sE * sE + sN * sN);
        if (drift < 0.05) {
            return null; // below sensor noise — no meaningful current to display
        }
        const setCompass = normDeg((Math.atan2(sE, sN) * 180) / Math.PI);
        const setRel = signedDeg(setCompass - heading);
        return { setRel, drift };
    }

    private startAnim(key: string, ref: SvgRef, target: number | null, immediate: boolean): void {
        if (target == null) {
            return;
        }
        const existing = this.animations[key];
        if (existing?.rafId != null) {
            cancelAnimationFrame(existing.rafId);
        }
        const current = existing ? existing.current : target;
        // Unwrap target to nearest equivalent within ±180° of current — drives the short way.
        const delta = ((((target - current) % 360) + 540) % 360) - 180;
        const unwrapped = current + delta;

        if (immediate || !existing) {
            this.applyRotation(ref, unwrapped);
            this.animations[key] = {
                ref,
                current: unwrapped,
                startAngle: unwrapped,
                target: unwrapped,
                startTime: 0,
                rafId: null,
            };
            return;
        }

        const entry: AnimEntry = {
            ref,
            current,
            startAngle: current,
            target: unwrapped,
            startTime: performance.now(),
            rafId: null,
        };
        this.animations[key] = entry;
        entry.rafId = requestAnimationFrame(() => this.stepAnim(key));
    }

    private stepAnim(key: string): void {
        const anim = this.animations[key];
        if (!anim) {
            return;
        }
        const now = performance.now();
        const duration = ANIM_DURATION_MS[key] ?? ANIM_DURATION_DEFAULT;
        const t = Math.min(1, (now - anim.startTime) / duration);
        const eased = cubicEaseInOut(t);
        anim.current = anim.startAngle + eased * (anim.target - anim.startAngle);
        this.applyRotation(anim.ref, anim.current);
        if (t < 1) {
            anim.rafId = requestAnimationFrame(() => this.stepAnim(key));
        } else {
            anim.current = anim.target;
            anim.rafId = null;
        }
    }

    private applyRotation(ref: SvgRef, angle: number): void {
        if (ref.current) {
            ref.current.setAttribute('transform', `rotate(${angle} ${CX} ${CY})`);
        }
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

        bind(`${instance}.windData.windAngleApparent`, v => this.pushAngle('awa', v));
        bind(`${instance}.windData.windSpeedApparent`, v => this.setState({ aws: v } as WindCompassState));
        bind(`${instance}.windData.windAngleTrue`, v => this.pushAngle('twa', v));
        bind(`${instance}.windData.windSpeedTrue`, v => this.setState({ tws: v } as WindCompassState));
        bind(`${instance}.windData.windDirectionTrue`, v => this.setState({ twd: v } as WindCompassState));
        // Use only `headingTrue` — the backend always populates it (applying deviation + variation
        // when the source reference is magnetic, pass-through otherwise). Subscribing to both would
        // cause the raw `heading` packet to clobber the corrected true heading whenever it arrived last.
        bind(`${instance}.vesselHeading.headingTrue`, v => this.setState({ heading: v } as WindCompassState));
        bind(`${instance}.cogSogRapidUpdate.cogTrue`, v => this.setState({ cog: v } as WindCompassState));
        bind(`${instance}.cogSogRapidUpdate.cog`, v => this.setState({ cog: v } as WindCompassState));
        bind(`${instance}.cogSogRapidUpdate.sog`, v => this.setState({ sog: v } as WindCompassState));
        // Speed Through Water (log/paddlewheel, PGN 128259) — required for SET/DRIFT calculation.
        bind(`${instance}.speed.speedWaterReferenced`, v => this.setState({ stw: v } as WindCompassState));
    }

    private unsubscribeAll(): void {
        const ctx = this.props.stateContext;
        for (const [id, handler] of this.stateHandlers) {
            ctx.removeState(id, handler);
        }
        this.stateHandlers.clear();
    }

    private pushAngle(which: 'awa' | 'twa', val: number | null): void {
        const historyKey = which === 'awa' ? 'awaHistory' : 'twaHistory';
        const windowSec = this.props.settings.historySeconds ?? DEFAULT_HISTORY_SECONDS;
        this.setState(s => {
            const history = s[historyKey];
            const now = Date.now();
            const trimmed = windowSec > 0 ? history.filter(h => now - h.ts < windowSec * 1000) : [];
            const next = val != null && isFinite(val) ? [...trimmed, { val, ts: now }] : trimmed;
            return { [which]: val, [historyKey]: next } as unknown as WindCompassState;
        });
    }

    protected isTileActive(): boolean {
        return this.state.aws != null || this.state.tws != null || this.state.heading != null;
    }

    private convertSpeed(kn: number | null): number | null {
        if (kn == null) {
            return null;
        }
        const unit = this.props.settings.speedUnit || 'knots';
        if (unit === 'm/s') {
            return kn / 1.9438444924574;
        }
        if (unit === 'km/h') {
            return kn * 1.852;
        }
        return kn;
    }

    private speedUnitLabel(): string {
        return this.props.settings.speedUnit || 'knots';
    }

    /**
     * The full compass. Rendered in a 1000×1000 viewBox; `size` is the CSS pixel width.
     * `compact=true` drops side AWS/TWS labels.
     */
    protected renderCompassSvg(size: number | string, compact = false): React.JSX.Element {
        const { heading, awa, aws, twa, tws, sog, stw, awaHistory } = this.state;
        const closeHauled = this.props.settings.closeHauledAngle ?? DEFAULT_CLOSE_HAULED;
        const isFloatComma = this.props.stateContext.isFloatComma;
        const awsDisplay = this.convertSpeed(aws);
        const twsDisplay = this.convertSpeed(tws);
        const sogDisplay = this.convertSpeed(sog);
        const stwDisplay = this.convertSpeed(stw);

        // Laylines — dashed port/stbd guides that flank the apparent-wind pointer (rendered inside the
        // awaRef group, so they rotate with AWA). Use a narrower half-angle than the bow-fixed close-
        // hauled bands so the lines sit just alongside the A-arrow instead of spanning the whole sector.
        const LAYLINE_HALF_ANGLE = 40;
        const laylineEnd = R_OUTER - 100;
        const portLaylineEnd = polar(CX, CY, laylineEnd, 360 - LAYLINE_HALF_ANGLE);
        const stbdLaylineEnd = polar(CX, CY, laylineEnd, LAYLINE_HALF_ANGLE);

        return (
            <svg
                viewBox="0 0 1000 1000"
                style={{ width: 'auto', height: size, display: 'block' }}
            >
                {/* Card background */}
                <circle
                    cx={CX}
                    cy={CY}
                    r={R_OUTER}
                    fill={COLORS.cardBg}
                />

                {/* Small grey dial ring — fixed, non-rotating. */}
                <circle
                    cx={CX}
                    cy={CY}
                    r={R_OUTER - R_RING_STROKE / 2}
                    fill="none"
                    stroke={COLORS.grey}
                    strokeWidth={R_RING_STROKE}
                />

                {/* Thick dark grey dial ring — fixed, non-rotating. */}
                <circle
                    cx={CX}
                    cy={CY}
                    r={R_INNER - 80 / 2}
                    fill="none"
                    stroke={COLORS.bg}
                    strokeWidth={80}
                />

                {/* Bow-fixed close-hauled bands (port red, starboard green) overlaid on the ring. */}
                <path
                    d={sectorPath(CX, CY, R_CLOSE_HAULED_IN, R_CLOSE_HAULED_OUT + 5, 360 - closeHauled, 360)}
                    fill={COLORS.port}
                />
                <path
                    d={sectorPath(CX, CY, R_CLOSE_HAULED_IN, R_CLOSE_HAULED_OUT + 5, 0, closeHauled)}
                    fill={COLORS.starboard}
                />

                {/* ============== Rotating compass rose ============== */}
                <g ref={this.dialRef}>
                    {/* 10° minor ticks (not on 30° marks) */}
                    {Array.from({ length: 36 }).map((_, i) => {
                        const a = i * 10;
                        if (a % 30 === 0) {
                            return null;
                        }
                        const p1 = polar(CX, CY, R_TICK_MINOR_IN - 12.5, a);
                        const p2 = polar(CX, CY, R_TICK_OUT - 10, a);
                        return (
                            <line
                                key={`mt${a}`}
                                x1={p1.x}
                                y1={p1.y}
                                x2={p2.x}
                                y2={p2.y}
                                stroke={COLORS.contrast}
                                strokeWidth={3}
                                strokeLinecap="square"
                            />
                        );
                    })}
                    {/* 30° major ticks cutting across the grey ring */}
                    {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map(a => {
                        const p1 = polar(CX, CY, R_TICK_MAJOR_IN + 2, a);
                        const p2 = polar(CX, CY, R_TICK_OUT, a);
                        return (
                            <line
                                key={`Mt${a}`}
                                x1={p1.x}
                                y1={p1.y}
                                x2={p2.x}
                                y2={p2.y}
                                stroke={COLORS.contrast}
                                strokeWidth={8}
                                strokeLinecap="square"
                            />
                        );
                    })}

                    {/* Cardinal N/E/S/W + numeric labels. Counter-rotate each so it stays upright.
                        Classic magnetic-compass colouring: N in blue (north-seeking end),
                        S in red (south pole); E and W in plain white. */}
                    {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map(a => {
                        const isCardinal = a % 90 === 0;
                        const isNorth = a === 0;
                        const isSouth = a === 180;
                        const label = a === 0 ? 'N' : a === 90 ? 'E' : a === 180 ? 'S' : a === 270 ? 'W' : String(a);
                        const pos = polar(CX, CY, R_LABEL, a);
                        const labelFill = isNorth ? '#3a8dff' : isSouth ? '#ff3b3b' : COLORS.contrast;
                        return (
                            <text
                                key={`lbl${a}`}
                                x={pos.x}
                                y={pos.y}
                                textAnchor="middle"
                                dominantBaseline="central"
                                fontSize={isNorth || isSouth ? 62 : isCardinal ? 54 : 44}
                                fontWeight={isCardinal ? 700 : 400}
                                fontFamily="Roboto, Arial, sans-serif"
                                fill={labelFill}
                                transform={`rotate(${a} ${pos.x} ${pos.y})`}
                            >
                                {label}
                            </text>
                        );
                    })}

                    {/* TWD pointer (yellow "T") — lives inside the rotating rose; additional inner rotation
                        equals twd (compass). Wrap in its own <g ref> so the inner rotation is CSS-free and
                        animated the same way. */}
                    {/*twd != null && (
                        <g ref={this.twdRef}>
                            <path
                                d={POINTER_PATH}
                                transform="matrix(0.40,0,0,0.42,298.7,327)"
                                fill={COLORS.yellow}
                            />
                            <text
                                x={CX}
                                y={418}
                                textAnchor="middle"
                                dominantBaseline="central"
                                fontSize={52}
                                fontWeight={700}
                                fontFamily="Roboto, Arial, sans-serif"
                                fill={COLORS.cardBg}
                            >
                                T
                            </text>
                        </g>
                    )*/}
                </g>
                {/* ============== End rotating rose ============== */}

                {/* Bow-fixed boat silhouette — custom hull outline: pointier bow, slightly narrower
                    beam and a flat transom closing the shape at the stern. Cubic-bezier curves instead
                    of the elliptical arc used as reference, with an opaque-to-transparent grey gradient
                    so the bow stands out while the stern dissolves. Gradient ids are namespaced with
                    the widget id so multiple instances on one page don't clash. */}
                {(() => {
                    const boatId = `boat-${String(this.props.widget?.id ?? 'dev')}`;
                    return (
                        <>
                            <defs>
                                <linearGradient
                                    id={`${boatId}-port`}
                                    x1="500"
                                    y1="500"
                                    x2="640"
                                    y2="500"
                                    gradientUnits="userSpaceOnUse"
                                >
                                    <stop
                                        offset="0"
                                        stopColor={COLORS.grey}
                                        stopOpacity={0.75}
                                    />
                                    <stop
                                        offset="1"
                                        stopColor={COLORS.grey}
                                        stopOpacity={0}
                                    />
                                </linearGradient>
                                <linearGradient
                                    id={`${boatId}-stbd`}
                                    x1="500"
                                    y1="500"
                                    x2="360"
                                    y2="500"
                                    gradientUnits="userSpaceOnUse"
                                >
                                    <stop
                                        offset="0"
                                        stopColor={COLORS.grey}
                                        stopOpacity={0.75}
                                    />
                                    <stop
                                        offset="1"
                                        stopColor={COLORS.grey}
                                        stopOpacity={0}
                                    />
                                </linearGradient>
                                {/* Transom fades symmetrically from the centre toward the stern corners. */}
                                <linearGradient
                                    id={`${boatId}-transom`}
                                    x1="500"
                                    y1="790"
                                    x2="620"
                                    y2="790"
                                    gradientUnits="userSpaceOnUse"
                                >
                                    <stop
                                        offset="0"
                                        stopColor={COLORS.grey}
                                        stopOpacity={0.35}
                                    />
                                    <stop
                                        offset="1"
                                        stopColor={COLORS.grey}
                                        stopOpacity={0}
                                    />
                                </linearGradient>
                            </defs>
                            <g>
                                {/* Port side — bow at top, curves out through mid-ship, meets transom corner. */}
                                <path
                                    d="M 500 200 C 615 270, 680 500, 570 790"
                                    fill="none"
                                    stroke={`url(#${boatId}-port)`}
                                    strokeWidth={6}
                                    strokeLinecap="round"
                                />
                                {/* Starboard side — absolute mirror of the port curve around x=500. */}
                                <path
                                    d="M 500 200 C 385 270, 320 500, 430 790"
                                    fill="none"
                                    stroke={`url(#${boatId}-stbd)`}
                                    strokeWidth={6}
                                    strokeLinecap="round"
                                />
                                {/* Transom — flat stern line, faint so it doesn't compete with the arrows.
                                    Two halves so each side picks up the matching symmetric gradient. */}
                                <line
                                    x1={500}
                                    y1={790}
                                    x2={570}
                                    y2={790}
                                    stroke={`url(#${boatId}-transom)`}
                                    strokeWidth={6}
                                    strokeLinecap="round"
                                />
                                <line
                                    x1={500}
                                    y1={790}
                                    x2={430}
                                    y2={790}
                                    stroke={`url(#${boatId}-transom)`}
                                    strokeWidth={6}
                                    strokeLinecap="round"
                                />
                            </g>
                        </>
                    );
                })()}

                {/* Optimal sail trim — bow-fixed mainsail overlay. The boom is set at half the
                    apparent-wind angle from the centerline (the classic "split-the-angle" rule —
                    gives ~15-20° angle of attack to the wind in upwind conditions and rotates to
                    perpendicular as AWA approaches 180°). Sail belly increases linearly with
                    |AWA|: nearly straight on close-hauled (flat-trimmed for max lift), full and
                    baggy on a run (max drag, max power). Drawn AFTER the boat silhouette so it
                    sits visibly on top, BEFORE the heat-map so the heat sectors don't cover it. */}
                {this.props.settings.showSail && awa != null && isFinite(awa) && (() => {
                    const SAIL_MAST_X = 500;
                    const SAIL_MAST_Y = 400; // about a third from the bow — typical sloop mast step
                    const SAIL_LEN = 220;
                    // Half-the-AWA rule: boom angle from centerline = AWA/2, on the leeward side.
                    // In SVG polar (0=bow, CW), that's 180° + AWA/2 (straight aft + half the AWA).
                    const boomDir = 180 + awa / 2;
                    const clew = polar(SAIL_MAST_X, SAIL_MAST_Y, SAIL_LEN, boomDir);
                    // Belly fraction of boom length — 0 (flat) at AWA=0, 0.5 (very full) at ±180°.
                    const bellyFrac = Math.min(0.5, (Math.abs(awa) / 180) * 0.5);
                    const bellyDepth = SAIL_LEN * bellyFrac;
                    // Belly perpendicular to chord, on the leeward side of the sail.
                    // Stbd tack (AWA > 0): boom to port, belly bulges further to port (perp +90°).
                    // Port tack (AWA < 0): boom to stbd, belly bulges further to stbd (perp -90°).
                    const perpDir = boomDir + (awa >= 0 ? 90 : -90);
                    const midX = (SAIL_MAST_X + clew.x) / 2;
                    const midY = (SAIL_MAST_Y + clew.y) / 2;
                    // Control point for the quadratic Bezier — at 2× belly depth so the peak of
                    // the curve (which sits at the chord-midpoint + perp/2) reaches `bellyDepth`.
                    const ctrl = polar(midX, midY, 2 * bellyDepth, perpDir);
                    return (
                        <g opacity={0.92}>
                            {/* Boom — straight line from mast (gooseneck) to clew. Dimmed so the
                                sail's curved silhouette stays the dominant visual element. */}
                            <line
                                x1={SAIL_MAST_X}
                                y1={SAIL_MAST_Y}
                                x2={clew.x}
                                y2={clew.y}
                                stroke="#888"
                                strokeWidth={5}
                                strokeLinecap="round"
                            />
                            {/* Mast — small white dot at the gooseneck to anchor the rig visually. */}
                            <circle
                                cx={SAIL_MAST_X}
                                cy={SAIL_MAST_Y}
                                r={7}
                                fill="#fff"
                            />
                            {/* Sail silhouette — luff (at mast) → belly → clew → straight back to
                                mast (the boom-side chord), closed and lightly filled so it reads
                                as a real sail rather than a stray curve. */}
                            <path
                                d={`M ${SAIL_MAST_X} ${SAIL_MAST_Y} Q ${ctrl.x} ${ctrl.y} ${clew.x} ${clew.y} L ${SAIL_MAST_X} ${SAIL_MAST_Y} Z`}
                                fill="rgba(255,255,255,0.22)"
                                stroke="#ffffff"
                                strokeWidth={4}
                                strokeLinejoin="round"
                            />
                        </g>
                    );
                })()}

                {/* Wind-shift heat-map (bow-fixed). Each AWA sample from the last `historySeconds` is
                    drawn as a thick radial bar filled with a shared radial gradient whose hot-spot
                    sits about 20 % inside the outer ring; the bar fades out toward the pivot and
                    outer edge. Per-sample opacity decays linearly with age, so the newest reading is
                    most prominent, and the oldest dissolves. Overlapping bars at the same bearing
                    stack alpha-wise — a quick visual read of where the apparent wind has lingered.
                    TWA history is intentionally omitted, so the map focuses on the "felt" wind. */}
                {!compact &&
                    (() => {
                        const windowMs = (this.props.settings.historySeconds ?? DEFAULT_HISTORY_SECONDS) * 1000;
                        if (windowMs <= 0) {
                            return null;
                        }
                        const now = Date.now();
                        // Bar width (perpendicular to the radial direction) and peak alpha per sample.
                        // With a gradient fill the bar can be fat without looking blocky at the tips.
                        const RAY_WIDTH = 34;
                        const MAX_ALPHA = 0.85;
                        const barLength = R_HISTORY_OUTER - R_HISTORY_INNER;
                        const gradId = `heat-port-${String(this.props.widget?.id ?? 'dev')}`;
                        // Gradient hot-spot at 20 % down from the top of the bar = 20 % from the outer
                        // ring (when the bar is rotated to its bearing). objectBoundingBox means
                        // cx/cy/r are fractions of each rect's bbox, and they rotate along with it.
                        const rays: React.JSX.Element[] = [];
                        for (let i = 0; i < awaHistory.length; i++) {
                            const s = awaHistory[i];
                            const age = now - s.ts;
                            if (age < 0 || age >= windowMs) {
                                continue;
                            }
                            const alpha = MAX_ALPHA * (1 - age / windowMs);
                            if (alpha <= 0.02) {
                                continue;
                            }
                            const bearing = normDeg(s.val);
                            rays.push(
                                <rect
                                    key={`awah-${s.ts}-${i}`}
                                    x={CX - RAY_WIDTH / 2}
                                    y={CY - R_HISTORY_OUTER}
                                    width={RAY_WIDTH}
                                    height={barLength}
                                    fill={`url(#${gradId})`}
                                    fillOpacity={alpha}
                                    transform={`rotate(${bearing} ${CX} ${CY})`}
                                />,
                            );
                        }
                        if (rays.length === 0) {
                            return null;
                        }
                        return (
                            <g>
                                <defs>
                                    <radialGradient
                                        id={gradId}
                                        cx="0.5"
                                        cy="0.2"
                                        r="0.7"
                                    >
                                        <stop
                                            offset="0"
                                            stopColor={COLORS.port}
                                            stopOpacity={1}
                                        />
                                        <stop
                                            offset="0.45"
                                            stopColor={COLORS.port}
                                            stopOpacity={0.55}
                                        />
                                        <stop
                                            offset="1"
                                            stopColor={COLORS.port}
                                            stopOpacity={0}
                                        />
                                    </radialGradient>
                                </defs>
                                {rays}
                            </g>
                        );
                    })()}

                {/* Apparent-wind (bow-relative) pointer — orange "A" arrow, bigger.
                    Drawn BEFORE the true-wind T-pointer, so the smaller T always sits on top of A
                    when they overlap (same bearing); otherwise A would cover T entirely.
                    Close-hauled laylines live inside this same rotating group, so they always flank
                    the A pointer at ±closeHauled° (i.e. they track the apparent wind, not the bow). */}
                {awa != null && (
                    <g ref={this.awaRef}>
                        <line
                            x1={CX}
                            y1={CY}
                            x2={portLaylineEnd.x}
                            y2={portLaylineEnd.y}
                            stroke={COLORS.contrast}
                            strokeWidth={3}
                            strokeDasharray="40 20"
                            strokeOpacity={0.6}
                        />
                        <line
                            x1={CX}
                            y1={CY}
                            x2={stbdLaylineEnd.x}
                            y2={stbdLaylineEnd.y}
                            stroke={COLORS.contrast}
                            strokeWidth={3}
                            strokeDasharray="40 20"
                            strokeOpacity={0.6}
                        />
                        <path
                            d={POINTER_PATH}
                            transform="matrix(0.6745560,0,0,0.7878389,161.63,57)"
                            fill={COLORS.orange}
                        />
                        <text
                            x={CX}
                            y={142}
                            textAnchor="middle"
                            dominantBaseline="central"
                            fontSize={60}
                            fontWeight={700}
                            fontFamily="Roboto, Arial, sans-serif"
                            fill={COLORS.cardBg}
                        >
                            A
                        </text>
                        {/* Debug-only AWA readout — kept in source, commented out for production. */}
                        {/*<text
                            x={CX}
                            y={194}
                            textAnchor="middle"
                            dominantBaseline="central"
                            fontSize={24}
                            fontWeight={600}
                            fontFamily="Roboto, Arial, sans-serif"
                            fill={COLORS.cardBg}
                        >
                            {awa == null ? '—' : `${formatNum(awa, 1, isFloatComma)}°`}
                        </text>*/}
                    </g>
                )}

                {/* True-wind (bow-relative) pointer — yellow "T"-style arrow, smaller than apparent.
                    Drawn AFTER A so it stays visible on top when the two pointers overlap. The 6th
                    matrix value (f = y-translate) shifts the whole pointer radially toward the
                    compass centre; bump it further if the tip should sit even closer to the pivot. */}
                {twa != null && (
                    <g ref={this.twaRef}>
                        <path
                            d={POINTER_PATH}
                            transform="matrix(0.5134876,0,0,0.5997212,242.38,67)"
                            fill={COLORS.yellowDim}
                        />
                        <text
                            x={CX}
                            y={134}
                            textAnchor="middle"
                            dominantBaseline="central"
                            fontSize={51}
                            fontWeight={700}
                            fontFamily="Roboto, Arial, sans-serif"
                            fill={COLORS.cardBg}
                        >
                            T
                        </text>
                        {/* Debug-only TWA readout — kept in source, commented out for production. */}
                        {/*<text
                            x={CX}
                            y={180}
                            textAnchor="middle"
                            dominantBaseline="central"
                            fontSize={22}
                            fontWeight={600}
                            fontFamily="Roboto, Arial, sans-serif"
                            fill={COLORS.cardBg}
                        >
                            {twa == null ? '—' : `${formatNum(twa, 1, isFloatComma)}°`}
                        </text>*/}
                    </g>
                )}

                {/* COG indicator (pink marker near the outer edge, bow-relative). */}
                {heading != null && this.state.cog != null && (
                    <g ref={this.cogRef}>
                        <path
                            d={`M ${CX} ${CY - R_OUTER + 20}
                                L ${CX - 15} ${CY - R_OUTER + 50}
                                L ${CX + 15} ${CY - R_OUTER + 50} Z`}
                            fill={COLORS.pink}
                        />
                        <rect
                            x={CX - 8}
                            y={CY - R_OUTER + 50}
                            width={16}
                            height={80}
                            fill={COLORS.pink}
                        />
                    </g>
                )}

                {/* Blue SET / drift arrow — bow-relative, points in the direction the current is
                    pushing the vessel. Length scales with the drift magnitude (current speed),
                    computed as the vector difference between ground motion (COG+SOG) and water
                    motion (HDG+STW). Only rendered when all four inputs are available and the
                    drift is strong enough to be meaningful (>0.05 kn). Shaft fades from opaque at
                    the arrowhead to transparent at the tail for a subtle "drift trail" look. */}
                {(() => {
                    const set = this.computeSet();
                    if (!set) {
                        return null;
                    }
                    // Map drift (knots) to arrow length. 0.1 kn → short stub; 3 kn+ saturates.
                    const len = Math.min(1, set.drift / 3) * 180 + 80; // 80..260 units
                    const tip = { x: CX, y: CY - len };
                    const tail = { x: CX, y: CY - (len - 140) };
                    const headOff = 32;
                    const headBack = 50;
                    // Widget ID isolates the gradient id so multiple widget instances on the same
                    // page don't collide in the global <defs> namespace.
                    const gradId = `setGrad-${String(this.props.widget?.id ?? 'dev')}`;
                    return (
                        <g ref={this.setRef}>
                            <defs>
                                <linearGradient
                                    id={gradId}
                                    gradientUnits="userSpaceOnUse"
                                    x1={tip.x}
                                    y1={tip.y}
                                    x2={tail.x}
                                    y2={tail.y}
                                >
                                    <stop
                                        offset="0"
                                        stopColor={COLORS.blue}
                                        stopOpacity={1}
                                    />
                                    <stop
                                        offset="0.6"
                                        stopColor={COLORS.blue}
                                        stopOpacity={0.55}
                                    />
                                    <stop
                                        offset="1"
                                        stopColor={COLORS.blue}
                                        stopOpacity={0}
                                    />
                                </linearGradient>
                            </defs>
                            <line
                                x1={tail.x}
                                y1={tail.y}
                                x2={tip.x}
                                y2={tip.y}
                                stroke={`url(#${gradId})`}
                                strokeWidth={7}
                                strokeLinecap="round"
                            />
                            <polygon
                                points={`${tip.x},${tip.y - 10} ${tip.x - headOff},${tip.y + headBack} ${tip.x},${tip.y + headBack - 10} ${tip.x + headOff},${tip.y + headBack}`}
                                fill={COLORS.blue}
                            />
                        </g>
                    );
                })()}

                {/* SOG numeric readout — centered horizontally on the pivot. Unit label sits right
                    under the digits, dimmer (opacity 0.6), so the number stays the primary read. */}
                <text
                    x={CX}
                    y={CY}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={56}
                    fontWeight={700}
                    fontFamily="Roboto, Arial, sans-serif"
                    fill={COLORS.contrast}
                >
                    {formatNum(sogDisplay, 1, isFloatComma)}
                </text>
                <text
                    x={CX}
                    y={CY + 42}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={24}
                    fontWeight={500}
                    fontFamily="Roboto, Arial, sans-serif"
                    fill={COLORS.contrast}
                    opacity={0.6}
                >
                    {this.speedUnitLabel()}
                </text>

                {/* Heading readout box at top — large rounded rect with the current compass heading. */}
                <rect
                    x={CX - 128}
                    y={10}
                    width={256}
                    height={108}
                    rx={24}
                    fill={COLORS.cardBg}
                    stroke={COLORS.grey}
                    strokeWidth={5}
                    opacity={0.7}
                />
                {/* Rect spans y=10..118 (centre at y=64). `dominantBaseline="central"` is unreliable
                    across renderers; instead we pin the baseline explicitly — baseline ≈ centre +
                    cap-height/2 = 64 + ~35 for a 100px bold glyph, giving a visually centred look. */}
                <text
                    x={CX}
                    y={99}
                    textAnchor="middle"
                    fontSize={100}
                    fontWeight={700}
                    fontFamily="Roboto, Arial, sans-serif"
                    fill={COLORS.contrast}
                >
                    {heading != null ? `${Math.round(heading)}°` : '---°'}
                </text>

                {/* AWS top-left (orange). All three lines share the same centre x so "AWS", the
                    value, and "knots" line up visually no matter how wide each string renders. */}
                {!compact && (
                    <g>
                        <text
                            x={95}
                            y={60}
                            textAnchor="middle"
                            fontSize={42}
                            fontWeight={700}
                            fontFamily="Roboto, Arial, sans-serif"
                            fill={COLORS.orange}
                        >
                            AWS
                        </text>
                        <text
                            x={95}
                            y={130}
                            textAnchor="middle"
                            fontSize={72}
                            fontWeight={800}
                            fontFamily="Roboto, Arial, sans-serif"
                            fill={COLORS.orange}
                        >
                            {formatNum(awsDisplay, 1, isFloatComma)}
                        </text>
                        <text
                            x={95}
                            y={175}
                            textAnchor="middle"
                            fontSize={36}
                            fontWeight={600}
                            fontFamily="Roboto, Arial, sans-serif"
                            fill={COLORS.orange}
                        >
                            {this.speedUnitLabel()}
                        </text>
                    </g>
                )}

                {/* TWS top-right (yellow) — mirrored version of the AWS block. */}
                {!compact && (
                    <g>
                        <text
                            x={905}
                            y={60}
                            textAnchor="middle"
                            fontSize={42}
                            fontWeight={700}
                            fontFamily="Roboto, Arial, sans-serif"
                            fill={COLORS.yellow}
                        >
                            TWS
                        </text>
                        <text
                            x={905}
                            y={130}
                            textAnchor="middle"
                            fontSize={72}
                            fontWeight={800}
                            fontFamily="Roboto, Arial, sans-serif"
                            fill={COLORS.yellow}
                        >
                            {formatNum(twsDisplay, 1, isFloatComma)}
                        </text>
                        <text
                            x={905}
                            y={175}
                            textAnchor="middle"
                            fontSize={36}
                            fontWeight={600}
                            fontFamily="Roboto, Arial, sans-serif"
                            fill={COLORS.yellow}
                        >
                            {this.speedUnitLabel()}
                        </text>
                    </g>
                )}

                {/* STW bottom-left (blue — same hue as the SET arrow, so the reader associates it
                    with water-frame motion). "STW" mirrors the three-letter "SOG" label on the
                    right; the dial narrows enough at y≈825..940 for a header / value / unit stack
                    just like the top blocks. Hidden when this widget is rendered as a companion
                    next to the autopilot — the autopilot already shows STW + SOG, no duplicates. */}
                {!compact && !this.props.settings._renderInline && (
                    <g>
                        <text
                            x={95}
                            y={825}
                            textAnchor="middle"
                            fontSize={42}
                            fontWeight={700}
                            fontFamily="Roboto, Arial, sans-serif"
                            fill={COLORS.blue}
                        >
                            STW
                        </text>
                        <text
                            x={95}
                            y={895}
                            textAnchor="middle"
                            fontSize={72}
                            fontWeight={800}
                            fontFamily="Roboto, Arial, sans-serif"
                            fill={COLORS.blue}
                        >
                            {formatNum(stwDisplay, 1, isFloatComma)}
                        </text>
                        <text
                            x={95}
                            y={940}
                            textAnchor="middle"
                            fontSize={36}
                            fontWeight={600}
                            fontFamily="Roboto, Arial, sans-serif"
                            fill={COLORS.blue}
                        >
                            {this.speedUnitLabel()}
                        </text>
                    </g>
                )}

                {/* SOG bottom-right (pink — matches the COG bug on the rose, so ground-frame info
                    shares a colour). Same hide-in-companion rule as STW above. */}
                {!compact && !this.props.settings._renderInline && (
                    <g>
                        <text
                            x={905}
                            y={825}
                            textAnchor="middle"
                            fontSize={42}
                            fontWeight={700}
                            fontFamily="Roboto, Arial, sans-serif"
                            fill={COLORS.pink}
                        >
                            SOG
                        </text>
                        <text
                            x={905}
                            y={895}
                            textAnchor="middle"
                            fontSize={72}
                            fontWeight={800}
                            fontFamily="Roboto, Arial, sans-serif"
                            fill={COLORS.pink}
                        >
                            {formatNum(sogDisplay, 1, isFloatComma)}
                        </text>
                        <text
                            x={905}
                            y={940}
                            textAnchor="middle"
                            fontSize={36}
                            fontWeight={600}
                            fontFamily="Roboto, Arial, sans-serif"
                            fill={COLORS.pink}
                        >
                            {this.speedUnitLabel()}
                        </text>
                    </g>
                )}
            </svg>
        );
    }

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
                    onClick={() => this.setState({ dialogOpen: true } as WindCompassState)}
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
                    <Box sx={{ width: '100%', aspectRatio: '1' }}>{this.renderCompassSvg('100%', true)}</Box>
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

    /** 2x0.5 bar — numerical AWS/TWS/heading only. */
    renderWide(): React.JSX.Element {
        const isActive = this.isTileActive();
        const accent = this.getAccentColor();
        const { heading, aws, tws } = this.state;
        const isFloatComma = this.props.stateContext.isFloatComma;
        const awsDisplay = this.convertSpeed(aws);
        const twsDisplay = this.convertSpeed(tws);
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
                        <Typography sx={{ fontSize: 12, color: COLORS.orange, fontWeight: 700 }}>AWS</Typography>
                        <Typography sx={{ fontSize: 22, color: COLORS.orange, fontWeight: 800, lineHeight: 1 }}>
                            {formatNum(awsDisplay, 1, isFloatComma)}
                        </Typography>
                    </Box>
                    <Box sx={{ textAlign: 'center' }}>
                        <Typography sx={{ fontSize: 12, color: 'text.secondary', fontWeight: 600 }}>HDG</Typography>
                        <Typography sx={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>
                            {heading != null ? `${Math.round(heading)}°` : '—'}
                        </Typography>
                    </Box>
                    <Box sx={{ textAlign: 'center' }}>
                        <Typography sx={{ fontSize: 12, color: COLORS.yellow, fontWeight: 700 }}>TWS</Typography>
                        <Typography sx={{ fontSize: 22, color: COLORS.yellow, fontWeight: 800, lineHeight: 1 }}>
                            {formatNum(twsDisplay, 1, isFloatComma)}
                        </Typography>
                    </Box>
                </Box>
            </Box>
        );
    }

    /** 2x1 — compass dial, larger. */
    renderWideTall(): React.JSX.Element {
        const isActive = this.isTileActive();
        const accent = this.getAccentColor();
        const settingsButton = this.renderSettingsButton();
        const indicators = this.renderIndicators(settingsButton);

        return (
            <Box
                id={String(this.props.widget.id)}
                className={this.getWidgetClass()}
                sx={theme => WidgetGeneric.getStyleWide(theme)}
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
                    <Box sx={{ aspectRatio: '1', height: '100%', maxHeight: 280 }}>{this.renderCompassSvg('100%')}</Box>
                    {this.props.settings.name ? (
                        <Box sx={{ position: 'absolute', bottom: 6, left: 0, right: 0, textAlign: 'center' }}>
                            <Typography
                                variant="caption"
                                sx={{ fontWeight: 600, color: 'text.secondary' }}
                            >
                                {this.props.settings.name}
                            </Typography>
                        </Box>
                    ) : null}
                </Box>
            </Box>
        );
    }

    /**
     * Inline dialog body — compass SVG only, sized to fit its container. Used by the parent
     * dialog (single view) and by the other widget when it embeds the wind compass in
     * companion split view. The container chooses the size.
     */
    protected renderInlineContent(): React.JSX.Element {
        return (
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '100%',
                    height: '100%',
                    minHeight: 0,
                }}
            >
                {this.renderCompassSvg('100%')}
            </Box>
        );
    }

    /** Build the companion widget element — NmeaAutopilotComponent rendered inline. The import
     *  is a cyclic ES import that resolves at render time (see top of file). */
    private renderCompanion(): React.JSX.Element | null {
        if (!NmeaAutopilotComponent) {
            return null;
        }
        const companionSettings = {
            instance: this.props.settings.instance,
            _renderInline: true,
        };
        return (
            <NmeaAutopilotComponent
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
        const toggleSx = landscape
            ? { position: 'absolute' as const, top: 8, right: 56, zIndex: 1, color: 'white' }
            : { position: 'absolute' as const, bottom: 8, right: 8, zIndex: 1, color: 'white' };
        const ToggleIcon = inSplit ? ViewAgendaIcon : landscape ? ViewColumnIcon : ViewStreamIcon;
        return (
            <Dialog
                open
                onClose={() => this.setState({ dialogOpen: false } as WindCompassState)}
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
                    onClick={() => this.setState({ dialogOpen: false } as WindCompassState)}
                    sx={{ position: 'absolute', top: 8, right: 8, zIndex: 1, color: 'white' }}
                >
                    <CloseIcon />
                </IconButton>
                {enableCompanion && ToggleIcon ? (
                    <IconButton
                        onClick={() => {
                            const next = !inSplit;
                            this.saveCompanionPref(next);
                            this.setState({ companionMode: next } as WindCompassState);
                        }}
                        sx={toggleSx}
                        title={inSplit ? 'Single view' : 'Show autopilot alongside'}
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
                    {/* Current instrument first (left in landscape, top in portrait). */}
                    <Box
                        sx={{
                            flex: 1,
                            minHeight: 0,
                            minWidth: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        {this.renderInlineContent()}
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
                                // opened the wind dialog, the autopilot is the secondary view.
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

    render(): React.JSX.Element {
        if (this.props.settings._renderInline) {
            return this.renderInlineContent();
        }
        const widget = super.render();
        const dialog = this.renderDialog();
        if (dialog) {
            return (
                <>
                    {widget}
                    {dialog}
                </>
            );
        }
        return widget;
    }
}

export default NmeaWindCompass;
