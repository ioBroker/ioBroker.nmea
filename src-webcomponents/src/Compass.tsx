/**
 * The navigation compass as a web component: `<iob-nmea-compass>` - the "Navigation" window of the vis-2 widget
 * "Complex" (`src-widgets/src/Components/Navigation.tsx`), which has no native widget of its own.
 *
 * A compass rose turning with the course over ground, so the course is always up, the boat in the middle, the
 * true wind direction as a yellow "T" arrow, the course in degrees with its point of the compass, and optionally
 * the rudder as a bar below.
 */
import type { JSX } from 'react';

import { defineWebComponent } from '@iobroker/web-components/element';

import { type CompassSettings, getTag } from './constants';
import { Hint } from './Hint';
import { AngleUnwrapper, compassPoint, pad3, polar } from './nautic';
import { NmeaElement } from './NmeaElement';

const CX = 500;
const CY = 500;
const R = 470;
const RUDDER_MAX = 50;

/** Tapered pointer: wide at the rim, its tip towards the middle */
const POINTER_PATH =
    'm 451.77021,55.078207 42.08541,-33.202814 a 12.555638,12.555638 0.26446337 0 1 15.64423,0.07221 l 42.20046,33.930296 a 15.557694,15.557694 71.53185 0 1 5.32954,15.957795 L 504.17034,279.76529 a 2.5373267,2.5373267 0.02614114 0 1 -4.91879,-0.002 L 446.37431,70.966036 a 15.416336,15.416336 108.75875 0 1 5.3959,-15.887829 z';

const CSS = `
.compass {
    position: absolute;
    inset: 0;
}
.compass svg {
    width: 100%;
    height: 100%;
}
.face { fill: var(--nmea-face); stroke: currentColor; }
.fg { fill: currentColor; }
.fg-stroke { stroke: currentColor; }
.mount { --nmea-face: #000; }
.mount.light { --nmea-face: #fff; }
.rot {
    transform-origin: 500px 500px;
    transition: transform 600ms cubic-bezier(0.65, 0, 0.35, 1);
}
`;

class NmeaCompassElement extends NmeaElement<CompassSettings> {
    readonly #unwrapper = new AngleUnwrapper();

    constructor() {
        super(CSS);
    }

    protected override getStateIds(settings: CompassSettings): string[] {
        const instance = settings.instance;
        if (!instance) {
            return [];
        }
        const ids = [
            `${instance}.cogSogRapidUpdate.cogTrue`,
            `${instance}.cogSogRapidUpdate.cog`,
            // the default of the vis-2 widget
            `${instance}.directionData.cogTrue`,
            `${instance}.windData.windDirectionTrue`,
        ];
        if (settings.showRudder) {
            ids.push(`${instance}.rudder.position`);
        }
        return ids;
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
        const cog =
            this.num(`${instance}.cogSogRapidUpdate.cogTrue`) ??
            this.num(`${instance}.cogSogRapidUpdate.cog`) ??
            this.num(`${instance}.directionData.cogTrue`);
        const twd = this.num(`${instance}.windData.windDirectionTrue`);
        const rudder = settings.showRudder ? this.num(`${instance}.rudder.position`) : null;
        const roseAngle = this.#unwrapper.get('rose', cog !== null ? -cog : null);
        const twdAngle = this.#unwrapper.get('twd', twd !== null && cog !== null ? twd - cog : twd);

        const ticks: JSX.Element[] = [];
        for (let a = 0; a < 360; a += 5) {
            const major = a % 30 === 0;
            const p1 = polar(CX, CY, R - (major ? 40 : a % 10 ? 14 : 24), a);
            const p2 = polar(CX, CY, R - 4, a);
            ticks.push(
                <line
                    key={`t${a}`}
                    className="fg-stroke"
                    x1={p1.x}
                    y1={p1.y}
                    x2={p2.x}
                    y2={p2.y}
                    strokeWidth={major ? 6 : 2}
                />,
            );
            if (major) {
                const pos = polar(CX, CY, R - 80, a);
                const cardinal = a % 90 === 0;
                ticks.push(
                    <text
                        key={`l${a}`}
                        className="fg"
                        x={pos.x}
                        y={pos.y}
                        fontSize={cardinal ? 60 : 44}
                        fontWeight={cardinal ? 700 : 400}
                        textAnchor="middle"
                        dominantBaseline="central"
                        transform={`rotate(${a} ${pos.x} ${pos.y})`}
                    >
                        {a === 0 ? 'N' : a === 90 ? 'E' : a === 180 ? 'S' : a === 270 ? 'W' : String(a)}
                    </text>,
                );
            }
        }

        let rudderBar: JSX.Element | null = null;
        if (settings.showRudder) {
            const w = 600;
            const x = CX - w / 2;
            const y = CY + 150;
            const px =
                rudder !== null ? (Math.max(-RUDDER_MAX, Math.min(RUDDER_MAX, rudder)) / RUDDER_MAX) * (w / 2) : 0;
            rudderBar = (
                <g>
                    <rect
                        className="fg-stroke"
                        x={x}
                        y={y}
                        width={w}
                        height={36}
                        fill="none"
                        strokeWidth={3}
                    />
                    <line
                        className="fg-stroke"
                        x1={CX}
                        y1={y}
                        x2={CX}
                        y2={y + 36}
                        strokeWidth={3}
                    />
                    {rudder !== null ? (
                        <rect
                            x={px >= 0 ? CX : CX + px}
                            y={y + 4}
                            width={Math.abs(px)}
                            height={28}
                            fill={px >= 0 ? '#2e7d32' : '#c62828'}
                            style={{ transition: 'all 0.3s linear' }}
                        />
                    ) : null}
                </g>
            );
        }

        return (
            <div className={`compass${this.editMode ? ' edit' : ''}`}>
                <svg
                    viewBox="0 0 1000 1000"
                    preserveAspectRatio="xMidYMid meet"
                >
                    <circle
                        className="face"
                        cx={CX}
                        cy={CY}
                        r={R}
                        strokeWidth={4}
                    />
                    <g
                        className="rot"
                        style={{ transform: `rotate(${roseAngle}deg)` }}
                    >
                        {ticks}
                    </g>
                    {/* the boat, bow up */}
                    <path
                        className="fg"
                        d="M 500 250 C 560 300, 590 420, 575 600 L 425 600 C 410 420, 440 300, 500 250 Z"
                        opacity={0.18}
                    />
                    <path
                        className="fg-stroke"
                        d="M 500 250 C 560 300, 590 420, 575 600 L 425 600 C 410 420, 440 300, 500 250 Z"
                        fill="none"
                        strokeWidth={4}
                        opacity={0.6}
                    />
                    {twd !== null ? (
                        <g
                            className="rot"
                            style={{ transform: `rotate(${twdAngle}deg)` }}
                        >
                            <path
                                d={POINTER_PATH}
                                transform="matrix(0.6,0,0,0.7,200,10)"
                                fill="#ffdf00"
                            />
                            <text
                                x={CX}
                                y={85}
                                textAnchor="middle"
                                dominantBaseline="central"
                                fontSize={52}
                                fontWeight={700}
                                fill="#000"
                            >
                                T
                            </text>
                        </g>
                    ) : null}
                    <text
                        className="fg"
                        x={CX}
                        y={CY - 10}
                        fontSize={110}
                        fontWeight={700}
                        textAnchor="middle"
                    >
                        {`${pad3(cog)}°`}
                    </text>
                    <text
                        className="fg"
                        x={CX}
                        y={CY + 70}
                        fontSize={56}
                        textAnchor="middle"
                        opacity={0.8}
                    >
                        {compassPoint(cog)}
                    </text>
                    {rudderBar}
                </svg>
            </div>
        );
    }
}

defineWebComponent(getTag('compass'), NmeaCompassElement);
