/**
 * The autopilot as a web component: `<iob-nmea-autopilot>` - the web component of the devices widget
 * "NMEA Autopilot" (`src-devices/src/NmeaAutopilotComponent.tsx`).
 *
 * A half dial with the compass rose turning with the heading, the mode, the locked heading (in Wind mode the wind
 * angle with its side, as a pilot head shows it) and the rudder; below it the mode buttons, -10/-1/+1/+10 and STW
 * and SOG. In Auto mode the locked heading can be dragged on the dial; a change of more than 20° must be confirmed
 * in a dialog that cancels itself after 10 s. A box too small for the buttons shows the dial only and opens all of
 * it in an element dialog of the host; a wide, flat box shows heading, mode and locked heading in a row.
 *
 * Commands go to the states of the adapter (`autoPilot.*`), as in the native widget.
 */
import type { JSX, KeyboardEvent, PointerEvent } from 'react';

import { defineWebComponent } from '@iobroker/web-components/element';

import { type AutopilotSettings, getTag } from './constants';
import { Hint } from './Hint';
import { getWindSide, type WordKey } from './i18n';
import { NAMES } from './names';
import { AngleUnwrapper, angularDiff, formatNum, normDeg, pad3, polar } from './nautic';
import { NmeaElement } from './NmeaElement';

// the half dial: 1000 x 500, plus 80 for the rudder bar
const VIEW_W = 1000;
const VIEW_H_DIAL = 500;
const RUDDER_BAND_H = 80;
const CX = 500;
const CY = 500;
const R_OUTER = 480;
const R_RING = 465;
const R_INNER = 370;
const POINTER_TIP_Y = CY - R_OUTER + 85;
const RUDDER_W = R_OUTER * 2;
const RUDDER_X = CX - R_OUTER;
const RUDDER_Y = VIEW_H_DIAL + 30;
const RUDDER_H = 32;
const RUDDER_MAX_DEG = 35;

/** A drag to a new heading further than this must be confirmed */
const LARGE_DELTA_DEG = 20;
/** The confirmation cancels itself after this time */
const CONFIRM_TIMEOUT_MS = 10_000;

/** `autoPilot.state` */
const MODES: { val: number; word: WordKey; color: string }[] = [
    { val: 0, word: 'modeStandby', color: '#d32f2f' },
    { val: 1, word: 'modeAuto', color: '#2e7d32' },
    { val: 2, word: 'modeWind', color: '#29b6f6' },
    { val: 3, word: 'modeTrack', color: '#ed6c02' },
    { val: 4, word: 'modeNoDrift', color: '#9c27b0' },
];

const COLORS = {
    port: '#c62828',
    starboard: '#2e7d32',
    grey: '#888888',
    yellow: '#FFD700',
    yellowDark: '#B38600',
    drag: '#ff7a00',
    north: '#3a8dff',
    south: '#ff3b3b',
} as const;

const CSS = `
.ap {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: clamp(2px, 2cqmin, 8px);
    box-sizing: border-box;
    gap: 6px;
}
.dial {
    position: relative;
    flex: 1;
    width: 100%;
    min-height: 0;
}
.dial svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    touch-action: none;
}
.dial svg.drag {
    cursor: pointer;
}
.fg { fill: currentColor; }
.fg-stroke { stroke: currentColor; }
.dim { fill: var(--nmea-dim); }
.ring { fill: var(--nmea-ring); stroke: currentColor; }
.mount { --nmea-ring: #1b2733; }
.mount.light { --nmea-ring: #e8eef3; }
.rot {
    transform-origin: 500px 500px;
    transition: transform 400ms linear;
}
.controls {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    width: 100%;
}
.group {
    display: flex;
    width: 100%;
    max-width: 440px;
}
.group button.btn {
    flex: 1;
    min-width: 0;
    padding: 4px 2px;
    border-radius: 0;
    margin-left: -1px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.group button.btn:first-child {
    border-radius: var(--iob-border-radius, 4px) 0 0 var(--iob-border-radius, 4px);
    margin-left: 0;
}
.group button.btn:last-child {
    border-radius: 0 var(--iob-border-radius, 4px) var(--iob-border-radius, 4px) 0;
}
.speeds {
    display: flex;
    justify-content: space-around;
    width: 100%;
    text-align: center;
}
.speeds .label { font-size: 12px; font-weight: 700; }
.speeds .value { font-size: 28px; font-weight: 800; line-height: 1; }
.speeds .unit { font-size: 11px; opacity: 0.8; }
.stw { color: var(--nmea-blue); }
.sog { color: var(--nmea-pink); }
.open {
    display: none;
    position: absolute;
    inset: 0;
    background: transparent;
    border: 0;
    padding: 0;
    cursor: pointer;
}
.bar {
    display: none;
    position: absolute;
    inset: 0;
    align-items: center;
    justify-content: space-around;
    text-align: center;
}
.bar .label { font-size: clamp(10px, 16cqh, 14px); font-weight: 600; color: var(--iob-text-secondary); }
.bar .value { font-size: clamp(14px, 40cqh, 44px); font-weight: 800; line-height: 1.05; }
/* in the box of the host only: the dialog always shows the buttons */
@container (max-height: 379px) {
    .mount:not(.dialog) .controls { display: none; }
    .mount:not(.dialog) .open { display: block; }
}
@container (max-width: 299px) {
    .mount:not(.dialog) .controls { display: none; }
    .mount:not(.dialog) .open { display: block; }
}
@container (min-aspect-ratio: 5/2) {
    .mount:not(.dialog) .ap { display: none; }
    .mount:not(.dialog) .bar { display: flex; }
}
.confirm {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    min-width: 260px;
}
.confirm .title { font-size: 18px; font-weight: 700; }
.confirm .row {
    display: flex;
    align-items: center;
    justify-content: space-around;
    gap: 16px;
}
.confirm .small { font-size: 12px; opacity: 0.7; text-align: center; }
.confirm .big { font-size: 36px; font-weight: 700; text-align: center; }
.confirm .countdown {
    height: 4px;
    border-radius: 2px;
    background: var(--iob-divider);
    overflow: hidden;
}
.confirm .countdown div {
    height: 100%;
    background: currentColor;
    animation: nmea-countdown ${CONFIRM_TIMEOUT_MS}ms linear forwards;
}
@keyframes nmea-countdown {
    from { width: 100%; }
    to { width: 0; }
}
.confirm .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
}
`;

/** What the autopilot shows */
interface PilotValues {
    mode: number | null;
    heading: number | null;
    locked: number | null;
    awa: number | null;
    rudder: number | null;
    stw: number | null;
    sog: number | null;
    windAngle: number | null;
}

/** The wind angle datum as a pilot head shows it: 0..180 and the side, `130°P` */
function formatWindDatum(deg: number | null, lang: string): { digits: string; side: string } {
    if (deg === null) {
        return { digits: '---', side: '' };
    }
    const d = Math.round(normDeg(deg)) % 360;
    if (d === 0 || d === 180) {
        return { digits: String(d), side: '' };
    }
    const side = getWindSide(lang);
    return d < 180 ? { digits: String(d), side: side.starboard } : { digits: String(360 - d), side: side.port };
}

let uidCounter = 0;

class NmeaAutopilotElement extends NmeaElement<AutopilotSettings> {
    readonly #unwrapper = new AngleUnwrapper();

    readonly #uid = `nmea-ap-${++uidCounter}`;

    /** The bow-relative angle while the user drags on the dial */
    #dragAngle: number | null = null;

    /** Closes the open confirmation */
    #closeConfirm: ((detail?: unknown) => void) | null = null;

    #confirmTimer: ReturnType<typeof setTimeout> | null = null;

    constructor() {
        super(CSS);
    }

    override disconnectedCallback(): void {
        super.disconnectedCallback();
        this.#dragAngle = null;
        this.#closeConfirm?.(null);
    }

    protected override getStateIds(settings: AutopilotSettings): string[] {
        const instance = settings.instance;
        if (!instance) {
            return [];
        }
        return [
            `${instance}.autoPilot.state`,
            `${instance}.autoPilot.heading`,
            `${instance}.autoPilot.windAngle`,
            `${instance}.vesselHeading.headingTrue`,
            `${instance}.windData.windAngleApparent`,
            `${instance}.rudder.position`,
            `${instance}.speed.speedWaterReferenced`,
            `${instance}.cogSogRapidUpdate.sog`,
        ];
    }

    #getValues(): PilotValues {
        const instance = this.settings.instance || '';
        return {
            mode: this.num(`${instance}.autoPilot.state`),
            heading: this.num(`${instance}.vesselHeading.headingTrue`),
            locked: this.num(`${instance}.autoPilot.heading`),
            awa: this.num(`${instance}.windData.windAngleApparent`),
            rudder: this.num(`${instance}.rudder.position`),
            stw: this.num(`${instance}.speed.speedWaterReferenced`),
            sog: this.num(`${instance}.cogSogRapidUpdate.sog`),
            windAngle: this.num(`${instance}.autoPilot.windAngle`),
        };
    }

    #write(suffix: string, val: ioBroker.StateValue): void {
        const instance = this.settings.instance;
        if (instance) {
            void this.setState(`${instance}.${suffix}`, val);
        }
    }

    #adjust(mode: number | null, delta: -10 | -1 | 1 | 10): void {
        if (mode === 2) {
            // Wind mode: the wind angle by this many degrees
            this.#write('autoPilot.windAngleChange', delta);
        } else {
            this.#write(`autoPilot.heading${delta > 0 ? 'Plus' : 'Minus'}${Math.abs(delta)}`, true);
        }
    }

    /** The bow-relative angle of a pointer on the dial, 0 = bow, clockwise */
    static #pointerAngle(e: PointerEvent<SVGSVGElement>): number | null {
        const svg = e.currentTarget;
        const matrix = svg.getScreenCTM?.();
        if (!matrix) {
            return null;
        }
        const point = svg.createSVGPoint();
        point.x = e.clientX;
        point.y = e.clientY;
        const p = point.matrixTransform(matrix.inverse());
        const dx = p.x - CX;
        const dy = CY - p.y;
        if (!dx && !dy) {
            return null;
        }
        return normDeg((Math.atan2(dx, dy) * 180) / Math.PI);
    }

    // Drag to set works in Auto mode only: a stray swipe in Wind mode could gybe the boat
    #onPointerDown = (e: PointerEvent<SVGSVGElement>): void => {
        if (this.editMode || this.#getValues().mode !== 1) {
            return;
        }
        const angle = NmeaAutopilotElement.#pointerAngle(e);
        if (angle === null) {
            return;
        }
        try {
            e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
            // not everywhere
        }
        e.preventDefault();
        this.#dragAngle = angle;
        this.render();
    };

    #onPointerMove = (e: PointerEvent<SVGSVGElement>): void => {
        if (this.#dragAngle === null) {
            return;
        }
        const angle = NmeaAutopilotElement.#pointerAngle(e);
        if (angle !== null) {
            this.#dragAngle = angle;
            this.render();
        }
    };

    #onPointerEnd = (e: PointerEvent<SVGSVGElement>): void => {
        if (this.#dragAngle === null) {
            return;
        }
        const target = this.#dragTarget();
        this.#dragAngle = null;
        this.render();
        if (e.type === 'pointercancel' || target === null) {
            return;
        }
        const values = this.#getValues();
        const rounded = Math.round(target) % 360;
        if (values.mode !== 1) {
            return;
        }
        if (values.locked === null || angularDiff(rounded, values.locked) <= LARGE_DELTA_DEG) {
            this.#write('autoPilot.heading', rounded);
        } else {
            void this.#confirm(rounded, values.locked);
        }
    };

    /** The heading the drag would set now */
    #dragTarget(): number | null {
        if (this.#dragAngle === null) {
            return null;
        }
        return normDeg((this.#getValues().heading ?? 0) + this.#dragAngle);
    }

    /** A large change of the locked heading must be confirmed; it cancels itself after 10 s */
    async #confirm(angle: number, current: number): Promise<void> {
        if (this.#closeConfirm) {
            return;
        }
        const color = MODES[1].color;
        const delta = Math.round(angularDiff(angle, current));
        this.#confirmTimer = setTimeout(() => this.#closeConfirm?.(null), CONFIRM_TIMEOUT_MS);
        let result: unknown = null;
        try {
            result = await this.showElementDialog({
                title: this.word('confirmTitle'),
                css: CSS,
                width: 400,
                fit: true,
                draw: close => {
                    this.#closeConfirm = close;
                    return (
                        <div className="confirm">
                            <div>{this.word('lockedHeading')}:</div>
                            <div className="row">
                                <div>
                                    <div className="small">{this.word('now')}</div>
                                    <div className="big">{pad3(current)}°</div>
                                </div>
                                <div className="big">→</div>
                                <div style={{ color }}>
                                    <div className="small">{this.word('new')}</div>
                                    <div className="big">{pad3(angle)}°</div>
                                </div>
                            </div>
                            <div className="small">{`Δ ${delta}°`}</div>
                            <div className="small">{`${this.word('autoCancel')} ${CONFIRM_TIMEOUT_MS / 1000} s`}</div>
                            <div className="countdown">
                                <div />
                            </div>
                            <div className="actions">
                                <button
                                    type="button"
                                    className="btn"
                                    onClick={() => close(null)}
                                >
                                    {this.word('cancel')}
                                </button>
                                <button
                                    type="button"
                                    className="btn primary"
                                    style={{ background: color, borderColor: color, color: '#fff' }}
                                    onClick={() => close('confirm')}
                                >
                                    {this.word('confirm')}
                                </button>
                            </div>
                        </div>
                    );
                },
            });
        } finally {
            if (this.#confirmTimer) {
                clearTimeout(this.#confirmTimer);
                this.#confirmTimer = null;
            }
            this.#closeConfirm = null;
        }
        // the mode may have changed meanwhile: then the heading does not apply any more
        if (result === 'confirm' && this.#getValues().mode === 1) {
            this.#write('autoPilot.heading', angle);
        }
    }

    #onOpen = (): void => {
        if (!this.editMode) {
            void this.showElementDialog({
                title: this.text(NAMES.autopilot),
                css: CSS,
                width: 520,
                height: 640,
                draw: () => this.#renderPilot(false),
            });
        }
    };

    #renderDial(values: PilotValues, interactive: boolean): JSX.Element {
        const { mode, heading, locked, awa, rudder, windAngle } = values;
        const showRudder = this.settings.showRudder !== false;
        const showAwa = this.settings.showAwa !== false;
        const viewH = VIEW_H_DIAL + (showRudder ? RUDDER_BAND_H : 0);
        const clipId = `${this.#uid}-clip`;
        const modeInfo = MODES.find(m => m.val === mode);
        const dragTarget = this.#dragTarget();

        const ticks: JSX.Element[] = [];
        for (let a = 0; a < 360; a += 10) {
            const major = a % 30 === 0;
            const len = major ? 22 : 12;
            const p1 = polar(CX, CY, R_RING - len / 2, a);
            const p2 = polar(CX, CY, R_RING + len / 2, a);
            ticks.push(
                <line
                    key={`t${a}`}
                    className="fg-stroke"
                    x1={p1.x}
                    y1={p1.y}
                    x2={p2.x}
                    y2={p2.y}
                    strokeWidth={major ? 6 : 3}
                />,
            );
            if (major) {
                const pos = polar(CX, CY, R_RING - 50, a);
                const cardinal = a % 90 === 0;
                const label = a === 0 ? 'N' : a === 90 ? 'E' : a === 180 ? 'S' : a === 270 ? 'W' : String(a);
                ticks.push(
                    <text
                        key={`l${a}`}
                        className={a === 0 || a === 180 ? undefined : 'fg'}
                        x={pos.x}
                        y={pos.y}
                        fill={a === 0 ? COLORS.north : a === 180 ? COLORS.south : undefined}
                        fontSize={cardinal ? 38 : 32}
                        fontWeight={cardinal ? 700 : 400}
                        textAnchor="middle"
                        dominantBaseline="central"
                        transform={`rotate(${a} ${pos.x} ${pos.y})`}
                    >
                        {label}
                    </text>,
                );
            }
        }

        const arcR = R_OUTER - 15;
        const arc = (from: number, to: number): string => {
            const p1 = polar(CX, CY, arcR, from);
            const p2 = polar(CX, CY, arcR, to);
            return `M ${p1.x} ${p1.y} A ${arcR} ${arcR} 0 0 1 ${p2.x} ${p2.y}`;
        };

        // the rudder bar: to port red, to starboard green
        let rudderBar: JSX.Element | null = null;
        if (showRudder) {
            const half = RUDDER_W / 2;
            const center = RUDDER_X + half;
            let bar: JSX.Element | null = null;
            if (rudder !== null) {
                const px = (Math.max(-RUDDER_MAX_DEG, Math.min(RUDDER_MAX_DEG, rudder)) / RUDDER_MAX_DEG) * half;
                bar = (
                    <rect
                        x={px >= 0 ? center : center + px}
                        y={RUDDER_Y + 2}
                        width={Math.abs(px)}
                        height={RUDDER_H - 4}
                        fill={px >= 0 ? COLORS.starboard : COLORS.port}
                        style={{ transition: 'all 0.3s linear' }}
                    />
                );
            }
            rudderBar = (
                <g>
                    <rect
                        className="fg-stroke"
                        x={RUDDER_X}
                        y={RUDDER_Y}
                        width={RUDDER_W}
                        height={RUDDER_H}
                        fill="none"
                        strokeWidth={2}
                    />
                    {[0.25, 0.5, 0.75].map(p => (
                        <line
                            key={p}
                            className="fg-stroke"
                            x1={RUDDER_X + RUDDER_W * p}
                            y1={RUDDER_Y}
                            x2={RUDDER_X + RUDDER_W * p}
                            y2={RUDDER_Y + RUDDER_H}
                            strokeWidth={2}
                        />
                    ))}
                    {bar}
                </g>
            );
        }

        // the big number: the drag target, the wind angle datum in Wind mode, else the locked heading
        let center: JSX.Element;
        if (dragTarget !== null) {
            center = (
                <>
                    <text
                        x={CX}
                        y={CY - 100}
                        fill={COLORS.drag}
                        fontSize={140}
                        fontWeight={700}
                        textAnchor="middle"
                    >
                        {pad3(dragTarget)}°
                    </text>
                    <text
                        className="dim"
                        x={CX}
                        y={CY - 30}
                        fontSize={48}
                        textAnchor="middle"
                    >
                        {`${this.word('now')} ${pad3(locked)}°`}
                    </text>
                </>
            );
        } else if (mode === 2) {
            const { digits, side } = formatWindDatum(windAngle, this.systemLang);
            center = (
                <>
                    <g transform={`translate(${CX - 240}, ${CY - 170})`}>
                        <line
                            className="fg-stroke"
                            x1={8}
                            y1={0}
                            x2={8}
                            y2={110}
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
                            className="fg"
                            d="M -10 102 L 48 102 Q 38 118 -5 112 Z"
                        />
                    </g>
                    <text
                        className="fg"
                        x={CX}
                        y={CY - 60}
                        fontSize={150}
                        fontWeight={700}
                        textAnchor="middle"
                    >
                        {`${digits}°${side}`}
                    </text>
                </>
            );
        } else {
            // in Standby there is no setpoint: the heading itself
            center = (
                <text
                    className="fg"
                    x={CX}
                    y={CY - 60}
                    fontSize={150}
                    fontWeight={700}
                    textAnchor="middle"
                >
                    {`${pad3(mode !== null && mode !== 0 ? locked : heading)}°`}
                </text>
            );
        }

        const drag = interactive && mode === 1;
        return (
            <svg
                className={drag ? 'drag' : undefined}
                viewBox={`0 0 ${VIEW_W} ${viewH}`}
                preserveAspectRatio="xMidYMid meet"
                onPointerDown={interactive ? this.#onPointerDown : undefined}
                onPointerMove={interactive ? this.#onPointerMove : undefined}
                onPointerUp={interactive ? this.#onPointerEnd : undefined}
                onPointerCancel={interactive ? this.#onPointerEnd : undefined}
            >
                <defs>
                    <clipPath id={clipId}>
                        <rect
                            x={0}
                            y={0}
                            width={VIEW_W}
                            height={CY}
                        />
                    </clipPath>
                </defs>
                {/* pointer events on the empty inside too */}
                <rect
                    x={0}
                    y={0}
                    width={VIEW_W}
                    height={viewH}
                    fill="transparent"
                />
                <path
                    className="ring"
                    d={`M ${CX - R_OUTER} ${CY} A ${R_OUTER} ${R_OUTER} 0 0 1 ${CX + R_OUTER} ${CY} L ${CX + R_INNER} ${CY} A ${R_INNER} ${R_INNER} 0 0 0 ${CX - R_INNER} ${CY} Z`}
                    strokeWidth={3}
                />
                <path
                    d={arc(-90, 90)}
                    fill="none"
                    stroke={COLORS.grey}
                    strokeWidth={30}
                />
                <path
                    d={arc(-66, -30)}
                    fill="none"
                    stroke={COLORS.port}
                    strokeWidth={30}
                />
                <path
                    d={arc(30, 66)}
                    fill="none"
                    stroke={COLORS.starboard}
                    strokeWidth={30}
                />
                {/* the clip stays fixed, the rose turns inside it */}
                <g clipPath={`url(#${clipId})`}>
                    <g
                        className="rot"
                        style={{
                            transform: `rotate(${this.#unwrapper.get('heading', heading !== null ? -heading : null)}deg)`,
                        }}
                    >
                        {ticks}
                    </g>
                </g>
                {mode === 2 && awa !== null ? (
                    <g clipPath={`url(#${clipId})`}>
                        <g
                            className="rot"
                            style={{ transform: `rotate(${this.#unwrapper.get('awa', awa)}deg)` }}
                        >
                            <path
                                d={`M ${CX} ${CY - R_OUTER + 5} L ${CX - 18} ${CY - R_OUTER + 50} L ${CX + 18} ${CY - R_OUTER + 50} Z`}
                                fill={COLORS.yellow}
                                stroke={COLORS.yellowDark}
                                strokeWidth={3}
                            />
                        </g>
                    </g>
                ) : null}
                {this.#dragAngle !== null ? (
                    <g clipPath={`url(#${clipId})`}>
                        <g transform={`rotate(${this.#dragAngle} ${CX} ${CY})`}>
                            <line
                                x1={CX}
                                y1={CY - R_INNER + 30}
                                x2={CX}
                                y2={CY - R_OUTER + 50}
                                stroke={COLORS.drag}
                                strokeWidth={6}
                                strokeLinecap="round"
                                opacity={0.8}
                            />
                            <path
                                d={`M ${CX} ${CY - R_OUTER + 5} L ${CX - 22} ${CY - R_OUTER + 56} L ${CX + 22} ${CY - R_OUTER + 56} Z`}
                                fill={COLORS.drag}
                                stroke="#a04a00"
                                strokeWidth={3}
                            />
                        </g>
                    </g>
                ) : null}
                <path
                    className="fg"
                    d={`M ${CX} ${POINTER_TIP_Y - 14} L ${CX - 26} ${POINTER_TIP_Y + 26} L ${CX + 26} ${POINTER_TIP_Y + 26} Z`}
                    opacity={0.5}
                />
                <text
                    className="dim"
                    x={90}
                    y={50}
                    fontSize={28}
                    fontWeight={700}
                    textAnchor="middle"
                >
                    HDG
                </text>
                <text
                    className="fg"
                    x={90}
                    y={108}
                    fontSize={56}
                    fontWeight={700}
                    textAnchor="middle"
                >
                    {`${pad3(heading)}°`}
                </text>
                {showAwa ? (
                    <>
                        <text
                            className={mode === 2 ? undefined : 'dim'}
                            fill={mode === 2 ? COLORS.yellowDark : undefined}
                            x={VIEW_W - 90}
                            y={50}
                            fontSize={28}
                            fontWeight={700}
                            textAnchor="middle"
                        >
                            AWA
                        </text>
                        <text
                            className={mode === 2 ? undefined : 'dim'}
                            fill={mode === 2 ? COLORS.yellow : undefined}
                            x={VIEW_W - 90}
                            y={108}
                            fontSize={56}
                            fontWeight={700}
                            textAnchor="middle"
                        >
                            {`${awa === null ? '--' : Math.abs(Math.round(awa))}°`}
                        </text>
                    </>
                ) : null}
                <text
                    className={modeInfo ? undefined : 'dim'}
                    fill={modeInfo?.color}
                    x={CX}
                    y={CY - 200}
                    fontSize={42}
                    fontWeight={700}
                    textAnchor="middle"
                >
                    {modeInfo ? this.word(modeInfo.word).toUpperCase() : '---'}
                </text>
                {center}
                {rudderBar}
            </svg>
        );
    }

    /**
     * The dial with the buttons
     *
     * @param tile in the box of the host: a click on a small one opens the dialog
     */
    #renderPilot(tile: boolean): JSX.Element {
        const values = this.#getValues();
        const { mode } = values;
        const adjustDisabled = mode === null || mode === 0 || mode === 3;
        const comma = this.isFloatComma;
        return (
            <div className="ap">
                <div className="dial">
                    {this.#renderDial(values, true)}
                    {tile ? (
                        <button
                            type="button"
                            className="open"
                            title={this.text(NAMES.autopilot)}
                            aria-label={this.text(NAMES.autopilot)}
                            onClick={this.#onOpen}
                        />
                    ) : null}
                </div>
                <div className="controls">
                    <div className="group">
                        {MODES.slice(0, 4).map(m => {
                            const active = mode === m.val;
                            return (
                                <button
                                    key={m.val}
                                    type="button"
                                    className="btn"
                                    style={{
                                        color: active ? '#fff' : m.color,
                                        background: active ? m.color : 'transparent',
                                        borderColor: m.color,
                                        fontWeight: active ? 700 : 500,
                                    }}
                                    onClick={() => this.#write('autoPilot.state', m.val)}
                                >
                                    {this.word(m.word)}
                                </button>
                            );
                        })}
                    </div>
                    <div className="group">
                        {([-10, -1, 1, 10] as const).map(delta => (
                            <button
                                key={delta}
                                type="button"
                                className="btn"
                                disabled={adjustDisabled}
                                onClick={() => this.#adjust(mode, delta)}
                            >
                                {delta > 0 ? `+${delta}` : `−${-delta}`}
                            </button>
                        ))}
                    </div>
                    <div className="speeds">
                        <div className="stw">
                            <div className="label">STW</div>
                            <div className="value">{formatNum(values.stw, 1, comma)}</div>
                            <div className="unit">kn</div>
                        </div>
                        <div className="sog">
                            <div className="label">SOG</div>
                            <div className="value">{formatNum(values.sog, 1, comma)}</div>
                            <div className="unit">kn</div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    protected override renderContent(): JSX.Element {
        if (!this.settings.instance) {
            return (
                <Hint
                    text={this.word('chooseInstance')}
                    editMode={this.editMode}
                />
            );
        }
        const values = this.#getValues();
        const modeInfo = MODES.find(m => m.val === values.mode);
        return (
            <div className={`fill${this.editMode ? ' edit' : ''}`}>
                {this.#renderPilot(true)}
                <div
                    className="bar clickable"
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
                    <div>
                        <div className="label">HDG</div>
                        <div className="value">{pad3(values.heading)}°</div>
                    </div>
                    <div>
                        <div className="label">{this.word('mode')}</div>
                        <div
                            className="value"
                            style={{ color: modeInfo?.color }}
                        >
                            {modeInfo ? this.word(modeInfo.word).toUpperCase() : '—'}
                        </div>
                    </div>
                    <div>
                        <div className="label">{this.word('lock')}</div>
                        <div className="value">
                            {values.mode !== null && values.mode !== 0 ? `${pad3(values.locked)}°` : '—'}
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

defineWebComponent(getTag('autopilot'), NmeaAutopilotElement);
