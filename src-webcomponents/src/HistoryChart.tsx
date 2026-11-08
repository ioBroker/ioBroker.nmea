/**
 * A live chart of one state as a web component: `<iob-nmea-history-chart>` - the web component of the devices widget
 * "NMEA Chart" (`src-devices/src/NmeaHistoryChartComponent.tsx`).
 *
 * The last `historySeconds` of the state as a line with an area under it, scrolling with the time, with dashed lines
 * at the minimum, average and maximum of the window. When the state is logged by the default history instance of
 * the system, the window is filled from its history (`getHistory`) at once; after that the live values extend it.
 * No chart library: one SVG. A click shows the chart big in an element dialog of the host.
 */
import type { JSX, KeyboardEvent } from 'react';

import { defineWebComponent } from '@iobroker/web-components/element';

import { getTag, type HistoryChartSettings } from './constants';
import { Hint } from './Hint';
import { NAMES } from './names';
import { formatNum } from './nautic';
import { NmeaElement, SYSTEM_CONFIG } from './NmeaElement';

const DEFAULT_HISTORY_SECONDS = 60;
const DEFAULT_DECIMALS = 1;

/** Without a new value for so long, the last one is taken again, so the window keeps moving */
const REPEAT_MS = 2000;

// the chart, in a 600 x 400 viewBox that is stretched to the box
const VIEW_W = 600;
const VIEW_H = 400;
const CHART_TOP = 12;
const CHART_BOTTOM = VIEW_H - 12;

const CSS = `
.chart {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    padding: clamp(4px, 3cqmin, 12px);
    box-sizing: border-box;
    gap: 2px;
}
.header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
}
.label {
    font-size: clamp(11px, 9cqh, 22px);
    font-weight: 600;
    color: var(--iob-text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.value {
    font-size: clamp(16px, 20cqh, 64px);
    font-weight: 800;
    line-height: 1;
    white-space: nowrap;
}
.value .unit {
    font-size: 0.45em;
    font-weight: 500;
    margin-left: 0.2em;
    color: var(--iob-text-secondary);
}
.plot {
    position: relative;
    flex: 1;
    min-height: 0;
}
.plot svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
}
.ref {
    stroke-width: 2px;
    stroke-dasharray: 12 6;
    opacity: 0.85;
}
.ref.min { stroke: #5fb3ff; }
.ref.avg { stroke: var(--iob-text-secondary); }
.ref.max { stroke: #ff9100; }
.pill {
    position: absolute;
    right: 4px;
    transform: translateY(-50%);
    font-size: clamp(9px, 6cqh, 14px);
    padding: 1px 6px;
    border-radius: 999px;
    background: var(--iob-paper);
    border: 1px solid currentColor;
    white-space: nowrap;
    line-height: 1.3;
}
.pill.min { color: #2f8fe0; }
.pill.avg { color: var(--iob-text-secondary); }
.pill.max { color: #e67e00; }
.waiting {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--iob-text-secondary);
    font-size: clamp(11px, 8cqmin, 16px);
}
@container (max-height: 110px) {
    .header { display: none; }
}
@container (max-height: 70px) {
    .pill { display: none; }
}
`;

interface Sample {
    val: number;
    ts: number;
}

interface ChartData {
    /** The polyline, in the viewBox */
    line: string;
    /** The area under it */
    area: string;
    min: number | null;
    avg: number | null;
    max: number | null;
    /** y of a value in the viewBox */
    yFor: (val: number) => number;
}

/**
 * The samples of the window: the one before it interpolated to its left edge, the last one held until now
 *
 * @param samples all samples, ascending
 * @param settings the settings
 * @param now the right edge
 */
function computeChart(samples: Sample[], settings: HistoryChartSettings, now: number): ChartData {
    const windowMs = Math.max(1, settings.historySeconds ?? DEFAULT_HISTORY_SECONDS) * 1000;
    const start = now - windowMs;
    const active = samples.filter(s => s.ts >= start && s.ts <= now);
    const before = [...samples].reverse().find(s => s.ts < start);
    if (samples.length && samples[samples.length - 1].ts < now) {
        active.push({ val: samples[samples.length - 1].val, ts: now });
    }
    if (before && active[0] && before.ts < active[0].ts) {
        const ratio = (start - before.ts) / (active[0].ts - before.ts);
        active.unshift({ val: before.val + (active[0].val - before.val) * ratio, ts: start });
    }

    let min: number | null = null;
    let max: number | null = null;
    let avg: number | null = null;
    if (active.length) {
        min = Math.min(...active.map(s => s.val));
        max = Math.max(...active.map(s => s.val));
        avg = active.reduce((sum, s) => sum + s.val, 0) / active.length;
    }

    // yMin/yMax: exact bounds, or with auto scale only suggestions the data may exceed
    const cfgMin = settings.yMin ?? 0;
    const cfgMax = settings.yMax ?? 0;
    const hasCfgMax = cfgMax > cfgMin;
    let yMin: number;
    let yMax: number;
    if (settings.autoScale ?? true) {
        yMin = Math.min(cfgMin, min ?? cfgMin);
        yMax = Math.max(hasCfgMax ? cfgMax : cfgMin + 1, max !== null ? max * 1.1 : cfgMin + 1);
    } else {
        yMin = cfgMin;
        yMax = hasCfgMax ? cfgMax : cfgMin + 1;
    }
    if (yMax <= yMin) {
        yMax = yMin + 1;
    }
    const xFor = (ts: number): number => ((ts - start) / windowMs) * VIEW_W;
    const yFor = (val: number): number =>
        CHART_BOTTOM - ((Math.max(yMin, Math.min(yMax, val)) - yMin) / (yMax - yMin)) * (CHART_BOTTOM - CHART_TOP);

    const points: string[] = [];
    for (const s of active) {
        const point = `${xFor(s.ts).toFixed(1)},${yFor(s.val).toFixed(1)}`;
        if (points[points.length - 1] !== point) {
            points.push(point);
        }
    }
    let area = '';
    if (points.length) {
        const first = points[0].split(',');
        const last = points[points.length - 1].split(',');
        area = `M ${first[0]},${CHART_BOTTOM} L ${points.join(' L ')} L ${last[0]},${CHART_BOTTOM} Z`;
    }
    return { line: points.join(' '), area, min, avg, max, yFor };
}

class NmeaHistoryChartElement extends NmeaElement<HistoryChartSettings> {
    #samples: Sample[] = [];

    /** The state the samples belong to */
    #samplesOf = '';

    /** The state whose history was asked for */
    #historyOf = '';

    constructor() {
        super(CSS);
        // the chart scrolls with the time
        this.tickMs = 200;
    }

    protected override getStateIds(settings: HistoryChartSettings): string[] {
        return settings.stateId ? [settings.stateId] : [];
    }

    /** Takes the newest value, repeats the last one while none comes and drops what is out of the window */
    #updateSamples(id: string): void {
        if (this.#samplesOf !== id) {
            this.#samplesOf = id;
            this.#samples = [];
        }
        const now = Date.now();
        const state = this.states[id];
        const val = this.num(id);
        const samples = this.#samples;
        const last = samples[samples.length - 1];
        if (val !== null && state?.ts && (!last || state.ts > last.ts)) {
            samples.push({ val, ts: state.ts });
        } else if (last && now - last.ts > REPEAT_MS && val !== null) {
            samples.push({ val: last.val, ts: now });
        }
        // keep the last sample before the window: the left edge is interpolated from it
        const start = now - Math.max(1, this.settings.historySeconds ?? DEFAULT_HISTORY_SECONDS) * 1000;
        const firstInside = samples.findIndex(s => s.ts >= start);
        if (firstInside > 1) {
            samples.splice(0, firstInside - 1);
        }
    }

    /** Fills the window from the default history instance, if it logs the state */
    async #loadHistory(id: string): Promise<void> {
        const socket = this.socket;
        const instance = this.defaultHistory;
        const obj = this.objects[id] as ioBroker.StateObject | null | undefined;
        if (!socket || !instance || !obj?.common?.custom?.[instance]) {
            return;
        }
        const end = Date.now();
        const start = end - Math.max(1, this.settings.historySeconds ?? DEFAULT_HISTORY_SECONDS) * 1000;
        try {
            const rows = await socket.getHistory(id, { instance, start, end, aggregate: 'none' });
            if (this.#samplesOf !== id || !Array.isArray(rows)) {
                return;
            }
            const known = new Set(this.#samples.map(s => s.ts));
            const history: Sample[] = [];
            for (const row of rows) {
                const val = Number(row.val);
                if (Number.isFinite(val) && row.ts && !known.has(row.ts)) {
                    history.push({ val, ts: row.ts });
                }
            }
            this.#samples = [...history, ...this.#samples].sort((a, b) => a.ts - b.ts);
            if (this.isConnected) {
                this.render();
            }
        } catch {
            // no history: the live values fill the chart
        }
    }

    #onOpen = (): void => {
        if (!this.editMode) {
            void this.showElementDialog({
                title: this.#getLabel() || this.text(NAMES['history-chart']),
                css: CSS,
                width: 1000,
                height: 600,
                draw: () => this.#renderChart(),
            });
        }
    };

    #getLabel(): string {
        const settings = this.settings;
        const obj = settings.stateId ? this.objects[settings.stateId] : null;
        return settings.label || (obj?.common?.name ? this.text(obj.common.name) : '');
    }

    #renderChart(): JSX.Element {
        const settings = this.settings;
        const id = settings.stateId || '';
        const obj = this.objects[id] as ioBroker.StateObject | null | undefined;
        const unit = settings.unit || obj?.common?.unit || '';
        const decimals = settings.decimals ?? DEFAULT_DECIMALS;
        const comma = this.isFloatComma;
        const chart = computeChart(this.#samples, settings, Date.now());
        const current = this.#samples.length ? this.#samples[this.#samples.length - 1].val : this.num(id);
        const color = settings.color || 'var(--iob-primary)';
        const refs = (['min', 'avg', 'max'] as const).filter(
            key =>
                chart[key] !== null &&
                (settings[key === 'min' ? 'showMin' : key === 'avg' ? 'showAvg' : 'showMax'] ?? key === 'avg'),
        );
        return (
            <div className="chart">
                <div className="header">
                    <span className="label">{this.#getLabel()}</span>
                    <span
                        className="value"
                        style={{ color }}
                    >
                        {formatNum(current, decimals, comma)}
                        {unit ? <span className="unit">{unit}</span> : null}
                    </span>
                </div>
                <div className="plot">
                    <svg
                        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
                        preserveAspectRatio="none"
                    >
                        {chart.area ? (
                            <path
                                d={chart.area}
                                style={{ fill: color }}
                                fillOpacity={0.22}
                            />
                        ) : null}
                        {chart.line ? (
                            <polyline
                                points={chart.line}
                                fill="none"
                                style={{ stroke: color }}
                                strokeWidth={3}
                                strokeLinejoin="round"
                                strokeLinecap="round"
                                vectorEffect="non-scaling-stroke"
                            />
                        ) : null}
                        {refs.map(key => (
                            <line
                                key={key}
                                className={`ref ${key}`}
                                x1={0}
                                x2={VIEW_W}
                                y1={chart.yFor(chart[key]!)}
                                y2={chart.yFor(chart[key]!)}
                                vectorEffect="non-scaling-stroke"
                            />
                        ))}
                    </svg>
                    {refs.map(key => (
                        <span
                            key={key}
                            className={`pill ${key}`}
                            style={{ top: `${(chart.yFor(chart[key]!) / VIEW_H) * 100}%` }}
                        >
                            {`${this.word(key)} ${formatNum(chart[key], decimals, comma)}`}
                        </span>
                    ))}
                    {chart.line ? null : <div className="waiting">{this.word('waiting')}</div>}
                </div>
            </div>
        );
    }

    protected override renderContent(): JSX.Element {
        const id = this.settings.stateId;
        if (!id) {
            return (
                <Hint
                    text={this.word('chooseState')}
                    editMode={this.editMode}
                />
            );
        }
        this.#updateSamples(id);
        // once the object of the state and system.config are there: does the default history log the state?
        if (
            this.#historyOf !== id &&
            this.socket &&
            this.objects[id] !== undefined &&
            this.objects[SYSTEM_CONFIG] !== undefined
        ) {
            this.#historyOf = id;
            void this.#loadHistory(id);
        }
        return (
            <div
                className={`fill${this.editMode ? ' edit' : ' clickable'}`}
                role="button"
                tabIndex={this.editMode ? undefined : 0}
                onClick={this.#onOpen}
                onKeyDown={(e: KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        this.#onOpen();
                    }
                }}
            >
                {this.#renderChart()}
            </div>
        );
    }
}

defineWebComponent(getTag('history-chart'), NmeaHistoryChartElement);
