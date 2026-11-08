/**
 * The wind instrument as a web component: `<iob-nmea-wind>` - the web component of the devices widget "NMEA Wind"
 * (`src-devices/src/NmeaWindComponent.tsx`).
 *
 * A dark dial with the compass rose turning with the heading, the apparent wind (orange "A" with laylines) and the
 * true wind (yellow "T") relative to the bow, the course over ground (pink), the set of the current (blue), the
 * close-hauled bands and a heat map of the apparent wind of the last seconds. Around it AWS, TWS, STW and SOG.
 * A wide, flat box shows AWS, heading and TWS in a row; a small one only the dial. A click shows the dial big in an
 * element dialog of the host.
 *
 * All states are those of the adapter instance of the setting, as in the native widget.
 */
import type { JSX, KeyboardEvent } from 'react';

import { defineWebComponent } from '@iobroker/web-components/element';

import { getTag, type WindSettings } from './constants';
import { Hint } from './Hint';
import { NAMES } from './names';
import { AngleUnwrapper, DEG_TO_RAD, formatNum, MS_TO_KN, normDeg, pad3, polar, sectorPath, signedDeg } from './nautic';
import { NmeaElement } from './NmeaElement';

const DEFAULT_HISTORY_SECONDS = 60;
const DEFAULT_CLOSE_HAULED = 60;

// the dial, in a 1000 x 1000 viewBox - the geometry of the native widget
const CX = 500;
const CY = 500;
const R_OUTER = 451;
const R_RING_STROKE = 25;
const R_INNER = R_OUTER - R_RING_STROKE;
const R_LABEL = 390;
const R_TICK_OUT = R_OUTER - 4;
const R_TICK_MAJOR_IN = R_INNER + 4;
const R_TICK_MINOR_IN = R_INNER + 35;
const R_HISTORY_OUTER = 346;
const R_HISTORY_INNER = 120;
const R_CLOSE_HAULED_OUT = R_OUTER - 6;
const R_CLOSE_HAULED_IN = R_INNER + 2;
const LAYLINE_HALF_ANGLE = 40;

/** Tapered pointer: tip near y 55, base near y 280, centered on x 500 */
const POINTER_PATH =
    'm 451.77021,55.078207 42.08541,-33.202814 a 12.555638,12.555638 0.26446337 0 1 15.64423,0.07221 l 42.20046,33.930296 a 15.557694,15.557694 71.53185 0 1 5.32954,15.957795 L 504.17034,279.76529 a 2.5373267,2.5373267 0.02614114 0 1 -4.91879,-0.002 L 446.37431,70.966036 a 15.416336,15.416336 108.75875 0 1 5.3959,-15.887829 z';

const COLORS = {
    face: '#000000',
    ring: '#191c1d',
    grey: '#B5B5B5',
    contrast: '#FFFFFF',
    port: '#8F0000',
    starboard: '#008700',
    yellow: '#ffdf00b6',
    orange: '#ff9100',
    pink: '#FC0FC0',
    blue: '#3298ff',
    north: '#3a8dff',
    south: '#ff3b3b',
} as const;

const CSS = `
.wind {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
}
.wind svg.dial {
    width: 100%;
    height: 100%;
}
.rot {
    transform-origin: 500px 500px;
    transition: transform 600ms cubic-bezier(0.65, 0, 0.35, 1);
}
.rot.twa {
    transition-duration: 900ms;
}
.rot.set {
    transition-duration: 1500ms;
}
.c-orange { fill: var(--nmea-orange); }
.c-yellow { fill: var(--nmea-yellow); }
.c-pink { fill: var(--nmea-pink); }
.c-blue { fill: var(--nmea-blue); }
.bar {
    display: none;
    position: absolute;
    inset: 0;
    align-items: center;
    justify-content: space-around;
    text-align: center;
}
.bar .label {
    font-size: clamp(10px, 18cqh, 16px);
    font-weight: 700;
}
.bar .value {
    font-size: clamp(14px, 42cqh, 48px);
    font-weight: 800;
    line-height: 1.05;
}
.bar .unit {
    font-size: clamp(9px, 14cqh, 14px);
    opacity: 0.7;
}
.bar .orange { color: var(--nmea-orange); }
.bar .yellow { color: var(--nmea-yellow); }
.bar .secondary { color: var(--iob-text-secondary); }
@container (min-aspect-ratio: 5/2) {
    .wind { display: none; }
    .bar { display: flex; }
}
@container (max-width: 220px) {
    .corner { display: none; }
}
@container (max-height: 220px) {
    .corner { display: none; }
}
@container (max-width: 160px) {
    .heat { display: none; }
}
`;

/** One sample of the apparent wind angle */
interface Sample {
    val: number;
    ts: number;
}

/** What the dial shows */
interface WindValues {
    heading: number | null;
    awa: number | null;
    aws: number | null;
    twa: number | null;
    tws: number | null;
    cog: number | null;
    sog: number | null;
    stw: number | null;
}

/** The set (direction of the current, relative to the bow) and drift (kn) from COG/SOG against heading/STW */
function computeSet(v: WindValues): { setRel: number; drift: number } | null {
    if (v.heading === null || v.cog === null || v.sog === null || v.stw === null) {
        return null;
    }
    const sE = v.sog * Math.sin(v.cog * DEG_TO_RAD) - v.stw * Math.sin(v.heading * DEG_TO_RAD);
    const sN = v.sog * Math.cos(v.cog * DEG_TO_RAD) - v.stw * Math.cos(v.heading * DEG_TO_RAD);
    const drift = Math.sqrt(sE * sE + sN * sN);
    if (drift < 0.05) {
        return null;
    }
    return { setRel: signedDeg(normDeg((Math.atan2(sE, sN) * 180) / Math.PI) - v.heading), drift };
}

/** A rotating group: CSS animates the turn, `angle` is unwrapped so it takes the short way */
function Rotating({
    angle,
    className,
    children,
}: {
    angle: number;
    className?: string;
    children: JSX.Element[] | JSX.Element;
}): JSX.Element {
    return (
        <g
            className={`rot${className ? ` ${className}` : ''}`}
            style={{ transform: `rotate(${angle}deg)` }}
        >
            {children}
        </g>
    );
}

/** The labels of a corner: name, value, unit */
function Corner({
    x,
    y,
    name,
    value,
    unit,
    color,
}: {
    x: number;
    y: number;
    name: string;
    value: string;
    unit: string;
    color: string;
}): JSX.Element {
    return (
        <g
            className={`corner ${color}`}
            textAnchor="middle"
        >
            <text
                x={x}
                y={y}
                fontSize={42}
                fontWeight={700}
            >
                {name}
            </text>
            <text
                x={x}
                y={y + 70}
                fontSize={72}
                fontWeight={800}
            >
                {value}
            </text>
            <text
                x={x}
                y={y + 115}
                fontSize={36}
                fontWeight={600}
            >
                {unit}
            </text>
        </g>
    );
}

interface DialProps {
    values: WindValues;
    angles: { dial: number; awa: number; twa: number; cog: number; set: number };
    history: Sample[];
    historySeconds: number;
    closeHauled: number;
    showSail: boolean;
    unit: string;
    speed: (kn: number | null) => string;
    /** Unique per element: the ids of the gradients */
    uid: string;
    /** The time of the drawing: the age of the samples of the heat map */
    now: number;
}

/** The dial, as the native widget draws it */
function WindDial(props: DialProps): JSX.Element {
    const { values, angles, closeHauled, uid } = props;
    const { heading, awa, twa } = values;
    const set = computeSet(values);
    const laylineEnd = R_OUTER - 100;
    const portLayline = polar(CX, CY, laylineEnd, 360 - LAYLINE_HALF_ANGLE);
    const stbdLayline = polar(CX, CY, laylineEnd, LAYLINE_HALF_ANGLE);

    // the heat map of the apparent wind: one bar per sample, fading with its age
    const now = props.now;
    const windowMs = props.historySeconds * 1000;
    const rays: JSX.Element[] = [];
    if (windowMs > 0) {
        props.history.forEach((sample, i) => {
            const age = now - sample.ts;
            const alpha = 0.85 * (1 - age / windowMs);
            if (age >= 0 && alpha > 0.02) {
                rays.push(
                    <rect
                        key={`h${sample.ts}-${i}`}
                        x={CX - 17}
                        y={CY - R_HISTORY_OUTER}
                        width={34}
                        height={R_HISTORY_OUTER - R_HISTORY_INNER}
                        fill={`url(#${uid}-heat)`}
                        fillOpacity={alpha}
                        transform={`rotate(${normDeg(sample.val)} ${CX} ${CY})`}
                    />,
                );
            }
        });
    }

    // the main sail at its best angle: the boom at half the apparent wind angle, fuller the further aft
    let sail: JSX.Element | null = null;
    if (props.showSail && awa !== null) {
        const mastY = 400;
        const length = 220;
        const boomDir = 180 + awa / 2;
        const clew = polar(CX, mastY, length, boomDir);
        const belly = length * Math.min(0.5, (Math.abs(awa) / 180) * 0.5);
        const ctrl = polar((CX + clew.x) / 2, (mastY + clew.y) / 2, 2 * belly, boomDir + (awa >= 0 ? 90 : -90));
        sail = (
            <g opacity={0.92}>
                <line
                    x1={CX}
                    y1={mastY}
                    x2={clew.x}
                    y2={clew.y}
                    stroke="#888"
                    strokeWidth={5}
                    strokeLinecap="round"
                />
                <circle
                    cx={CX}
                    cy={mastY}
                    r={7}
                    fill="#fff"
                />
                <path
                    d={`M ${CX} ${mastY} Q ${ctrl.x} ${ctrl.y} ${clew.x} ${clew.y} Z`}
                    fill="rgba(255,255,255,0.22)"
                    stroke="#fff"
                    strokeWidth={4}
                    strokeLinejoin="round"
                />
            </g>
        );
    }

    let setArrow: JSX.Element | null = null;
    if (set) {
        const len = Math.min(1, set.drift / 3) * 180 + 80;
        const tipY = CY - len;
        const tailY = CY - (len - 140);
        setArrow = (
            <Rotating
                angle={angles.set}
                className="set"
            >
                <line
                    x1={CX}
                    y1={tailY}
                    x2={CX}
                    y2={tipY}
                    stroke={`url(#${uid}-set)`}
                    strokeWidth={7}
                    strokeLinecap="round"
                />
                <polygon
                    points={`${CX},${tipY - 10} ${CX - 32},${tipY + 50} ${CX},${tipY + 40} ${CX + 32},${tipY + 50}`}
                    fill={COLORS.blue}
                />
            </Rotating>
        );
    }

    const labels = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
    return (
        <svg
            className="dial"
            viewBox="0 0 1000 1000"
            preserveAspectRatio="xMidYMid meet"
        >
            <defs>
                <linearGradient
                    id={`${uid}-port`}
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
                    id={`${uid}-stbd`}
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
                <radialGradient
                    id={`${uid}-heat`}
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
                <linearGradient
                    id={`${uid}-set`}
                    gradientUnits="userSpaceOnUse"
                    x1={CX}
                    y1={CY - 260}
                    x2={CX}
                    y2={CY - 80}
                >
                    <stop
                        offset="0"
                        stopColor={COLORS.blue}
                        stopOpacity={1}
                    />
                    <stop
                        offset="1"
                        stopColor={COLORS.blue}
                        stopOpacity={0.1}
                    />
                </linearGradient>
            </defs>

            <circle
                cx={CX}
                cy={CY}
                r={R_OUTER}
                fill={COLORS.face}
            />
            <circle
                cx={CX}
                cy={CY}
                r={R_OUTER - R_RING_STROKE / 2}
                fill="none"
                stroke={COLORS.grey}
                strokeWidth={R_RING_STROKE}
            />
            <circle
                cx={CX}
                cy={CY}
                r={R_INNER - 40}
                fill="none"
                stroke={COLORS.ring}
                strokeWidth={80}
            />
            <path
                d={sectorPath(CX, CY, R_CLOSE_HAULED_IN, R_CLOSE_HAULED_OUT + 5, 360 - closeHauled, 360)}
                fill={COLORS.port}
            />
            <path
                d={sectorPath(CX, CY, R_CLOSE_HAULED_IN, R_CLOSE_HAULED_OUT + 5, 0, closeHauled)}
                fill={COLORS.starboard}
            />

            {/* the compass rose, turning with the heading */}
            <Rotating angle={angles.dial}>
                <g>
                    {Array.from({ length: 36 }, (_, i) => i * 10)
                        .filter(a => a % 30)
                        .map(a => {
                            const p1 = polar(CX, CY, R_TICK_MINOR_IN - 12.5, a);
                            const p2 = polar(CX, CY, R_TICK_OUT - 10, a);
                            return (
                                <line
                                    key={`m${a}`}
                                    x1={p1.x}
                                    y1={p1.y}
                                    x2={p2.x}
                                    y2={p2.y}
                                    stroke={COLORS.contrast}
                                    strokeWidth={3}
                                />
                            );
                        })}
                </g>
                <g>
                    {labels.map(a => {
                        const p1 = polar(CX, CY, R_TICK_MAJOR_IN + 2, a);
                        const p2 = polar(CX, CY, R_TICK_OUT, a);
                        return (
                            <line
                                key={`M${a}`}
                                x1={p1.x}
                                y1={p1.y}
                                x2={p2.x}
                                y2={p2.y}
                                stroke={COLORS.contrast}
                                strokeWidth={8}
                            />
                        );
                    })}
                </g>
                <g>
                    {labels.map(a => {
                        const cardinal = a % 90 === 0;
                        const label = a === 0 ? 'N' : a === 90 ? 'E' : a === 180 ? 'S' : a === 270 ? 'W' : String(a);
                        const pos = polar(CX, CY, R_LABEL, a);
                        return (
                            <text
                                key={`l${a}`}
                                x={pos.x}
                                y={pos.y}
                                textAnchor="middle"
                                dominantBaseline="central"
                                fontSize={a === 0 || a === 180 ? 62 : cardinal ? 54 : 44}
                                fontWeight={cardinal ? 700 : 400}
                                fill={a === 0 ? COLORS.north : a === 180 ? COLORS.south : COLORS.contrast}
                                transform={`rotate(${a} ${pos.x} ${pos.y})`}
                            >
                                {label}
                            </text>
                        );
                    })}
                </g>
            </Rotating>

            {/* the hull, fixed to the bow */}
            <path
                d="M 500 200 C 615 270, 680 500, 570 790"
                fill="none"
                stroke={`url(#${uid}-port)`}
                strokeWidth={6}
                strokeLinecap="round"
            />
            <path
                d="M 500 200 C 385 270, 320 500, 430 790"
                fill="none"
                stroke={`url(#${uid}-stbd)`}
                strokeWidth={6}
                strokeLinecap="round"
            />
            <line
                x1={430}
                y1={790}
                x2={570}
                y2={790}
                stroke={COLORS.grey}
                strokeOpacity={0.3}
                strokeWidth={6}
                strokeLinecap="round"
            />
            {sail}
            {rays.length ? <g className="heat">{rays}</g> : null}

            {awa !== null ? (
                <Rotating angle={angles.awa}>
                    <line
                        x1={CX}
                        y1={CY}
                        x2={portLayline.x}
                        y2={portLayline.y}
                        stroke={COLORS.contrast}
                        strokeWidth={3}
                        strokeDasharray="40 20"
                        strokeOpacity={0.6}
                    />
                    <line
                        x1={CX}
                        y1={CY}
                        x2={stbdLayline.x}
                        y2={stbdLayline.y}
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
                        fill={COLORS.face}
                    >
                        A
                    </text>
                </Rotating>
            ) : null}
            {twa !== null ? (
                <Rotating
                    angle={angles.twa}
                    className="twa"
                >
                    <path
                        d={POINTER_PATH}
                        transform="matrix(0.5134876,0,0,0.5997212,242.38,67)"
                        fill={COLORS.yellow}
                    />
                    <text
                        x={CX}
                        y={134}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={51}
                        fontWeight={700}
                        fill={COLORS.face}
                    >
                        T
                    </text>
                </Rotating>
            ) : null}
            {heading !== null && values.cog !== null ? (
                <Rotating angle={angles.cog}>
                    <path
                        d={`M ${CX} ${CY - R_OUTER + 20} L ${CX - 15} ${CY - R_OUTER + 50} L ${CX + 15} ${CY - R_OUTER + 50} Z`}
                        fill={COLORS.pink}
                    />
                    <rect
                        x={CX - 8}
                        y={CY - R_OUTER + 50}
                        width={16}
                        height={80}
                        fill={COLORS.pink}
                    />
                </Rotating>
            ) : null}
            {setArrow}

            {/* SOG in the middle */}
            <text
                x={CX}
                y={CY}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={56}
                fontWeight={700}
                fill={COLORS.contrast}
            >
                {props.speed(values.sog)}
            </text>
            <text
                x={CX}
                y={CY + 42}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={24}
                fontWeight={500}
                fill={COLORS.contrast}
                opacity={0.6}
            >
                {props.unit}
            </text>

            {/* the heading at the top */}
            <rect
                x={CX - 128}
                y={10}
                width={256}
                height={108}
                rx={24}
                fill={COLORS.face}
                stroke={COLORS.grey}
                strokeWidth={5}
                opacity={0.7}
            />
            <text
                x={CX}
                y={99}
                textAnchor="middle"
                fontSize={100}
                fontWeight={700}
                fill={COLORS.contrast}
            >
                {heading !== null ? `${Math.round(normDeg(heading))}°` : '---°'}
            </text>

            <Corner
                x={95}
                y={60}
                name="AWS"
                value={props.speed(values.aws)}
                unit={props.unit}
                color="c-orange"
            />
            <Corner
                x={905}
                y={60}
                name="TWS"
                value={props.speed(values.tws)}
                unit={props.unit}
                color="c-yellow"
            />
            <Corner
                x={95}
                y={825}
                name="STW"
                value={props.speed(values.stw)}
                unit={props.unit}
                color="c-blue"
            />
            <Corner
                x={905}
                y={825}
                name="SOG"
                value={props.speed(values.sog)}
                unit={props.unit}
                color="c-pink"
            />
        </svg>
    );
}

let uidCounter = 0;

class NmeaWindElement extends NmeaElement<WindSettings> {
    readonly #unwrapper = new AngleUnwrapper();

    /** The apparent wind angles of the last `historySeconds` */
    #history: Sample[] = [];

    readonly #uid = `nmea-wind-${++uidCounter}`;

    constructor() {
        super(CSS);
        // the heat map fades with the time
        this.tickMs = 500;
    }

    protected override getStateIds(settings: WindSettings): string[] {
        const instance = settings.instance;
        if (!instance) {
            return [];
        }
        return [
            `${instance}.windData.windAngleApparent`,
            `${instance}.windData.windSpeedApparent`,
            `${instance}.windData.windAngleTrue`,
            `${instance}.windData.windSpeedTrue`,
            `${instance}.vesselHeading.headingTrue`,
            `${instance}.cogSogRapidUpdate.cogTrue`,
            `${instance}.cogSogRapidUpdate.cog`,
            `${instance}.cogSogRapidUpdate.sog`,
            `${instance}.speed.speedWaterReferenced`,
        ];
    }

    #getValues(instance: string): WindValues {
        return {
            heading: this.num(`${instance}.vesselHeading.headingTrue`),
            awa: this.num(`${instance}.windData.windAngleApparent`),
            aws: this.num(`${instance}.windData.windSpeedApparent`),
            twa: this.num(`${instance}.windData.windAngleTrue`),
            tws: this.num(`${instance}.windData.windSpeedTrue`),
            cog: this.num(`${instance}.cogSogRapidUpdate.cogTrue`) ?? this.num(`${instance}.cogSogRapidUpdate.cog`),
            sog: this.num(`${instance}.cogSogRapidUpdate.sog`),
            stw: this.num(`${instance}.speed.speedWaterReferenced`),
        };
    }

    /** Takes the newest apparent wind angle into the heat map and drops what is too old */
    #updateHistory(instance: string, historySeconds: number): void {
        const id = `${instance}.windData.windAngleApparent`;
        const val = this.num(id);
        const ts = this.states[id]?.ts || 0;
        const cutoff = Date.now() - historySeconds * 1000;
        const history = this.#history.filter(sample => sample.ts >= cutoff);
        if (val !== null && historySeconds > 0 && ts >= cutoff && !history.some(sample => sample.ts === ts)) {
            history.push({ val, ts });
        }
        this.#history = history;
    }

    /** The unit of the speeds as shown */
    get #unit(): string {
        const unit = this.settings.speedUnit || 'knots';
        return unit === 'knots' ? 'kn' : unit;
    }

    /** A speed of the adapter (kn) in the unit of the settings */
    #speed = (kn: number | null): string => {
        const unit = this.settings.speedUnit || 'knots';
        let val = kn;
        if (val !== null && unit === 'm/s') {
            val /= MS_TO_KN;
        } else if (val !== null && unit === 'km/h') {
            val *= 1.852;
        }
        return formatNum(val, 1, this.isFloatComma);
    };

    #onOpen = (): void => {
        if (!this.editMode) {
            void this.showElementDialog({
                title: this.text(NAMES.wind),
                css: CSS,
                width: 720,
                height: 760,
                draw: () => this.#renderDial(),
            });
        }
    };

    #renderDial(): JSX.Element {
        const settings = this.settings;
        const values = this.#getValues(settings.instance || '');
        const set = computeSet(values);
        return (
            <div className="wind">
                <WindDial
                    values={values}
                    angles={{
                        dial: this.#unwrapper.get('dial', values.heading !== null ? -values.heading : null),
                        awa: this.#unwrapper.get('awa', values.awa),
                        twa: this.#unwrapper.get('twa', values.twa),
                        cog: this.#unwrapper.get(
                            'cog',
                            values.cog !== null && values.heading !== null
                                ? signedDeg(values.cog - values.heading)
                                : null,
                        ),
                        set: this.#unwrapper.get('set', set ? set.setRel : null),
                    }}
                    history={this.#history}
                    historySeconds={settings.historySeconds ?? DEFAULT_HISTORY_SECONDS}
                    closeHauled={settings.closeHauledAngle ?? DEFAULT_CLOSE_HAULED}
                    showSail={!!settings.showSail}
                    unit={this.#unit}
                    speed={this.#speed}
                    uid={this.#uid}
                    now={Date.now()}
                />
            </div>
        );
    }

    protected override renderContent(): JSX.Element {
        const settings = this.settings;
        const instance = settings.instance;
        if (!instance) {
            return (
                <Hint
                    text={this.word('chooseInstance')}
                    editMode={this.editMode}
                />
            );
        }
        this.#updateHistory(instance, settings.historySeconds ?? DEFAULT_HISTORY_SECONDS);
        const values = this.#getValues(instance);
        return (
            <div
                className={`fill${this.editMode ? ' edit' : ' clickable'}`}
                role="button"
                tabIndex={this.editMode ? undefined : 0}
                title={this.text(NAMES.wind)}
                onClick={this.#onOpen}
                onKeyDown={(e: KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        this.#onOpen();
                    }
                }}
            >
                {this.#renderDial()}
                <div className="bar">
                    <div className="orange">
                        <div className="label">AWS</div>
                        <div className="value">{this.#speed(values.aws)}</div>
                        <div className="unit">{this.#unit}</div>
                    </div>
                    <div>
                        <div className="label secondary">HDG</div>
                        <div className="value">{pad3(values.heading)}°</div>
                        <div className="unit">&nbsp;</div>
                    </div>
                    <div className="yellow">
                        <div className="label">TWS</div>
                        <div className="value">{this.#speed(values.tws)}</div>
                        <div className="unit">{this.#unit}</div>
                    </div>
                </div>
            </div>
        );
    }
}

defineWebComponent(getTag('wind'), NmeaWindElement);
