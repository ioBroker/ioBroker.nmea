/**
 * A value as on a marine instrument, as a web component: `<iob-nmea-instrument>` - the web component of the vis-2
 * widget "Instrument" (`src-widgets/src/Instrument.tsx`).
 *
 * Up to four states, one at a time, with name, value and unit as large as the box allows; the arrows show the next
 * one. A value can show a plus sign and a green flash when it changes, with fixed digits before and after the
 * decimal separator. Name and unit come from the object of the state if the settings leave them empty.
 *
 * The vis-2 widget keeps any number of values in its own editor and can synchronize the shown value between
 * browsers through a state of vis-2; the settings of a web component are plain fields, so it takes four, and the
 * shown value is the choice of each viewer.
 */
import type { JSX } from 'react';

import { defineWebComponent } from '@iobroker/web-components/element';

import { getTag, INSTRUMENT_VALUES, type InstrumentSettings } from './constants';
import { Hint } from './Hint';
import { NmeaElement } from './NmeaElement';

const CSS = `
.instrument {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    padding: clamp(4px, 4cqmin, 12px);
    box-sizing: border-box;
    overflow: hidden;
}
.name {
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.2;
}
.number {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: baseline;
    justify-content: center;
    white-space: nowrap;
    line-height: 1;
}
.number > span {
    align-self: center;
}
.decimals {
    font-size: 0.8em;
}
.unit {
    font-size: 0.45em;
    opacity: 0.6;
    margin-left: 0.15em;
}
.flash {
    animation: nmea-flash 2s ease-in-out;
}
@keyframes nmea-flash {
    0% { color: #00f900; }
    80% { color: #008000; }
}
.nav {
    position: absolute;
    right: 2px;
    bottom: 2px;
    display: flex;
    gap: 2px;
}
.nav button {
    font: inherit;
    font-size: 12px;
    line-height: 1;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--iob-text-secondary);
    cursor: pointer;
}
.nav button:hover {
    background: color-mix(in srgb, currentColor 15%, transparent);
}
.dots {
    position: absolute;
    left: 50%;
    bottom: 4px;
    transform: translateX(-50%);
    display: flex;
    gap: 4px;
}
.dots span {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--iob-text-secondary);
    opacity: 0.35;
}
.dots span.active {
    opacity: 1;
}
`;

/** One value of the settings */
interface Item {
    oid: string;
    name: string;
    unit: string;
    beforeComma: number;
    afterComma: number;
    color: string;
    showPlus: boolean;
    changes: boolean;
}

function getItems(settings: InstrumentSettings): Item[] {
    const items: Item[] = [];
    for (let i = 1; i <= INSTRUMENT_VALUES; i++) {
        const oid = settings[`oid${i}`];
        if (typeof oid === 'string' && oid) {
            items.push({
                oid,
                name: String(settings[`name${i}`] ?? ''),
                unit: String(settings[`unit${i}`] ?? ''),
                beforeComma: Number(settings[`beforeComma${i}`]) || 0,
                afterComma: Number(settings[`afterComma${i}`]) || 0,
                color: String(settings[`color${i}`] ?? ''),
                showPlus: !!settings[`showPlus${i}`],
                changes: !!settings[`changes${i}`],
            });
        }
    }
    return items;
}

/**
 * A number with leading zeros and fixed decimals: the integer part and the decimals with their separator
 *
 * @param val the number
 * @param before digits before the separator at least
 * @param after digits after it
 * @param comma true if the system writes `1,5`
 */
function formatInstrument(val: number, before: number, after: number, comma: boolean): [string, string] {
    const fixed = Math.abs(val).toFixed(after);
    const [integer, decimals] = fixed.split('.');
    const sign = val < 0 && Number(fixed) !== 0 ? '-' : '';
    return [`${sign}${integer.padStart(before, '0')}`, decimals ? `${comma ? ',' : '.'}${decimals}` : ''];
}

class NmeaInstrumentElement extends NmeaElement<InstrumentSettings> {
    /** The value shown, of the configured ones */
    #index = 0;

    constructor() {
        super(CSS);
    }

    protected override getStateIds(settings: InstrumentSettings): string[] {
        // all of them: the next one is there at once
        return getItems(settings).map(item => item.oid);
    }

    #step(direction: 1 | -1, count: number): void {
        this.#index = (this.#index + direction + count) % count;
        this.render();
    }

    protected override renderContent(): JSX.Element {
        const items = getItems(this.settings);
        if (!items.length) {
            return (
                <Hint
                    text={this.word('noValues')}
                    editMode={this.editMode}
                />
            );
        }
        if (this.#index >= items.length) {
            this.#index = 0;
        }
        const item = items[this.#index];
        const obj = this.objects[item.oid] as ioBroker.StateObject | null | undefined;
        const name = item.name || (obj?.common?.name ? this.text(obj.common.name) : item.oid.split('.').pop() || '');
        const unit = item.unit || obj?.common?.unit || '';
        const state = this.states[item.oid];
        const val = state?.val;

        let integer = '---';
        let decimals = '';
        if (val !== null && val !== undefined && val !== '') {
            const n = typeof val === 'number' ? val : parseFloat(String(val));
            if (Number.isFinite(n) && (typeof val !== 'string' || /^\s*-?[\d.,]+\s*$/.test(val))) {
                [integer, decimals] = formatInstrument(n, item.beforeComma, item.afterComma, this.isFloatComma);
                if (item.showPlus && n > 0) {
                    integer = `+${integer}`;
                }
            } else {
                integer = String(val);
            }
        }
        // as large as the box: the height, or the width for the number of characters
        const chars = integer.length + decimals.length * 0.8 + unit.length * 0.45 + 0.5;
        const fontSize = `min(52cqh, ${(160 / chars).toFixed(1)}cqw)`;
        const nameSize = `min(16cqh, ${(180 / Math.max(6, name.length)).toFixed(1)}cqw)`;

        return (
            <div
                className={`instrument${this.editMode ? ' edit' : ''}`}
                style={{ color: item.color || undefined }}
            >
                <div
                    className="name"
                    style={{ fontSize: nameSize }}
                >
                    {name}
                </div>
                <div
                    className="number"
                    style={{ fontSize }}
                >
                    <span
                        // a new value starts the flash again
                        key={`${this.#index}:${integer}${decimals}`}
                        className={item.changes && state ? 'flash' : undefined}
                    >
                        {integer}
                        {decimals ? <span className="decimals">{decimals}</span> : null}
                        {unit ? <span className="unit">{unit}</span> : null}
                    </span>
                </div>
                {items.length > 1 ? (
                    <>
                        <div className="dots">
                            {items.map((_item, i) => (
                                <span
                                    key={i}
                                    className={i === this.#index ? 'active' : undefined}
                                />
                            ))}
                        </div>
                        <div className="nav">
                            <button
                                type="button"
                                aria-label="▲"
                                onClick={() => this.#step(-1, items.length)}
                            >
                                ▲
                            </button>
                            <button
                                type="button"
                                aria-label="▼"
                                onClick={() => this.#step(1, items.length)}
                            >
                                ▼
                            </button>
                        </div>
                    </>
                ) : null}
            </div>
        );
    }
}

defineWebComponent(getTag('instrument'), NmeaInstrumentElement);
