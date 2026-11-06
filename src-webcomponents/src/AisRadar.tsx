/**
 * The AIS radar as a web component: `<iob-nmea-ais-radar>` - the web component of the devices widget
 * "NMEA AIS Radar" (`src-devices/src/NmeaAisRadarComponent.tsx`).
 *
 * The own boat in the middle of a dark sea chart, range rings, and the AIS targets around it: chevrons in a color
 * of their own (squares for aids to navigation), their trails and their COG vectors; north up or course up. A
 * click shows the radar big in an element dialog of the host, with buttons for the range and the orientation (the
 * wheel zooms there too).
 *
 * The adapter writes every AIS target as one state with the canboat fields as JSON
 * (`<instance>.aisClassAPositionReport.<MMSI>`, ...). The native widget reads all objects to find them; the
 * element asks only for the states below these channels (`getObjectViewSystem`), again every minute for new ones.
 * The map is drawn from tiles (`MapTiles.tsx`), without Leaflet.
 */
import type { JSX, KeyboardEvent, WheelEvent } from 'react';

import { defineWebComponent } from '@iobroker/web-components/element';

import { type AisRadarSettings, getTag } from './constants';
import { Hint } from './Hint';
import { MapTiles, TILE_SOURCES } from './MapTiles';
import { NAMES } from './names';
import { formatNum, M_PER_NM, MS_TO_KN, normDeg, projectToMeters } from './nautic';
import { NmeaElement } from './NmeaElement';

const DEFAULT_RANGE_NM = 6;
const DEFAULT_VECTOR_MINUTES = 6;
const DEFAULT_STALE_MINUTES = 10;
const RANGE_PRESETS_NM = [1, 1.5, 2, 3, 6, 12, 24, 48];

/** The channels of AIS targets with a position (`WELL_KNOWN_AIS_GROUPS` of the adapter) */
const AIS_GROUPS = [
    'aisClassAPositionReport',
    'aisClassBPositionReport',
    'aisAidsToNavigationAtonReport',
    'aisUtcAndDateReport',
];

/** New targets are looked for this often */
const DISCOVERY_MS = 60_000;
const TRAIL_MAX_POINTS = 60;
const TRAIL_MAX_AGE_MS = 30 * 60_000;
const RAD_TO_DEG = 180 / Math.PI;

const VIEWBOX = 1000;
const CENTER = VIEWBOX / 2;
const R_OUTER = 470;
const RING_FRACTIONS = [0.25, 0.5, 0.75, 1];

const COLORS = {
    face: '#000000',
    badge: '#0E1F2A',
    grey: '#5C6E80',
    contrast: '#FFFFFF',
    dim: '#7E8A99',
    own: '#3a8dff',
    north: '#3a8dff',
    south: '#ff3b3b',
} as const;

const CSS = `
.radar {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
}
.radar .plot {
    position: relative;
    flex: 1;
    min-height: 0;
}
.radar svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
}
.count {
    fill: var(--iob-text-secondary);
}
.toolbar {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 8px;
    padding: 8px;
}
.toolbar .range {
    min-width: 72px;
    text-align: center;
    font-weight: 700;
}
`;

type AisClass = 'A' | 'B' | 'AtoN' | 'SAR' | 'Other';

interface AisTarget {
    mmsi: string;
    lat: number;
    lon: number;
    /** degrees; NaN if unknown */
    cog: number;
    /** knots */
    sog: number;
    cls: AisClass;
    name: string;
    lastSeen: number;
    trail: { lat: number; lon: number; ts: number }[];
}

/** A hue per MMSI: neighbouring numbers land far apart on the color wheel */
function shipColor(mmsi: string): string {
    let h = 0;
    for (let i = 0; i < mmsi.length; i++) {
        h = Math.imul(h ^ mmsi.charCodeAt(i), 2_654_435_761) | 0;
    }
    return `hsl(${((h % 360) + 360) % 360} 75% 62%)`;
}

function classify(id: string): AisClass {
    if (id.includes('aisAidsToNavigation')) {
        return 'AtoN';
    }
    if (id.includes('SafetyRelatedBroadcast') || id.includes('SARAircraft')) {
        return 'SAR';
    }
    if (id.includes('aisClassA')) {
        return 'A';
    }
    if (id.includes('aisClassB')) {
        return 'B';
    }
    return 'Other';
}

/** "5 minutes ago" in the language of the system */
function formatSeen(ts: number, now: number, lang: string): string {
    const seconds = Math.round((ts - now) / 1000);
    try {
        const format = new Intl.RelativeTimeFormat(lang === 'zh-cn' ? 'zh-CN' : lang, { numeric: 'auto' });
        if (seconds > -60) {
            return format.format(seconds, 'second');
        }
        if (seconds > -3600) {
            return format.format(Math.round(seconds / 60), 'minute');
        }
        return format.format(Math.round(seconds / 3600), 'hour');
    } catch {
        return new Date(ts).toLocaleTimeString();
    }
}

let uidCounter = 0;

class NmeaAisRadarElement extends NmeaElement<AisRadarSettings> {
    /** The AIS states of the instance `#aisInstance` */
    #aisIds: string[] = [];

    #aisInstance = '';

    /** For which socket and instance the AIS states were looked for */
    #discoveredSocket: unknown = null;

    #discoveredInstance = '';

    #discoveryTimer: ReturnType<typeof setInterval> | null = null;

    readonly #targets = new Map<string, AisTarget>();

    readonly #uid = `nmea-ais-${++uidCounter}`;

    /** The time stamp of the last value taken per AIS state */
    readonly #taken = new Map<string, number>();

    /** Range and orientation chosen in the dialog; null: those of the settings */
    #range: number | null = null;

    #courseUp: boolean | null = null;

    constructor() {
        super(CSS);
        // many targets: draw at most 4 times a second
        this.throttleMs = 250;
        // the times of "seen" and the targets that are too old
        this.tickMs = 10_000;
    }

    override connectedCallback(): void {
        super.connectedCallback();
        this.#discoveryTimer ||= setInterval(() => void this.#discover(), DISCOVERY_MS);
    }

    override disconnectedCallback(): void {
        super.disconnectedCallback();
        if (this.#discoveryTimer) {
            clearInterval(this.#discoveryTimer);
            this.#discoveryTimer = null;
        }
        this.#discoveredSocket = null;
    }

    protected override getStateIds(settings: AisRadarSettings): string[] {
        const instance = settings.instance;
        if (!instance) {
            return [];
        }
        return [
            `${instance}.gnssPositionData.latitude`,
            `${instance}.gnssPositionData.longitude`,
            `${instance}.vesselHeading.headingTrue`,
            `${instance}.cogSogRapidUpdate.cogTrue`,
            `${instance}.cogSogRapidUpdate.cog`,
            ...(this.#aisInstance === instance ? this.#aisIds : []),
        ];
    }

    /** Looks for the AIS states below the channels of the adapter */
    async #discover(): Promise<void> {
        const socket = this.socket;
        const instance = this.settings.instance;
        if (!socket || !instance) {
            return;
        }
        const ids: string[] = [];
        for (const group of AIS_GROUPS) {
            const prefix = `${instance}.${group}.`;
            try {
                const objects = await socket.getObjectViewSystem('state', prefix, `${prefix}香`);
                ids.push(...Object.keys(objects || {}));
            } catch {
                // no such channel
            }
        }
        if (socket !== this.socket || instance !== this.settings.instance) {
            return;
        }
        ids.sort();
        if (instance !== this.#aisInstance || ids.join() !== this.#aisIds.join()) {
            this.#aisIds = ids;
            this.#aisInstance = instance;
            // the base class asks `getStateIds()` again when the settings are set
            const settings = this.settings;
            this.settings = settings;
        }
    }

    /** Takes the new values of the AIS states into the targets */
    #updateTargets(): void {
        for (const id of this.#aisIds) {
            const state = this.states[id];
            if (!state?.val || this.#taken.get(id) === state.ts) {
                continue;
            }
            this.#taken.set(id, state.ts);
            // the adapter writes the fields of the PGN as JSON
            const val: unknown = state.val;
            let fields: Record<string, unknown>;
            if (typeof val === 'string') {
                try {
                    fields = JSON.parse(val) as Record<string, unknown>;
                } catch {
                    continue;
                }
            } else if (val && typeof val === 'object') {
                fields = val as Record<string, unknown>;
            } else {
                continue;
            }
            const userId = fields.userId;
            const mmsi =
                typeof userId === 'number' || typeof userId === 'string' ? String(userId) : id.split('.').pop() || '';
            const lat = Number(fields.latitude);
            const lon = Number(fields.longitude);
            if (!mmsi || !Number.isFinite(lat) || !Number.isFinite(lon)) {
                continue;
            }
            // canboat reports angles in radians and speeds in m/s
            const cogRaw = Number(fields.cog ?? fields.courseOverGroundReference);
            const sogRaw = Number(fields.sog);
            const objName = this.objects[id]?.common?.name;
            const name =
                (typeof fields.name === 'string' && fields.name.trim()) ||
                (typeof fields.callsign === 'string' && fields.callsign.trim()) ||
                (objName ? this.text(objName) : '');
            const ts = state.ts || Date.now();
            const existing = this.#targets.get(mmsi);
            const trail = (existing?.trail || []).filter(p => p.ts >= ts - TRAIL_MAX_AGE_MS);
            const last = trail[trail.length - 1];
            if (!last || Math.abs(last.lat - lat) >= 5e-5 || Math.abs(last.lon - lon) >= 5e-5 || ts - last.ts >= 1000) {
                trail.push({ lat, lon, ts });
            }
            this.#targets.set(mmsi, {
                mmsi,
                lat,
                lon,
                cog: Number.isFinite(cogRaw) ? normDeg(cogRaw * RAD_TO_DEG) : NaN,
                sog: Number.isFinite(sogRaw) ? sogRaw * MS_TO_KN : 0,
                cls: classify(id),
                name,
                lastSeen: ts,
                trail: trail.slice(-TRAIL_MAX_POINTS),
            });
        }
        // forget what has not been seen for long
        const cutoff = Date.now() - 2 * (this.settings.staleMinutes || DEFAULT_STALE_MINUTES) * 60_000;
        for (const [mmsi, target] of this.#targets) {
            if (target.lastSeen < cutoff) {
                this.#targets.delete(mmsi);
            }
        }
    }

    get #rangeNm(): number {
        return this.#range ?? (this.settings.rangeNm || DEFAULT_RANGE_NM);
    }

    /** The next preset range: 1 farther, -1 closer */
    #zoom(direction: 1 | -1): void {
        const current = this.#rangeNm;
        const larger = RANGE_PRESETS_NM.filter(r => r > current);
        const smaller = RANGE_PRESETS_NM.filter(r => r < current);
        this.#range = (direction > 0 ? larger[0] : smaller[smaller.length - 1]) ?? current;
        this.render();
    }

    #onWheel = (e: WheelEvent): void => {
        if (e.deltaY) {
            this.#zoom(e.deltaY > 0 ? 1 : -1);
        }
    };

    #onOpen = (): void => {
        if (this.editMode) {
            return;
        }
        void this.showElementDialog({
            title: this.text(NAMES['ais-radar']),
            css: CSS,
            width: 760,
            height: 840,
            draw: () => {
                const courseUp = this.#courseUp ?? !!this.settings.courseUp;
                return (
                    <div className="radar">
                        <div
                            className="plot"
                            onWheel={this.#onWheel}
                        >
                            {this.#renderRadar()}
                        </div>
                        <div className="toolbar">
                            <button
                                type="button"
                                className="btn"
                                title={this.word('zoomIn')}
                                disabled={this.#rangeNm <= RANGE_PRESETS_NM[0]}
                                onClick={() => this.#zoom(-1)}
                            >
                                −
                            </button>
                            <span className="range">{`${formatNum(this.#rangeNm, this.#rangeNm % 1 ? 1 : 0, this.isFloatComma)} NM`}</span>
                            <button
                                type="button"
                                className="btn"
                                title={this.word('zoomOut')}
                                disabled={this.#rangeNm >= RANGE_PRESETS_NM[RANGE_PRESETS_NM.length - 1]}
                                onClick={() => this.#zoom(1)}
                            >
                                +
                            </button>
                            <button
                                type="button"
                                className="btn"
                                onClick={() => {
                                    this.#courseUp = !courseUp;
                                    this.render();
                                }}
                            >
                                {courseUp ? this.word('courseUp') : this.word('northUp')}
                            </button>
                        </div>
                    </div>
                );
            },
        }).finally(() => {
            // the tile shows the range and orientation of the settings again
            this.#range = null;
            this.#courseUp = null;
            if (this.isConnected) {
                this.render();
            }
        });
    };

    #renderRadar(): JSX.Element {
        const settings = this.settings;
        const instance = settings.instance || '';
        const rangeNm = this.#rangeNm;
        const courseUp = this.#courseUp ?? !!settings.courseUp;
        const showVectors = settings.showVectors ?? true;
        const vectorMinutes = settings.vectorMinutes || DEFAULT_VECTOR_MINUTES;
        const staleMs = (settings.staleMinutes || DEFAULT_STALE_MINUTES) * 60_000;
        const ownMmsi = (settings.ownMmsi || '').trim();
        const comma = this.isFloatComma;
        const lang = this.systemLang;
        const now = Date.now();

        const ownLat = this.num(`${instance}.gnssPositionData.latitude`);
        const ownLon = this.num(`${instance}.gnssPositionData.longitude`);
        const ownCog =
            this.num(`${instance}.cogSogRapidUpdate.cogTrue`) ?? this.num(`${instance}.cogSogRapidUpdate.cog`);
        const ownHeading = this.num(`${instance}.vesselHeading.headingTrue`) ?? ownCog;
        const upRotation = courseUp && ownHeading !== null ? -ownHeading : 0;
        const haveOwn = ownLat !== null && ownLon !== null;
        const unitsPerNm = R_OUTER / rangeNm;

        const plotted: JSX.Element[] = [];
        if (ownLat !== null && ownLon !== null) {
            const toXY = (lat: number, lon: number): { x: number; y: number } => {
                const { east, north } = projectToMeters(lat, lon, ownLat, ownLon);
                return { x: CENTER + (east / M_PER_NM) * unitsPerNm, y: CENTER - (north / M_PER_NM) * unitsPerNm };
            };
            for (const t of this.#targets.values()) {
                if (now - t.lastSeen > staleMs || (ownMmsi && t.mmsi === ownMmsi)) {
                    continue;
                }
                const { x, y } = toXY(t.lat, t.lon);
                if ((x - CENTER) ** 2 + (y - CENTER) ** 2 > R_OUTER ** 2) {
                    continue;
                }
                const color = shipColor(t.mmsi);
                const trail = t.trail.length >= 2 ? t.trail.map(p => toXY(p.lat, p.lon)) : [];
                let vector: JSX.Element | null = null;
                if (showVectors && Number.isFinite(t.cog) && t.sog > 0.3) {
                    const length = ((t.sog * vectorMinutes) / 60) * unitsPerNm;
                    vector = (
                        <line
                            x1={x}
                            y1={y}
                            x2={x + length * Math.sin(t.cog / RAD_TO_DEG)}
                            y2={y - length * Math.cos(t.cog / RAD_TO_DEG)}
                            stroke={color}
                            strokeWidth={2}
                            strokeDasharray="4 4"
                            opacity={0.85}
                        />
                    );
                }
                const info = [t.name, `MMSI ${t.mmsi}`];
                if (Number.isFinite(t.cog)) {
                    info.push(`COG ${Math.round(t.cog)}°`);
                }
                if (t.sog > 0.1) {
                    info.push(`SOG ${formatNum(t.sog, 1, comma)} kn`);
                }
                info.push(`${this.word('seen')} ${formatSeen(t.lastSeen, now, lang)}`);
                plotted.push(
                    <g key={t.mmsi}>
                        <title>{info.filter(Boolean).join(' · ')}</title>
                        {trail.length ? (
                            <polyline
                                points={trail.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
                                fill="none"
                                stroke={color}
                                strokeWidth={2}
                                strokeLinejoin="round"
                                opacity={0.65}
                            />
                        ) : null}
                        {vector}
                        <g transform={`translate(${x} ${y}) rotate(${Number.isFinite(t.cog) ? t.cog : 0})`}>
                            {t.cls === 'AtoN' ? (
                                <rect
                                    x={-7}
                                    y={-7}
                                    width={14}
                                    height={14}
                                    fill={color}
                                    stroke="#000"
                                    strokeWidth={1}
                                />
                            ) : (
                                <path
                                    d="M 0 -14 L 8 10 L 0 5 L -8 10 Z"
                                    fill={color}
                                    stroke="#000"
                                    strokeWidth={1}
                                />
                            )}
                        </g>
                    </g>,
                );
            }
        }
        const total = [...this.#targets.values()].filter(t => now - t.lastSeen <= staleMs).length;
        const clipId = this.#uid;

        return (
            <svg
                viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
                preserveAspectRatio="xMidYMid meet"
            >
                <defs>
                    <clipPath id={clipId}>
                        <circle
                            cx={CENTER}
                            cy={CENTER}
                            r={R_OUTER}
                        />
                    </clipPath>
                    <radialGradient
                        id={`${clipId}-vignette`}
                        cx="50%"
                        cy="50%"
                        r="50%"
                    >
                        <stop
                            offset="0"
                            stopColor="rgba(0,0,0,0)"
                        />
                        <stop
                            offset="0.7"
                            stopColor="rgba(0,0,0,0.15)"
                        />
                        <stop
                            offset="1"
                            stopColor="rgba(0,0,0,0.45)"
                        />
                    </radialGradient>
                </defs>
                <circle
                    cx={CENTER}
                    cy={CENTER}
                    r={R_OUTER}
                    fill={COLORS.face}
                />
                {ownLat !== null && ownLon !== null ? (
                    <g clipPath={`url(#${clipId})`}>
                        <g transform={`rotate(${upRotation} ${CENTER} ${CENTER})`}>
                            <MapTiles
                                source={TILE_SOURCES.dark}
                                lat={ownLat}
                                lon={ownLon}
                                cx={CENTER}
                                cy={CENTER}
                                metersPerUnit={(rangeNm * M_PER_NM) / R_OUTER}
                                x0={CENTER - R_OUTER}
                                y0={CENTER - R_OUTER}
                                x1={CENTER + R_OUTER}
                                y1={CENTER + R_OUTER}
                                radius={R_OUTER}
                            />
                        </g>
                    </g>
                ) : null}
                <circle
                    cx={CENTER}
                    cy={CENTER}
                    r={R_OUTER}
                    fill={`url(#${clipId}-vignette)`}
                    stroke={COLORS.dim}
                    strokeWidth={2}
                />
                <g transform={`rotate(${upRotation} ${CENTER} ${CENTER})`}>
                    {RING_FRACTIONS.map(f => (
                        <g key={f}>
                            <circle
                                cx={CENTER}
                                cy={CENTER}
                                r={R_OUTER * f}
                                fill="none"
                                stroke={COLORS.grey}
                                strokeWidth={1.5}
                                strokeDasharray="4 6"
                                opacity={0.7}
                            />
                            <text
                                x={CENTER}
                                y={CENTER - R_OUTER * f + 18}
                                fill={COLORS.dim}
                                fontSize={20}
                                textAnchor="middle"
                            >
                                {`${formatNum(rangeNm * f, f === 1 ? 0 : 1, comma)} NM`}
                            </text>
                        </g>
                    ))}
                    <line
                        x1={CENTER - R_OUTER}
                        y1={CENTER}
                        x2={CENTER + R_OUTER}
                        y2={CENTER}
                        stroke={COLORS.grey}
                        opacity={0.5}
                    />
                    <line
                        x1={CENTER}
                        y1={CENTER - R_OUTER}
                        x2={CENTER}
                        y2={CENTER + R_OUTER}
                        stroke={COLORS.grey}
                        opacity={0.5}
                    />
                    {[
                        { angle: 0, text: 'N', fill: COLORS.north },
                        { angle: 90, text: 'E', fill: COLORS.contrast },
                        { angle: 180, text: 'S', fill: COLORS.south },
                        { angle: 270, text: 'W', fill: COLORS.contrast },
                    ].map(c => {
                        const tx = CENTER + Math.sin(c.angle / RAD_TO_DEG) * (R_OUTER - 28);
                        const ty = CENTER - Math.cos(c.angle / RAD_TO_DEG) * (R_OUTER - 28);
                        return (
                            <text
                                key={c.text}
                                x={tx}
                                y={ty}
                                fill={c.fill}
                                fontSize={32}
                                fontWeight={700}
                                textAnchor="middle"
                                dominantBaseline="central"
                                transform={`rotate(${-upRotation} ${tx} ${ty})`}
                            >
                                {c.text}
                            </text>
                        );
                    })}
                    {plotted}
                </g>
                {haveOwn ? (
                    <g transform={`translate(${CENTER} ${CENTER}) rotate(${courseUp ? 0 : (ownHeading ?? 0)})`}>
                        <path
                            d="M 0 -22 L 14 18 L 0 10 L -14 18 Z"
                            fill={COLORS.own}
                            stroke="#000"
                            strokeWidth={1.5}
                        />
                    </g>
                ) : (
                    <text
                        x={CENTER}
                        y={CENTER}
                        fill={COLORS.contrast}
                        fontSize={36}
                        textAnchor="middle"
                        dominantBaseline="central"
                    >
                        {this.word('noPosition')}
                    </text>
                )}
                <rect
                    x={20}
                    y={20}
                    width={130}
                    height={48}
                    rx={6}
                    fill={COLORS.badge}
                    fillOpacity={0.85}
                    stroke={COLORS.dim}
                />
                <text
                    x={85}
                    y={52}
                    fill={COLORS.contrast}
                    fontSize={26}
                    fontWeight={700}
                    textAnchor="middle"
                >
                    {`${formatNum(rangeNm, rangeNm % 1 ? 1 : 0, comma)} NM`}
                </text>
                <rect
                    x={VIEWBOX - 150}
                    y={20}
                    width={130}
                    height={48}
                    rx={6}
                    fill={COLORS.badge}
                    fillOpacity={0.85}
                    stroke={COLORS.dim}
                />
                <text
                    x={VIEWBOX - 85}
                    y={52}
                    fill={COLORS.contrast}
                    fontSize={22}
                    fontWeight={700}
                    textAnchor="middle"
                >
                    {courseUp ? 'C-Up' : 'N-Up'}
                </text>
                <text
                    className="count"
                    x={VIEWBOX - 30}
                    y={VIEWBOX - 30}
                    fontSize={22}
                    textAnchor="end"
                >
                    {`${plotted.length} / ${total} ${this.word('targets')}`}
                </text>
                <text
                    className="count"
                    x={30}
                    y={VIEWBOX - 30}
                    fontSize={14}
                    opacity={0.7}
                >
                    {haveOwn ? TILE_SOURCES.dark.attribution : ''}
                </text>
            </svg>
        );
    }

    protected override renderContent(): JSX.Element {
        const instance = this.settings.instance;
        if (!instance) {
            return (
                <Hint
                    text={this.word('chooseInstance')}
                    editMode={this.editMode}
                />
            );
        }
        if (this.socket && (this.#discoveredSocket !== this.socket || this.#discoveredInstance !== instance)) {
            this.#discoveredSocket = this.socket;
            this.#discoveredInstance = instance;
            void this.#discover();
        }
        this.#updateTargets();
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
                <div className="radar">
                    <div className="plot">{this.#renderRadar()}</div>
                </div>
            </div>
        );
    }
}

defineWebComponent(getTag('ais-radar'), NmeaAisRadarElement);
