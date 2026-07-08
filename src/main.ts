import { type AdapterOptions, Adapter, I18n } from '@iobroker/adapter-core';
import { readFileSync, existsSync } from 'node:fs';
import { exec, type ExecException } from 'node:child_process';
import { find } from 'geo-tz';
import { FromPgn } from '@canboat/canboatjs';
import type { PGN } from '@canboat/ts-pgns';

import moment from 'moment';
// @ts-expect-error no types
import 'moment/locale/de';
// @ts-expect-error no types
import 'moment/locale/ru';
// @ts-expect-error no types
import 'moment/locale/it';
// @ts-expect-error no types
import 'moment/locale/fr';
// @ts-expect-error no types
import 'moment/locale/pl';
// @ts-expect-error no types
import 'moment/locale/pt';
// @ts-expect-error no types
import 'moment/locale/nl';
// @ts-expect-error no types
import 'moment/locale/es';
// @ts-expect-error no types
import 'moment/locale/uk';
// @ts-expect-error no types
import 'moment/locale/zh-cn';

import type { PGNType, NmeaConfig, PGNEntry, WritePgnData } from './types';

import META_DATA from './lib/metaData';
import SeaTalkAutoPilot from './lib/seaTalkAutoPilot';
import NavicoAutoPilot from './lib/navicoAutopilot';
import type AutoPilot from './lib/autoPilot';
import Fusion from './lib/fusion';
import NGT1 from './lib/ngt1';
import PicanM from './lib/picanM';
import YDWG from './lib/ydwg';
import type { GenericDriver } from './lib/genericDriver';
import { SignalKServer } from './lib/signalK';
import { ENGINE_J1939_PGNS, processEngineJ1939 } from './lib/engineJ1939';
import { AddressClaim } from './lib/addressClaim';
import { AnchorAlarm } from './lib/anchorAlarm';
import { AnchorTracker } from './lib/anchorTracker';

const pgnPath = require.resolve('@canboat/ts-pgns').replace(/\\/g, '/').split('/');
pgnPath.pop();
pgnPath.pop();
pgnPath.push('canboat.json');
const PGNS: PGNType = JSON.parse(readFileSync(pgnPath.join('/'), 'utf8'));

const WELL_KNOWN_AIS_GROUPS = [
    'aisClassAPositionReport',
    'aisClassAStaticAndVoyageRelatedData',
    'aisClassBPositionReport',
    'aisClassBStaticDataMsg24PartA',
    'aisClassBStaticDataMsg24PartB',
    'aisUtcAndDateReport',
];

const DEG = Math.PI / 180;
const MS_TO_KN = 1.9438444924574;

function normDeg(d: number): number {
    return ((d % 360) + 360) % 360;
}

function signedDeg(d: number): number {
    const a = normDeg(d);
    return a > 180 ? a - 360 : a;
}

// Port/starboard single-letter abbreviations per language, used to render the Seatalk
// Pilot Wind Datum the way the Raymarine pilot head does (e.g. "130°P" / in German
// "130°B"). Port = wind from the left side (datum 180…360°), starboard = from the right
// (0…180°). Conventional nautical abbreviations; falls back to English P/S.
const WIND_SIDE_ABBR: Record<string, { port: string; starboard: string }> = {
    en: { port: 'P', starboard: 'S' }, // Port / Starboard
    de: { port: 'B', starboard: 'S' }, // Backbord / Steuerbord
    ru: { port: 'Л', starboard: 'П' }, // Левый борт / Правый борт
    uk: { port: 'Л', starboard: 'П' }, // Лівий борт / Правий борт
    pl: { port: 'L', starboard: 'P' }, // Lewa burta / Prawa burta
    nl: { port: 'B', starboard: 'S' }, // Bakboord / Stuurboord
    fr: { port: 'B', starboard: 'T' }, // Bâbord / Tribord
    it: { port: 'B', starboard: 'T' }, // Babordo / Tribordo
    pt: { port: 'B', starboard: 'E' }, // Bombordo / Estibordo
    es: { port: 'B', starboard: 'E' }, // Babor / Estribor
    'zh-cn': { port: '左', starboard: '右' }, // 左舷 / 右舷
};

// Render an absolute wind datum (radians, 0…2π) the way a Raymarine pilot head shows it:
// 0…180° → starboard, 180…360° → port, each shown as a (≤180)° value plus a
// language-dependent side letter. 0° (dead ahead) and 180° (dead astern) carry no side.
function formatWindDatum(rad: number, lang: string): string {
    const side = WIND_SIDE_ABBR[lang] || WIND_SIDE_ABBR.en;
    const deg = Math.round(normDeg((rad * 180) / Math.PI)) % 360;
    if (deg === 0) {
        return '0°';
    }
    if (deg === 180) {
        return '180°';
    }
    return deg < 180 ? `${deg}°${side.starboard}` : `${360 - deg}°${side.port}`;
}

// V_apparent = V_true - V_boat, so V_true = V_apparent + V_boat.
// AWA is measured relative to the vessel bow, which points along `headingDeg`;
// `boatSpeed`/`boatCourseDeg` picks the reference frame (water: STW+heading → water-ref TW;
// ground: SOG+COG → ground-ref TW).
function computeTrueFromApparent(
    awaDeg: number,
    aws: number,
    boatSpeed: number,
    boatCourseDeg: number,
    headingDeg: number,
): { twa: number; tws: number; twd: number } {
    const awdCompass = normDeg(headingDeg + awaDeg); // direction wind comes FROM
    const aE = -aws * Math.sin(awdCompass * DEG); // apparent vector going-TO, east
    const aN = -aws * Math.cos(awdCompass * DEG);
    const bE = boatSpeed * Math.sin(boatCourseDeg * DEG);
    const bN = boatSpeed * Math.cos(boatCourseDeg * DEG);
    const tE = aE + bE;
    const tN = aN + bN;
    const tws = Math.sqrt(tE * tE + tN * tN);
    const toCompass = normDeg((Math.atan2(tE, tN) * 180) / Math.PI);
    const twd = normDeg(toCompass + 180); // "comes FROM"
    const twa = signedDeg(twd - headingDeg);
    return { twa, tws, twd };
}

function computeApparentFromTrue(
    twdDeg: number,
    tws: number,
    boatSpeed: number,
    boatCourseDeg: number,
    headingDeg: number,
): { awa: number; aws: number; awd: number } {
    const tE = -tws * Math.sin(twdDeg * DEG);
    const tN = -tws * Math.cos(twdDeg * DEG);
    const bE = boatSpeed * Math.sin(boatCourseDeg * DEG);
    const bN = boatSpeed * Math.cos(boatCourseDeg * DEG);
    const aE = tE - bE;
    const aN = tN - bN;
    const aws = Math.sqrt(aE * aE + aN * aN);
    const toCompass = normDeg((Math.atan2(aE, aN) * 180) / Math.PI);
    const awd = normDeg(toCompass + 180);
    const awa = signedDeg(awd - headingDeg);
    return { awa, aws, awd };
}

export class NmeaAdapter extends Adapter {
    declare config: NmeaConfig;

    private createsChannelAndStates: Record<string, boolean> = {};

    private pgn2entry: Record<number, PGNEntry> = {};

    private userId2Name: Record<string, { name: string; ts: number }> = {};

    private values: Record<string, { val: ioBroker.StateValue; ts: number }> = {};

    private lastMessageReceived = 0;

    private connectedInterval: ioBroker.Interval | null | undefined = null;

    private sendEnvironmentInterval: ioBroker.Interval | null | undefined = null;

    private autoPilot: AutoPilot | null = null;

    private fusion: Fusion | null = null;

    private simulationsValues: Record<string, number | null> = {};

    /** Lower-cased `common.unit` of each simulated source state, cached on first read. */
    private simulationsUnits: Record<string, string> = {};

    private aisGroups: string[] = [];

    private parser: FromPgn;

    private lastCleanNames = 0;

    private nmeaDriver: GenericDriver | null = null;

    private signalKServer: SignalKServer | null = null;

    private addressClaim: AddressClaim | null = null;

    /** Separate Address Claim that announces the simulate source as a Fluid Level sensor. */
    private simulateAddressClaim: AddressClaim | null = null;

    private anchorAlarm: AnchorAlarm | null = null;

    private anchorTracker: AnchorTracker | null = null;

    private windSpeeds: { tws: number; ts: number }[] | null = null;

    private windDirs: { twd: number; ts: number }[] | null = null;

    private trueWindSpeedError = 0;

    private trueWindAngleError = 0;

    private currentTimeZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone;

    private pressureHistory: Record<string, { val: number; ts: number }[]> = {};

    private pressureAlerts: Record<string, string> = {};

    private lang: ioBroker.Languages = 'en';

    // Per-(pgn,src) fingerprint of the last logged autopilot status frame so the chatty
    // status PGNs (65345/65359/65360/65379) only emit a log line when something actually
    // changes. Command frames (126208/126720) bypass this and are always logged.
    private autoPilotBusLastSeen: Map<string, string> = new Map();

    constructor(options: Partial<AdapterOptions> = {}) {
        super({
            ...options,
            name: 'nmea',
        });

        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));

        this.parser = new FromPgn({ includeRawData: true });
        // Swallow canboatjs 'error' events so an unparsable frame does not surface as Node's
        // ERR_UNHANDLED_ERROR. The test-playback caller reports the failed line itself.
        this.parser.on('error', () => {});

        this.config = {
            serialPort: 'COM3',
            ydwgProtocol: 'tcp',
            ydwgIp: '127.0.0.1',
            ydwgPort: 1457,
            type: 'ngt1',
            canPort: 'can0',
            updateAtLeastEveryMs: 60000,
            magneticVariation: 'magneticVariation.variation',
            simulationEnabled: false,
            combinedEnvironment: false,
            simulate: [],
            simulateAddress: 204,
            approximateMs: 10000,
            applyGpsTimeZoneToSystem: false,
            deleteAisAfter: 3600,
            pressureAlertDiff: 4,
            pressureAlertMinutes: 240,
            signalKEnabled: false,
            signalKPort: 3000,
            signalKBidirectional: true,
            announceDevice: false,
            announceSrc: 7,
            announceUniqueNumber: 12345,
            announceManufacturerCode: 2046,
            announceProductCode: 0xc001,
            announceModelId: 'ioBroker.nmea',
            announceRaymarineDeviceId: 0x03,
        };
    }

    sendCombinedEnvironment(): void {
        const obj = {
            dst: 255,
            prio: 2,
            pgn: 130311,
            fields: {
                sid: 0,
                temperatureSource: 'Outside Temperature',
                temperature: 0,
                atmosphericPressure: 0,
                humidity: 50,
                humiditySource: 'Outside',
            },
            src: this.config.simulateAddress || 204,
        };

        for (let s = 0; s < this.config.simulate.length; s++) {
            const sim = this.config.simulate[s];
            if (sim.type === 'temperature') {
                if (this.simulationsValues[sim.oid] !== null && this.simulationsValues[sim.oid] !== undefined) {
                    obj.fields.temperature = (this.simulationsValues[sim.oid] as number) + 273.15;
                    obj.fields.temperatureSource = sim.subType || 'Outside Temperature';
                }
            } else if (sim.type === 'humidity') {
                if (this.simulationsValues[sim.oid] !== null && this.simulationsValues[sim.oid] !== undefined) {
                    obj.fields.humidity = this.simulationsValues[sim.oid] as number;
                    obj.fields.humiditySource = sim.subType || 'Outside';
                }
            } else if (sim.type === 'pressure' && sim.subType === 'Atmospheric') {
                if (this.simulationsValues[sim.oid] !== null && this.simulationsValues[sim.oid] !== undefined) {
                    // ioBroker state is in hPa/mbar; N2K PGN 130311 expects Pa.
                    obj.fields.atmosphericPressure = Math.round((this.simulationsValues[sim.oid] as number) * 100);
                }
            }
        }

        console.log(`send combined${JSON.stringify(obj)}`);

        this.nmeaDriver?.write(obj);
    }

    sendTemperature(temperature: number, subType: string, instance = 0): void {
        // Convert °C → K. canboatjs encodes the temperature fields at sub-K resolution, so keep decimals.
        const kelvin = temperature + 273.15;
        const src = this.config.simulateAddress || 204;
        const source = subType || 'Outside Temperature';

        // PGN 130312 (Temperature) — the legacy message, kept for older displays.
        this.nmeaDriver?.write({
            dst: 255,
            prio: 2,
            pgn: 130312,
            fields: {
                sid: 0,
                instance,
                source,
                actualTemperature: kelvin,
                setTemperature: 0,
                reserved: 0,
            },
            src,
        });

        // PGN 130316 (Temperature, Extended Range) — the current message. Modern plotters (incl.
        // Raymarine LightHouse) display temperature from 130316 and ignore the deprecated 130312,
        // which is why temperature stayed hidden while humidity (130313) and pressure (130314) showed.
        this.nmeaDriver?.write({
            dst: 255,
            prio: 2,
            pgn: 130316,
            fields: {
                sid: 0,
                instance,
                source,
                temperature: kelvin,
                setTemperature: 0,
            },
            src,
        });
    }

    sendHumidity(humidity = 97, subType: string, instance = 0): void {
        const obj = {
            dst: 255,
            prio: 2,
            pgn: 130313,
            fields: {
                sid: 0,
                instance,
                source: subType || 'Outside',
                actualHumidity: Math.round(humidity),
                setHumidity: 0,
                reserved: 0,
            },
            src: this.config.simulateAddress || 204,
        };
        this.nmeaDriver?.write(obj);
    }

    sendPressure(pressure = 0, subType: string, instance = 0): void {
        const obj = {
            dst: 255,
            prio: 2,
            pgn: 130314,
            fields: {
                sid: 0,
                instance,
                source: subType || 'Atmospheric',
                // ioBroker state is in hPa/mbar; N2K PGN 130314 expects Pa.
                pressure: Math.round(pressure * 100),
                reserved: 0,
            },
            src: this.config.simulateAddress || 204,
        };
        this.nmeaDriver?.write(obj);
    }

    /**
     * Emit PGN 127505 (Fluid Level). Called once per configured tank row on each simulate tick.
     * - `level` is the percentage read from the ioBroker state (-131.068 .. +131.056 is the raw
     *   encodable range; practical sources produce 0..100).
     * - `subType` is the TANK_TYPE enum name (Fuel / Water / Gray water / Live well / Oil / Black water).
     * - `instance` is the NMEA bus instance — up to 14 tanks per type can coexist on the network.
     * - `capacity` is the nominal total volume in liters. Set to 0 to let plotters ignore it.
     */
    sendTank(level: number, subType: string, instance = 0, capacity = 0): void {
        const obj = {
            dst: 255,
            prio: 6,
            pgn: 127505,
            fields: {
                // sid is required by WritePgnData; PGN 127505 has no sid field, canboat ignores extras.
                sid: 0,
                instance: Math.max(0, Math.min(13, Math.round(instance))),
                type: subType || 'Fuel',
                level: Math.max(-131, Math.min(131, level)),
                capacity: Math.max(0, capacity),
                reserved: 0,
            },
            src: this.config.simulateAddress || 204,
        };
        this.nmeaDriver?.write(obj);
    }

    async sendEnvironment(): Promise<void> {
        if (this.config.simulate) {
            let anyData = false;
            for (let s = 0; s < this.config.simulate.length; s++) {
                const sim = this.config.simulate[s];
                if (!sim?.oid) {
                    continue;
                }
                if (this.simulationsValues[sim.oid] === undefined) {
                    await this.subscribeForeignStatesAsync(sim.oid);
                    const state = await this.getForeignStateAsync(sim.oid);
                    if (state) {
                        this.simulationsValues[sim.oid] = state.val as number;
                    } else {
                        this.simulationsValues[sim.oid] = null;
                    }
                    // Cache the unit so tank values delivered in liters can be converted to % (PGN 127505).
                    const obj = await this.getForeignObjectAsync(sim.oid);
                    this.simulationsUnits[sim.oid] = (obj?.common?.unit || '').trim().toLowerCase();
                }

                this.log.debug(`Simulate [${sim.type}] ${sim.oid} = ${this.simulationsValues[sim.oid]}`);

                // Tanks use PGN 127505 (one packet per tank) regardless of the combined-environment
                // setting — they can't share a frame with temperature/humidity/pressure.
                if (sim.type === 'tank') {
                    if (this.simulationsValues[sim.oid] !== null && this.simulationsValues[sim.oid] !== undefined) {
                        let level = this.simulationsValues[sim.oid] as number;
                        // PGN 127505 expects the level in % (0..100). If the source state is in liters,
                        // convert it to a percentage via the configured capacity.
                        const unit = this.simulationsUnits[sim.oid];
                        if (
                            unit === 'l' ||
                            unit === 'liter' ||
                            unit === 'liters' ||
                            unit === 'litre' ||
                            unit === 'litres'
                        ) {
                            if (sim.capacity && sim.capacity > 0) {
                                level = (level / sim.capacity) * 100;
                            } else {
                                this.log.warn(
                                    `Tank ${sim.oid}: source unit is "${unit}" but capacity is 0 — cannot convert liters to %`,
                                );
                            }
                        }
                        this.sendTank(level, sim.subType, sim.instance, sim.capacity);
                    }
                } else if (!this.config.combinedEnvironment) {
                    // Instance identifies the sensor on the bus. Use the value configured per row;
                    // if none is set (older config), fall back to a position-based unique instance so
                    // two sensors of the same type don't collide (same effect seen with tanks).
                    const instance =
                        typeof sim.instance === 'number'
                            ? sim.instance
                            : this.config.simulate.slice(0, s).filter(x => x.type === sim.type).length;
                    if (sim.type === 'temperature') {
                        if (this.simulationsValues[sim.oid] !== null && this.simulationsValues[sim.oid] !== undefined) {
                            this.sendTemperature(this.simulationsValues[sim.oid] as number, sim.subType, instance);
                        }
                    } else if (sim.type === 'humidity') {
                        if (this.simulationsValues[sim.oid] !== null && this.simulationsValues[sim.oid] !== undefined) {
                            this.sendHumidity(this.simulationsValues[sim.oid] as number, sim.subType, instance);
                        }
                    } else if (sim.type === 'pressure') {
                        if (this.simulationsValues[sim.oid] !== null && this.simulationsValues[sim.oid] !== undefined) {
                            this.sendPressure(this.simulationsValues[sim.oid] as number, sim.subType, instance);
                        }
                    }
                } else if (sim.type) {
                    anyData = true;
                }
            }
            if (anyData) {
                this.sendCombinedEnvironment();
            }
        }
    }

    async writeState(id: string, val: ioBroker.StateValue, states?: Record<string, string>): Promise<void> {
        if (val !== undefined) {
            if (
                !this.values[id] ||
                val !== this.values[id].val ||
                !this.config.updateAtLeastEveryMs ||
                Date.now() - this.values[id].ts >= this.config.updateAtLeastEveryMs
            ) {
                this.values[id] = { val, ts: Date.now() };
                if (states && val !== null && val !== undefined) {
                    if (states[val.toString()] !== undefined) {
                        await this.setState(id, states[val.toString()], true);
                    } else {
                        await this.setState(id, val.toString(), true);
                    }
                } else {
                    await this.setState(id, val, true);
                }
            }
        }
    }

    async processWindEvent(data: PGN): Promise<void> {
        const fields: Record<string, any> = data.fields;
        const windAngleDeg = (fields.windAngle * 180) / Math.PI;
        const windSpeedKn = fields.windSpeed * MS_TO_KN;
        const reference: string = typeof fields.reference === 'string' ? fields.reference : '';

        const magVariation = this.values[this.config.magneticVariation || 'magneticVariation.variation']?.val as
            | number
            | undefined;

        // Resolve vessel heading (compass, true). Prefer a true-heading source, then magnetic + variation,
        // then COG as a last-resort approximation (ignores leeway/current).
        let heading: number | undefined;
        if (this.values['vesselHeading.headingTrue']) {
            heading = this.values['vesselHeading.headingTrue'].val as number;
        } else if (this.values['seatalkPilotHeading.headingMagneticTrue']) {
            heading = this.values['seatalkPilotHeading.headingMagneticTrue'].val as number;
        } else if (this.values['vesselHeading.headingMagnetic'] && magVariation !== undefined) {
            heading = normDeg((this.values['vesselHeading.headingMagnetic'].val as number) + magVariation);
        } else if (this.values['cogSogRapidUpdate.cogTrue']) {
            heading = this.values['cogSogRapidUpdate.cogTrue'].val as number;
        } else if (this.values['directionData.cogTrue']) {
            heading = this.values['directionData.cogTrue'].val as number;
        }

        if (heading === undefined) {
            this.trueWindAngleError ||= 0;
            if (this.trueWindAngleError < 100) {
                this.trueWindAngleError++;
            }
            if (this.trueWindAngleError === 50) {
                this.log.warn('Could not find vessel heading for true-wind calculation');
            }
            return;
        }

        // Resolve boat motion: prefer STW (water-referenced TW) with heading, fall back to SOG+COG.
        let motionSpeed: number | undefined;
        let motionCourse: number | undefined;
        if (this.values['speed.speedWaterReferenced']) {
            motionSpeed = this.values['speed.speedWaterReferenced'].val as number;
            motionCourse = heading;
        } else if (this.values['cogSogRapidUpdate.sog']) {
            motionSpeed = this.values['cogSogRapidUpdate.sog'].val as number;
            motionCourse = (this.values['cogSogRapidUpdate.cogTrue']?.val as number | undefined) ?? heading;
        } else if (this.values['directionData.sog']) {
            motionSpeed = this.values['directionData.sog'].val as number;
            motionCourse = (this.values['directionData.cogTrue']?.val as number | undefined) ?? heading;
        }

        if (motionSpeed === undefined || motionCourse === undefined) {
            this.trueWindSpeedError ||= 0;
            if (this.trueWindSpeedError < 100) {
                this.trueWindSpeedError++;
            }
            if (this.trueWindSpeedError === 50) {
                this.log.warn('Could not find boat speed for true-wind calculation');
            }
            return;
        }

        // Derive the full set {AWA, AWS, AWD, TWA, TWS, TWD} from whatever the PGN provides.
        let twa: number;
        let tws: number;
        let twd: number;
        let awa: number;
        let aws: number;
        let awd: number;

        if (reference.includes('Apparent')) {
            awa = signedDeg(windAngleDeg);
            aws = windSpeedKn;
            awd = normDeg(heading + awa);
            ({ twa, tws, twd } = computeTrueFromApparent(awa, aws, motionSpeed, motionCourse, heading));
        } else if (reference.includes('True (boat')) {
            twa = signedDeg(windAngleDeg);
            tws = windSpeedKn;
            twd = normDeg(heading + twa);
            ({ awa, aws, awd } = computeApparentFromTrue(twd, tws, motionSpeed, motionCourse, heading));
        } else if (reference.includes('True')) {
            // True, referenced to North — windAngle is a compass bearing.
            twd = reference.includes('Magnetic') ? normDeg(windAngleDeg + (magVariation ?? 0)) : normDeg(windAngleDeg);
            tws = windSpeedKn;
            twa = signedDeg(twd - heading);
            ({ awa, aws, awd } = computeApparentFromTrue(twd, tws, motionSpeed, motionCourse, heading));
        } else {
            this.log.debug(`Unknown wind Reference: ${reference}`);
            return;
        }

        const round1 = (x: number): number => Math.round(x * 10) / 10;
        const round2 = (x: number): number => Math.round(x * 100) / 100;

        const twdR = round1(twd);
        const awdR = round1(awd);
        const twsR = round2(tws);
        const awsR = round2(aws);
        const twaR = round1(twa);
        const awaR = round1(awa);

        const channelId = this.pgn2entry[data.pgn].Id;
        const twdId = `${channelId}.windDirectionTrue`;
        const twsId = `${channelId}.windSpeedTrue`;
        const avwdId = `${channelId}.windDirectionAverage`;
        const avwsId = `${channelId}.windSpeedAverage`;
        const maxwsId = `${channelId}.windSpeedMax`;
        const awdId = `${channelId}.windDirectionApparent`;
        const awsId = `${channelId}.windSpeedApparent`;
        const twaId = `${channelId}.windAngleTrue`;
        const awaId = `${channelId}.windAngleApparent`;

        await this.ensureWindState(twdId, 'True Wind Direction', '°', 'value.direction.wind');
        await this.ensureWindState(twsId, 'True Wind Speed', 'kn', 'value.speed.wind');
        await this.ensureWindState(avwdId, 'Average Wind Direction', '°', 'value.direction.wind');
        await this.ensureWindState(avwsId, 'Average Wind Speed', 'kn', 'value.speed.wind');
        await this.ensureWindState(maxwsId, 'Maximal Wind Speed', 'kn', 'value.speed.wind');
        await this.ensureWindState(awdId, 'Apparent Wind Direction', '°', 'value.direction.wind');
        await this.ensureWindState(awsId, 'Apparent Wind Speed', 'kn', 'value.speed.wind');
        await this.ensureWindState(awaId, 'Apparent Wind Angle (rel. to bow)', '°', 'value.direction.wind');
        await this.ensureWindState(twaId, 'True Wind Angle (rel. to bow)', '°', 'value.direction.wind');

        // Rolling window for averages / max over `approximateMs`.
        const now = Date.now();
        this.windSpeeds ||= [];
        this.windSpeeds.push({ tws: twsR, ts: now });
        this.windSpeeds = this.windSpeeds.filter(w => now - w.ts < this.config.approximateMs);

        this.windDirs ||= [];
        this.windDirs.push({ twd: twdR, ts: now });
        this.windDirs = this.windDirs.filter(w => now - w.ts < this.config.approximateMs);

        let sumSpeed = 0;
        let maxSpeed = 0;
        for (const w of this.windSpeeds) {
            sumSpeed += w.tws;
            if (w.tws > maxSpeed) {
                maxSpeed = w.tws;
            }
        }
        const avgSpeed = Math.round((sumSpeed / this.windSpeeds.length) * 100) / 100;

        // Circular mean for direction — arithmetic mean wraps badly near 0°/360°.
        let sumSin = 0;
        let sumCos = 0;
        for (const w of this.windDirs) {
            sumSin += Math.sin(w.twd * DEG);
            sumCos += Math.cos(w.twd * DEG);
        }
        const avgDir = Math.round(normDeg((Math.atan2(sumSin, sumCos) * 180) / Math.PI) * 10) / 10;

        await this.writeState(twdId, twdR);
        await this.writeState(twsId, twsR);
        await this.writeState(awdId, awdR);
        await this.writeState(awsId, awsR);
        await this.writeState(twaId, twaR);
        await this.writeState(awaId, awaR);
        await this.writeState(avwdId, avgDir);
        await this.writeState(avwsId, avgSpeed);
        await this.writeState(maxwsId, Math.round(maxSpeed * 100) / 100);
    }

    private async ensureWindState(id: string, name: string, unit: string, role: string): Promise<void> {
        if (this.createsChannelAndStates[id]) {
            return;
        }
        this.createsChannelAndStates[id] = true;
        await this.updateObject({
            _id: id,
            common: {
                name,
                type: 'number',
                unit,
                role,
                read: true,
                write: false,
            },
            type: 'state',
            native: {},
        });
    }

    async processPositionEvent(data: PGN): Promise<void> {
        const id = `${this.pgn2entry[data.pgn].Id}.position`;
        const fields: Record<string, any> = data.fields;
        const val = `${fields.latitude};${fields.longitude}`;
        if (!this.createsChannelAndStates[id]) {
            this.createsChannelAndStates[id] = true;
            const positionObject: ioBroker.StateObject = {
                _id: id,
                common: {
                    name: 'GPS Position',
                    type: 'string',
                    role: 'value.gps',
                    read: true,
                    write: false,
                },
                type: 'state',
                native: {},
            };
            await this.setObjectNotExistsAsync(id, positionObject);
        }
        if (fields.time) {
            // detect time zone
            const timeZone = find(fields.latitude, fields.longitude); // ['America/Los_Angeles']
            if (timeZone?.[0]) {
                const timeZoneID = `${this.pgn2entry[data.pgn].Id}.timeZone`;
                if (!this.createsChannelAndStates[timeZoneID]) {
                    this.createsChannelAndStates[timeZoneID] = true;
                    const timeZoneObject: ioBroker.StateObject = {
                        _id: timeZoneID,
                        common: {
                            name: 'Current Time Zone',
                            type: 'string',
                            role: 'value',
                            read: true,
                            write: false,
                        },
                        type: 'state',
                        native: {},
                    };
                    await this.setObjectNotExistsAsync(timeZoneID, timeZoneObject);
                }

                if (this.currentTimeZone !== timeZone[0]) {
                    this.currentTimeZone = timeZone[0];
                    await this.setState(timeZoneID, this.currentTimeZone, true);
                    this.setSystemTimeZone(timeZone[0]);
                }
            }
        }

        await this.writeState(id, val);

        // Feed the anchor-alarm watcher with every fresh fix. The watcher itself decides whether
        // to use this stream or an external aux-position state (see AnchorAlarm.onNmeaPosition).
        if (typeof fields.latitude === 'number' && typeof fields.longitude === 'number') {
            this.anchorAlarm?.onNmeaPosition(fields.latitude, fields.longitude);
            this.anchorTracker?.onNmeaPosition(fields.latitude, fields.longitude);
        }
    }

    /**
     * PGN 128267 (Water Depth) carries `depth` (transducer reading) and `offset` (transducer-to-
     * waterline/keel correction). Publishes the corrected value as `waterDepth.waterDepthTrue`
     * so downstream consumers don't have to recompute it. The clamp at 0 is for the keel-offset
     * case (negative offset + shallow water can mathematically go below zero).
     */
    async processDepthEvent(data: PGN): Promise<void> {
        const channelId = this.pgn2entry[data.pgn]?.Id;
        if (!channelId) {
            return;
        }
        const fields: Record<string, any> = data.fields;
        const depth = Number(fields.depth);
        if (!isFinite(depth)) {
            return;
        }
        const offset = Number(fields.offset);
        const corrected = Math.max(0, depth + (isFinite(offset) ? offset : 0));
        const id = `${channelId}.waterDepthTrue`;
        if (!this.createsChannelAndStates[id]) {
            this.createsChannelAndStates[id] = true;
            const stateObject: ioBroker.StateObject = {
                _id: id,
                common: {
                    name: 'Corrected water depth (depth + offset)',
                    type: 'number',
                    role: 'value.depth',
                    unit: 'm',
                    read: true,
                    write: false,
                },
                type: 'state',
                native: {},
            };
            await this.setObjectNotExistsAsync(id, stateObject);
        }
        await this.writeState(id, corrected);

        // Anchor tracker uses the corrected depth (not the raw transducer value) to decide
        // when the chain length matches the water depth (anchor on bottom).
        this.anchorTracker?.onNmeaDepth(corrected);
    }

    setSystemTimeZone(zone: string): void {
        if (zone !== Intl.DateTimeFormat().resolvedOptions().timeZone && this.config.applyGpsTimeZoneToSystem) {
            if (process.platform === 'linux') {
                exec(`timedatectl set-timezone ${zone}`, (error, stdout, stderr) => {
                    if (error || stderr) {
                        if (error) {
                            this.log.error(`timedatectl set-timezone ${zone} error: ${error.toString()}`);
                        }
                        if (stderr) {
                            this.log.error(`timedatectl set-timezone ${zone} error: ${stderr}`);
                        }
                    } else {
                        this.log.info(`Time Zone changed to ${zone}`);
                    }
                });
            } else {
                this.log.warn('Detected new time zone via GPS, but ioBroker cannot change it on this system');
            }
        }
    }

    async processMagneticVariation(data: PGN, withReference: string[]): Promise<void> {
        for (let r = 0; r < withReference.length; r++) {
            const name = withReference[r];
            const pgnObj = this.pgn2entry[data.pgn];
            const field = pgnObj?.Fields.find(f => f.Id === name);
            if (!field) {
                continue;
            }
            const channelId = this.pgn2entry[data.pgn].Id;
            const mId = `${channelId}.${field.Id}True`;
            if (!this.createsChannelAndStates[mId]) {
                const headingObject: ioBroker.StateObject = {
                    _id: mId,
                    common: {
                        name: `${field.Name} with correction`,
                        type: 'number',
                        unit: '°',
                        role: 'value.direction',
                        read: true,
                        write: false,
                    },
                    type: 'state',
                    native: {},
                };
                await this.updateObject(headingObject);
                this.createsChannelAndStates[mId] = true;
            }
            const rawValue = this.values[`${channelId}.${field.Id}`]?.val;
            if (typeof rawValue !== 'number') {
                continue;
            }
            let val: number = rawValue;
            let referenceVal = this.values[`${channelId}.${field.Id}Reference`];
            if (!referenceVal) {
                referenceVal = this.values[`${channelId}.reference`];
            }
            if (referenceVal?.val === 'Magnetic') {
                // Magnetic reading → apply compass deviation (installation-specific) then variation
                // (geographic). Deviation comes from the same PGN (e.g. vesselHeading.deviation);
                // variation is taken from the central source configured via `magneticVariation`.
                const deviationState = this.values[`${channelId}.deviation`];
                if (deviationState && typeof deviationState.val === 'number') {
                    val += deviationState.val;
                }
                const variationState = this.values[this.config.magneticVariation || 'magneticVariation.variation'];
                if (variationState && typeof variationState.val === 'number') {
                    val += variationState.val;
                }
                val = normDeg(val);
            }
            // Any other reference (True / Error / Null / unset) writes through unchanged so the
            // `…True` state always carries a usable heading for downstream consumers.
            await this.writeState(mId, val);
        }
    }

    static nameToId(name: string): string {
        const parts = name.split(' ');
        return parts.map(p => p[0].toUpperCase() + p.substring(1).toLowerCase()).join('_');
    }

    async processPressureEvent(data: PGN): Promise<void> {
        const fields: Record<string, any> = data.fields;
        const source: string = fields.source || '';
        const pressure = Math.round(fields.pressure / 10) / 10;
        const pressureId = `${this.pgn2entry[data.pgn].Id}.pressure${NmeaAdapter.nameToId(source)}`;

        // check what the type of event it is
        if (source) {
            // create the according pressure
            if (!this.createsChannelAndStates[pressureId]) {
                this.createsChannelAndStates[pressureId] = true;
                const pressureObject: ioBroker.StateObject = {
                    _id: pressureId,
                    common: {
                        name: `Pressure ${fields.source}`,
                        type: 'number',
                        unit: 'mbar',
                        role: 'value.pressure',
                        read: true,
                        write: false,
                    },
                    type: 'state',
                    native: {},
                };
                await this.updateObject(pressureObject);
            }
            await this.setState(pressureId, Math.round(pressure), true);
        }

        // create the alert flag
        const pressureAlertTextId = `${this.pgn2entry[data.pgn].Id}.pressure${NmeaAdapter.nameToId(fields.source)}AlertText`;
        if (!this.createsChannelAndStates[pressureAlertTextId]) {
            this.createsChannelAndStates[pressureAlertTextId] = true;
            const pressureAlertTextObject: ioBroker.StateObject = {
                _id: pressureAlertTextId,
                common: {
                    name: `Pressure ${fields.source} Alert`,
                    type: 'string',
                    role: 'value',
                    read: true,
                    write: false,
                },
                type: 'state',
                native: {},
            };
            await this.updateObject(pressureAlertTextObject);
        }

        const pressureAlertId = `${this.pgn2entry[data.pgn].Id}.pressure${NmeaAdapter.nameToId(fields.source)}Alert`;
        if (!this.createsChannelAndStates[pressureAlertId]) {
            this.createsChannelAndStates[pressureAlertId] = true;
            const pressureAlertObject: ioBroker.StateObject = {
                _id: pressureAlertId,
                common: {
                    name: `Pressure ${fields.source} Alert`,
                    type: 'boolean',
                    role: 'indicator.alarm',
                    read: true,
                    write: false,
                },
                type: 'state',
                native: {},
            };
            await this.updateObject(pressureAlertObject);
        }

        // create the according flag
        const pressureAlertHistoryId = `${this.pgn2entry[data.pgn].Id}.pressure${NmeaAdapter.nameToId(fields.source)}AlertHistory`;
        if (!this.createsChannelAndStates[pressureAlertHistoryId]) {
            this.createsChannelAndStates[pressureAlertHistoryId] = true;
            const pressureHistoryObject: ioBroker.StateObject = {
                _id: pressureAlertHistoryId,
                common: {
                    name: `Pressure ${fields.source} Alert History`,
                    type: 'array',
                    role: 'state',
                    read: true,
                    write: false,
                },
                type: 'state',
                native: {},
            };
            await this.updateObject(pressureHistoryObject);

            // read history
            const history = await this.getStateAsync(pressureAlertHistoryId);
            if (history?.val) {
                try {
                    this.pressureHistory[pressureId] = JSON.parse(history.val as string);
                } catch {
                    this.pressureHistory[pressureId] = [];
                }
            }
        }

        const history = this.pressureHistory[pressureId];
        if (history) {
            // Drop entries older than pressureAlertMinutes; sample at ~1/min.
            const now = Date.now();
            const maxAge = this.config.pressureAlertMinutes * 60000;
            const trimmed = history.filter(h => now - h.ts <= maxAge);
            this.pressureHistory[pressureId] = trimmed;
            if (!trimmed.length || now - trimmed[trimmed.length - 1].ts > 60000) {
                trimmed.push({ val: pressure, ts: now });
                await this.setState(pressureAlertHistoryId, JSON.stringify(trimmed), true);
                // find out if the pressure is falling on more than 4 mbar in 4 hours
                let min: { val: number; ts: number } | undefined;
                let max: { val: number; ts: number } | undefined;
                for (let i = 0; i < trimmed.length; i++) {
                    if (!min || min.val > trimmed[i].val) {
                        min = trimmed[i];
                    }
                    if (!max || max.val < trimmed[i].val) {
                        max = trimmed[i];
                    }
                }
                if (min && max && min.ts > max.ts) {
                    const diff = max.val - min.val;
                    if (diff > this.config.pressureAlertDiff) {
                        const minTs = moment(new Date(min.ts));
                        const maxTs = moment(new Date(max.ts));
                        const tsDiff = minTs.from(maxTs);

                        const alertText = I18n.t('pressureAlarm', diff, tsDiff);
                        if (this.pressureAlerts[pressureId] !== alertText) {
                            if (!this.pressureAlerts[pressureId]) {
                                await this.setState(pressureAlertId, true, true);
                            }
                            this.pressureAlerts[pressureId] = alertText;
                            await this.setState(pressureAlertTextId, alertText, true);
                        }
                    } else if (this.pressureAlerts[pressureId]) {
                        this.pressureAlerts[pressureId] = '';
                        await this.setState(pressureAlertTextId, '', true);
                        await this.setState(pressureAlertId, false, true);
                    }
                }
            }
        }
    }

    async processTemperatureEvent(data: PGN): Promise<void> {
        const fields: Record<string, any> = data.fields;
        // check what the type of event it is
        if (fields.temperatureSource) {
            // create the according pressure
            const tempId = `${this.pgn2entry[data.pgn].Id}.temperature${NmeaAdapter.nameToId(fields.temperatureSource)}`;
            if (!this.createsChannelAndStates[tempId]) {
                this.createsChannelAndStates[tempId] = true;
                const tempObject: ioBroker.StateObject = {
                    _id: tempId,
                    common: {
                        name: `Temperature ${fields.temperatureSource}`,
                        type: 'number',
                        unit: '°C',
                        role: 'value.temperature',
                        read: true,
                        write: false,
                    },
                    type: 'state',
                    native: {},
                };
                await this.updateObject(tempObject);
            }

            await this.setState(tempId, Math.round((fields.temperature - 273.15) * 10) / 10, true);
        }
    }

    async processActualTemperatureEvent(data: PGN): Promise<void> {
        const fields: Record<string, any> = data.fields;
        // check what the type of event it is
        // (data.fields['Actual Temperature'] && data.fields.Source) {
        if (fields.source) {
            // create the according pressure
            const tempId = `${this.pgn2entry[data.pgn].Id}.actualTemperature${NmeaAdapter.nameToId(fields.source)}`;
            if (!this.createsChannelAndStates[tempId]) {
                this.createsChannelAndStates[tempId] = true;
                const tempObject: ioBroker.StateObject = {
                    _id: tempId,
                    common: {
                        name: `Temperature ${fields.source}`,
                        type: 'number',
                        unit: '°C',
                        role: 'value.temperature',
                        read: true,
                        write: false,
                    },
                    type: 'state',
                    native: {},
                };
                await this.updateObject(tempObject);
            }

            await this.setState(tempId, Math.round((fields.actualTemperature - 273.15) * 10) / 10, true);
        }
    }

    cleanAisNames(): void {
        // `deleteAisAfter` is in seconds; compare against an ms delta.
        if (this.lastCleanNames && Date.now() - this.lastCleanNames < this.config.deleteAisAfter * 1000) {
            return;
        }
        this.lastCleanNames = Date.now();
        Object.keys(this.userId2Name).forEach(k => {
            if (Date.now() - this.userId2Name[k].ts > 3600000) {
                delete this.userId2Name[k];
            }
        });

        // delete all AIS data older than one hour
        setTimeout(async (): Promise<void> => {
            const groups = [...WELL_KNOWN_AIS_GROUPS, ...this.aisGroups];
            const prefix = `${this.namespace}.`;
            for (let l = 0; l < groups.length; l++) {
                const states = await this.getStatesAsync(`${this.namespace}.${groups[l]}.*`);
                const ids = Object.keys(states);
                for (let s = 0; s < ids.length; s++) {
                    const id = ids[s];
                    if (!states[id] || states[id].ts < Date.now() - this.config.deleteAisAfter * 1000) {
                        // delete object
                        await this.delObjectAsync(id);
                        // Invalidate the in-memory create-cache flag so the next packet
                        // for this MMSI recreates the object. Without this, processAisData
                        // would skip the create path (flag still true) and setState would
                        // warn "State X has no existing object" on every subsequent packet.
                        // delObjectAsync uses the namespaced id; createsChannelAndStates
                        // keys are relative — strip the prefix to match.
                        const cacheKey = id.startsWith(prefix) ? id.substring(prefix.length) : id;
                        delete this.createsChannelAndStates[cacheKey];
                    }
                }
            }
        }, 1000);
    }

    async processAisData(data: PGN): Promise<void> {
        const fields: Record<string, any> = data.fields;
        const aisId = `${this.pgn2entry[data.pgn].Id}.${fields.userId}`;
        if (fields.name) {
            this.userId2Name[fields.userId] = { name: fields.name as string, ts: Date.now() };
        }
        if (!this.aisGroups.includes(this.pgn2entry[data.pgn].Id)) {
            this.aisGroups.push(this.pgn2entry[data.pgn].Id);
        }

        this.cleanAisNames();

        if (!this.createsChannelAndStates[aisId]) {
            const aisObject: ioBroker.StateObject = {
                _id: aisId,
                common: {
                    name: (fields.name as string) || this.userId2Name[fields.userId]?.name || '',
                    type: 'object',
                    role: 'value',
                    read: true,
                    write: false,
                },
                type: 'state',
                native: {},
            };
            // Create the object BEFORE flipping the flag — otherwise a second AIS packet for
            // the same MMSI arriving while the first updateObject() is still pending would
            // skip the create path and call setState() on a non-existent object.
            await this.updateObject(aisObject);
            this.createsChannelAndStates[aisId] = true;
        }

        if (fields.sid) {
            delete fields.sid;
        }

        await this.setState(aisId, JSON.stringify(fields), true);
    }

    onData = async (data: PGN): Promise<void> => {
        this.lastMessageReceived = Date.now();

        // ── Autopilot bus snooping ───────────────────────────────────────────────────────
        // Surface every autopilot-related frame seen on the bus at info-level so the operator
        // can correlate physical Control-Panel (p70/p70s/p70R) button presses with what the
        // adapter is actually decoding. Two categories:
        //   • Command frames — 126208 (NMEA group function, used by Raymarine for mode/heading
        //     commands) and 126720 (manufacturer proprietary fast packet, used for Seatalk1
        //     keystroke encodings). These are infrequent and every occurrence is interesting.
        //   • Status frames — 65345/65359/65360/65379 (Seatalk pilot wind datum / heading /
        //     locked heading / mode). The autopilot broadcasts these continuously, so we
        //     dedupe on (pgn, src) + JSON-fields fingerprint and only log on change.
        // if (data.pgn) {
        //     const isCmd = data.pgn === 126208 || data.pgn === 126720;
        //     const isStatus = false;
        //         // data.pgn === 65345 || data.pgn === 65359 || data.pgn === 65360 || data.pgn === 65379;
        //     if (isCmd || isStatus) {
        //         const raw = (data as any).rawData
        //             ? Buffer.from((data as any).rawData).toString('hex').match(/.{2}/g)?.join(' ') ?? ''
        //             : '';
        //         const payload = JSON.stringify(data.fields ?? {});
        //         const tag = isCmd ? 'CMD' : 'STATUS';
        //         const line = `[autoPilot ← src=${(data as any).src ?? '?'} dst=${(data as any).dst ?? '?'}] PGN ${data.pgn} ${tag} raw=[${raw}] ${payload}`;
        //         if (isCmd) {
        //             this.log.info(line);
        //         } else {
        //             const fp = `${data.pgn}:${(data as any).src ?? '?'}`;
        //             if (this.autoPilotBusLastSeen.get(fp) !== payload) {
        //                 this.autoPilotBusLastSeen.set(fp, payload);
        //                 this.log.info(line);
        //             }
        //         }
        //     }
        // }
        // ────────────────────────────────────────────────────────────────────────────────

        if (!this.connectedInterval) {
            await this.setState('info.connection', true, true);
            this.connectedInterval = this.setInterval(async () => {
                if (!this.lastMessageReceived || Date.now() - this.lastMessageReceived >= 10000) {
                    await this.setState('info.connection', false, true);
                    if (this.connectedInterval) {
                        this.clearInterval(this.connectedInterval);
                        this.connectedInterval = null;
                    }
                    if (this.sendEnvironmentInterval) {
                        this.clearInterval(this.sendEnvironmentInterval);
                        this.sendEnvironmentInterval = null;
                    }
                }
            }, 5000);

            if (this.config.simulationEnabled) {
                this.sendEnvironmentInterval = this.setInterval(() => this.sendEnvironment(), 1000);
            }
        }

        if (data.pgn && ENGINE_J1939_PGNS.has(data.pgn)) {
            // J1939 engine PGNs aren't in canboat's definition set — handle the raw 8-byte frame directly.
            await processEngineJ1939(this, data);
            return;
        }

        if (data.pgn && data.fields) {
            this.signalKServer?.onPGN(data);

            // PGN 130820 is Fusion's proprietary status PGN (37 sub-variants). Route it to the
            // dedicated Fusion handler (which surfaces a `mediaPlayer.*` device) instead of the
            // generic state factory — the latter cannot tell the sub-variants apart and would
            // create a mess of ambiguous states. Auto-detect the stereo the first time we see it.
            if (data.pgn === 130820) {
                if (!this.fusion && this.nmeaDriver && data.src !== undefined) {
                    this.fusion = new Fusion(this, this.config, this.nmeaDriver, data.src);
                    await this.fusion.start();
                }
                await this.fusion?.onPGN(data);
                return;
            }

            if (await this.createNmeaChannel(data.pgn, data.src)) {
                const keys = Object.keys(data.fields);
                const withReference: string[] = [];
                const fields: Record<string, any> = data.fields;
                if (!fields.userId) {
                    for (let k = 0; k < keys.length; k++) {
                        if (keys[k] === 'sid') {
                            continue;
                        }
                        if (fields[`${keys[k]}Reference`]) {
                            withReference.push(keys[k]);
                        } else if (keys[k] === 'heading' && fields.reference) {
                            withReference.push(keys[k]);
                        }
                        const val = fields[keys[k]];
                        const options = { pgn: data.pgn, name: keys[k], value: val };
                        const { id, states } = await this.createNmeaState(options);
                        if (id) {
                            await this.writeState(id, options.value, states);
                        }
                    }
                }
                if (fields.userId) {
                    // AIS PGNs also carry Latitude/Longitude — route them to the AIS handler first.
                    await this.processAisData(data);
                } else if (fields.windSpeed && fields.windAngle) {
                    await this.processWindEvent(data);
                } else if (fields.longitude && fields.latitude) {
                    await this.processPositionEvent(data);
                } else if (withReference.length) {
                    // Always produce the `…True` state: magnetic values get deviation + variation
                    // applied; true/error/null pass through unchanged.
                    await this.processMagneticVariation(data, withReference);
                } else if (fields.pressure && fields.source) {
                    await this.processPressureEvent(data);
                } else if (fields.temperature && fields.temperatureSource) {
                    await this.processTemperatureEvent(data);
                } else if (fields.actualTemperature && fields.source) {
                    await this.processActualTemperatureEvent(data);
                } else if (typeof fields.depth === 'number') {
                    // PGN 128267 (Water Depth) — derive `waterDepthTrue = depth + offset`.
                    await this.processDepthEvent(data);
                }

                // SOG fan-out runs outside the else-if chain because it can appear in several
                // PGNs (129026 rapid update, 129025 position rapid, plus AIS PGNs which already
                // returned above). canboatjs delivers it in m/s; the tracker converts internally.
                if (!fields.userId && typeof fields.sog === 'number') {
                    this.anchorTracker?.onNmeaSog(fields.sog);
                }
            }
        }
    };

    async onReady(): Promise<void> {
        await this.updateInstance();

        const connectionState = await this.getStateAsync('info.connection');
        if (connectionState?.val) {
            await this.setState('info.connection', false, true);
        }
        if (this.config.updateAtLeastEveryMs === undefined) {
            this.config.updateAtLeastEveryMs = 60000;
        }

        this.config.approximateMs = parseInt(this.config.approximateMs as any as string, 10) || 10000;
        this.config.deleteAisAfter = parseInt(this.config.deleteAisAfter as any as string, 10) || 3600;
        this.config.pressureAlertDiff = parseInt(this.config.pressureAlertDiff as any as string, 10) || 4;
        this.config.pressureAlertMinutes = parseInt(this.config.pressureAlertMinutes as any as string, 10) || 240;

        const systemConfig: ioBroker.SystemConfigObject | null | undefined =
            await this.getForeignObjectAsync('system.config');

        this.lang = systemConfig?.common?.language || 'en';
        moment.locale(this.lang); // set default locale
        await I18n.init(__dirname, this.lang);

        await this.subscribeStatesAsync('test.rawString');

        if (this.config.type === 'ngt1') {
            this.nmeaDriver = new NGT1(this, this.config, this.onData);
        } else if (this.config.type === 'picanm') {
            this.nmeaDriver = new PicanM(this, this.config, this.onData);
        } else if (this.config.type === 'ydwg') {
            this.nmeaDriver = new YDWG(this, this.config, this.onData);
        } else {
            this.log.error(`Unknown driver type: ${this.config.type as string}`);
            return;
        }

        // Analyse which autopilot it could be here
        let autoPilotObj =
            (await this.getObjectAsync('seatalkPilotMode')) || (await this.getObjectAsync('seatalk1PilotMode'));
        if (autoPilotObj) {
            this.autoPilot = new SeaTalkAutoPilot(
                this,
                this.config,
                this.nmeaDriver,
                this.values,
                autoPilotObj.native.src,
            );
        }
        if (!this.autoPilot) {
            autoPilotObj = await this.getObjectAsync('simnetDeviceStatus');
            if (autoPilotObj) {
                this.autoPilot = new NavicoAutoPilot(
                    this,
                    this.config,
                    this.nmeaDriver,
                    this.values,
                    autoPilotObj.native.src,
                );
            }
        }

        // Recreate the Fusion media-player handler if we already discovered the stereo in a
        // previous run, so the `mediaPlayer.*` controls work immediately after a restart (before
        // the first status frame re-detects it). The stereo's bus address was stored in native.src.
        const fusionObj = await this.getObjectAsync('mediaPlayer');
        if (fusionObj && this.nmeaDriver && typeof fusionObj.native?.src === 'number') {
            this.fusion = new Fusion(this, this.config, this.nmeaDriver, fusionObj.native.src);
            await this.fusion.start();
        }

        this.nmeaDriver?.start();

        // Anchor-alarm watcher — creates `anchorAlarm.*` states (isActive/isAlarm/alarmRadius/
        // anchorPosition), subscribes to the operator-writable ones, and starts evaluating
        // every position fix coming through processPositionEvent (or via config.auxPosition).
        this.anchorAlarm = new AnchorAlarm(this, this.config, I18n);
        await this.anchorAlarm.start();

        // Anchor-drop tracker — watches `config.chainLength`, `waterDepth.depth`, and the live
        // GNSS position. Records the drop position when the chain starts paying out and a
        // second "bottom reached" position when chain length ≈ depth.
        this.anchorTracker = new AnchorTracker(this, this.config, I18n);
        await this.anchorTracker.start();

        // Optional NMEA-2000 device announcement. Some autopilots silently drop group-function
        // commands from unknown source addresses; broadcasting an Address Claim + Product Info
        // (and optionally a Raymarine-style Device Identification) gets us into the device list
        // and unblocks those commands. Off by default — enable via `announceDevice` in config.
        if (this.config.announceDevice && this.nmeaDriver) {
            const cfgSrc = parseInt(this.config.announceSrc as unknown as string, 10);
            this.addressClaim = new AddressClaim(this, this.nmeaDriver, {
                src: isFinite(cfgSrc) && cfgSrc > 0 && cfgSrc < 252 ? cfgSrc : 7,
                uniqueNumber: parseInt(this.config.announceUniqueNumber as unknown as string, 10) || 12345,
                manufacturerCode: parseInt(this.config.announceManufacturerCode as unknown as string, 10) || 2046,
                productCode: parseInt(this.config.announceProductCode as unknown as string, 10) || 0xc001,
                modelId: this.config.announceModelId || 'ioBroker.nmea',
                raymarineDeviceId: parseInt(this.config.announceRaymarineDeviceId as unknown as string, 10) || 0,
            });
            this.addressClaim.start();
        }

        // Announce the simulate source as an NMEA-2000 Fluid Level sensor (Device Class 75 "Sensors",
        // Function 150 "Fluid Level"). Only meaningful on a direct CAN interface (PiCAN-M): the YDEN/
        // YDWG and NGT-1 gateways transmit from their OWN claimed address and manage address claims
        // themselves, so injecting a 60928 there gets remapped onto the gateway's address and causes
        // an address conflict — the plotter then drops ALL data from that source. So skip it for
        // gateways. Also gated behind `announceDevice` and only needed with at least one tank row.
        if (
            this.config.announceDevice &&
            this.config.type === 'picanm' &&
            this.config.simulationEnabled &&
            this.nmeaDriver &&
            this.config.simulate?.some(s => s.type === 'tank')
        ) {
            const simSrc = this.config.simulateAddress || 204;
            this.simulateAddressClaim = new AddressClaim(this, this.nmeaDriver, {
                src: simSrc,
                uniqueNumber: 23456,
                manufacturerCode: 2046,
                deviceClass: 75, // Sensors
                deviceFunction: 150, // Fluid Level
                productCode: 0xc002,
                modelId: 'ioBroker.nmea tank',
            });
            this.simulateAddressClaim.start();
        }

        if (this.config.signalKEnabled) {
            const port = parseInt(this.config.signalKPort as unknown as string, 10) || 3000;
            let version = '0.0.0';
            try {
                const pkg = JSON.parse(readFileSync(`${__dirname}/../package.json`, 'utf8')) as {
                    version?: string;
                };
                version = pkg.version || version;
            } catch {
                // ignore — keep default
            }
            this.signalKServer = new SignalKServer({
                adapter: this,
                config: this.config,
                serverVersion: version,
                writePgn: (pgn: WritePgnData) => this.nmeaDriver?.write(pgn),
                simulateAddress: this.config.simulateAddress,
            });
            this.signalKServer.start(port);
        }
    }

    async updateInstance(): Promise<void> {
        const instance = await this.getForeignObjectAsync(`system.adapter.${this.namespace}`);
        const adapter = await this.getForeignObjectAsync('system.adapter.nmea');
        if (
            instance &&
            adapter &&
            JSON.stringify(instance.common.deviceWidgets) !== JSON.stringify(adapter.common.deviceWidgets)
        ) {
            instance.common.deviceWidgets = adapter?.common.deviceWidgets;
            if (instance) {
                await this.setForeignObjectAsync(instance._id, instance);
            }
        }
    }

    async createNmeaChannel(pgn: number, srcAddress?: number): Promise<boolean> {
        if (this.pgn2entry[pgn]) {
            return true;
        }

        const obj: PGNEntry | undefined = PGNS.PGNs.find(p => p.PGN === pgn);
        if (obj) {
            await this.setObjectNotExistsAsync(obj.Id, {
                common: {
                    name: obj.Description,
                    desc: obj.Explanation,
                },
                type: 'channel',
                native: {
                    pgn,
                    src: srcAddress,
                    transmissionIrregular: obj.TransmissionIrregular,
                },
            });
            this.pgn2entry[pgn] = obj;

            // if seatalk1PilotMode
            if (!this.autoPilot) {
                if (pgn === 126720 && this.nmeaDriver && srcAddress) {
                    this.autoPilot = new SeaTalkAutoPilot(this, this.config, this.nmeaDriver, this.values, srcAddress);
                } else if (pgn === 130860 && this.nmeaDriver && srcAddress) {
                    this.autoPilot = new NavicoAutoPilot(this, this.config, this.nmeaDriver, this.values, srcAddress);
                }
            }
            return true;
        }

        this.log.warn(`Unknown pgn: ${pgn}`);
        return false;
    }

    async updateObject(stateObj: ioBroker.StateObject): Promise<void> {
        let existingObject: ioBroker.StateObject | undefined;
        try {
            existingObject = (await this.getObjectAsync(stateObj._id)) as ioBroker.StateObject;
        } catch {
            // ignore
        }
        if (existingObject) {
            // try to update all settings
            let changed = false;
            Object.keys(stateObj.common).forEach(attr => {
                if (
                    JSON.stringify((stateObj.common as Record<string, any>)[attr]) !==
                    JSON.stringify((existingObject.common as Record<string, any>)[attr])
                ) {
                    (existingObject.common as Record<string, any>)[attr] = (stateObj.common as Record<string, any>)[
                        attr
                    ];
                    changed = true;
                }
            });
            if (changed) {
                await this.setObjectAsync(stateObj._id, existingObject);
            }
        } else {
            await this.setObjectNotExistsAsync(stateObj._id, stateObj);
        }
    }

    async createNmeaState(options: {
        pgn: number;
        name: string;
        value: number | string;
    }): Promise<{ id: string | false; states?: Record<string, string> }> {
        const { pgn, name, value } = options;
        const pgnObj = this.pgn2entry[pgn];
        const field = pgnObj.Fields.find(f => f.Name === name);
        let id: string;
        let states: Record<string, string> | undefined;
        let role: string | undefined;
        let commonType: ioBroker.CommonType | undefined;
        let unit: string | undefined;
        if (!field) {
            id = `${pgnObj.Id}.${name}`;
            // Unknown fields (not described by the PGN spec — e.g. canboat's synthetic
            // unknownN on proprietary frames) can arrive as either hex strings or numbers
            // across packets, so use 'mixed' to avoid type-mismatch errors.
            commonType = 'mixed';
            if (typeof value === 'object' && value !== null) {
                options.value = JSON.stringify(value);
            }
        } else {
            id = `${pgnObj.Id}.${field.Id}`;
        }

        if (field) {
            if (field.FieldType === 'STRING_FIX' || field.FieldType === 'STRING_LAU') {
                commonType = 'string';
            } else if (field.FieldType === 'LOOKUP' && field.LookupEnumeration) {
                commonType = 'string';
                const lookUp = PGNS.LookupEnumerations.find(l => l.Name === field.LookupEnumeration);
                if (lookUp) {
                    states = {};
                    lookUp.EnumValues.forEach(v => (states![v.Value] = v.Name));
                }
            } else if (field.FieldType === 'NUMBER') {
                commonType = 'number';
                if (typeof value === 'string' && value.startsWith('0x')) {
                    options.value = parseInt(value.substring(2), 16);
                }
            } else if (field.FieldType === 'DATE') {
                commonType = 'string';
                role = 'value.date';
            } else if (field.FieldType === 'TIME') {
                commonType = 'string';
                role = 'value.time';
            } else if (field.FieldType === 'MMSI') {
                commonType = 'number';
                role = 'value';
            } else if (field.FieldType === 'INDIRECT_LOOKUP') {
                commonType = 'number';
                role = 'value';
            } else if (field.FieldType === 'BINARY') {
                // canboat may emit BINARY as a hex string ("0x1234") or as a number,
                // so use 'mixed' to allow either across consecutive packets.
                commonType = 'mixed';
                role = 'value';
            } else if (field.FieldType === 'SPARE') {
                commonType = 'mixed';
                role = 'value';
            } else if (field.FieldType === 'RESERVED') {
                // skip
                return { id: false };
            } else {
                this.log.warn(`Unsupported field type: ${field.FieldType}: value="${value}"`);
            }
        }

        if (name === 'aisTransceiverInformation') {
            commonType = 'string';
        }

        // try to find meta-data
        let metaData = META_DATA[id];
        if (!metaData) {
            const fieldId: string = id.split('.').pop() as string;
            metaData = META_DATA[fieldId];
        }
        if (metaData) {
            role = metaData.role || role;
            unit = metaData.unit;
            const valueNum = parseFloat(value as string);
            if (metaData.radians) {
                options.value = (valueNum * 180) / Math.PI;
            } else if (metaData.meterPerSecond) {
                options.value = valueNum * 1.9438444924574;
            }
            if (metaData.factor) {
                options.value = (options.value as number) * metaData.factor;
            }
            if (metaData.offset !== undefined) {
                options.value = (options.value as number) + metaData.offset;
            }
            // round value to X digits
            if (metaData.round !== undefined) {
                options.value = Math.round((options.value as number) * metaData.round) / metaData.round;
            }
            // Sanity bounds — drop the sample if the converted value is outside the field's
            // realistic physical range. Used e.g. for depth where echo sounders emit huge
            // out-of-range placeholders (0xFFFFFFFF → ~4.3e9 m) when they lose the bottom; those
            // would otherwise overwrite the last good reading with bogus data. We return the
            // false-id sentinel so callers know to skip the writeState() too.
            const numericValue = options.value as number;
            if (typeof numericValue === 'number' && Number.isFinite(numericValue)) {
                if (metaData.min !== undefined && numericValue < metaData.min) {
                    return { id: false };
                }
                if (metaData.max !== undefined && numericValue > metaData.max) {
                    return { id: false };
                }
            }

            if (metaData.applyMagneticVariation) {
                if (this.values[this.config.magneticVariation || 'magneticVariation.variation']) {
                    const val = normDeg(
                        (options.value as number) +
                            (this.values[this.config.magneticVariation || 'magneticVariation.variation'].val as number),
                    );
                    // create state with magnetic variation
                    const mId = `${id}True`;
                    const stateObj: ioBroker.StateObject = {
                        _id: mId,
                        common: {
                            name: `${field ? field.Name : name} with magnetic variation`,
                            role: 'value.direction',
                            type: 'number',
                            unit: '°',
                            read: true,
                            write: false,
                        },
                        type: 'state',
                        native: {},
                    };

                    await this.updateObject(stateObj);

                    await this.writeState(mId, val);
                }
            }
        }

        // Raymarine "Pilot Wind Datum" (PGN 65345): expose an extra read-only state that
        // renders the angle the way the Raymarine pilot head does — 0…180° to starboard,
        // 180…360° to port, with a language-dependent side letter (e.g. datum 230° →
        // "130°P" in English, "130°B" in German). The numeric `windDatum` itself stays in
        // radians on purpose: the autopilot wind-angle adjustment reads it back as radians
        // (see seaTalkAutoPilot.ts setWindAngle/setWindAngleAbsolute), so the +/-1°/±10°
        // buttons keep working unchanged.
        if (id === 'seatalkPilotWindDatum.windDatum') {
            const raw = parseFloat(options.value as string);
            if (Number.isFinite(raw)) {
                const displayId = 'seatalkPilotWindDatum.windDatumDisplay';
                await this.updateObject({
                    _id: displayId,
                    common: {
                        name: 'Wind datum (Raymarine display, port/starboard)',
                        role: 'text',
                        type: 'string',
                        read: true,
                        write: false,
                    },
                    type: 'state',
                    native: {},
                });
                await this.writeState(displayId, formatWindDatum(raw, this.lang));
            }
        }

        if (!commonType) {
            return { id: false };
        }

        if (this.createsChannelAndStates[id]) {
            return { id, states };
        }

        const stateObj: ioBroker.StateObject = {
            _id: id,
            common: {
                name: field ? field.Name : name,
                desc: field ? field.Description : undefined,
                role: 'state',
                type: commonType,
                read: true,
                write: false,
            },
            type: 'state',
            native: {},
        };
        if (unit) {
            stateObj.common.unit = unit;
        }
        if (role) {
            stateObj.common.role = role;
        }
        if (states) {
            stateObj.native.states = states;
            const texts: Record<string, string> = {};
            Object.keys(states).forEach(s => (texts[states[s]] = states[s]));
            stateObj.common.states = texts;
        }
        await this.updateObject(stateObj);
        this.createsChannelAndStates[id] = true;
        return { id, states };
    }

    async onStateChange(id: string, state?: ioBroker.State | null): Promise<void> {
        if (id.endsWith('.test.rawString') && state?.val && !state.ack && typeof state.val === 'string') {
            let lines = [];
            if (state.val.endsWith('.txt')) {
                if (existsSync(`${__dirname}/test/${state.val}`)) {
                    lines = readFileSync(`${__dirname}/test/${state.val}`).toString().split('\n');
                } else {
                    this.log.warn(`File ${__dirname}/test/${state.val} not found`);
                    return;
                }
            } else {
                lines = state.val.split('\n');
            }
            for (let i = 0; i < lines.length; i++) {
                lines[i] = lines[i].replace('\r', '');
                try {
                    const json = this.parser.parseString(lines[i]);
                    console.log(`Play "${lines[i]} => ${JSON.stringify(json)}`);
                    if (json?.fields) {
                        await this.onData(json);
                    } else {
                        this.log.warn(`Cannot decode line: ${lines[i]}, ${JSON.stringify(json)}`);
                    }
                } catch {
                    this.log.warn(`Cannot decode line: ${lines[i]}`);
                }
            }
        }
        if (this.config.simulate) {
            for (let s = 0; s < this.config.simulate.length; s++) {
                if (this.config.simulate[s].oid === id) {
                    this.simulationsValues[id] = state ? (state.val as number) : null;
                }
            }
        }
        this.autoPilot?.onStateChange(id, state);
        this.fusion?.onStateChange(id, state);
        await this.anchorAlarm?.onStateChange(id, state);
        await this.anchorTracker?.onStateChange(id, state);
    }

    onMessage(obj: ioBroker.Message): void {
        if (!obj?.command) {
            return;
        }

        switch (obj.command) {
            case 'list':
                if (obj.callback) {
                    try {
                        import('serialport')
                            .then(def => {
                                const SerialPort = def.SerialPort;
                                if (SerialPort) {
                                    // read all found serial ports
                                    SerialPort.list()
                                        .then(ports => {
                                            this.log.info(`List of port: ${JSON.stringify(ports)}`);

                                            this.sendTo(
                                                obj.from,
                                                obj.command,
                                                ports.map(item => ({
                                                    label: item.path,
                                                    value: item.path,
                                                })),
                                                obj.callback,
                                            );
                                        })
                                        .catch((e: string) => {
                                            this.sendTo(obj.from, obj.command, [], obj.callback);
                                            this.log.error(e);
                                        });
                                } else {
                                    this.log.warn('Module "serialport" is not available');
                                    this.sendTo(
                                        obj.from,
                                        obj.command,
                                        [{ label: 'Not available', value: '' }],
                                        obj.callback,
                                    );
                                }
                            })
                            .catch((e: string) => {
                                this.log.error(`Cannot list serial ports: ${e}`);
                                this.sendTo(
                                    obj.from,
                                    obj.command,
                                    [{ label: 'Not available', value: '' }],
                                    obj.callback,
                                );
                            });
                    } catch (e) {
                        this.log.error(`Cannot list serial ports: ${e}`);
                        this.sendTo(obj.from, obj.command, [{ label: 'Not available', value: '' }], obj.callback);
                    }
                }

                break;

            case 'listCan':
                if (obj.callback) {
                    try {
                        // cmd: ip link show
                        import('node:child_process')
                            .then(def => {
                                const exec = def.exec;
                                // Output of "ip link show"
                                // ~$ ip link show
                                // 1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN mode DEFAULT group default qlen 1000
                                // link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00
                                // 2: ens33: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc pfifo_fast state UP mode DEFAULT group default qlen 1000
                                // link/ether 00:0c:29:35:8c:af brd ff:ff:ff:ff:ff:ff
                                // 3: can0: <NOARP,ECHO> mtu 16 qdisc noop state DOWN mode DEFAULT group default qlen 10
                                // link/can

                                exec(
                                    'ip link show',
                                    (error: ExecException | null, stdout: string | Buffer, stderr: string | Buffer) => {
                                        if (error) {
                                            this.log.error(`error: ${error.message}`);
                                            return;
                                        }
                                        if (stderr) {
                                            this.log.error(`stderr: ${stderr.toString()}`);
                                            return;
                                        }
                                        // analyse stdout
                                        const lines = (stdout || '').toString().split('\n');
                                        const ports: { label: string; value: string }[] = [];

                                        for (let l = 0; l < lines.length; l++) {
                                            const line = lines[l].trim();
                                            const m = line.match(/^\d+: (can\d+): /);
                                            if (m) {
                                                ports.push({
                                                    label: m[1],
                                                    value: m[1],
                                                });
                                            }
                                        }

                                        this.sendTo(obj.from, obj.command, ports, obj.callback);
                                    },
                                );
                            })
                            .catch((e: string) => {
                                this.log.error(`Cannot list CAN ports: ${e}`);
                                this.sendTo(
                                    obj.from,
                                    obj.command,
                                    [{ label: 'Not available', value: '' }],
                                    obj.callback,
                                );
                            });
                    } catch {
                        this.sendTo(obj.from, obj.command, [{ label: 'Not available', value: '' }], obj.callback);
                    }
                }

                break;

            default:
                this.log.warn(`Unknown command: ${obj.command}`);
                break;
        }
    }

    onUnload(callback: () => void): void {
        try {
            this.autoPilot?.stop();
            this.autoPilot = null;
            this.fusion?.stop();
            this.fusion = null;
            if (this.connectedInterval) {
                this.clearInterval(this.connectedInterval);
                this.connectedInterval = null;
            }
            if (this.sendEnvironmentInterval) {
                this.clearInterval(this.sendEnvironmentInterval);
                this.sendEnvironmentInterval = null;
            }
            this.setState('info.connection', false, true).catch(e =>
                this.log.error(`Cannot set info.connection to false: ${e}`),
            );
            this.signalKServer?.stop();
            this.signalKServer = null;
            this.addressClaim?.stop();
            this.addressClaim = null;
            this.simulateAddressClaim?.stop();
            this.simulateAddressClaim = null;
            this.anchorAlarm = null;
            this.anchorTracker?.stop();
            this.anchorTracker = null;
            this.nmeaDriver?.stop();
            callback();
        } catch {
            callback();
        }
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<AdapterOptions>) => new NmeaAdapter(options);
} else {
    // otherwise start the instance directly
    new NmeaAdapter();
}
