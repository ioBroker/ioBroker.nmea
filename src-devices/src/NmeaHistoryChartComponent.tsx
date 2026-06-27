// NMEA historical line-chart widget — plots any numeric nmea.* state over a rolling time window.
// Shows:
//   • Header label (top-left) and current value + unit (top-right)
//   • White raw-sample polyline
//   • Grey shaded area below the line (area-chart style)
//   • Dashed horizontal line at the window average, with its numeric value
//
// Data accumulates from the moment the widget mounts (no backfill from ioBroker's history adapter).
// A 1 s re-render tick keeps the time axis scrolling even when no new samples arrive.

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

const Box: React.ComponentType<BoxProps> = MuiMaterial?.Box;
const Typography: React.ComponentType<TypographyProps> = MuiMaterial?.Typography;
const Dialog: React.ComponentType<DialogProps> = MuiMaterial?.Dialog;
const DialogContent: React.ComponentType<DialogContentProps> = MuiMaterial?.DialogContent;
const IconButton: React.ComponentType<IconButtonProps> = MuiMaterial?.IconButton;
const CloseIcon: React.ComponentType<any> = MuiIcons?.Close;

interface HistoryChartSettings extends CustomWidgetPlugin {
    /** State path absolute. 'nmea.0.windData.windSpeedApparent' */
    stateId?: string;
    /** Header label shown top-left (e.g. 'AWS') */
    label?: string;
    /** Unit shown next to the current value (e.g. 'knots'). Purely display-level — no conversion. */
    unit?: string;
    /** Rolling time window in seconds (default 300 = 5 min). */
    historySeconds?: number;
    /** Y-axis minimum. Acts as a suggestion if `autoScale` is true, as a hard lower bound otherwise. */
    yMin?: number;
    /** Y-axis maximum. Acts as a suggestion if `autoScale` is true, as a hard upper bound otherwise. */
    yMax?: number;
    /**
     * If true, `yMin`/`yMax` are only suggested bounds — the axis expands whenever the data exceeds them.
     *  If false, the axis is clamped to `[yMin, yMax]` exactly, and out-of-range values are clipped.
     */
    autoScale?: boolean;
    /** Decimal places for the readout and min/avg/max labels. */
    decimals?: number;
    /** Reference lines overlaid on the chart at the visible window's min/avg/max values. */
    showMin?: boolean;
    showAvg?: boolean;
    showMax?: boolean;
}

interface HistoryChartState extends WidgetGenericState {
    samples: { val: number; ts: number; tss?: string }[];
    current: number | null;
    dialogOpen: boolean;
}

// Schema defaults — also used at the read sites because json-config strips fields
// whose value equals the schema default, so `settings.foo` arrives as `undefined`
// for any field the user left at its default. We have to fall back to the same
// constant in both places to keep "default" consistent.
const DEFAULT_HISTORY_SECONDS = 60;
const DEFAULT_DECIMALS = 1;
const DEFAULT_STATE_ID = 'nmea.0.windData.windSpeedApparent';
const DEFAULT_LABEL = 'AWS';
const DEFAULT_UNIT = 'knots';
const DEFAULT_Y_MIN = 0;
const DEFAULT_Y_MAX = 0;
const DEFAULT_AUTO_SCALE = true;
const DEFAULT_SHOW_MIN = false;
const DEFAULT_SHOW_AVG = true;
const DEFAULT_SHOW_MAX = false;

const COLORS = {
    bg: '#191c1d',
    cardBg: '#000000',
    grey: '#8a9095',
    greyArea: '#4a5256',
    contrast: '#FFFFFF',
    avgLine: '#d0d4d8',
    // Min = cool cyan (looks like a "low" water-line); max = warm orange (a "peak" marker).
    minLine: '#5fb3ff',
    maxLine: '#ff9100',
} as const;

function formatNum(val: number | null, decimals: number, isFloatComma?: boolean): string {
    if (val == null || !isFinite(val)) {
        return '—';
    }
    const s = val.toFixed(decimals);
    return isFloatComma ? s.replace('.', ',') : s;
}

// Empty-state text shown when the chart hasn't received any samples yet within the visible
// window. Keyed by `ioBroker.Languages` so `WidgetGeneric.getText()` can pick the user's locale
// at render time. Languages we don't ship a translation for fall back to the English string.
const WAITING_FOR_SAMPLES: Partial<Record<ioBroker.Languages, string>> & { en: string } = {
    en: 'waiting for samples…',
    de: 'warte auf Werte…',
    ru: 'ожидание данных…',
    fr: 'en attente de données…',
    es: 'esperando datos…',
    it: 'in attesa di dati…',
    nl: 'wachten op gegevens…',
    pl: 'oczekiwanie na dane…',
    pt: 'aguardando dados…',
    uk: 'очікування даних…',
    'zh-cn': '等待样本…',
};

export class NmeaHistoryChartComponent extends WidgetGeneric<HistoryChartState, HistoryChartSettings> {
    private stateHandler: ((id: string, state: ioBroker.State | null | undefined) => void) | null = null;
    private subscribedId: string | null = null;
    /** Periodic re-render so the chart scrolls left smoothly without waiting for new samples. */
    private tickInterval: ReturnType<typeof setInterval> | null = null;

    constructor(props: WidgetGenericProps<HistoryChartSettings>) {
        super(props);
        this.state = {
            ...this.state,
            samples: [],
            current: null,
            dialogOpen: false,
        };
    }

    static override getConfigSchema(): { name: string; schema: ConfigItemPanel | ConfigItemTabs } {
        return {
            name: 'NmeaHistoryChartComponent',
            schema: {
                type: 'panel',
                items: {
                    stateId: {
                        type: 'objectId',
                        label: 'nmeahc_stateId',
                        help: 'nmeahc_stateId_help',
                        default: DEFAULT_STATE_ID,
                        fillOnSelect: 'common.name=>label(X),common.unit=>unit',
                        sm: 12,
                    },
                    label: {
                        type: 'text',
                        label: 'nmeahc_label',
                        default: DEFAULT_LABEL,
                        sm: 6,
                    },
                    unit: {
                        type: 'text',
                        label: 'nmeahc_unit',
                        default: DEFAULT_UNIT,
                        sm: 6,
                    },
                    historySeconds: {
                        type: 'number',
                        label: 'nmeahc_historySeconds',
                        help: 'nmeahc_historySeconds_help',
                        default: DEFAULT_HISTORY_SECONDS,
                        min: 10,
                        max: 3600,
                        sm: 12,
                        md: 4,
                    },
                    yMin: {
                        type: 'number',
                        label: 'nmeahc_yMin',
                        help: 'nmeahc_yMin_help',
                        default: DEFAULT_Y_MIN,
                        sm: 12,
                        md: 4,
                    },
                    yMax: {
                        type: 'number',
                        label: 'nmeahc_yMax',
                        help: 'nmeahc_yMax_help',
                        default: DEFAULT_Y_MAX,
                        sm: 12,
                        md: 4,
                    },
                    autoScale: {
                        type: 'checkbox',
                        label: 'nmeahc_autoScale',
                        help: 'nmeahc_autoScale_help',
                        default: DEFAULT_AUTO_SCALE,
                        sm: 12,
                        md: 4,
                    },
                    showMin: {
                        newLine: true,
                        type: 'checkbox',
                        label: 'nmeahc_showMin',
                        default: DEFAULT_SHOW_MIN,
                        sm: 4,
                    },
                    showAvg: {
                        type: 'checkbox',
                        label: 'nmeahc_showAvg',
                        default: DEFAULT_SHOW_AVG,
                        sm: 4,
                    },
                    showMax: {
                        type: 'checkbox',
                        label: 'nmeahc_showMax',
                        default: DEFAULT_SHOW_MAX,
                        sm: 4,
                    },
                    decimals: {
                        type: 'number',
                        label: 'nmeahc_decimals',
                        default: DEFAULT_DECIMALS,
                        min: 0,
                        max: 3,
                        sm: 6,
                    },
                },
            },
        };
    }

    componentDidMount(): void {
        super.componentDidMount?.();
        this.subscribe();
        // Tick at ~10 Hz so the chart scrolls smoothly — at 300 s / ~560 px the axis moves
        // roughly 0.2 px per tick, well below perceptible jumps. Data still arrives whenever
        // ioBroker publishes a new sample; this interval is purely for the time-axis animation.
        this.tickInterval = setInterval(() => {
            if (this.state.samples.length > 0) {
                if (Date.now() - this.state.samples[this.state.samples.length - 1].ts > 2000) {
                    // Repeat last value
                    this.setState(s => {
                        return {
                            samples: [...s.samples, { val: s.samples[s.samples.length - 1].val, ts: Date.now() }],
                        };
                    });
                    return;
                }
                this.forceUpdate();
            }
        }, 100);
    }

    componentDidUpdate(prevProps: Readonly<WidgetGenericProps<HistoryChartSettings>>): void {
        super.componentDidUpdate?.(prevProps, this.state);
        if (prevProps.settings.stateId !== this.props.settings.stateId) {
            this.unsubscribe();
            this.setState({ samples: [], current: null });
            this.subscribe();
        }
    }

    componentWillUnmount(): void {
        super.componentWillUnmount?.();
        this.unsubscribe();
        if (this.tickInterval) {
            clearInterval(this.tickInterval);
            this.tickInterval = null;
        }
    }

    private subscribe(): void {
        // json-config strips fields equal to their default → fall back to the schema default.
        const stateId = this.props.settings.stateId || DEFAULT_STATE_ID;
        if (!stateId) {
            return;
        }
        this.subscribedId = stateId;
        this.stateHandler = (_id, state) => {
            if (!state || state.val == null) {
                return;
            }
            const val = Number(state.val);
            if (!isFinite(val)) {
                return;
            }
            const ts = state.ts || Date.now();
            if (this.state.samples.length && ts <= this.state.samples[this.state.samples.length - 1].ts) {
                return;
            }
            this.setState(s => {
                const windowMs = (this.props.settings.historySeconds ?? DEFAULT_HISTORY_SECONDS) * 1000;
                const cutoff = Date.now() - windowMs;
                // Find first value outside window and hold it for calculations
                let beforeFirst: { val: number; ts: number } | undefined;
                for (const v of s.samples) {
                    if (v.ts >= cutoff) {
                        break;
                    }
                    beforeFirst = v;
                }
                const trimmed = s.samples.filter(x => x.ts >= cutoff);
                const samples = [...trimmed];
                if (!samples.length || ts > samples[samples.length - 1].ts) {
                    samples.push({ val, ts });
                }
                if (beforeFirst) {
                    samples.unshift(beforeFirst);
                }

                return {
                    samples,
                    current: val,
                };
            });
        };
        this.props.stateContext.getState(this.subscribedId, this.stateHandler);
        // Background-load historical samples, so the chart isn't empty on first paint — but only
        // when the object opts into a default history adapter via `common.custom[defaultHistory]`.
        void this.prefillFromHistory(this.subscribedId);
    }

    /**
     * Query the system's default-history adapter for the last `historySeconds` of this state and
     * merge the result into the sample buffer. Silently no-ops if the state isn't being historised
     * or the history call fails — the live subscription still populates the chart over time.
     */
    private async prefillFromHistory(fullId: string): Promise<void> {
        const ctx = this.props.stateContext;
        const historyAdapter = ctx.defaultHistory;
        if (!historyAdapter) {
            return;
        }
        let obj: ioBroker.StateObject | undefined;
        try {
            obj = await ctx.getObject<ioBroker.StateObject>(fullId);
        } catch {
            return;
        }
        if (!obj?.common?.custom?.[historyAdapter]) {
            return;
        }
        // Subscription may have been torn down while we were awaiting the object lookup
        // (e.g. instance-setting change). Bail out — the fresh subscribe() will re-invoke us.
        if (this.subscribedId !== fullId) {
            return;
        }
        const windowMs = (this.props.settings.historySeconds ?? DEFAULT_HISTORY_SECONDS) * 1000;
        const end = Date.now();
        const start = end - windowMs;
        try {
            const socket = ctx.getSocket();
            const result = await socket.getHistory(fullId, {
                instance: historyAdapter,
                start,
                end,
                aggregate: 'none',
            });
            if (!result || !Array.isArray(result) || this.subscribedId !== fullId) {
                return;
            }
            const historical: { val: number; ts: number }[] = [];
            for (const row of result as Array<{ val: unknown; ts?: number }>) {
                const v = Number(row.val);
                if (!isFinite(v) || !row.ts) {
                    continue;
                }
                historical.push({ val: v, ts: row.ts });
            }
            if (historical.length === 0) {
                return;
            }
            // Merge with live samples that may have arrived, meanwhile, de-duplicating by timestamp
            // and keeping the array sorted ascending so the renderer can walk it left-to-right.
            this.setState(s => {
                const seen = new Set(s.samples.map(x => x.ts));
                const merged = [...historical.filter(x => !seen.has(x.ts)), ...s.samples].sort((a, b) => a.ts - b.ts);
                const latest = merged.length ? merged[merged.length - 1].val : s.current;
                return {
                    samples: merged,
                    current: s.current ?? latest,
                };
            });
        } catch {
            // History adapter unreachable or returned an error — just keep going with live data.
        }
    }

    private unsubscribe(): void {
        if (this.subscribedId && this.stateHandler) {
            this.props.stateContext.removeState(this.subscribedId, this.stateHandler);
        }
        this.subscribedId = null;
        this.stateHandler = null;
    }

    protected isTileActive(): boolean {
        return this.state.current != null;
    }

    /**
     * Core chart renderer — 600×400 viewBox, scales to the container via width/height attrs.
     * `compact=true` drops the header + current readout (used by the small-tile variant).
     */
    protected renderChartSvg(compact = false): React.JSX.Element {
        const { samples } = this.state;
        const windowMs = (this.props.settings.historySeconds ?? DEFAULT_HISTORY_SECONDS) * 1000;
        // User-configurable line color (settings.color from the host's base widget settings).
        // Falls back to white so the chart still has a visible line if the user clears the picker.
        const lineColor = this.getAccentColor() || COLORS.contrast;

        // ---- Geometry ----
        const VIEW_W = 600;
        const VIEW_H = 400;
        const chartLeft = 20;
        const chartRight = VIEW_W - 20;
        const chartTop = compact ? 30 : 110;
        const chartBottom = VIEW_H - 20;
        const chartWidth = chartRight - chartLeft;
        const chartHeight = chartBottom - chartTop;

        // Right edge of the chart = "now". Combined with the 100 ms render tick (started in
        // componentDidMount), the chart axis scrolls left smoothly between samples instead of
        // jumping forward only when a new sample arrives. The earlier "tip flicker" issue is
        // avoided by simply NOT drawing a hold-last-value extension to chartRight — the
        // polyline ends at the last actual sample. As "now" advances, the last sample slides
        // leftward at the same rate as the rest, leaving a small open gap on the right that
        // fills again the moment a new sample arrives. Smooth scrolling, no fake tip, no flicker.
        const now = Date.now();
        const endMs = now;
        const startMs = endMs - windowMs;
        const active = samples.filter(s => s.ts >= startMs);

        let beforeFirst: { val: number; ts: number } | undefined;
        for (const v of samples) {
            if (v.ts >= startMs) {
                break;
            }
            beforeFirst = v;
        }

        // Get the last value and use it as actual one
        if (samples.length && samples[samples.length - 1].ts < endMs) {
            active.push({ val: samples[samples.length - 1].val, ts: endMs });
        }

        // Interpolate value between afterLast and samples[0]
        if (beforeFirst && active[0] && beforeFirst.ts < active[0].ts) {
            const ratio = (startMs - beforeFirst.ts) / (active[0].ts - beforeFirst.ts);
            const interpolated = (active[0].val - beforeFirst.val) * ratio;
            active.unshift({ val: interpolated + beforeFirst.val, ts: startMs });
        }

        // ---- Data min / avg / max over the visible window ----
        let dataMin: number | null = null;
        let dataMax: number | null = null;
        let avg: number | null = null;
        if (active.length > 0) {
            dataMin = Infinity;
            dataMax = -Infinity;
            let sum = 0;
            for (const s of active) {
                if (s.val < dataMin) {
                    dataMin = s.val;
                }
                if (s.val > dataMax) {
                    dataMax = s.val;
                }
                sum += s.val;
            }
            avg = sum / active.length;
        }

        // ---- Y-axis scaling ----
        // `yMin`/`yMax` settings act as suggestions when `autoScale` is true (axis grows beyond
        // them if data exceeds), or as hard bounds when false (values outside are clipped).
        const cfgMin = this.props.settings.yMin ?? DEFAULT_Y_MIN;
        const cfgMax = this.props.settings.yMax ?? DEFAULT_Y_MAX;
        const hasCfgMax = cfgMax > cfgMin;
        const autoScale = this.props.settings.autoScale ?? DEFAULT_AUTO_SCALE;
        let yMin: number;
        let yMax: number;
        if (autoScale) {
            const lowerSeed = dataMin ?? cfgMin;
            const upperSeed = dataMax != null ? dataMax * 1.1 : cfgMin + 1;
            yMin = Math.min(cfgMin, lowerSeed);
            yMax = Math.max(hasCfgMax ? cfgMax : cfgMin + 1, upperSeed);
        } else {
            yMin = cfgMin;
            yMax = hasCfgMax ? cfgMax : cfgMin + 1;
        }
        if (yMax <= yMin) {
            yMax = yMin + 1; // guarantee a non-zero range
        }
        const yRange = yMax - yMin;

        const xFor = (ts: number): number => chartLeft + ((ts - startMs) / windowMs) * chartWidth;
        const yFor = (val: number): number =>
            chartBottom - ((Math.max(yMin, Math.min(yMax, val)) - yMin) / yRange) * chartHeight;

        // ---- Poly points / area path ----
        // Smooth (linearly interpolated) line through the samples. Each sample becomes one
        // polyline vertex; SVG draws straight segments between consecutive vertices, so the
        // line slopes between values rather than stepping. After the loop we extend
        // horizontally from the latest sample to chartRight (= now), so the chart's tip stays
        // glued to the right edge between samples — the value is "held" until the next sample
        // arrives, but only the FINAL hold (between last sample and now) is drawn as flat;
        // intermediate samples connect smoothly.
        //
        // `pushPoint` deduplicates consecutive identical points, so a sample arriving exactly
        // at `now` doesn't spawn a zero-length stroke segment that would render as a visible
        // round-cap dot at the tip.
        const lineParts: string[] = [];
        const pushPoint = (x: number, y: number): void => {
            const xs = x.toFixed(1);
            const ys = y.toFixed(1);
            const last = lineParts[lineParts.length - 1];
            if (last === `${xs},${ys}`) {
                return;
            }
            lineParts.push(`${xs},${ys}`);
        };
        for (let i = 0; i < active.length; i++) {
            const s = active[i];
            pushPoint(xFor(s.ts), yFor(s.val));
        }
        if (active.length > 0) {
            const lastSample = active[active.length - 1];
            pushPoint(xFor(now), yFor(lastSample.val));
        }
        const polyline = lineParts.join(' ');

        // Close the area polygon from the baseline (chartBottom) up through the samples plus
        // the optional hold-last-value extension. The area is extended on BOTH sides by
        // `LINE_HALF_WIDTH` so the polyline's round-cap (which sits half-stroke beyond the
        // first/last sample x) stays fully on top of the filled area instead of poking out
        // unfilled. Visually: the line never "sticks out" past the shaded body at the chart
        // start or end.
        const LINE_HALF_WIDTH = 2; // strokeWidth=4 → cap radius ≈ 2 px
        let areaPath = '';
        if (active.length > 0) {
            const firstSample = active[0];
            const firstX = xFor(firstSample.ts);
            const firstY = yFor(firstSample.val);
            const lastPoint = lineParts[lineParts.length - 1].split(',');
            const lastX = parseFloat(lastPoint[0]);
            const lastY = parseFloat(lastPoint[1]);
            const leftEdge = (firstX - LINE_HALF_WIDTH).toFixed(1);
            const rightEdge = (lastX + LINE_HALF_WIDTH).toFixed(1);
            // Path order:
            //   1. Start at (left-extended, bottom).
            //   2. Up the left wall to (left-extended, firstY) — vertical at the first value.
            //   3. Across to (firstX, firstY) — short horizontal stub matching the line cap.
            //   4. Through every polyline point.
            //   5. Across to (right-extended, lastY) — same stub on the right.
            //   6. Down the right wall to (right-extended, bottom).
            //   7. Z closes the rectangle along the baseline.
            areaPath =
                `M ${leftEdge},${chartBottom} ` +
                `L ${leftEdge},${firstY.toFixed(1)} ` +
                `L ${firstX.toFixed(1)},${firstY.toFixed(1)} ` +
                `L ${lineParts.join(' L ')} ` +
                `L ${rightEdge},${lastY.toFixed(1)} ` +
                `L ${rightEdge},${chartBottom} Z`;
        }

        // ---- Reference-line y positions (computed from dataMin/avg/dataMax) ----
        const showMin = this.props.settings.showMin ?? DEFAULT_SHOW_MIN;
        const showAvg = this.props.settings.showAvg ?? DEFAULT_SHOW_AVG;
        const showMax = this.props.settings.showMax ?? DEFAULT_SHOW_MAX;
        const avgY = avg != null ? yFor(avg) : null;
        const minY = dataMin != null ? yFor(dataMin) : null;
        const maxY = dataMax != null ? yFor(dataMax) : null;

        return (
            <svg
                viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
                preserveAspectRatio="none"
                style={{ width: '100%', height: '100%', display: 'block' }}
            >
                {/* Card background */}
                <rect
                    x={0}
                    y={0}
                    width={VIEW_W}
                    height={VIEW_H}
                    fill={COLORS.cardBg}
                />

                {/* Header (label + current value) and empty-state hint live OUTSIDE the SVG —
                    SVG `<text>` cannot wrap or truncate-with-ellipsis, so long labels (e.g.
                    "Apparent Wind Speed") were getting clipped at the viewBox right edge.
                    See `renderChartWithChrome()` for the HTML overlay. */}

                {/* Area fill under the polyline — uses the same accent colour as the line but
                    at low opacity so it reads as a "passive" / muted version of the active
                    stroke. The fixed grey fill from before is kept as a fallback when the
                    user hasn't picked a colour, so the chart still has a visible body. */}
                {areaPath ? (
                    <path
                        d={areaPath}
                        fill={lineColor}
                        fillOpacity={0.22}
                    />
                ) : null}

                {/* Raw-sample polyline. `vectorEffect="non-scaling-stroke"` keeps the line at a
                    constant pixel thickness even though the SVG uses preserveAspectRatio="none"
                    (which would otherwise stretch the stroke horizontally on wide tiles). */}
                {polyline ? (
                    <polyline
                        points={polyline}
                        fill="none"
                        stroke={lineColor}
                        strokeWidth={4}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        vectorEffect="non-scaling-stroke"
                    />
                ) : null}

                {/* Reference lines (dashed) — drawn inside SVG so they stretch with the chart.
                    Labels (avg/min/max pills) live in the HTML overlay (`renderChartWithChrome`)
                    so the text isn't horizontally distorted by `preserveAspectRatio="none"`. */}
                {((): React.JSX.Element[] => {
                    const lines: React.JSX.Element[] = [];
                    const addLine = (key: string, y: number | null, stroke: string): void => {
                        if (y == null) {
                            return;
                        }
                        lines.push(
                            <line
                                key={`refline-${key}`}
                                x1={chartLeft}
                                y1={y}
                                x2={chartRight}
                                y2={y}
                                stroke={stroke}
                                strokeWidth={2.5}
                                strokeDasharray="12 6"
                                strokeOpacity={0.85}
                                vectorEffect="non-scaling-stroke"
                                style={{ transition: 'all 100ms ease-out' }}
                            />,
                        );
                    };
                    if (showMin) {
                        addLine('min', minY, COLORS.minLine);
                    }
                    if (showAvg) {
                        addLine('avg', avgY, COLORS.avgLine);
                    }
                    if (showMax) {
                        addLine('max', maxY, COLORS.maxLine);
                    }
                    return lines;
                })()}

                {/* Empty-state hint moved to the HTML overlay (renderChartWithChrome) so it can
                    use real CSS centring and a font that doesn't depend on the SVG's viewBox scale. */}
            </svg>
        );
    }

    /**
     * Wraps the SVG chart with HTML chrome (header + reference-line pills + empty-state).
     * Using HTML instead of in-SVG `<text>` keeps text un-distorted by the SVG's
     * preserveAspectRatio="none" stretching, lets long labels truncate with ellipsis, and
     * gives proper centring without renderer-specific dominantBaseline quirks.
     *
     * VIEW_H is the internal SVG viewBox height; we convert per-line y values into
     * percentages so the HTML pills stay aligned with the dashed lines as the chart resizes.
     */
    private renderChartWithChrome(isDialog: boolean): React.JSX.Element {
        const label = this.props.settings.label ?? DEFAULT_LABEL;
        const unit = this.props.settings.unit ?? DEFAULT_UNIT;
        const decimals = this.props.settings.decimals ?? DEFAULT_DECIMALS;
        const isFloatComma = this.props.stateContext.isFloatComma;
        const { current } = this.state;
        // Apply the user's `settings.color` (returned via getAccentColor) to the current-value
        // readout so it visually matches the chart line. Falls back to white when unset.
        const valueColor = this.getAccentColor() || COLORS.contrast;
        const windowMs = (this.props.settings.historySeconds ?? DEFAULT_HISTORY_SECONDS) * 1000;
        const showMin = this.props.settings.showMin ?? DEFAULT_SHOW_MIN;
        const showAvg = this.props.settings.showAvg ?? DEFAULT_SHOW_AVG;
        const showMax = this.props.settings.showMax ?? DEFAULT_SHOW_MAX;

        // Recompute reference-line data in the same way as renderChartSvg so the pill positions
        // stay locked to the dashed lines. SVG viewBox is 600×400 with chartTop=110 / bottom=380.
        const VIEW_H = 400;
        const chartTop = 110;
        const chartBottom = VIEW_H - 20;
        const chartHeight = chartBottom - chartTop;
        const cfgMin = this.props.settings.yMin ?? DEFAULT_Y_MIN;
        const cfgMax = this.props.settings.yMax ?? DEFAULT_Y_MAX;
        const hasCfgMax = cfgMax > cfgMin;
        const autoScale = this.props.settings.autoScale ?? DEFAULT_AUTO_SCALE;
        const samples = this.state.samples;
        // Mirror the SVG's right-edge convention so pill positions stay aligned with the chart.
        const endMs = Date.now();
        const startMs = endMs - windowMs;
        const active = samples.filter(s => s.ts >= startMs);

        // Get the last value and use it as actual one
        if (samples.length && samples[samples.length - 1].ts < endMs) {
            active.push({ val: samples[samples.length - 1].val, ts: endMs });
        }

        let dataMin: number | null = null;
        let dataMax: number | null = null;
        let avg: number | null = null;
        if (active.length > 0) {
            dataMin = Infinity;
            dataMax = -Infinity;
            let sum = 0;
            for (const s of active) {
                if (s.val < dataMin) {
                    dataMin = s.val;
                }
                if (s.val > dataMax) {
                    dataMax = s.val;
                }
                sum += s.val;
            }
            avg = sum / active.length;
        }
        let yMin: number;
        let yMax: number;
        if (autoScale) {
            const lowerSeed = dataMin ?? cfgMin;
            const upperSeed = dataMax != null ? dataMax * 1.1 : cfgMin + 1;
            yMin = Math.min(cfgMin, lowerSeed);
            yMax = Math.max(hasCfgMax ? cfgMax : cfgMin + 1, upperSeed);
        } else {
            yMin = cfgMin;
            yMax = hasCfgMax ? cfgMax : cfgMin + 1;
        }
        if (yMax <= yMin) {
            yMax = yMin + 1;
        }
        const yRange = yMax - yMin;
        const yPctFor = (val: number): number => {
            const y = chartBottom - ((Math.max(yMin, Math.min(yMax, val)) - yMin) / yRange) * chartHeight;
            return (y / VIEW_H) * 100;
        };

        const pills: { key: 'min' | 'avg' | 'max'; value: number; topPct: number; color: string }[] = [];
        if (showMin && dataMin != null) {
            pills.push({ key: 'min', value: dataMin, topPct: yPctFor(dataMin), color: COLORS.minLine });
        }
        if (showAvg && avg != null) {
            pills.push({ key: 'avg', value: avg, topPct: yPctFor(avg), color: COLORS.avgLine });
        }
        if (showMax && dataMax != null) {
            pills.push({ key: 'max', value: dataMax, topPct: yPctFor(dataMax), color: COLORS.maxLine });
        }

        const hasSamples = active.length > 0;
        return (
            <Box sx={{ position: 'relative', width: '100%', height: '100%' }}>
                {/* The SVG fills the entire box; header / pills / empty-state are overlaid in front. */}
                {this.renderChartSvg()}
                {/* Reference-line pills — one per enabled stat. Stacked horizontally near the
                    left edge with slot-spacing so they never overlap. `top` follows the dashed
                    line at the same yPct; `transform: translateY(-50%)` centres the pill on the
                    line. `transition: top` makes the pill glide when the underlying value changes. */}
                {pills.map((p, i) => (
                    <Box
                        key={p.key}
                        sx={{
                            position: 'absolute',
                            top: `${p.topPct}%`,
                            left: `${8 + i * 88}px`,
                            transform: 'translateY(-50%)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            px: '8px',
                            py: '2px',
                            borderRadius: '6px',
                            backgroundColor: COLORS.cardBg,
                            border: `1px solid ${p.color}66`,
                            fontSize: 14,
                            fontWeight: 600,
                            lineHeight: 1.2,
                            pointerEvents: 'none',
                            transition: 'top 100ms ease-out',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        <Box
                            component="span"
                            sx={{ color: p.color }}
                        >
                            {p.key}
                        </Box>
                        <Box
                            component="span"
                            sx={{ color: COLORS.contrast }}
                        >
                            {formatNum(p.value, decimals, isFloatComma)}
                        </Box>
                    </Box>
                ))}
                {/* Header — label left (truncates with ellipsis), value+unit right. */}
                <Box
                    sx={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: 1,
                        px: 1.5,
                        pt: 1,
                        pointerEvents: 'none',
                    }}
                >
                    <Typography
                        sx={{
                            fontSize: 'clamp(14px, 4cqw, 28px)',
                            fontWeight: 700,
                            color: COLORS.grey,
                            overflow: 'hidden',
                            whiteSpace: 'nowrap',
                            textOverflow: 'ellipsis',
                            minWidth: 0,
                            flex: '1 1 auto',
                        }}
                        title={label}
                    >
                        {label}
                    </Typography>
                    <Typography
                        sx={{
                            fontSize: isDialog ? 'clamp(32px, 10cqw, 64px)' : 'clamp(14px, 4cqw, 26px)',
                            fontWeight: 800,
                            color: valueColor,
                            whiteSpace: 'nowrap',
                            flex: '0 0 auto',
                        }}
                    >
                        {current != null
                            ? `${formatNum(current, decimals, isFloatComma)}${unit ? ` ${unit}` : ''}`
                            : '—'}
                    </Typography>
                </Box>
                {/* Empty-state hint — centred over the chart area when no samples have arrived yet. */}
                {!hasSamples ? (
                    <Box
                        sx={{
                            position: 'absolute',
                            inset: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            pointerEvents: 'none',
                        }}
                    >
                        <Typography sx={{ fontSize: 14, color: COLORS.grey, opacity: 0.6, fontWeight: 500 }}>
                            {this.getText(WAITING_FOR_SAMPLES)}
                        </Typography>
                    </Box>
                ) : null}
            </Box>
        );
    }

    override renderCompact(): React.JSX.Element {
        const isActive = this.isTileActive();
        const accent = this.getAccentColor();
        const settingsButton = this.renderSettingsButton();
        const indicators = this.renderIndicators(settingsButton);
        const label = this.props.settings.label ?? DEFAULT_LABEL;
        const unit = this.props.settings.unit ?? DEFAULT_UNIT;
        const decimals = this.props.settings.decimals ?? DEFAULT_DECIMALS;
        const isFloatComma = this.props.stateContext.isFloatComma;
        return (
            <Box
                id={String(this.props.widget.id)}
                className={this.getWidgetClass()}
                sx={theme => WidgetGeneric.getStyleCompact(theme)}
            >
                <Box
                    onClick={() => this.setState({ dialogOpen: true } as HistoryChartState)}
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
                    <Typography
                        variant="caption"
                        sx={{ fontWeight: 700, color: 'text.secondary' }}
                    >
                        {label}
                    </Typography>
                    <Typography sx={{ fontSize: 32, fontWeight: 800, lineHeight: 1 }}>
                        {formatNum(this.state.current, decimals, isFloatComma)}
                    </Typography>
                    {unit ? (
                        <Typography
                            variant="caption"
                            sx={{ opacity: 0.7 }}
                        >
                            {unit}
                        </Typography>
                    ) : null}
                </Box>
            </Box>
        );
    }

    /** 2x0.5 — same compact layout, just wider. */
    override renderWide(): React.JSX.Element {
        const isActive = this.isTileActive();
        const accent = this.getAccentColor();
        const settingsButton = this.renderSettingsButton();
        const indicators = this.renderIndicators(settingsButton);
        return (
            <Box
                id={String(this.props.widget.id)}
                className={this.getWidgetClass()}
                sx={theme => ({ ...WidgetGeneric.getStyleWide(theme), height: 80 })}
            >
                <Box
                    onClick={() => this.setState({ dialogOpen: true } as HistoryChartState)}
                    sx={theme => ({
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
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
                    <Typography sx={{ fontSize: 14, fontWeight: 700, color: 'text.secondary' }}>
                        {this.props.settings.label ?? DEFAULT_LABEL}
                    </Typography>
                    <Typography sx={{ fontSize: 28, fontWeight: 800 }}>
                        {formatNum(
                            this.state.current,
                            this.props.settings.decimals ?? DEFAULT_DECIMALS,
                            this.props.stateContext.isFloatComma,
                        )}
                        {(() => {
                            const u = this.props.settings.unit ?? DEFAULT_UNIT;
                            return u ? ` ${u}` : '';
                        })()}
                    </Typography>
                </Box>
            </Box>
        );
    }

    /** 2x1 — the actual chart. This is the primary layout. */
    override renderWideTall(): React.JSX.Element {
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
                    onClick={() => this.setState({ dialogOpen: true } as HistoryChartState)}
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
                    <Box
                        sx={{
                            width: '100%',
                            height: '100%',
                            // Enable container queries so the HTML header can scale font-size
                            // proportional to the actual rendered tile width (clamp(_, _cqw, _)).
                            containerType: 'size',
                        }}
                    >
                        {this.renderChartWithChrome(false)}
                    </Box>
                </Box>
            </Box>
        );
    }

    private renderDialog(): React.JSX.Element | null {
        if (!this.state.dialogOpen) {
            return null;
        }
        return (
            <Dialog
                open
                onClose={() => this.setState({ dialogOpen: false } as HistoryChartState)}
                maxWidth={false}
                fullWidth
                slotProps={{
                    paper: {
                        sx: {
                            width: '95vw',
                            height: '85vh',
                            maxWidth: '95vw',
                            maxHeight: '85vh',
                            m: 1,
                            bgcolor: COLORS.bg,
                        },
                    },
                }}
            >
                <IconButton
                    onClick={() => this.setState({ dialogOpen: false } as HistoryChartState)}
                    sx={{ position: 'absolute', top: 8, right: 8, zIndex: 1, color: 'white' }}
                >
                    <CloseIcon />
                </IconButton>
                <DialogContent
                    sx={{
                        display: 'flex',
                        alignItems: 'stretch',
                        justifyContent: 'stretch',
                        p: 2,
                        overflow: 'hidden',
                    }}
                >
                    <Box
                        sx={{
                            width: '100%',
                            height: '100%',
                            containerType: 'size',
                        }}
                    >
                        {this.renderChartWithChrome(true)}
                    </Box>
                </DialogContent>
            </Dialog>
        );
    }

    override render(): React.JSX.Element {
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

export default NmeaHistoryChartComponent;
