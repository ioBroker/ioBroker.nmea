/**
 * The anchorage as a web component: `<iob-nmea-anchor-position>` - the web component of the devices widget
 * "NMEA Anchor Position" (`src-devices/src/NmeaAnchorPositionComponent.tsx`).
 *
 * A map (or satellite picture) with the anchor, the boat, the rode between them, the swing circle of the chain,
 * the circle of the anchor alarm and the track of the last two hours, which comes from the default history
 * instance (`getHistory`) when it logs the position. The distance from the anchor turns red outside the swing
 * circle. A click opens an element dialog of the host with the controls of the native widget: map or satellite,
 * zoom, "anchor here" (writes the position of the boat as the anchor position), the alarm radius and the switch
 * that arms the anchor alarm of the adapter (`anchorAlarm.isActive`).
 *
 * The map is drawn from tiles (`MapTiles.tsx`), without Leaflet; it shows anchor and boat with their circles in
 * the middle of the box, whatever its shape.
 */
import type { JSX, KeyboardEvent } from 'react';

import { defineWebComponent } from '@iobroker/web-components/element';

import { type AnchorPositionSettings, getTag } from './constants';
import { Hint } from './Hint';
import { MapTiles, TILE_SOURCES } from './MapTiles';
import { NAMES } from './names';
import { formatNum, haversine, projectToMeters } from './nautic';
import { NmeaElement, SYSTEM_CONFIG } from './NmeaElement';

/** The track: the last two hours */
const TRAIL_WINDOW_MS = 2 * 60 * 60 * 1000;

/**
 * The map is 1000 x 1000 units, cut to the shape of the box (`slice`): of a box up to 2.5 times as wide as high (or
 * the other way round) the middle 400 x 400 are always visible. Anchor, boat and circles are fitted into them.
 */
const VIEW = 1000;
const CENTER = VIEW / 2;
const FIT_UNITS = 190;
/** The closest zoom: about 0.15 m per unit */
const MIN_M_PER_UNIT = 0.15;

const COLORS = {
    anchor: '#ff5252',
    boat: '#3a8dff',
    chain: '#ffeb3b',
    swing: '#ffeb3b',
    trail: '#ff1744',
    alarm: '#00e676',
    tripped: '#ff1744',
} as const;

/** Material Design "anchor" */
const ANCHOR_PATH =
    'M12,2A3,3 0 0,0 9,5C9,6.27 9.8,7.4 11,7.83V10H8V12H11V18.92C9.16,18.65 7.53,17.73 6.34,16.34L8,15L4,13V16.5L5.5,15.5C7,17.55 9.38,19 12,19C14.62,19 17,17.55 18.5,15.5L20,16.5V13L16,15L17.66,16.34C16.47,17.73 14.84,18.65 13,18.92V12H16V10H13V7.83C14.2,7.4 15,6.27 15,5A3,3 0 0,0 12,2M12,4A1,1 0 0,1 13,5A1,1 0 0,1 12,6A1,1 0 0,1 11,5A1,1 0 0,1 12,4Z';
/** A sailing boat */
const BOAT_PATH = 'M11 3 4 15h7V3zm2 1v11h7L13 4zM3 17l1.5 3h15l1.5-3H3z';

const CSS = `
.anchorage {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
}
.map {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    border-radius: var(--iob-border-radius, 4px);
}
.map svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    background: #aac3d4;
}
.readouts {
    position: absolute;
    top: 6px;
    left: 6px;
    right: 6px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    pointer-events: none;
}
.box {
    background: rgba(0, 0, 0, 0.6);
    color: #fff;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 6px;
    padding: 2px 8px;
}
.box .label { font-size: 11px; font-weight: 600; opacity: 0.75; }
.box .value { font-size: clamp(16px, 9cqmin, 26px); font-weight: 800; line-height: 1.05; }
.box.far { color: #ff5252; }
.box.tripped { background: rgba(198, 40, 40, 0.85); }
.details {
    display: flex;
    gap: 12px;
    font-size: 12px;
}
.message {
    position: absolute;
    left: 50%;
    bottom: 10%;
    transform: translateX(-50%);
    white-space: nowrap;
}
.attribution {
    position: absolute;
    right: 4px;
    bottom: 2px;
    font-size: 10px;
    color: #333;
    background: rgba(255, 255, 255, 0.6);
    padding: 0 3px;
    pointer-events: none;
}
.controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 8px;
}
.controls label {
    display: flex;
    align-items: center;
    gap: 6px;
}
.controls input[type='number'] {
    width: 80px;
    font: inherit;
    padding: 6px;
    border-radius: var(--iob-border-radius, 4px);
    border: 1px solid var(--iob-divider);
    background: transparent;
    color: inherit;
}
.controls input[type='checkbox'] {
    width: 20px;
    height: 20px;
    accent-color: ${COLORS.alarm};
}
.controls .alarm {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px;
    border: 1px solid var(--iob-divider);
    border-radius: var(--iob-border-radius, 4px);
}
.controls .alarm.armed {
    border-color: ${COLORS.alarm};
}
.selected {
    background: var(--iob-primary) !important;
    border-color: var(--iob-primary) !important;
    color: var(--iob-primary-contrast, #fff) !important;
}
@container (max-height: 200px) {
    .details { display: none; }
}
`;

interface Point {
    lat: number;
    lon: number;
}

interface TrailPoint extends Point {
    ts: number;
}

/** "lat;lon" */
function parseLatLon(val: ioBroker.StateValue | undefined): Point | null {
    if (typeof val !== 'string') {
        return null;
    }
    const parts = val.split(/[;,]/).map(part => parseFloat(part.trim()));
    if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) {
        return null;
    }
    return { lat: parts[0], lon: parts[1] };
}

/** The horizontal radius the boat can swing around the anchor: the rode is the hypotenuse over the depth */
function swingRadius(chain: number, depth: number | null): number {
    if (depth === null || depth <= 0 || depth >= chain) {
        return chain;
    }
    return Math.sqrt(chain * chain - depth * depth);
}

/** The IDs of the states of the settings */
interface AnchorIds {
    anchorPosition: string;
    anchorLat: string;
    anchorLon: string;
    boatLat: string;
    boatLon: string;
    chainLength: string;
    depthAtDrop: string;
    depth: string;
    alarmRadius: string;
    isAlarm: string;
    isActive: string;
}

function getIds(settings: AnchorPositionSettings): AnchorIds | null {
    const instance = settings.instance;
    if (!instance) {
        return null;
    }
    const separate = !settings.anchorPosition && !!settings.anchorLat && !!settings.anchorLon;
    return {
        // without a setting: the anchor position the anchor alarm of the adapter uses
        anchorPosition: separate ? '' : settings.anchorPosition || `${instance}.anchorAlarm.anchorPosition`,
        anchorLat: separate ? settings.anchorLat || '' : '',
        anchorLon: separate ? settings.anchorLon || '' : '',
        boatLat: settings.positionLat || `${instance}.gnssPositionData.latitude`,
        boatLon: settings.positionLon || `${instance}.gnssPositionData.longitude`,
        chainLength: settings.chainLength || '',
        depthAtDrop: settings.depthAtDrop || '',
        depth: `${instance}.waterDepth.depth`,
        alarmRadius: `${instance}.anchorAlarm.alarmRadius`,
        isAlarm: `${instance}.anchorAlarm.isAlarm`,
        isActive: `${instance}.anchorAlarm.isActive`,
    };
}

class NmeaAnchorPositionElement extends NmeaElement<AnchorPositionSettings> {
    #trail: TrailPoint[] = [];

    /** The position states the trail belongs to */
    #trailOf = '';

    /** The position states whose history was asked for */
    #historyOf = '';

    /** Chosen in the dialog; null: that of the settings */
    #mapStyle: 'osm' | 'satellite' | null = null;

    /** Zoom of the dialog: 0 fits anchor and boat, each step doubles */
    #zoom = 0;

    constructor() {
        super(CSS);
    }

    protected override getStateIds(settings: AnchorPositionSettings): string[] {
        const ids = getIds(settings);
        return ids ? Object.values(ids).filter(Boolean) : [];
    }

    #getAnchor(ids: AnchorIds): Point | null {
        if (ids.anchorPosition) {
            return parseLatLon(this.states[ids.anchorPosition]?.val);
        }
        const lat = this.num(ids.anchorLat);
        const lon = this.num(ids.anchorLon);
        return lat !== null && lon !== null ? { lat, lon } : null;
    }

    #getBoat(ids: AnchorIds): Point | null {
        const lat = this.num(ids.boatLat);
        const lon = this.num(ids.boatLon);
        return lat !== null && lon !== null && (lat || lon) ? { lat, lon } : null;
    }

    /** Extends the track with the newest position */
    #updateTrail(ids: AnchorIds): void {
        const key = `${ids.boatLat}|${ids.boatLon}`;
        if (this.#trailOf !== key) {
            this.#trailOf = key;
            this.#trail = [];
        }
        const boat = this.#getBoat(ids);
        const now = Date.now();
        let trail = this.#trail.filter(p => p.ts >= now - TRAIL_WINDOW_MS);
        const last = trail[trail.length - 1];
        if (boat && (!last || last.lat !== boat.lat || last.lon !== boat.lon)) {
            const ts = Math.max(this.states[ids.boatLat]?.ts || 0, this.states[ids.boatLon]?.ts || 0) || now;
            trail = [...trail, { ...boat, ts }];
        }
        this.#trail = trail;
    }

    /** The track of the last two hours from the default history instance, if it logs latitude and longitude */
    async #loadHistory(ids: AnchorIds): Promise<void> {
        const socket = this.socket;
        const instance = this.defaultHistory;
        const latObj = this.objects[ids.boatLat] as ioBroker.StateObject | null | undefined;
        const lonObj = this.objects[ids.boatLon] as ioBroker.StateObject | null | undefined;
        if (!socket || !instance || !latObj?.common?.custom?.[instance] || !lonObj?.common?.custom?.[instance]) {
            return;
        }
        const key = this.#trailOf;
        try {
            const alive = await socket.getState(`system.adapter.${instance}.alive`);
            if (!alive?.val) {
                return;
            }
            const end = Date.now();
            const start = end - TRAIL_WINDOW_MS;
            const [latRows, lonRows] = await Promise.all([
                socket.getHistory(ids.boatLat, { instance, start, end, aggregate: 'none' }),
                socket.getHistory(ids.boatLon, { instance, start, end, aggregate: 'none' }),
            ]);
            if (key !== this.#trailOf || !Array.isArray(latRows) || !Array.isArray(lonRows)) {
                return;
            }
            // latitude and longitude come in the same telegram: pair them by the second
            const latBySecond = new Map<number, number>();
            for (const row of latRows) {
                const lat = Number(row.val);
                if (Number.isFinite(lat) && row.ts) {
                    latBySecond.set(Math.floor(row.ts / 1000), lat);
                }
            }
            const known = new Set(this.#trail.map(p => p.ts));
            const history: TrailPoint[] = [];
            for (const row of lonRows) {
                const lon = Number(row.val);
                const lat = row.ts ? latBySecond.get(Math.floor(row.ts / 1000)) : undefined;
                if (Number.isFinite(lon) && lat !== undefined && row.ts && !known.has(row.ts)) {
                    history.push({ lat, lon, ts: row.ts });
                }
            }
            this.#trail = [...history, ...this.#trail].sort((a, b) => a.ts - b.ts);
            if (this.isConnected) {
                this.render();
            }
        } catch {
            // no history: the live positions make the track
        }
    }

    /** "Anchor here": the position of the boat becomes the anchor position */
    #dropHere(ids: AnchorIds): void {
        const boat = this.#getBoat(ids);
        if (!boat) {
            return;
        }
        if (ids.anchorPosition) {
            void this.setState(ids.anchorPosition, `${boat.lat};${boat.lon}`);
        } else {
            void this.setState(ids.anchorLat, boat.lat);
            void this.setState(ids.anchorLon, boat.lon);
        }
    }

    #commitRadius(ids: AnchorIds, text: string): void {
        const radius = Number(text.replace(',', '.'));
        if (text.trim() && Number.isFinite(radius) && radius >= 1 && Math.round(radius) !== this.num(ids.alarmRadius)) {
            void this.setState(ids.alarmRadius, Math.round(radius));
        }
    }

    #onOpen = (): void => {
        const ids = getIds(this.settings);
        if (this.editMode || !ids) {
            return;
        }
        void this.showElementDialog({
            title: this.text(NAMES['anchor-position']),
            css: CSS,
            width: 900,
            height: 760,
            draw: () => {
                const style = this.#mapStyle || this.settings.mapStyle || 'osm';
                const radius = this.num(ids.alarmRadius);
                const armed = this.states[ids.isActive]?.val === true;
                return (
                    <div className="anchorage">
                        {this.#renderMap(ids, true)}
                        <div className="controls">
                            <span>
                                <button
                                    type="button"
                                    className={`btn${style === 'osm' ? ' selected' : ''}`}
                                    onClick={() => {
                                        this.#mapStyle = 'osm';
                                        this.render();
                                    }}
                                >
                                    {this.word('map')}
                                </button>
                                <button
                                    type="button"
                                    className={`btn${style === 'satellite' ? ' selected' : ''}`}
                                    onClick={() => {
                                        this.#mapStyle = 'satellite';
                                        this.render();
                                    }}
                                >
                                    {this.word('satellite')}
                                </button>
                            </span>
                            <span>
                                <button
                                    type="button"
                                    className="btn"
                                    title={this.word('zoomOut')}
                                    onClick={() => {
                                        this.#zoom = Math.max(-6, this.#zoom - 1);
                                        this.render();
                                    }}
                                >
                                    −
                                </button>
                                <button
                                    type="button"
                                    className="btn"
                                    title={this.word('zoomIn')}
                                    onClick={() => {
                                        this.#zoom = Math.min(6, this.#zoom + 1);
                                        this.render();
                                    }}
                                >
                                    +
                                </button>
                            </span>
                            <button
                                type="button"
                                className="btn"
                                disabled={!this.#getBoat(ids)}
                                onClick={() => this.#dropHere(ids)}
                            >
                                ⚓ {this.word('dropHere')}
                            </button>
                            <span className={`alarm${armed ? ' armed' : ''}`}>
                                <b>{this.word('alarm')}</b>
                                <label>
                                    {this.word('radius')}
                                    <input
                                        // a new value of the state starts the field again
                                        key={String(radius)}
                                        type="number"
                                        min={1}
                                        step={1}
                                        defaultValue={radius === null ? '' : String(radius)}
                                        onBlur={e => this.#commitRadius(ids, e.currentTarget.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') {
                                                e.currentTarget.blur();
                                            }
                                        }}
                                    />
                                    m
                                </label>
                                <label>
                                    <input
                                        type="checkbox"
                                        checked={armed}
                                        onChange={e => void this.setState(ids.isActive, e.currentTarget.checked)}
                                    />
                                    {armed ? this.word('armed') : this.word('off')}
                                </label>
                            </span>
                        </div>
                    </div>
                );
            },
        }).finally(() => {
            this.#mapStyle = null;
            this.#zoom = 0;
            if (this.isConnected) {
                this.render();
            }
        });
    };

    /**
     * The map with everything on it
     *
     * @param ids the states
     * @param dialog the dialog zooms; the box of the host always fits anchor and boat
     */
    #renderMap(ids: AnchorIds, dialog: boolean): JSX.Element {
        const anchor = this.#getAnchor(ids);
        const boat = this.#getBoat(ids);
        const comma = this.isFloatComma;
        const chain = this.num(ids.chainLength);
        const depthAtDrop = this.num(ids.depthAtDrop);
        const depth = this.num(ids.depth);
        const alarmRadius = this.num(ids.alarmRadius);
        const armed = this.states[ids.isActive]?.val === true;
        const tripped = this.states[ids.isAlarm]?.val === true;
        const swing = chain !== null && chain > 0 ? swingRadius(chain, depthAtDrop) : null;
        const distance = anchor && boat ? haversine(anchor.lat, anchor.lon, boat.lat, boat.lon) : null;
        const style = (dialog && this.#mapStyle) || this.settings.mapStyle || 'osm';
        const source = style === 'satellite' ? TILE_SOURCES.satellite : TILE_SOURCES.voyager;

        const center =
            anchor && boat ? { lat: (anchor.lat + boat.lat) / 2, lon: (anchor.lon + boat.lon) / 2 } : anchor || boat;
        let content: JSX.Element | null = null;
        if (center) {
            const meters = (p: Point): { east: number; north: number } =>
                projectToMeters(p.lat, p.lon, center.lat, center.lon);
            // how far the farthest thing to show lies from the center
            let extent = 25;
            if (anchor) {
                const a = meters(anchor);
                const r = Math.max(swing || 0, armed && alarmRadius ? alarmRadius : 0, 10);
                extent = Math.max(extent, Math.hypot(a.east, a.north) + r);
            }
            if (boat) {
                const b = meters(boat);
                extent = Math.max(extent, Math.hypot(b.east, b.north) + 10);
            }
            const mpu = Math.max(MIN_M_PER_UNIT, extent / FIT_UNITS) / (dialog ? 2 ** this.#zoom : 1);
            const toXY = (p: Point): { x: number; y: number } => {
                const m = meters(p);
                return { x: CENTER + m.east / mpu, y: CENTER - m.north / mpu };
            };
            const a = anchor ? toXY(anchor) : null;
            const b = boat ? toXY(boat) : null;
            const now = Date.now();
            content = (
                <>
                    <MapTiles
                        source={source}
                        lat={center.lat}
                        lon={center.lon}
                        cx={CENTER}
                        cy={CENTER}
                        metersPerUnit={mpu}
                        x0={0}
                        y0={0}
                        x1={VIEW}
                        y1={VIEW}
                        tileUnits={300}
                    />
                    <g>
                        {this.#trail.map((p, i) => {
                            const { x, y } = toXY(p);
                            const fresh = 1 - Math.min(1, Math.max(0, now - p.ts) / TRAIL_WINDOW_MS);
                            return (
                                <circle
                                    key={`${p.ts}-${i}`}
                                    cx={x}
                                    cy={y}
                                    r={6}
                                    fill={COLORS.trail}
                                    fillOpacity={0.25 + 0.55 * fresh}
                                />
                            );
                        })}
                    </g>
                    {a && swing ? (
                        <circle
                            cx={a.x}
                            cy={a.y}
                            r={swing / mpu}
                            fill={COLORS.swing}
                            fillOpacity={0.05}
                            stroke={COLORS.swing}
                            strokeOpacity={0.8}
                            strokeWidth={4}
                        />
                    ) : null}
                    {a && armed && alarmRadius ? (
                        <circle
                            cx={a.x}
                            cy={a.y}
                            r={alarmRadius / mpu}
                            fill={tripped ? COLORS.tripped : COLORS.alarm}
                            fillOpacity={0.08}
                            stroke={tripped ? COLORS.tripped : COLORS.alarm}
                            strokeWidth={6}
                            strokeDasharray="16 12"
                        />
                    ) : null}
                    {a && b ? (
                        <line
                            x1={a.x}
                            y1={a.y}
                            x2={b.x}
                            y2={b.y}
                            stroke={COLORS.chain}
                            strokeWidth={4}
                            strokeDasharray="12 12"
                            strokeOpacity={0.9}
                        />
                    ) : null}
                    {a ? (
                        <path
                            d={ANCHOR_PATH}
                            transform={`translate(${a.x - 36} ${a.y - 36}) scale(3)`}
                            fill={COLORS.anchor}
                            stroke="#000"
                            strokeWidth={0.6}
                        />
                    ) : null}
                    {b ? (
                        <path
                            d={BOAT_PATH}
                            transform={`translate(${b.x - 36} ${b.y - 36}) scale(3)`}
                            fill={COLORS.boat}
                            stroke="#000"
                            strokeWidth={0.6}
                        />
                    ) : null}
                </>
            );
        }

        const details: string[] = [];
        if (chain !== null) {
            details.push(`${this.word('chain')} ${Math.round(chain)} m`);
        }
        if (depthAtDrop !== null) {
            details.push(`${this.word('atDrop')} ${formatNum(depthAtDrop, 1, comma)} m`);
        }
        if (depth !== null) {
            details.push(`${this.word('depth')} ${formatNum(depth, 1, comma)} m`);
        }
        let message = '';
        if (!boat) {
            message = this.word('noPosition');
        } else if (!anchor) {
            message = this.word('noAnchor');
        }
        return (
            <div className="map">
                <svg
                    viewBox={`0 0 ${VIEW} ${VIEW}`}
                    preserveAspectRatio="xMidYMid slice"
                >
                    {content}
                </svg>
                <div className="readouts">
                    <div
                        className={`box${swing !== null && distance !== null && distance > swing ? ' far' : ''}${tripped ? ' tripped' : ''}`}
                    >
                        <div className="label">{tripped ? this.word('alarm') : this.word('distance')}</div>
                        <div className="value">{distance !== null ? `${Math.round(distance)} m` : '—'}</div>
                    </div>
                    {details.length ? (
                        <div className="box details">
                            {details.map(text => (
                                <span key={text}>{text}</span>
                            ))}
                        </div>
                    ) : null}
                </div>
                {message ? <div className="box message">{message}</div> : null}
                {center ? <div className="attribution">{source.attribution}</div> : null}
            </div>
        );
    }

    protected override renderContent(): JSX.Element {
        const ids = getIds(this.settings);
        if (!ids) {
            return (
                <Hint
                    text={this.word('chooseInstance')}
                    editMode={this.editMode}
                />
            );
        }
        this.#updateTrail(ids);
        // once the objects of the position and system.config are there: does the default history log them?
        if (
            this.#historyOf !== this.#trailOf &&
            this.socket &&
            this.objects[ids.boatLat] !== undefined &&
            this.objects[ids.boatLon] !== undefined &&
            this.objects[SYSTEM_CONFIG] !== undefined
        ) {
            this.#historyOf = this.#trailOf;
            void this.#loadHistory(ids);
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
                <div className="anchorage">{this.#renderMap(ids, false)}</div>
            </div>
        );
    }
}

defineWebComponent(getTag('anchor-position'), NmeaAnchorPositionElement);
