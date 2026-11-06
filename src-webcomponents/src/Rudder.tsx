/**
 * The rudder angle indicator as a web component: `<iob-nmea-rudder>` - the "Rudder" window of the vis-2 widget
 * "Complex" (`src-widgets/src/Components/Rudder.tsx`), which has no native widget of its own.
 *
 * A gauge over 240° with the rudder straight down, port red on the left and starboard green on the right, and a
 * red needle. Like the vis-2 widget it zooms in on small angles: below `rudderZoomAt` the scale ends at
 * `rudderZoomAt + rudderZoomDelay`, above it the full range; the delay keeps it from switching back and forth. The
 * button in the middle switches by hand. The full range is `rudderMinMax`, else `common.max`/`common.min` of the
 * state, else 50°.
 */
import type { JSX } from 'react';

import { defineWebComponent } from '@iobroker/web-components/element';

import { getTag, type RudderSettings } from './constants';
import { Hint } from './Hint';
import { arcPath, formatNum, polar } from './nautic';
import { NmeaElement } from './NmeaElement';

const CX = 500;
const CY = 500;
const R = 470;
/** The scale spans ±120° around the bottom */
const HALF_SPAN = 120;
const DEFAULT_ZOOM_AT = 12;
const DEFAULT_ZOOM_DELAY = 4;
const DEFAULT_MIN_MAX = 50;

/** Material Design "zoom in" / "zoom out" */
const ZOOM_IN_PATH =
    'M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14m.5-7H9v2H7v1h2v2h1v-2h2V9h-2z';
const ZOOM_OUT_PATH =
    'M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14M7 9h5v1H7z';

const CSS = `
.rudder {
    position: absolute;
    inset: 0;
}
.rudder svg {
    width: 100%;
    height: 100%;
}
.face { fill: var(--nmea-face); stroke: currentColor; }
.fg { fill: currentColor; }
.fg-stroke { stroke: currentColor; }
.mount { --nmea-face: #000; }
.mount.light { --nmea-face: #fff; }
.needle {
    transform-origin: 500px 500px;
    transition: transform 300ms linear;
}
.zoom {
    cursor: pointer;
}
.zoom:hover circle {
    fill: #666;
}
`;

class NmeaRudderElement extends NmeaElement<RudderSettings> {
    /** Zoomed in on small angles; null until the first value */
    #zoomed: boolean | null = null;

    constructor() {
        super(CSS);
    }

    protected override getStateIds(settings: RudderSettings): string[] {
        return settings.instance ? [`${settings.instance}.rudder.position`] : [];
    }

    #toggleZoom = (): void => {
        if (!this.editMode) {
            this.#zoomed = !this.#zoomed;
            this.render();
        }
    };

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
        const id = `${instance}.rudder.position`;
        const rudder = this.num(id);
        const zoomAt = settings.rudderZoomAt || DEFAULT_ZOOM_AT;
        const delay = settings.rudderZoomDelay || DEFAULT_ZOOM_DELAY;
        // switch with a hysteresis, so it does not switch back and forth around zoomAt
        if (this.#zoomed === null) {
            this.#zoomed = Math.abs(rudder || 0) <= zoomAt;
        }
        if (rudder !== null) {
            if (this.#zoomed && Math.abs(rudder) > zoomAt + delay) {
                this.#zoomed = false;
            } else if (!this.#zoomed && Math.abs(rudder) <= zoomAt - delay) {
                this.#zoomed = true;
            }
        }
        const obj = this.objects[id] as ioBroker.StateObject | null | undefined;
        const fullRange =
            settings.rudderMinMax ||
            Math.abs(Number(obj?.common?.max) || Number(obj?.common?.min) || 0) ||
            DEFAULT_MIN_MAX;
        const minMax = this.#zoomed ? zoomAt + delay : fullRange;
        const factor = HALF_SPAN / minMax;
        /** The bearing of the dial for a rudder angle: 0 straight down, starboard to the right */
        const bearing = (angle: number): number => 180 - angle * factor;

        const scale: JSX.Element[] = [];
        for (let angle = -Math.floor(minMax); angle <= minMax; angle++) {
            const ten = angle % 10 === 0;
            if (!ten && minMax > 30 && angle % 2) {
                continue;
            }
            const p1 = polar(CX, CY, R - (ten ? 44 : 20), bearing(angle));
            const p2 = polar(CX, CY, R - 4, bearing(angle));
            scale.push(
                <line
                    key={`t${angle}`}
                    className="fg-stroke"
                    x1={p1.x}
                    y1={p1.y}
                    x2={p2.x}
                    y2={p2.y}
                    strokeWidth={ten ? 5 : 2}
                />,
            );
            if (ten) {
                const pos = polar(CX, CY, R - 80, bearing(angle));
                scale.push(
                    <text
                        key={`l${angle}`}
                        className="fg"
                        x={pos.x}
                        y={pos.y}
                        fontSize={40}
                        textAnchor="middle"
                        dominantBaseline="central"
                    >
                        {Math.abs(angle)}
                    </text>,
                );
            }
        }
        // where it zooms back in, on the full scale
        if (!this.#zoomed && zoomAt - delay > 0 && zoomAt - delay < minMax) {
            for (const angle of [-(zoomAt - delay), zoomAt - delay]) {
                const p1 = polar(CX, CY, R - 50, bearing(angle));
                const p2 = polar(CX, CY, R - 4, bearing(angle));
                scale.push(
                    <line
                        key={`z${angle}`}
                        x1={p1.x}
                        y1={p1.y}
                        x2={p2.x}
                        y2={p2.y}
                        stroke="#0f0"
                        strokeWidth={6}
                    />,
                );
            }
        }
        // the zoom cannot be switched by hand where the hysteresis would switch it back
        const canToggle = this.#zoomed
            ? Math.abs(rudder || 0) > zoomAt - delay
            : Math.abs(rudder || 0) <= zoomAt + delay;
        const port = polar(CX, CY, R - 130, 320);
        const starboard = polar(CX, CY, R - 130, 40);
        const needle = rudder !== null ? bearing(Math.max(-minMax, Math.min(minMax, rudder))) : null;

        return (
            <div className={`rudder${this.editMode ? ' edit' : ''}`}>
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
                    <path
                        d={arcPath(CX, CY, R - 10, 180, 180 + HALF_SPAN)}
                        fill="none"
                        stroke="#ff0000"
                        strokeOpacity={0.67}
                        strokeWidth={20}
                    />
                    <path
                        d={arcPath(CX, CY, R - 10, 180 - HALF_SPAN, 180)}
                        fill="none"
                        stroke="#00ff00"
                        strokeOpacity={0.67}
                        strokeWidth={20}
                    />
                    {scale}
                    <text
                        className="fg"
                        x={port.x}
                        y={port.y}
                        fontSize={44}
                        fontWeight={700}
                        textAnchor="middle"
                    >
                        {this.word('port')}
                    </text>
                    <text
                        className="fg"
                        x={starboard.x}
                        y={starboard.y}
                        fontSize={44}
                        fontWeight={700}
                        textAnchor="middle"
                    >
                        {this.word('starboard')}
                    </text>
                    <text
                        className="fg"
                        x={CX}
                        y={CY - 120}
                        fontSize={72}
                        fontWeight={700}
                        textAnchor="middle"
                    >
                        {rudder !== null ? `${formatNum(Math.abs(rudder), 0, false)}°` : '---°'}
                    </text>
                    {needle !== null ? (
                        <g
                            className="needle"
                            style={{ transform: `rotate(${needle}deg)` }}
                        >
                            <path
                                d={`M ${CX - 16} ${CY - 80} L ${CX - 8} ${CY - 400} L ${CX + 8} ${CY - 400} L ${CX + 16} ${CY - 80} Z`}
                                fill="#ff0000"
                                fillOpacity={0.67}
                            />
                        </g>
                    ) : null}
                    <g
                        className={canToggle ? 'zoom' : undefined}
                        role={canToggle ? 'button' : undefined}
                        onClick={canToggle ? this.#toggleZoom : undefined}
                    >
                        <circle
                            cx={CX}
                            cy={CY}
                            r={80}
                            fill="grey"
                        />
                        {canToggle ? (
                            <path
                                d={this.#zoomed ? ZOOM_OUT_PATH : ZOOM_IN_PATH}
                                transform={`translate(${CX - 48} ${CY - 48}) scale(4)`}
                                fill="#fff"
                            />
                        ) : null}
                    </g>
                </svg>
            </div>
        );
    }
}

defineWebComponent(getTag('rudder'), NmeaRudderElement);
