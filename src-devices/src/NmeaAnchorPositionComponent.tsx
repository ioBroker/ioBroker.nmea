// NMEA Anchor Position — at-anchor monitor showing the relationship between the dropped
// anchor position and the current boat position on a Leaflet base map.
//
// Setup:
//   - Anchor lat/lon are entered manually in settings (or via a "Set current as anchor"
//     button in the dialog when the boat is sitting on the anchor).
//   - Boat lat/lon are read live from the NMEA adapter's GNSS state.
//   - Optional chain length lets the widget draw a "swing circle" around the anchor — a
//     rough estimate of the area the boat could swing through given the rode length and the
//     depth at the time of a drop. Useful as a sanity check for whether the boat is dragging.
//   - Optional initial depth (depth at a drop) and current depth are shown numerically alongside
//     the live distance from anchor.
//
// Map base layer is user-selectable: a clean OSM/Voyager style for general use, or Esri
// WorldImagery satellite imagery for a more visual reference.

import WidgetGeneric, {
    React,
    MuiMaterial,
    MuiIcons,
    moment,
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
    ButtonProps,
    ToggleButtonProps,
    ToggleButtonGroupProps,
    SwitchProps,
    TextFieldProps,
} from '@mui/material';
import type { ConfigItemPanel, ConfigItemTabs } from '@iobroker/dm-utils';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const Box: React.ComponentType<BoxProps> = MuiMaterial?.Box;
const Typography: React.ComponentType<TypographyProps> = MuiMaterial?.Typography;
const Dialog: React.ComponentType<DialogProps> = MuiMaterial?.Dialog;
const DialogContent: React.ComponentType<DialogContentProps> = MuiMaterial?.DialogContent;
const IconButton: React.ComponentType<IconButtonProps> = MuiMaterial?.IconButton;
const Button: React.ComponentType<ButtonProps> = MuiMaterial?.Button;
const ToggleButton: React.ComponentType<ToggleButtonProps> = MuiMaterial?.ToggleButton;
const ToggleButtonGroup: React.ComponentType<ToggleButtonGroupProps> = MuiMaterial?.ToggleButtonGroup;
const Switch: React.ComponentType<SwitchProps> = MuiMaterial?.Switch;
const TextField: React.ComponentType<TextFieldProps> = MuiMaterial?.TextField;
const CloseIcon: React.ComponentType<any> = MuiIcons?.Close;
const AnchorIcon: React.ComponentType<any> = MuiIcons?.Anchor;
const SailingIcon: React.ComponentType<any> = MuiIcons?.Sailing;

export interface AnchorPositionSettings extends CustomWidgetPlugin {
    /** e.g. 'nmea.0' — used for live depth subscription. */
    instance?: string;
    /**
     * State ID of a combined "lat;lon" string holding the anchor position. Mutually exclusive
     * with the separate `anchorLat` / `anchorLon` state IDs.
     */
    anchorPosition?: string;
    /** State ID returning the anchor latitude as a number (decimal degrees). */
    anchorLat?: string;
    /** State ID returning the anchor longitude as a number (decimal degrees). */
    anchorLon?: string;
    /** State ID returning the current boat latitude as a number (decimal degrees). */
    positionLat?: string;
    /** State ID returning the current boat longitude as a number (decimal degrees). */
    positionLon?: string;
    /** Length of deployed chain/rope in metres. Drives the swing-circle radius. */
    chainLength?: string;
    /**
     * Depth at the moment the anchor touched bottom as object ID, in metres. Used for an
     *  effective-scope hint (rode = sqrt(chain² - depth²) gives the horizontal swing).
     */
    depthAtDrop?: string;
    /** Map base layer — 'osm' for normal vector-style tiles, 'satellite' for imagery. */
    mapStyle?: 'osm' | 'satellite';
}

interface AnchorPositionState extends WidgetGenericState {
    /** Resolved anchor latitude — populated from `anchorPosition` ("lat;lon") or `anchorLat`. */
    anchorLat: number | null;
    /** Resolved anchor longitude. */
    anchorLon: number | null;
    /** Resolved boat latitude — from the `positionLat` state subscription. */
    boatLat: number | null;
    /** Resolved boat longitude — from the `positionLon` state subscription. */
    boatLon: number | null;
    /** Live water depth from `waterDepth.depth` (PGN 128267). */
    currentDepth: number | null;
    chainLength: number | null;
    depthAtDrop: number | null;
    /**
     * Sliding-window position history (last `TRAIL_WINDOW_MS`). Older entries are dropped on every append.
     * Loaded from the configured history adapter on mount and extended live as positionLat
     * / positionLon updates arrive. Rendered as a red heatmap-style trail on the map.
     */
    trail: { lat: number; lon: number; ts: number }[];
    /** Resolved alarm-circle radius in metres (mirrors the configured `alarmRadius` state). */
    alarmRadius: number | null;
    /** Resolved alarm-armed flag (mirrors the configured `isAlarm` state). */
    isAlarm: boolean | null;
    /** Resolved when the anchor alarm is activated/deactivated */
    isAlarmEnabled: boolean | null;
    /** Local draft of the alarm-radius text input — committed to the state on blur / Enter. */
    alarmRadiusDraft: string;
    dialogOpen: boolean;
}

// Earth radius (m) for the haversine distance calculation. Average — good to ~0.5 % at any
// realistic latitude for distances under a few hundred metres (an anchor swing).
const EARTH_RADIUS_M = 6_371_000;
const RAD = Math.PI / 180;

/** Trail window for the position heatmap — the last 2 hours of boat positions. */
const TRAIL_WINDOW_MS = 2 * 60 * 60 * 1000;

const COLORS = {
    bg: '#0E1620',
    cardBg: '#0E1F2A',
    contrast: '#FFFFFF',
    grey: '#7E8A99',
    anchor: '#ff5252', // red — eye-catching for the drop point
    boat: '#3a8dff', // blue — matches own-ship colour in the AIS radar
    chain: '#ffeb3b', // yellow — visually links anchor to boat (swing line)
    swingRing: '#ffeb3b', // yellow ring at chain-length radius
    trail: '#ff1744', // bright red — position-history heatmap dots
    alarmRing: '#00e676', // green — alarm boundary "safe zone" reading, distinct from anchor red & swing yellow
} as const;

/**
 * Parse a combined "lat;lon" or "lat,lon" string state value. Accepts either separator and
 * tolerates surrounding whitespace, so a user can plug in different upstream conventions. Returns
 * null whenever the input isn't a string with two finite numbers — callers treat that as "no
 * anchor position known".
 */
function parseLatLonString(val: unknown): { lat: number; lon: number } | null {
    if (typeof val !== 'string') {
        return null;
    }
    const parts = val.split(/[;,]/).map(s => s.trim());
    if (parts.length !== 2) {
        return null;
    }
    const lat = parseFloat(parts[0]);
    const lon = parseFloat(parts[1]);
    if (!isFinite(lat) || !isFinite(lon)) {
        return null;
    }
    return { lat, lon };
}

/** Great-circle distance via haversine, returning metres. */
/** Format a number with fixed decimals, honouring the system's decimal separator (comma vs dot). */
function formatNum(val: number, decimals: number, isFloatComma?: boolean): string {
    const s = val.toFixed(decimals);
    return isFloatComma ? s.replace('.', ',') : s;
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const dLat = (lat2 - lat1) * RAD;
    const dLon = (lon2 - lon1) * RAD;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_RADIUS_M * c;
}

/**
 * Effective horizontal swing radius from rode length and depth at a drop. Rode forms the
 * hypotenuse of a right triangle with the depth as the vertical leg, so the horizontal leg
 * (= max swing radius from the anchor's foot) is sqrt(chain² - depth²). When depth ≥ chain,
 * the math breaks (the chain is too short for the depth), and we fall back to the chain length itself.
 */
function effectiveSwingRadius(chainM: number, depthM: number | undefined | null): number {
    if (depthM == null || !isFinite(depthM) || depthM <= 0) {
        return chainM;
    }
    if (depthM >= chainM) {
        return chainM;
    }
    return Math.sqrt(chainM * chainM - depthM * depthM);
}

// SVG-data-URL anchor & boat markers — sized & coloured to read well at typical zoom levels
// without needing an external icon set. Returned as Leaflet DivIcons via inline HTML.
function buildAnchorIcon(): L.DivIcon {
    // U+FE0E forces a text-style (monochrome) rendering of ⚓ so the CSS color applies — without it,
    // most systems substitute a colored emoji glyph and ignore the color property.
    const html = `
        <div style="
            display: flex; align-items: center; justify-content: center;
            width: 32px; height: 32px;
            color: ${COLORS.anchor};
            font-family: 'Segoe UI Symbol', 'Apple Symbols', 'Noto Sans Symbols', sans-serif;
            font-weight: 700;
            font-size: 28px;
            line-height: 1;
            text-shadow: 0 0 3px rgba(0,0,0,0.85), 0 0 1px rgba(0,0,0,1);
        ">⚓︎</div>
    `;
    return L.divIcon({
        className: 'nmea-anchor-marker',
        html,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
    });
}

function buildBoatIcon(): L.DivIcon {
    const html = `
        <div style="
            width: 32px; height: 32px;
            display: flex; align-items: center; justify-content: center;
            color: ${COLORS.boat};
            font-family: 'Segoe UI Symbol', 'Apple Symbols', 'Noto Sans Symbols', sans-serif;
            font-weight: 700;
            font-size: 28px;
            line-height: 1;
            text-shadow: 0 0 3px rgba(0,0,0,0.85), 0 0 1px rgba(0,0,0,1);
        ">⛵</div>
    `;
    return L.divIcon({
        className: 'nmea-boat-marker',
        html,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
    });
}

export class NmeaAnchorPositionComponent extends WidgetGeneric<AnchorPositionState, AnchorPositionSettings> {
    private stateHandlers = new Map<string, (id: string, state: ioBroker.State | null | undefined) => void>();
    /** One Leaflet map per render variant (compact / widetall / dialog). */
    private maps = new Map<string, L.Map>();
    private mapContainers = new Map<string, HTMLDivElement | null>();
    private mapRefCallbacks = new Map<string, (el: HTMLDivElement | null) => void>();
    /**
     * Per-map overlay handles so we can update the existing anchor/boat marker / swing ring /
     *  rode polyline in place instead of removing & re-adding (which would flicker tiles).
     */
    private overlays = new Map<
        string,
        {
            anchor: L.Marker;
            boat: L.Marker;
            rode: L.Polyline;
            swing: L.Circle | null;
            /** Heatmap-style red dots for the recent position history. */
            trail: L.LayerGroup;
            /** Alarm boundary (orange) — drawn at `state.alarmRadius` around the anchor when armed. */
            alarm: L.Circle | null;
            tile: L.TileLayer;
        }
    >();
    private currentTileStyle = new Map<string, 'osm' | 'satellite'>();

    /** Outstanding "fetch position history" job — token used to ignore stale completions. */
    private trailLoadToken = 0;

    constructor(props: WidgetGenericProps<AnchorPositionSettings>) {
        super(props);
        this.state = {
            ...this.state,
            anchorLat: null,
            anchorLon: null,
            boatLat: null,
            boatLon: null,
            currentDepth: null,
            chainLength: null,
            trail: [],
            alarmRadius: null,
            isAlarm: null,
            alarmRadiusDraft: '',
            dialogOpen: false,
        };
    }

    static override getConfigSchema(): { name: string; schema: ConfigItemPanel | ConfigItemTabs } {
        return {
            name: 'NmeaAnchorPosition',
            schema: {
                type: 'panel',
                items: {
                    instance: {
                        type: 'instance',
                        adapter: 'nmea',
                        label: 'nmeaair_instance',
                        default: 'nmea.0',
                    },
                    anchorPosition: {
                        type: 'objectId',
                        label: 'nmeaap2_anchorPosition',
                        help: 'nmeaap2_anchorPosition_help',
                        hidden: '!!data.anchorLat || !!data.anchorLon',
                        sm: 6,
                    },
                    anchorLat: {
                        type: 'objectId',
                        label: 'nmeaap2_anchorLat',
                        help: 'nmeaap2_anchorLat_help',
                        hidden: '!!data.anchorPosition',
                        sm: 6,
                    },
                    anchorLon: {
                        type: 'objectId',
                        label: 'nmeaap2_anchorLon',
                        help: 'nmeaap2_anchorLon_help',
                        hidden: '!!data.anchorPosition',
                        sm: 6,
                    },
                    positionLat: {
                        type: 'objectId',
                        label: 'nmeaap2_actualPositionLat',
                        help: 'nmeaap2_chainLength_help',
                        sm: 6,
                    },
                    positionLon: {
                        type: 'objectId',
                        label: 'nmeaap2_actualPositionLon',
                        help: 'nmeaap2_depthAtDrop_help',
                        sm: 6,
                    },
                    mapStyle: {
                        type: 'select',
                        label: 'nmeaap2_mapStyle',
                        options: [
                            { value: 'osm', label: 'nmeaap2_mapStyle_osm' },
                            { value: 'satellite', label: 'nmeaap2_mapStyle_satellite' },
                        ],
                        default: 'osm',
                        sm: 12,
                    },
                },
            },
        };
    }

    componentDidMount(): void {
        super.componentDidMount?.();
        this.subscribeAll();
    }

    componentDidUpdate(
        prevProps: Readonly<WidgetGenericProps<AnchorPositionSettings>>,
        prevState: Readonly<AnchorPositionState>,
    ): void {
        super.componentDidUpdate?.(prevProps, this.state);
        const p = prevProps.settings;
        const s = this.props.settings;
        // Re-subscribe whenever any of the configured state IDs (or the adapter instance) changed.
        if (
            p.instance !== s.instance ||
            p.anchorPosition !== s.anchorPosition ||
            p.anchorLat !== s.anchorLat ||
            p.anchorLon !== s.anchorLon ||
            p.positionLat !== s.positionLat ||
            p.positionLon !== s.positionLon ||
            p.depthAtDrop !== s.depthAtDrop
        ) {
            this.unsubscribeAll();
            // Drop any stale resolved values; they'll be refilled by the new bindings.
            this.setState({
                anchorLat: null,
                anchorLon: null,
                boatLat: null,
                boatLon: null,
                trail: [],
                alarmRadius: null,
                isAlarm: null,
                alarmRadiusDraft: '',
                chainLength: null,
            } as Partial<AnchorPositionState> as unknown as AnchorPositionState);
            this.subscribeAll();
        }
        // Anything that affects the overlays gets re-applied to all attached maps. We only
        // touch overlays that have actually changed so Leaflet doesn't reload tiles.
        if (
            p.chainLength !== s.chainLength ||
            p.depthAtDrop !== s.depthAtDrop ||
            p.mapStyle !== s.mapStyle ||
            prevState.anchorLat !== this.state.anchorLat ||
            prevState.anchorLon !== this.state.anchorLon ||
            prevState.boatLat !== this.state.boatLat ||
            prevState.boatLon !== this.state.boatLon ||
            prevState.trail !== this.state.trail ||
            prevState.alarmRadius !== this.state.alarmRadius ||
            prevState.isAlarm !== this.state.isAlarm
        ) {
            this.updateAllOverlays();
        }
    }

    componentWillUnmount(): void {
        super.componentWillUnmount?.();
        this.unsubscribeAll();
        for (const map of this.maps.values()) {
            map.remove();
        }
        this.maps.clear();
        this.mapContainers.clear();
        this.mapRefCallbacks.clear();
        this.overlays.clear();
        this.currentTileStyle.clear();
    }

    private subscribeAll(): void {
        const instance = this.props.settings.instance || 'nmea.0';
        const ctx = this.props.stateContext;
        const s = this.props.settings;

        const subscribe = (
            id: string,
            handler: (id: string, state: ioBroker.State | null | undefined) => void,
        ): void => {
            ctx.getState(id, handler);
            this.stateHandlers.set(id, handler);
        };
        const bindNum = (id: string, update: (v: number | null) => void): void => {
            subscribe(id, (_id, state) => update(state?.val != null ? Number(state.val) : null));
        };

        // Anchor position: prefer the combined "lat;lon" string state (`anchorPosition`); if it
        // is not configured, fall back to the separate `anchorLat` / `anchorLon` numeric states.
        if (s.anchorPosition) {
            subscribe(s.anchorPosition, (_id, state) => {
                const parsed = parseLatLonString(state?.val);
                this.setState({
                    anchorLat: parsed?.lat ?? null,
                    anchorLon: parsed?.lon ?? null,
                } as AnchorPositionState);
            });
        } else {
            if (s.anchorLat) {
                bindNum(s.anchorLat, v => this.setState({ anchorLat: v } as AnchorPositionState));
            }
            if (s.anchorLon) {
                bindNum(s.anchorLon, v => this.setState({ anchorLon: v } as AnchorPositionState));
            }
        }

        // Boat position — drives both the live marker and the trail.
        if (s.positionLat || s.instance) {
            subscribe(s.positionLat || `${s.instance}.gnssPositionData.latitude`, (_id, state) =>
                this.onBoatPositionUpdate('lat', state),
            );
        }
        if (s.positionLon || s.instance) {
            subscribe(s.positionLon || `${s.instance}.gnssPositionData.longitude`, (_id, state) =>
                this.onBoatPositionUpdate('lon', state),
            );
        }

        if (s.chainLength) {
            bindNum(s.chainLength, v => this.setState({ chainLength: v } as AnchorPositionState));
        }
        if (s.depthAtDrop) {
            bindNum(s.depthAtDrop, v => this.setState({ depthAtDrop: v } as AnchorPositionState));
        }

        // Alarm controls — both state IDs are optional; they unlock the in-dialog UI and the
        // alarm-boundary overlay only when configured.
        if (instance) {
            // Live water depth — used in the readout overlay only; the adapter path is fixed.
            bindNum(`${instance}.waterDepth.depth`, v => this.setState({ currentDepth: v } as AnchorPositionState));

            bindNum(`${instance}.anchorAlarm.alarmRadius`, v =>
                this.setState(prev => ({
                    alarmRadius: v,
                    // Keep the local text-input draft in sync as long as the user isn't editing it;
                    // a non-empty draft means the user has a pending edit, so we leave it alone.
                    alarmRadiusDraft:
                        prev.alarmRadiusDraft === '' ? (v != null ? String(v) : '') : prev.alarmRadiusDraft,
                })),
            );
            subscribe(`${instance}.anchorAlarm.isAlarm`, (_id, state) => {
                const v = state?.val;
                this.setState({ isAlarm: v == null ? null : Boolean(v) } as AnchorPositionState);
            });
            subscribe(`${instance}.anchorAlarm.isActive`, (_id, state) => {
                const v = state?.val;
                this.setState({ isAlarmEnabled: v == null ? null : Boolean(v) } as AnchorPositionState);
            });
        }

        // Kick off a one-shot history fetch for the trail. Live updates from the subscriptions
        // above will continue to append to whatever this returns.
        void this.loadTrailHistory();
    }

    private unsubscribeAll(): void {
        const ctx = this.props.stateContext;
        for (const [id, handler] of this.stateHandlers) {
            ctx.removeState(id, handler);
        }
        this.stateHandlers.clear();
        // Invalidate any in-flight history load — its result would belong to the previous
        // subscription set and could re-introduce stale points.
        this.trailLoadToken += 1;
    }

    /**
     * Handle a live position update from either the lat or lon state subscription. Updates the
     * matching field in the component state and appends a new entry to the trail when both lat & lon
     * are known (i.e. we have a complete fix). Old trail entries past the window are dropped.
     */
    private onBoatPositionUpdate(which: 'lat' | 'lon', state: ioBroker.State | null | undefined): void {
        const v =
            state?.val != null ? Number(typeof state.val === 'string' ? state.val.replace(',', '.') : state.val) : null;
        const ts = typeof state?.ts === 'number' ? state.ts : Date.now();
        this.setState(prev => {
            const newLat = which === 'lat' ? v : prev.boatLat;
            const newLon = which === 'lon' ? v : prev.boatLon;
            const next: Partial<AnchorPositionState> = which === 'lat' ? { boatLat: v } : { boatLon: v };
            // Only extend the trail when we have a complete, finite fix, and it actually moved
            // (avoids duplicate points from lat & lon updating in sequence at the same coords).
            if (newLat != null && newLon != null && isFinite(newLat) && isFinite(newLon)) {
                const cutoff = Date.now() - TRAIL_WINDOW_MS;
                const filtered = prev.trail.filter(p => p.ts >= cutoff);
                const last = filtered[filtered.length - 1];
                if (!last || last.lat !== newLat || last.lon !== newLon) {
                    (next as AnchorPositionState).trail = [...filtered, { lat: newLat, lon: newLon, ts }];
                } else if (filtered.length !== prev.trail.length) {
                    (next as AnchorPositionState).trail = filtered;
                }
            }
            // `next` is a Partial — assert the keys we actually set so setState accepts it
            // (Partial makes every field optionally undefined, which the updater return type
            // forbids for fields typed `T | null`).
            return next as Pick<AnchorPositionState, 'boatLat' | 'boatLon' | 'trail'>;
        });
    }

    /**
     * One-shot history backfill for the position trail. Reads the configured history adapter for
     * both positionLat / positionLon over the last `TRAIL_WINDOW_MS`, merges the two streams by
     * matching timestamps to the same second, and seeds `state.trail`. Silently no-ops if no
     * history adapter is configured for the chosen states.
     */
    private async loadTrailHistory(): Promise<void> {
        const s = this.props.settings;
        if (!s.positionLat || !s.positionLon) {
            return;
        }
        const ctx = this.props.stateContext;
        const historyAdapter = ctx.defaultHistory;
        if (!historyAdapter) {
            return;
        }
        const token = ++this.trailLoadToken;
        const end = Date.now();
        const start = end - TRAIL_WINDOW_MS;
        try {
            const socket = ctx.getSocket();
            // Check if historyAdapter alive
            // Check if positionLat/Lon has history enabled
            const alive = await socket.getState(`system.adapter.${historyAdapter}.alive`);
            if (!alive?.val) {
                return;
            }
            const positionLat = await socket.getObject(s.positionLat);
            if (!positionLat?.common?.custom?.[historyAdapter]) {
                return;
            }
            const positionLon = await socket.getObject(s.positionLon);
            if (!positionLon?.common?.custom?.[historyAdapter]) {
                return;
            }
            const [latRows, lonRows] = await Promise.all([
                socket.getHistory(s.positionLat, { instance: historyAdapter, start, end, aggregate: 'none' }),
                socket.getHistory(s.positionLon, { instance: historyAdapter, start, end, aggregate: 'none' }),
            ]);
            // Subscription may have been torn down / replaced while we awaited — drop the result.
            if (token !== this.trailLoadToken) {
                return;
            }
            if (!Array.isArray(latRows) || !Array.isArray(lonRows)) {
                return;
            }
            // Index lat rows by floor-second so a tiny clock skew between the two history streams
            // doesn't prevent us from pairing the corresponding samples (NMEA GPS PGNs typically
            // emit lat & lon in the same telegram, so their writing timestamps are within a few ms).
            const latByTs = new Map<number, number>();
            for (const r of latRows as Array<{ val: unknown; ts?: number }>) {
                const v = Number(r.val);
                if (isFinite(v) && r.ts) {
                    latByTs.set(Math.floor(r.ts / 1000), v);
                }
            }
            const trail: { lat: number; lon: number; ts: number }[] = [];
            for (const r of lonRows as Array<{ val: unknown; ts?: number }>) {
                const lon = Number(r.val);
                if (!isFinite(lon) || !r.ts) {
                    continue;
                }
                const lat = latByTs.get(Math.floor(r.ts / 1000));
                if (lat == null) {
                    continue;
                }
                trail.push({ lat, lon, ts: r.ts });
            }
            trail.sort((a, b) => a.ts - b.ts);
            // Merge with any live points that arrived while we were loading. De-duplicate by ts.
            this.setState(prev => {
                const seen = new Set(trail.map(p => p.ts));
                const merged = [...trail, ...prev.trail.filter(p => !seen.has(p.ts))].sort((a, b) => a.ts - b.ts);
                return { trail: merged };
            });
        } catch {
            // History adapter unreachable / not configured for these states — proceed live-only.
        }
    }

    private getMapRef(key: string): (el: HTMLDivElement | null) => void {
        let cb = this.mapRefCallbacks.get(key);
        if (!cb) {
            cb = (el: HTMLDivElement | null): void => this.attachMap(key, el);
            this.mapRefCallbacks.set(key, cb);
        }
        return cb;
    }

    /**
     * Lazily create the Leaflet map for the given container and bind anchor/boat overlays.
     * Re-runs when the ref callback fires with a different DOM node (e.g. dialog mount).
     */
    private attachMap(key: string, el: HTMLDivElement | null): void {
        const prev = this.mapContainers.get(key);
        if (prev === el) {
            return;
        }
        this.mapContainers.set(key, el);
        const existing = this.maps.get(key);
        if (existing) {
            existing.remove();
            this.maps.delete(key);
            this.overlays.delete(key);
            this.currentTileStyle.delete(key);
        }
        if (!el) {
            return;
        }
        const map = L.map(el, {
            zoomControl: false,
            attributionControl: false,
            // Allow user gestures: the anchor view benefits from panning / zooming to inspect
            // shoreline distances etc. (unlike the AIS radar which is locked to range NM).
            dragging: true,
            scrollWheelZoom: true,
            doubleClickZoom: true,
            boxZoom: false,
            keyboard: false,
            zoomSnap: 0,
            zoomDelta: 0.5,
        });
        const tile = this.buildTileLayer(this.props.settings.mapStyle ?? 'osm');
        tile.addTo(map);

        // Layer order is "first added → bottom of stack". Add trail first so the heatmap dots sit
        // *below* the rode line and the anchor/boat icons — those need to stay visible on top.
        const trail = L.layerGroup().addTo(map);
        const rode = L.polyline([], {
            color: COLORS.chain,
            weight: 2,
            opacity: 0.85,
            dashArray: '6 6',
        }).addTo(map);
        const anchorIcon = buildAnchorIcon();
        const boatIcon = buildBoatIcon();
        const anchorMarker = L.marker([0, 0], { icon: anchorIcon, opacity: 0 }).addTo(map);
        const boatMarker = L.marker([0, 0], { icon: boatIcon, opacity: 0 }).addTo(map);
        // Swing circle is created lazily once we know we have a chain length — it's rendered
        // on top of the rode line, so the boundary is visible even when the boat sits near it.

        this.maps.set(key, map);
        this.overlays.set(key, {
            anchor: anchorMarker,
            boat: boatMarker,
            rode,
            swing: null,
            trail,
            alarm: null,
            tile,
        });
        this.currentTileStyle.set(key, this.props.settings.mapStyle ?? 'osm');

        // Centre on a reasonable initial view: fit anchor + boat if we have both, else jump to
        // anchor, else to boat, else to (0, 0) and wait for data.
        map.setView([0, 0], 2, { animate: false });
        requestAnimationFrame(() => {
            map.invalidateSize();
            this.updateOverlays(key, true);
        });
    }

    private buildTileLayer(style: 'osm' | 'satellite'): L.TileLayer {
        if (style === 'satellite') {
            // Esri WorldImagery is freely usable with attribution. Good resolution, no key.
            return L.tileLayer(
                'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                {
                    maxZoom: 19,
                    attribution:
                        'Tiles © Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
                    detectRetina: true,
                },
            );
        }
        // CartoDB Voyager — a clean, low-saturation OSM-style basemap that works as a "normal"
        // chart background. It looks good in light or dark UI without overpowering the markers.
        return L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            subdomains: ['a', 'b', 'c', 'd'],
            maxZoom: 19,
            attribution: '© OpenStreetMap, © CARTO',
            detectRetina: true,
        });
    }

    private updateAllOverlays(force = false): void {
        for (const key of this.maps.keys()) {
            this.updateOverlays(key, force);
        }
    }

    private updateOverlays(key: string, fitView: boolean): void {
        const map = this.maps.get(key);
        const overlays = this.overlays.get(key);
        if (!map || !overlays) {
            return;
        }
        const { mapStyle } = this.props.settings;
        const { depthAtDrop, anchorLat, anchorLon, boatLat, boatLon, trail, alarmRadius, isAlarm, chainLength } =
            this.state;
        const haveAnchor = anchorLat != null && anchorLon != null && isFinite(anchorLat) && isFinite(anchorLon);
        const haveBoat = boatLat != null && boatLon != null && isFinite(boatLat) && isFinite(boatLon);

        // Swap tile layer when the map style setting changes — replace the layer instance so
        // the new tiles are loaded; the marker/polyline overlays stay attached.
        const currentStyle = this.currentTileStyle.get(key);
        const desiredStyle = mapStyle ?? 'osm';
        if (currentStyle !== desiredStyle) {
            map.removeLayer(overlays.tile);
            const newTile = this.buildTileLayer(desiredStyle);
            newTile.addTo(map);
            overlays.tile = newTile;
            this.currentTileStyle.set(key, desiredStyle);
        }

        // Anchor marker — only visible when the user has set anchor coords. `setLatLng` on a
        // hidden (opacity 0) marker keeps the same DOM element so the icon doesn't blink in.
        if (haveAnchor) {
            overlays.anchor.setLatLng([anchorLat, anchorLon]);
            overlays.anchor.setOpacity(1);
        } else {
            overlays.anchor.setOpacity(0);
        }

        // Boat marker — visible whenever we have a fix.
        if (haveBoat) {
            overlays.boat.setLatLng([boatLat, boatLon]);
            overlays.boat.setOpacity(1);
        } else {
            overlays.boat.setOpacity(0);
        }

        // Rode (anchor → boat-dashed line) — only when both points are known.
        if (haveAnchor && haveBoat) {
            overlays.rode.setLatLngs([
                [anchorLat, anchorLon],
                [boatLat, boatLon],
            ]);
            overlays.rode.setStyle({ opacity: 0.85 });
        } else {
            overlays.rode.setLatLngs([]);
        }

        // Position-history heatmap — one small red circle per recent fix. Opacity scales linearly
        // with age (newest = full, oldest = ~25 %), so the visited zone "fades in" toward the
        // current boat position. We rebuild the layer-group contents on each call; for a 2-hour
        // window the count tops out in the low hundreds even at a per-second update rate, which
        // Leaflet handles comfortably.
        overlays.trail.clearLayers();
        if (trail.length > 0) {
            const now = Date.now();
            const windowMs = TRAIL_WINDOW_MS;
            for (const pt of trail) {
                const age = Math.max(0, Math.min(windowMs, now - pt.ts));
                const fresh = 1 - age / windowMs; // 0 (oldest) … 1 (newest)
                const fillOpacity = 0.25 + 0.55 * fresh;
                overlays.trail.addLayer(
                    L.circleMarker([pt.lat, pt.lon], {
                        radius: 5,
                        color: COLORS.trail,
                        weight: 0,
                        fillColor: COLORS.trail,
                        fillOpacity,
                        interactive: false,
                    }),
                );
            }
        }

        // Alarm boundary — green circle around the anchor at the user-set alarm radius. Visible
        // only when the operator has armed the alarm (`isAlarm === true`) and a valid radius is
        // known. Backend services watch the underlying states and trigger the real alarm; the
        // widget just paints the geometry.
        const haveAlarm =
            haveAnchor && isAlarm === true && alarmRadius != null && isFinite(alarmRadius) && alarmRadius > 0;
        if (haveAlarm) {
            if (!overlays.alarm) {
                overlays.alarm = L.circle([anchorLat, anchorLon], {
                    radius: alarmRadius,
                    color: COLORS.alarmRing,
                    weight: 3,
                    opacity: 0.9,
                    dashArray: '8 6',
                    fillColor: COLORS.alarmRing,
                    fillOpacity: 0.08,
                }).addTo(map);
            } else {
                overlays.alarm.setLatLng([anchorLat, anchorLon]);
                overlays.alarm.setRadius(alarmRadius);
                overlays.alarm.setStyle({ opacity: 0.9, fillOpacity: 0.08 });
            }
        } else if (overlays.alarm) {
            overlays.alarm.setStyle({ opacity: 0, fillOpacity: 0 });
        }

        // Swing circle — drawn around the anchor at the effective swing radius (chain length
        // adjusted for depth at a drop, if both are known). Created lazily on the first need.
        if (haveAnchor && chainLength != null && chainLength > 0) {
            const radius = effectiveSwingRadius(chainLength, depthAtDrop);
            if (!overlays.swing) {
                overlays.swing = L.circle([anchorLat, anchorLon], {
                    radius,
                    color: COLORS.swingRing,
                    weight: 2,
                    opacity: 0.7,
                    fillColor: COLORS.swingRing,
                    fillOpacity: 0.05,
                }).addTo(map);
            } else {
                overlays.swing.setLatLng([anchorLat, anchorLon]);
                overlays.swing.setRadius(radius);
                overlays.swing.setStyle({ opacity: 0.7, fillOpacity: 0.05 });
            }
        } else if (overlays.swing) {
            // Hide by setting zero radius — keeps the layer attached so we don't churn it.
            overlays.swing.setStyle({ opacity: 0, fillOpacity: 0 });
        }

        // Auto-fit the view: on the first attachment OR when the user just changed the anchor/style.
        // For routine boat-position updates we leave the existing zoom/pan so the user can
        // freely pan around without the map snapping back every second.
        if (fitView) {
            const points: L.LatLngExpression[] = [];
            if (haveAnchor) {
                points.push([anchorLat, anchorLon]);
            }
            if (haveBoat) {
                points.push([boatLat, boatLon]);
            }
            if (points.length === 2) {
                map.fitBounds(L.latLngBounds(points), {
                    padding: [40, 40],
                    animate: false,
                    maxZoom: 18,
                });
            } else if (points.length === 1) {
                map.setView(points[0], 17, { animate: false });
            }
        }
    }

    /**
     * Write the boat's current GPS fix back into whichever anchor state(s) the user configured.
     * If `anchorPosition` is set, we write a "lat;lon" string; otherwise the separate `anchorLat`
     * / `anchorLon` numeric states are written. The new value will also flow back through the
     * subscription handler to update `state.anchorLat` / `anchorLon`, but we set them locally
     * here so the map can refit immediately rather than waiting for the round-trip.
     */
    private setAnchorToCurrent(): void {
        const { boatLat, boatLon } = this.state;
        if (boatLat == null || boatLon == null) {
            return;
        }
        const s = this.props.settings;
        const socket = this.props.stateContext.getSocket();
        try {
            if (s.anchorPosition) {
                void socket.setState(s.anchorPosition, `${boatLat};${boatLon}`);
            } else {
                if (s.anchorLat) {
                    void socket.setState(s.anchorLat, boatLat);
                }
                if (s.anchorLon) {
                    void socket.setState(s.anchorLon, boatLon);
                }
            }
        } catch (e) {
            console.warn('[NmeaAnchorPosition] setAnchorToCurrent failed', e);
        }
        this.setState({ anchorLat: boatLat, anchorLon: boatLon } as AnchorPositionState);
        // Force-refit so the dialog zooms to the freshly set anchor.
        for (const key of this.maps.keys()) {
            this.updateOverlays(key, true);
        }
    }

    /**
     * Commit the local alarm-radius text input to the configured state. Trims whitespace, parses
     * as a number, clamps to a reasonable minimum (1 m) to avoid degenerate circles. Silently
     * no-ops on an invalid input — the draft stays so the user can correct it.
     */
    private commitAlarmRadius = (): void => {
        const s = this.props.settings;
        if (!s.instance) {
            return;
        }
        const raw = this.state.alarmRadiusDraft.trim();
        if (raw === '') {
            // Empty draft → leave the existing radius value untouched; sync the draft to it.
            this.setState(prev => ({
                alarmRadiusDraft: prev.alarmRadius != null ? String(prev.alarmRadius) : '',
            }));
            return;
        }
        const v = Number(raw.replace(',', '.'));
        if (!isFinite(v) || v < 1) {
            return;
        }
        const rounded = Math.round(v);
        try {
            void this.props.stateContext.getSocket().setState(`${s.instance}.anchorAlarm.alarmRadius`, rounded);
        } catch (e) {
            console.warn('[NmeaAnchorPosition] setState alarmRadius failed', e);
        }
        // Optimistic local update so the circle redraws immediately rather than waiting for the
        // subscription roundtrip.
        this.setState({ alarmRadius: rounded, alarmRadiusDraft: String(rounded) } as AnchorPositionState);
    };

    /** Arm / disarm the alarm by writing the boolean state. Optimistically updates the local flag. */
    private setAlarmArmed = (armed: boolean): void => {
        const s = this.props.settings;
        if (!s.instance) {
            return;
        }
        try {
            void this.props.stateContext.getSocket().setState(`${s.instance}.anchorAlarm.isActive`, armed);
        } catch (e) {
            console.warn('[NmeaAnchorPosition] setState isAlarm failed', e);
        }
        this.setState({ isAlarm: armed } as AnchorPositionState);
    };

    private currentDistanceM(): number | null {
        const { anchorLat, anchorLon, boatLat, boatLon } = this.state;
        if (
            anchorLat == null ||
            anchorLon == null ||
            boatLat == null ||
            boatLon == null ||
            !isFinite(anchorLat) ||
            !isFinite(anchorLon) ||
            !isFinite(boatLat) ||
            !isFinite(boatLon)
        ) {
            return null;
        }
        return haversineDistance(anchorLat, anchorLon, boatLat, boatLon);
    }

    /**
     * Build the wrapper that hosts the Leaflet map. The map fills the entire box; the SVG-style
     *  numerical readouts live in HTML overlays in the corners.
     */
    private renderMap(size: number | string, key: string): React.JSX.Element {
        return (
            <Box
                sx={{
                    position: 'relative',
                    width: size === '100%' ? '100%' : size,
                    height: size === '100%' ? '100%' : size,
                    overflow: 'hidden',
                    isolation: 'isolate',
                    boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.08)',
                    backgroundColor: COLORS.bg,
                }}
            >
                <div
                    ref={this.getMapRef(key)}
                    style={{ position: 'absolute', inset: 0 }}
                />
                {this.renderReadouts(key === 'compact')}
            </Box>
        );
    }

    /**
     * Numerical overlay — distance from anchor + depths. Compact mode hides the depth lines
     *  to keep the small tile readable.
     */
    private renderReadouts(compact: boolean): React.JSX.Element {
        const distance = this.currentDistanceM();
        const { currentDepth, chainLength, depthAtDrop } = this.state;
        const isFloatComma = this.props.stateContext.isFloatComma;
        const distanceText = distance != null ? `${Math.round(distance)} m` : '—';
        const distanceHi =
            chainLength != null && distance != null && distance > effectiveSwingRadius(chainLength, depthAtDrop);
        return (
            <Box
                sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    p: 1,
                    pointerEvents: 'none',
                    // Sit above Leaflet's panes (the zoom-animation pane briefly raises its z-index
                    // mid-animation, which would otherwise cover the readouts for a few frames).
                    zIndex: 1000,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 0.5,
                }}
            >
                <Box
                    sx={{
                        alignSelf: 'flex-start',
                        bgcolor: 'rgba(0,0,0,0.55)',
                        color: distanceHi ? '#ff5252' : COLORS.contrast,
                        px: 1.5,
                        py: 0.5,
                        borderRadius: '6px',
                        border: '1px solid rgba(255,255,255,0.15)',
                        backdropFilter: 'blur(2px)',
                    }}
                >
                    <Typography sx={{ fontSize: 11, fontWeight: 600, opacity: 0.7 }}>distance</Typography>
                    <Typography sx={{ fontSize: compact ? 18 : 24, fontWeight: 800, lineHeight: 1.05 }}>
                        {distanceText}
                    </Typography>
                </Box>
                {!compact ? (
                    <Box
                        sx={{
                            alignSelf: 'flex-start',
                            bgcolor: 'rgba(0,0,0,0.5)',
                            color: COLORS.contrast,
                            px: 1.25,
                            py: 0.5,
                            borderRadius: '6px',
                            border: '1px solid rgba(255,255,255,0.1)',
                            backdropFilter: 'blur(2px)',
                            display: 'flex',
                            flexDirection: 'row',
                            gap: 2,
                            fontSize: 12,
                        }}
                    >
                        {chainLength != null ? (
                            <span>
                                chain&nbsp;
                                <strong>{Math.round(chainLength)} m</strong>
                            </span>
                        ) : null}
                        {depthAtDrop != null ? (
                            <span>
                                @drop&nbsp;
                                <strong>{formatNum(depthAtDrop, 1, isFloatComma)} m</strong>
                            </span>
                        ) : null}
                        {currentDepth != null ? (
                            <span>
                                depth&nbsp;
                                <strong>{formatNum(currentDepth, 1, isFloatComma)} m</strong>
                            </span>
                        ) : null}
                    </Box>
                ) : null}
            </Box>
        );
    }

    protected isTileActive(): boolean {
        return this.state.boatLat != null && this.state.boatLon != null;
    }

    /** Square tile — small map with distance readout. */
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
                    onClick={() => this.setState({ dialogOpen: true } as AnchorPositionState)}
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
                    <Box sx={{ width: '100%', aspectRatio: '1' }}>{this.renderMap('100%', 'compact')}</Box>
                    {this.props.settings.name ? (
                        <Typography
                            variant="caption"
                            sx={{ fontWeight: 600 }}
                        >
                            {this.props.settings.name}
                        </Typography>
                    ) : null}
                </Box>
            </Box>
        );
    }

    /** 2x1 tile. */
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
                        alignItems: 'stretch',
                        justifyContent: 'stretch',
                        width: '100%',
                        aspectRatio: '2',
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
                    <Box sx={{ width: '100%', height: '100%' }}>{this.renderMap('100%', 'widetall')}</Box>
                </Box>
            </Box>
        );
    }

    protected renderDialog(): React.JSX.Element | null {
        if (!this.state.dialogOpen) {
            return null;
        }
        return (
            <Dialog
                open
                onClose={() => this.setState({ dialogOpen: false })}
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
                <Box
                    sx={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        zIndex: 1000,
                        display: 'flex',
                        gap: 1,
                        alignItems: 'center',
                    }}
                >
                    <ToggleButtonGroup
                        size="small"
                        exclusive
                        value={this.props.settings.mapStyle ?? 'osm'}
                        onChange={(_e, v) => {
                            if (v === 'osm' || v === 'satellite') {
                                this.props.settings.mapStyle = v;
                                this.updateAllOverlays();
                                this.forceUpdate();
                            }
                        }}
                        sx={{ bgcolor: COLORS.cardBg }}
                    >
                        <ToggleButton
                            value="osm"
                            sx={{ color: COLORS.contrast }}
                        >
                            Map
                        </ToggleButton>
                        <ToggleButton
                            value="satellite"
                            sx={{ color: COLORS.contrast }}
                        >
                            Sat
                        </ToggleButton>
                    </ToggleButtonGroup>
                    <Button
                        variant="contained"
                        size="small"
                        startIcon={AnchorIcon ? <AnchorIcon /> : null}
                        onClick={() => this.setAnchorToCurrent()}
                        disabled={this.state.boatLat == null || this.state.boatLon == null}
                        sx={{ bgcolor: COLORS.anchor, '&:hover': { bgcolor: COLORS.anchor } }}
                    >
                        drop here
                    </Button>
                    <IconButton
                        sx={{ color: COLORS.contrast }}
                        onClick={() => this.setState({ dialogOpen: false })}
                    >
                        <CloseIcon />
                    </IconButton>
                </Box>
                <DialogContent
                    sx={{
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'stretch',
                        justifyContent: 'stretch',
                        p: 2,
                        overflow: 'hidden',
                    }}
                >
                    <Box sx={{ width: '100%', height: '100%' }}>{this.renderMap('100%', 'dialog')}</Box>
                    {this.renderAlarmControls()}
                </DialogContent>
            </Dialog>
        );
    }

    /**
     * Bottom-left floating panel for arming the anchor alarm and setting its radius. Rendered
     * only when *both* state IDs are configured (`alarmRadius` and `isAlarm`); if either is
     *  missing, the operator can't fully use the alarm, so we hide the controls entirely rather
     * than showing a half-working UI. The backend is expected to watch these states and raise
     * the actual alarm — the widget only writes the values.
     */
    private renderAlarmControls(): React.JSX.Element | null {
        const s = this.props.settings;
        if (!s.instance) {
            return null;
        }
        const { isAlarm, alarmRadiusDraft } = this.state;
        const armed = isAlarm === true;
        return (
            <Box
                sx={{
                    position: 'absolute',
                    bottom: 16,
                    left: 16,
                    zIndex: 1000,
                    bgcolor: 'rgba(0,0,0,0.7)',
                    color: COLORS.contrast,
                    px: 1.5,
                    py: 1,
                    borderRadius: '8px',
                    border: `1px solid ${armed ? COLORS.alarmRing : 'rgba(255,255,255,0.15)'}`,
                    backdropFilter: 'blur(3px)',
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 1.5,
                }}
            >
                <Typography sx={{ fontSize: 12, fontWeight: 700, opacity: 0.8, mr: 0.5 }}>ALARM</Typography>
                <TextField
                    type="number"
                    size="small"
                    value={alarmRadiusDraft}
                    placeholder="radius"
                    onChange={e => this.setState({ alarmRadiusDraft: e.target.value } as AnchorPositionState)}
                    onBlur={this.commitAlarmRadius}
                    onKeyDown={e => {
                        if (e.key === 'Enter') {
                            this.commitAlarmRadius();
                            (e.target as HTMLInputElement).blur();
                        }
                    }}
                    slotProps={{
                        htmlInput: { min: 1, step: 1, inputMode: 'numeric' },
                        input: {
                            endAdornment: <Typography sx={{ fontSize: 12, opacity: 0.6, ml: 0.5 }}>m</Typography>,
                            sx: { color: COLORS.contrast },
                        },
                    }}
                    sx={{
                        width: 110,
                        '& .MuiOutlinedInput-notchedOutline': {
                            borderColor: 'rgba(255,255,255,0.25)',
                        },
                        '&:hover .MuiOutlinedInput-notchedOutline': {
                            borderColor: 'rgba(255,255,255,0.4)',
                        },
                    }}
                />
                <Switch
                    checked={armed}
                    onChange={(_e, checked) => this.setAlarmArmed(checked)}
                    sx={{
                        '& .MuiSwitch-switchBase.Mui-checked': { color: COLORS.alarmRing },
                        '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                            backgroundColor: COLORS.alarmRing,
                        },
                    }}
                />
                <Typography sx={{ fontSize: 12, opacity: 0.8 }}>{armed ? 'armed' : 'off'}</Typography>
            </Box>
        );
    }

    render(): React.JSX.Element {
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

// Suppress "unused" warnings on the moment / SailingIcon imports while keeping them available
// for future use (status banners, drop-time display, etc.).
void moment;
void SailingIcon;

export default NmeaAnchorPositionComponent;
