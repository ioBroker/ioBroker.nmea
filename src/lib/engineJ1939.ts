// Custom handler for SAE J1939 engine PGNs that aren't covered by @canboat/ts-pgns.
//
// Each J1939 engine PGN is a single 8-byte CAN frame. The canboat fallback parser treats these
// as opaque "proprietary single-frame non-addressed" packets, so the raw bytes (`rawData`)
// are what we decode here, against the SAE J1939-71 spec.
//
// Per-ECU state is grouped under a channel `engineJ1939.<src>` so multiple engines (with
// different source addresses on the bus) land in separate object trees.

import type { PGN } from '@canboat/ts-pgns';

/**
 * Accessor into the host adapter — kept intentionally narrow so we don't couple to main.ts types.
 *  Return types use `any` because ioBroker's typings differ subtly between `@iobroker/adapter-core`
 *  (`SetObjectPromise`) and this module's call sites — we never inspect the return value.
 */
export interface J1939Host {
    setObjectNotExistsAsync: (id: string, obj: ioBroker.SettableObject) => Promise<any>;
    setState: (id: string, value: ioBroker.StateValue | ioBroker.SettableState, ack?: boolean) => Promise<any>;
    log: ioBroker.Logger;
}

/** PGNs that we handle in this module. main.ts routes matching packets to `processEngineJ1939`. */
export const ENGINE_J1939_PGNS: ReadonlySet<number> = new Set([
    61443, // EEC2 — Electronic Engine Controller 2
    61444, // EEC1 — Electronic Engine Controller 1
    61445, // ETC2 — Electronic Transmission Controller 2
    65226, // DM1  — Active Diagnostic Trouble Codes (lamp status only)
    65253, // HOURS — Engine Hours, Revolutions
    65262, // ET1 — Engine Temperature 1
    65263, // EFL/P1 — Engine Fluid Level/Pressure 1
    65266, // LFE — Fuel Economy (Liquid)
    65270, // IC1 — Inlet/Exhaust Conditions 1
    65271, // VEP1 — Vehicle Electrical Power 1
    65272, // TF1 — Transmission Fluids 1
    65276, // DD — Dash Display
    65279, // WFI — Water in Fuel Indicator
    65373, // Volvo Penta proprietary (engine tilt/trim) — raw-byte passthrough
    65417, // Volvo Penta proprietary (MDI warnings) — raw-byte passthrough
]);

/** Accumulates which states have already been created (per channel) so we don't hit setObjectNotExistsAsync every packet. */
const createdStates = new Set<string>();
const createdChannels = new Set<string>();

interface StateDef {
    key: string;
    name: string;
    unit?: string;
    role?: string;
    min?: number;
    max?: number;
}

async function ensureChannel(host: J1939Host, channelId: string, name: string): Promise<void> {
    if (createdChannels.has(channelId)) {
        return;
    }
    createdChannels.add(channelId);
    await host.setObjectNotExistsAsync(channelId, {
        type: 'channel',
        common: { name },
        native: {},
    });
}

async function writeState(
    host: J1939Host,
    channelId: string,
    def: StateDef,
    value: number | string | null,
): Promise<void> {
    const id = `${channelId}.${def.key}`;
    if (!createdStates.has(id)) {
        createdStates.add(id);
        await host.setObjectNotExistsAsync(id, {
            type: 'state',
            common: {
                name: def.name,
                type: typeof value === 'string' ? 'string' : 'number',
                role: def.role || 'value',
                unit: def.unit,
                min: def.min,
                max: def.max,
                read: true,
                write: false,
            },
            native: {},
        });
    }
    if (value == null) {
        return; // leave last known value in place when the SPN reports "not available"
    }
    await host.setState(id, value, true);
}

/** Return the byte at `offset` from a rawData buffer/array; `undefined` if out of bounds. */
function byteAt(raw: number[] | Buffer | undefined, offset: number): number | undefined {
    if (!raw || offset >= raw.length) {
        return undefined;
    }
    return (raw as any)[offset] & 0xff;
}

/** 1-byte SPN with J1939 "not available" (0xFF) / "error" (0xFE) sentinels. */
function spn1(raw: number[] | Buffer | undefined, offset: number, scale = 1, bias = 0): number | null {
    const b = byteAt(raw, offset);
    if (b === undefined || b === 0xff || b === 0xfe) {
        return null;
    }
    return b * scale + bias;
}

/** 2-byte little-endian SPN. Invalid when high byte ≥ 0xFE (0xFExx/0xFFxx range). */
function spn2LE(raw: number[] | Buffer | undefined, offset: number, scale = 1, bias = 0): number | null {
    const lo = byteAt(raw, offset);
    const hi = byteAt(raw, offset + 1);
    if (lo === undefined || hi === undefined || hi >= 0xfe) {
        return null;
    }
    return (lo | (hi << 8)) * scale + bias;
}

/** 4-byte little-endian SPN. Invalid when highest byte ≥ 0xFE. */
function spn4LE(raw: number[] | Buffer | undefined, offset: number, scale = 1, bias = 0): number | null {
    const b0 = byteAt(raw, offset);
    const b1 = byteAt(raw, offset + 1);
    const b2 = byteAt(raw, offset + 2);
    const b3 = byteAt(raw, offset + 3);
    if (b0 === undefined || b1 === undefined || b2 === undefined || b3 === undefined) {
        return null;
    }
    if (b3 >= 0xfe) {
        return null;
    }
    // >>> 0 forces unsigned interpretation (JS bitwise ops are otherwise 32-bit signed).
    return ((b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0) * scale + bias;
}

/** Render 8 bytes as "01 23 45 67 89 ab cd ef" — useful for proprietary PGNs without a public spec. */
function rawHex(raw: number[] | Buffer | undefined): string | null {
    if (!raw) {
        return null;
    }
    const out: string[] = [];
    for (let i = 0; i < Math.min(raw.length, 8); i++) {
        out.push(((raw as any)[i] & 0xff).toString(16).padStart(2, '0'));
    }
    return out.join(' ');
}

function round(val: number | null, digits: number): number | null {
    if (val == null) {
        return null;
    }
    const f = 10 ** digits;
    return Math.round(val * f) / f;
}

/** J1939 2-bit lamp status lookup (bits 1-2, 3-4, 5-6, 7-8 of the first DM1 byte). */
const LAMP_STATES: Record<number, string> = {
    0b00: 'off',
    0b01: 'on',
    0b10: 'error',
    0b11: 'notAvailable',
};

/** Interpret a 2-bit lamp status slice. */
function lamp(byteVal: number | undefined, bitOffset: number): string | null {
    if (byteVal === undefined || byteVal === 0xff) {
        return null;
    }
    return LAMP_STATES[(byteVal >> bitOffset) & 0b11] ?? null;
}

export async function processEngineJ1939(
    host: J1939Host,
    data: PGN & { rawData?: number[] | Buffer; src?: number },
): Promise<void> {
    const src = data.src ?? 0;
    const channelId = `engineJ1939.${src}`;
    const raw = data.rawData;
    if (!raw) {
        host.log.debug(`J1939 PGN ${data.pgn}: rawData missing — driver must enable includeRawData`);
        return;
    }

    await ensureChannel(host, channelId, `Engine / source ${src}`);

    switch (data.pgn) {
        case 61443: {
            // EEC2 — byte 3 (index 2): Engine Percent Load At Current Speed, 1%/bit, 0..250
            const load = spn1(raw, 2, 1, 0);
            await writeState(
                host,
                channelId,
                { key: 'percentLoad', name: 'Engine Percent Load', unit: '%', role: 'value', min: 0, max: 250 },
                load,
            );
            break;
        }
        case 61444: {
            // EEC1 — byte 3 (idx 2): Actual Engine Percent Torque, 1%/bit, -125 offset
            const torque = spn1(raw, 2, 1, -125);
            // bytes 4-5 (idx 3-4): Engine Speed, 0.125 rpm/bit
            const rpm = spn2LE(raw, 3, 0.125, 0);
            await writeState(
                host,
                channelId,
                { key: 'percentTorque', name: 'Actual Engine Percent Torque', unit: '%', min: -125, max: 125 },
                torque,
            );
            await writeState(
                host,
                channelId,
                { key: 'engineSpeed', name: 'Engine Speed', unit: 'rpm', role: 'value.speed', min: 0 },
                round(rpm, 1),
            );
            break;
        }
        case 61445: {
            // ETC2 — byte 4 (idx 3): Transmission Current Gear, 1 gear/bit, -125 offset (negative=reverse)
            const gear = spn1(raw, 3, 1, -125);
            await writeState(
                host,
                channelId,
                { key: 'currentGear', name: 'Transmission Current Gear', role: 'value' },
                gear,
            );
            break;
        }
        case 65226: {
            // DM1 — lamp status (byte 1). DTC list itself is out of scope (needs multipacket + FMI parsing).
            const b0 = byteAt(raw, 0);
            await writeState(
                host,
                channelId,
                { key: 'lamp.malfunctionIndicator', name: 'Malfunction Indicator Lamp' },
                lamp(b0, 6),
            );
            await writeState(host, channelId, { key: 'lamp.redStop', name: 'Red Stop Lamp' }, lamp(b0, 4));
            await writeState(host, channelId, { key: 'lamp.amberWarning', name: 'Amber Warning Lamp' }, lamp(b0, 2));
            await writeState(host, channelId, { key: 'lamp.protect', name: 'Protect Lamp' }, lamp(b0, 0));
            break;
        }
        case 65253: {
            // HOURS — bytes 1-4 (idx 0-3): Engine Total Hours of Operation, 0.05 h/bit
            const hours = spn4LE(raw, 0, 0.05, 0);
            await writeState(
                host,
                channelId,
                { key: 'totalHours', name: 'Engine Total Hours of Operation', unit: 'h', role: 'value', min: 0 },
                round(hours, 2),
            );
            break;
        }
        case 65262: {
            // ET1 — byte 1 (idx 0): Coolant Temp, 1°C/bit, -40 offset
            const coolantTemp = spn1(raw, 0, 1, -40);
            // bytes 3-4 (idx 2-3): Oil Temp 1, 0.03125°C/bit, -273 offset
            const oilTemp = spn2LE(raw, 2, 0.03125, -273);
            await writeState(
                host,
                channelId,
                {
                    key: 'coolantTemperature',
                    name: 'Engine Coolant Temperature',
                    unit: '°C',
                    role: 'value.temperature',
                    min: -40,
                    max: 210,
                },
                coolantTemp,
            );
            await writeState(
                host,
                channelId,
                {
                    key: 'oilTemperature',
                    name: 'Engine Oil Temperature',
                    unit: '°C',
                    role: 'value.temperature',
                    min: -273,
                },
                round(oilTemp, 2),
            );
            break;
        }
        case 65263: {
            // EFL/P1 — byte 1: Fuel Delivery Pressure (4 kPa/bit)
            const fuelPressure = spn1(raw, 0, 4, 0);
            // byte 4 (idx 3): Oil Pressure (4 kPa/bit)
            const oilPressure = spn1(raw, 3, 4, 0);
            // byte 7 (idx 6): Coolant Pressure (2 kPa/bit)
            const coolantPressure = spn1(raw, 6, 2, 0);
            await writeState(
                host,
                channelId,
                {
                    key: 'fuelPressure',
                    name: 'Engine Fuel Delivery Pressure',
                    unit: 'kPa',
                    role: 'value.pressure',
                    min: 0,
                },
                fuelPressure,
            );
            await writeState(
                host,
                channelId,
                { key: 'oilPressure', name: 'Engine Oil Pressure', unit: 'kPa', role: 'value.pressure', min: 0 },
                oilPressure,
            );
            await writeState(
                host,
                channelId,
                {
                    key: 'coolantPressure',
                    name: 'Engine Coolant Pressure',
                    unit: 'kPa',
                    role: 'value.pressure',
                    min: 0,
                },
                coolantPressure,
            );
            break;
        }
        case 65266: {
            // LFE — bytes 1-2 (idx 0-1): Engine Fuel Rate, 0.05 L/h/bit
            const fuelRate = spn2LE(raw, 0, 0.05, 0);
            await writeState(
                host,
                channelId,
                { key: 'fuelRate', name: 'Engine Fuel Rate', unit: 'L/h', role: 'value', min: 0 },
                round(fuelRate, 2),
            );
            break;
        }
        case 65270: {
            // IC1 — byte 2 (idx 1): Intake Manifold #1 Pressure, 2 kPa/bit
            const boost = spn1(raw, 1, 2, 0);
            // bytes 6-7 (idx 5-6): Exhaust Gas Temperature, 0.03125°C/bit, -273 offset
            const exhaustTemp = spn2LE(raw, 5, 0.03125, -273);
            await writeState(
                host,
                channelId,
                {
                    key: 'intakeManifoldPressure',
                    name: 'Engine Intake Manifold Pressure',
                    unit: 'kPa',
                    role: 'value.pressure',
                    min: 0,
                },
                boost,
            );
            await writeState(
                host,
                channelId,
                {
                    key: 'exhaustTemperature',
                    name: 'Engine Exhaust Gas Temperature',
                    unit: '°C',
                    role: 'value.temperature',
                    min: -273,
                },
                round(exhaustTemp, 2),
            );
            break;
        }
        case 65271: {
            // VEP1 — all four SPNs.
            // bytes 1-2 (idx 0-1): Net Battery Current (SPN 114), 1 A/bit, -32000 offset (signed range via bias)
            const netBattRaw = spn2LE(raw, 0, 1, -32000);
            // bytes 3-4 (idx 2-3): Alternator Current (SPN 115), 0.05 A/bit
            const alternator = spn2LE(raw, 2, 0.05, 0);
            // bytes 5-6 (idx 4-5): Charging System Potential (SPN 167), 0.05 V/bit
            const chargingV = spn2LE(raw, 4, 0.05, 0);
            // bytes 7-8 (idx 6-7): Battery Potential / Power Input 1 (SPN 168, alias SPN 158), 0.05 V/bit
            const battery = spn2LE(raw, 6, 0.05, 0);
            await writeState(
                host,
                channelId,
                { key: 'netBatteryCurrent', name: 'Net Battery Current', unit: 'A', role: 'value.current' },
                round(netBattRaw, 1),
            );
            await writeState(
                host,
                channelId,
                { key: 'alternatorCurrent', name: 'Alternator Current', unit: 'A', role: 'value.current', min: 0 },
                round(alternator, 2),
            );
            await writeState(
                host,
                channelId,
                {
                    key: 'chargingVoltage',
                    name: 'Charging System Potential',
                    unit: 'V',
                    role: 'value.voltage',
                    min: 0,
                },
                round(chargingV, 2),
            );
            await writeState(
                host,
                channelId,
                {
                    key: 'batteryVoltage',
                    name: 'Battery Potential / Power Input 1',
                    unit: 'V',
                    role: 'value.voltage',
                    min: 0,
                },
                round(battery, 2),
            );
            break;
        }
        case 65272: {
            // TF1 — Transmission Fluids 1
            // byte 4 (idx 3): Transmission Oil Pressure (SPN 127), 16 kPa/bit
            const oilPressure = spn1(raw, 3, 16, 0);
            // bytes 5-6 (idx 4-5): Transmission Oil Temperature (SPN 177), 0.03125°C/bit, -273 offset
            const oilTemp = spn2LE(raw, 4, 0.03125, -273);
            await writeState(
                host,
                channelId,
                {
                    key: 'transmissionOilPressure',
                    name: 'Transmission Oil Pressure',
                    unit: 'kPa',
                    role: 'value.pressure',
                    min: 0,
                },
                oilPressure,
            );
            await writeState(
                host,
                channelId,
                {
                    key: 'transmissionOilTemperature',
                    name: 'Transmission Oil Temperature',
                    unit: '°C',
                    role: 'value.temperature',
                    min: -273,
                },
                round(oilTemp, 2),
            );
            break;
        }
        case 65276: {
            // DD — Dash Display
            // byte 2 (idx 1): Fuel Level 1 (SPN 96), 0.4%/bit
            const fuelLevel1 = spn1(raw, 1, 0.4, 0);
            // byte 7 (idx 6): Fuel Level 2 (SPN 38), 0.4%/bit
            const fuelLevel2 = spn1(raw, 6, 0.4, 0);
            await writeState(
                host,
                channelId,
                { key: 'fuelLevel1', name: 'Fuel Level 1', unit: '%', role: 'value', min: 0, max: 100 },
                round(fuelLevel1, 1),
            );
            await writeState(
                host,
                channelId,
                { key: 'fuelLevel2', name: 'Fuel Level 2', unit: '%', role: 'value', min: 0, max: 100 },
                round(fuelLevel2, 1),
            );
            break;
        }
        case 65279: {
            // WFI — byte 1, bits 1-2 (LSB pair of idx 0): Water in Fuel Indicator (SPN 97).
            // 00=no water, 01=water present, 10=error, 11=not available.
            const b0 = byteAt(raw, 0);
            const waterInFuel =
                b0 === undefined || b0 === 0xff
                    ? null
                    : (({ 0: 'no', 1: 'yes', 2: 'error', 3: 'notAvailable' } as Record<number, string>)[b0 & 0b11] ??
                      null);
            await writeState(host, channelId, { key: 'waterInFuel', name: 'Water in Fuel Indicator' }, waterInFuel);
            break;
        }
        case 65373: {
            // Volvo Penta proprietary — engine tilt/trim. Layout is not publicly documented;
            // pass the raw 8 bytes through as hex so a user can reverse-engineer per installation.
            // Yacht Devices' YDEG-04 gateway calibrates it into NMEA 2000 127488 Engine Tilt/Trim.
            await writeState(
                host,
                channelId,
                { key: 'volvoTiltTrim.rawHex', name: 'Volvo Penta tilt/trim raw bytes' },
                rawHex(raw),
            );
            // Bytes 1-2 (idx 0-1) are believed to be a raw 16-bit LE sensor reading; expose it
            // as a convenience so dashboards can watch for changes.
            const raw16 = spn2LE(raw, 0, 1, 0);
            await writeState(
                host,
                channelId,
                { key: 'volvoTiltTrim.raw16', name: 'Volvo Penta tilt/trim raw u16' },
                raw16,
            );
            break;
        }
        case 65417: {
            // Volvo Penta proprietary — MDI warnings. No public spec; emit raw bytes as hex.
            await writeState(
                host,
                channelId,
                { key: 'volvoMdiWarnings.rawHex', name: 'Volvo Penta MDI warnings raw bytes' },
                rawHex(raw),
            );
            break;
        }
        default:
            break;
    }
}
