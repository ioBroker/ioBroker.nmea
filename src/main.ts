'use strict';

import * as utils from '@iobroker/adapter-core';
import fs from 'node:fs';
import cp, { ExecException } from 'node:child_process';
import { find } from 'geo-tz';
import META_DATA from './lib/metaData';
import AutoPilot from './lib/seaTalkAutoPilot';
// @ts-expect-error no types
import { FromPgn } from '@canboat/canboatjs';
import moment from 'moment';
import 'moment/locale/en';
import 'moment/locale/de';
import 'moment/locale/ru';
import 'moment/locale/it';
import 'moment/locale/fr';
import 'moment/locale/pl';
import 'moment/locale/pt';
import 'moment/locale/nl';
import 'moment/locale/es';
import 'moment/locale/uk';
import 'moment/locale/zh-cn';

import {
    PGNType, NmeaConfig,
    GenericDriver, PgnDataEvent, PGNEntry,
} from './types';

import NGT1 from './lib/ngt1';
import PicanM from './lib/picanM';
import t from './lib/i18n';

const PGNS: PGNType = JSON.parse(fs.readFileSync(require.resolve('@canboat/pgns/canboat.json'), 'utf8'));

const WELL_KNOWN_AIS_GROUPS = [
    'aisClassAPositionReport',
    'aisClassAStaticAndVoyageRelatedData',
    'aisClassBPositionReport',
    'aisClassBStaticDataMsg24PartA',
    'aisClassBStaticDataMsg24PartB',
    'aisUtcAndDateReport',
];

export class NmeaAdapter extends utils.Adapter {
    private createsChannelAndStates: Record<string, boolean> = {};

    private pgn2entry: Record<number, PGNEntry> = {};

    private userId2Name: Record<string, { name: string, ts: number }> = {};

    private values: Record<string, { val: ioBroker.StateValue, ts: number }> = {};

    private lastMessageReceived = 0;

    private connectedInterval: ioBroker.Interval | null | undefined = null;

    private sendEnvironmentInterval: ioBroker.Interval | null | undefined = null;

    private autoPilot: AutoPilot | null = null;

    private simulationsValues: Record<string, number | null> = {};

    private aisGroups: string[] = [];

    private parser: FromPgn;

    private nmConfig: NmeaConfig;

    private lastCleanNames = 0;

    private nmeaDriver: GenericDriver | null = null;

    private windSpeeds: { tws: number, ts: number }[] | null = null;

    private windDirs: { twd: number, ts: number }[] | null = null;

    private trueWindSpeedError = 0;

    private trueWindAngleError = 0;

    private currentTimeZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone;

    private pressureHistory: Record<string, { val: number, ts: number }[]> = {};

    private pressureAlerts: Record<string, string> = {};

    private lang: ioBroker.Languages = 'en';

    constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({
            ...options,
            name: 'nmea',
        });

        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));

        this.parser = new FromPgn();

        this.nmConfig = {
            serialPort: 'COM3',
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
        };
    }

    sendCombinedEnvironment(): void {
        const obj = {
            dst: 255,
            prio: 2,
            pgn: 130311,
            fields: {
                SID: 0,
                'Temperature Source': 'Outside Temperature',
                'Temperature': 0,
                'Atmospheric Pressure': 0,
                'Humidity': 50,
                'Humidity Source': 'Outside',
            },
            src: this.nmConfig.simulateAddress || 204,
        };

        for (let s = 0; s < this.nmConfig.simulate.length; s++) {
            const sim = this.nmConfig.simulate[s];
            if (sim.type === 'temperature') {
                if (this.simulationsValues[sim.oid] !== null && this.simulationsValues[sim.oid] !== undefined) {
                    obj.fields.Temperature = Math.round(this.simulationsValues[sim.oid] as number + 273.15);
                    obj.fields['Temperature Source'] = sim.subType || 'Outside Temperature';
                }
            } else if (sim.type === 'humidity') {
                if (this.simulationsValues[sim.oid] !== null && this.simulationsValues[sim.oid] !== undefined) {
                    obj.fields.Humidity = this.simulationsValues[sim.oid] as number;
                    obj.fields['Humidity Source'] = sim.subType || 'Outside';
                }
            } else if (sim.type === 'pressure' && sim.subType === 'Atmospheric') {
                if (this.simulationsValues[sim.oid] !== null && this.simulationsValues[sim.oid] !== undefined) {
                    obj.fields['Atmospheric Pressure'] = this.simulationsValues[sim.oid] as number;
                }
            }
        }

        console.log(`send combined${JSON.stringify(obj)}`);

        this.nmeaDriver?.write(obj);
    }

    sendTemperature(temperature: number, subType: string): void {
        // convert to Kelvin
        const kelvin = Math.round(temperature + 273.15);

        const obj = {
            dst: 255,
            prio: 2,
            pgn: 130312,
            fields: {
                SID: 0,
                Instance: 0,
                Source: subType || 'Outside Temperature',
                'Actual Temperature': kelvin,
                'Set Temperature': 0,
                Reserved: 0,
            },
            src: this.nmConfig.simulateAddress || 204,
        };

        this.nmeaDriver?.write(obj);
    }

    sendHumidity(humidity = 97, subType: string): void {
        const obj = {
            dst: 255,
            prio: 2,
            pgn: 130313,
            fields: {
                SID: 0,
                Instance: 0,
                Source: subType || 'Outside',
                'Actual Humidity': Math.round(humidity),
                'Set Humidity': 0,
                Reserved: 0,
            },
            src: this.nmConfig.simulateAddress || 204,
        };
        this.nmeaDriver?.write(obj);
    }

    sendPressure(pressure = 0, subType: string): void {
        const obj = {
            dst: 255,
            prio: 2,
            pgn: 130314,
            fields: {
                SID: 0,
                Instance: 0,
                Source: subType || 'Atmospheric',
                Pressure: Math.round(pressure),
                Reserved: 0,
            },
            src: this.nmConfig.simulateAddress || 204,
        };
        this.nmeaDriver?.write(obj);
    }

    async sendEnvironment(): Promise<void> {
        if (this.nmConfig.simulate) {
            let anyData = false;
            for (let s = 0; s < this.nmConfig.simulate.length; s++) {
                const sim = this.nmConfig.simulate[s];
                if (!sim || !sim.oid) {
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
                }

                this.log.debug(`Simulate [${sim.type}] ${sim.oid} = ${this.simulationsValues[sim.oid]}`);

                if (!this.nmConfig.combinedEnvironment) {
                    if (sim.type === 'temperature') {
                        if (this.simulationsValues[sim.oid] !== null && this.simulationsValues[sim.oid] !== undefined) {
                            this.sendTemperature(this.simulationsValues[sim.oid] as number, sim.subType);
                        }
                    } else if (sim.type === 'humidity') {
                        if (this.simulationsValues[sim.oid] !== null && this.simulationsValues[sim.oid] !== undefined) {
                            this.sendHumidity(this.simulationsValues[sim.oid] as number, sim.subType);
                        }
                    } else if (sim.type === 'pressure') {
                        if (this.simulationsValues[sim.oid] !== null && this.simulationsValues[sim.oid] !== undefined) {
                            this.sendPressure(this.simulationsValues[sim.oid] as number, sim.subType);
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

    async writeState(id: string, val: ioBroker.StateValue): Promise<void> {
        if (val !== undefined) {
            if (!this.values[id] ||
                val !== this.values[id].val ||
                !this.nmConfig.updateAtLeastEveryMs ||
                Date.now() - this.values[id].ts >= this.nmConfig.updateAtLeastEveryMs
            ) {
                this.values[id] = { val: val, ts: Date.now() };
                await this.setState(id, val, true);
            }
        }
    }

    async processWindEvent(data: PgnDataEvent): Promise<void> {
        // calculate true wind speed and angle
        // try to find a true direction and true speed
        let trueCog: number | undefined;
        if (this.values['cogSogRapidUpdate.cogTrue']) {
            trueCog = this.values['cogSogRapidUpdate.cogTrue'].val as number;
        } else if (this.values['directionData.cogTrue']) {
            trueCog = this.values['directionData.cogTrue'].val as number;
        } else if (this.values['seatalkPilotHeading.headingMagneticTrue']) {
            trueCog = this.values['seatalkPilotHeading.headingMagneticTrue'].val as number;
        } else if (this.values['vesselHeading.headingTrue']) {
            trueCog = this.values['vesselHeading.headingTrue'].val as number;
        } else if (this.values['vesselHeading.headingMagnetic']) {
            trueCog = this.values['vesselHeading.headingMagnetic'].val as number;
        }
        if (trueCog !== undefined) {
            let trueSog: number | undefined;
            if (this.values['cogSogRapidUpdate.sog']) {
                trueSog = this.values['cogSogRapidUpdate.sog'].val as number;
            } else if (this.values['directionData.sog']) {
                trueSog = this.values['directionData.sog'].val as number;
            }

            if (trueSog !== undefined) {
                // convert from radian to degree
                const windAngle: number = data.fields['Wind Angle'] * 180 / Math.PI;
                // convert frm m/s to kn
                const windSpeed: number = data.fields['Wind Speed'] * 1.9438444924574;

                let trueWindDirectionRounded: number;
                let trueWindSpeedRounded: number;
                let apparentWindDirectionRounded: number;
                let apparentWindSpeedRounded: number;

                if (data.fields.Reference?.includes('Apparent')) {
                    // const awd = (boatHeading + awa) % 360;
                    // const u = (boatSpeed * Math.sin(boatHeading * Math.PI / 180)) - (aws * Math.sin(awd * Math.PI/180));
                    // const v = (boatSpeed * Math.cos(boatHeading * Math.PI / 180)) - (aws * Math.cos(awd * Math.PI/180));
                    // const tws = Math.sqrt(u * u + v * v);
                    // const twd = Math.atan(u / v) * 180 / Math.PI;
                    // const twd1 = twd;
                    // if (twd < 0) {
                    //   twd = 360+twd;
                    // }
                    const apparentWindDirection = (windAngle + trueCog) % 360;
                    const u = (trueSog * Math.sin(trueCog * Math.PI / 180)) - (windSpeed * Math.sin(apparentWindDirection * Math.PI/180));
                    const v = (trueSog * Math.cos(trueCog * Math.PI / 180)) - (windSpeed * Math.cos(apparentWindDirection * Math.PI/180));
                    const trueWindSpeed = Math.sqrt(u * u + v * v);
                    const trueWindDirection = v ? Math.atan(u / v) * 180 / Math.PI : 0;

                    trueWindDirectionRounded = Math.round(trueWindDirection * 10) / 10;
                    trueWindSpeedRounded = Math.round(trueWindSpeed * 100) / 100;
                    apparentWindDirectionRounded = Math.round(apparentWindDirection * 10) / 10;
                    apparentWindSpeedRounded = Math.round(windSpeed * 100) / 100;
                } else if (data.fields.Reference && data.fields.Reference.includes('Magnetic')) {
                    trueWindSpeedRounded = windSpeed;
                    trueWindDirectionRounded = (trueCog + windAngle + (this.values[this.nmConfig.magneticVariation || 'magneticVariation.variation'].val as number)) % 360;
                    apparentWindDirectionRounded = Math.round((trueCog - trueWindDirectionRounded) * 10) / 10;
                    // TODO!!
                    apparentWindSpeedRounded = 0;
                } else {
                    // True
                    trueWindSpeedRounded = windSpeed;
                    trueWindDirectionRounded = windAngle;
                    apparentWindSpeedRounded = windSpeed;
                    // TODO!!
                    apparentWindDirectionRounded = 0;
                    apparentWindSpeedRounded = 0;
                }

                const twdId = `${this.pgn2entry[data.pgn].Id}.windDirectionTrue`;

                if (!this.createsChannelAndStates[twdId]) {
                    this.createsChannelAndStates[twdId] = true;
                    const trueWindAngleObject: ioBroker.StateObject = {
                        _id: twdId,
                        common: {
                            name: 'True Wind Direction',
                            type: 'number',
                            unit: '°',
                            role: 'value.direction.wind',
                            read: true,
                            write: false,
                        },
                        type: 'state',
                        native: {
                        }
                    };
                    await this.updateObject(trueWindAngleObject);
                }

                const twsId = `${this.pgn2entry[data.pgn].Id}.windSpeedTrue`;
                if (!this.createsChannelAndStates[twsId]) {
                    this.createsChannelAndStates[twsId] = true;
                    const trueWindSpeedObject: ioBroker.StateObject = {
                        _id: twsId,
                        common: {
                            name: 'True Wind Speed',
                            type: 'number',
                            unit: 'kn',
                            role: 'value.speed.wind',
                            read: true,
                            write: false,
                        },
                        type: 'state',
                        native: {
                        }
                    };
                    await this.updateObject(trueWindSpeedObject);
                }

                const avwdId = `${this.pgn2entry[data.pgn].Id}.windDirectionAverage`;
                if (!this.createsChannelAndStates[avwdId]) {
                    this.createsChannelAndStates[avwdId] = true;
                    const averageWindAngleObject: ioBroker.StateObject = {
                        _id: avwdId,
                        common: {
                            name: 'Average Wind Direction',
                            type: 'number',
                            unit: '°',
                            role: 'value.direction.wind',
                            read: true,
                            write: false,
                        },
                        type: 'state',
                        native: {
                        }
                    };
                    await this.updateObject(averageWindAngleObject);
                }

                const avwsId = `${this.pgn2entry[data.pgn].Id}.windSpeedAverage`;
                if (!this.createsChannelAndStates[avwsId]) {
                    this.createsChannelAndStates[avwsId] = true;
                    const averageWindSpeedObject: ioBroker.StateObject = {
                        _id: avwsId,
                        common: {
                            name: 'Average Wind Speed',
                            type: 'number',
                            unit: 'kn',
                            role: 'value.speed.wind',
                            read: true,
                            write: false,
                        },
                        type: 'state',
                        native: {
                        }
                    };
                    await this.updateObject(averageWindSpeedObject);
                }

                const maxwsId = `${this.pgn2entry[data.pgn].Id}.windSpeedMax`;
                if (!this.createsChannelAndStates[maxwsId]) {
                    this.createsChannelAndStates[maxwsId] = true;
                    const maxWindSpeedObject: ioBroker.StateObject = {
                        _id: maxwsId,
                        common: {
                            name: 'Maximal Wind Speed',
                            type: 'number',
                            unit: 'kn',
                            role: 'value.speed.wind',
                            read: true,
                            write: false,
                        },
                        type: 'state',
                        native: {
                        }
                    };
                    await this.updateObject(maxWindSpeedObject);
                }

                const awdId = `${this.pgn2entry[data.pgn].Id}.windDirectionApparent`;
                if (!this.createsChannelAndStates[awdId]) {
                    this.createsChannelAndStates[awdId] = true;
                    const apparentWindDirectionObject: ioBroker.StateObject = {
                        _id: awdId,
                        common: {
                            name: 'Apparent Wind Direction',
                            type: 'number',
                            unit: '°',
                            role: 'value.direction.wind',
                            read: true,
                            write: false,
                        },
                        type: 'state',
                        native: {
                        }
                    };
                    await this.updateObject(apparentWindDirectionObject);
                }

                const awsId = `${this.pgn2entry[data.pgn].Id}.windSpeedApparent`;
                if (!this.createsChannelAndStates[awsId]) {
                    this.createsChannelAndStates[awsId] = true;
                    const apparentWindSpeedObject: ioBroker.StateObject = {
                        _id: awsId,
                        common: {
                            name: 'Apparent Wind Speed',
                            type: 'number',
                            unit: 'kn',
                            role: 'value.speed.wind',
                            read: true,
                            write: false,
                        },
                        type: 'state',
                        native: {
                        }
                    };
                    await this.updateObject(apparentWindSpeedObject);
                }

                if (trueWindDirectionRounded < 0) {
                    trueWindDirectionRounded = trueWindDirectionRounded + 360;
                }
                if (apparentWindDirectionRounded < 0) {
                    apparentWindDirectionRounded = apparentWindDirectionRounded + 360;
                }

                // Calculate average and max wind speed for the last 30 seconds
                const now = Date.now();
                this.windSpeeds = this.windSpeeds || [];
                this.windSpeeds.push({ tws: trueWindSpeedRounded, ts: now });
                // Delete all entries older than X seconds
                this.windSpeeds = this.windSpeeds.filter(w => now - w.ts < this.nmConfig.approximateMs);

                this.windDirs = this.windDirs || [];
                this.windDirs.push({ twd: trueWindDirectionRounded, ts: now });
                // Delete all entries older than X seconds
                this.windDirs = this.windDirs.filter(w => now - w.ts < this.nmConfig.approximateMs);

                let sumSpeed = 0;
                let maxSpeed = 0;
                this.windSpeeds.forEach(w => {
                    sumSpeed += w.tws;
                    if (w.tws > maxSpeed) {
                        maxSpeed = w.tws;
                    }
                });
                sumSpeed = Math.round(sumSpeed / this.windSpeeds.length * 100) / 100;

                let sumDirection = 0;
                this.windDirs.forEach(w => sumDirection += w.twd);
                sumDirection = Math.round(sumDirection / this.windDirs.length * 100) / 100;

                await this.writeState(twdId, trueWindDirectionRounded);
                await this.writeState(twsId, trueWindSpeedRounded);
                // if the reference is True, we do not calculate the apparent wind
                await this.writeState(avwdId, apparentWindDirectionRounded);
                await this.writeState(avwsId, apparentWindSpeedRounded);
                await this.writeState(maxwsId, maxSpeed);
                await this.writeState(awdId, sumDirection);
                await this.writeState(awsId, sumSpeed);
            } else {
                // show warning only one time and only after 3 calculation rounds
                this.trueWindSpeedError = this.trueWindSpeedError || 0;
                if (this.trueWindSpeedError < 100) {
                    this.trueWindSpeedError++;
                }
                if (this.trueWindSpeedError === 50) {
                    this.log.warn('Could not find true wind speed');
                }
            }
        } else {
            // show warning only one time and only after 3 calculation rounds
            this.trueWindAngleError = this.trueWindAngleError || 0;
            if (this.trueWindAngleError === 50) {
                this.log.warn('Could not find true wind angle');
            }
            if (this.trueWindAngleError < 100) {
                this.trueWindAngleError++;
            }
        }
    }

    async processPositionEvent(data: PgnDataEvent): Promise<void> {
        const id = `${this.pgn2entry[data.pgn].Id}.position`;
        const val = `${data.fields.Longitude};${data.fields.Latitude}`;
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
                native: {
                }
            };
            await this.setObjectNotExistsAsync(id, positionObject);
        }
        if (data.fields.Time) {
            // detect time zone
            const timeZone = find(data.fields.Latitude, data.fields.Longitude);  // ['America/Los_Angeles']
            if (timeZone && timeZone[0]) {
                const timeZoneID = `${this.pgn2entry[data.pgn].Id}.timeZone`;
                if (!this.createsChannelAndStates[timeZoneID]) {
                    this.createsChannelAndStates[timeZoneID] = true;
                    const positionObject: ioBroker.StateObject = {
                        _id: timeZoneID,
                        common: {
                            name: 'Current Time Zone',
                            type: 'string',
                            role: 'value',
                            read: true,
                            write: false,
                        },
                        type: 'state',
                        native: {
                        }
                    };
                    await this.setObjectNotExistsAsync(id, positionObject);
                }

                if (this.currentTimeZone !== timeZone[0]) {
                    this.currentTimeZone = timeZone[0];
                    await this.setState('timeZone', this.currentTimeZone, true);
                    this.setSystemTimeZone(timeZone[0]);
                }
            }
        }

        await this.writeState(id, val);
    }

    setSystemTimeZone(zone: string): void {
        if (zone !== Intl.DateTimeFormat().resolvedOptions().timeZone && this.nmConfig.applyGpsTimeZoneToSystem) {
            if (process.platform === 'linux') {
                cp.exec(`timedatectl set-timezone ${zone}`, (error, stdout, stderr) => {
                    if (error || stderr) {
                        error && this.log.error(`timedatectl set-timezone ${zone} error: ${error}`);
                        stderr && this.log.error(`timedatectl set-timezone ${zone} error: ${stderr}`);
                    } else {
                        this.log.info(`Time Zone changed to ${zone}`);
                    }
                });
            } else {
                this.log.warn('Detected new time zone via GPS, but ioBroker cannot change it on this system');
            }
        }
    }

    async processMagneticVariation(data: PgnDataEvent, withReference: string[]): Promise<void> {
        for (let r = 0; r < withReference.length; r++) {
            const name = withReference[r];
            const pgnObj = this.pgn2entry[data.pgn];
            const field = pgnObj?.Fields.find(f => f.Name === name);
            if (!field) {
                continue;
            }
            const mId = `${this.pgn2entry[data.pgn].Id}.${field.Id}True`;
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
                    native: {}
                };
                await this.updateObject(headingObject);
                this.createsChannelAndStates[mId] = true;
            }
            let val: number = this.values[`${this.pgn2entry[data.pgn].Id}.${field.Id}`].val as number;
            let referenceVal = this.values[`${this.pgn2entry[data.pgn].Id}.${field.Id}Reference`];
            if (!referenceVal) {
                referenceVal = this.values[`${this.pgn2entry[data.pgn].Id}.reference`];
            }
            if (referenceVal && referenceVal.val === 'Magnetic') {
                val = val + (this.values[this.nmConfig.magneticVariation || 'magneticVariation.variation'].val as number);
            }
            await this.writeState(mId, val);
        }
    }

    static nameToId(name: string): string {
        const parts = name.split(' ');
        return parts.map(p => p[0].toUpperCase() + p.substring(1).toLowerCase()).join('_');
    }

    async processPressureEvent(data: PgnDataEvent): Promise<void> {
        const source: string = data.fields.Source || '';
        const pressure = Math.round(data.fields.Pressure / 10) / 10;
        const pressureId = `${this.pgn2entry[data.pgn].Id}.pressure${NmeaAdapter.nameToId(source)}`;

        // check what the type of event it is
        if (source) {
            // create the according pressure
            if (!this.createsChannelAndStates[pressureId]) {
                this.createsChannelAndStates[pressureId] = true;
                const pressureObject: ioBroker.StateObject = {
                    _id: pressureId,
                    common: {
                        name: `Pressure ${data.fields.Source}`,
                        type: 'number',
                        unit: 'mbar',
                        role: 'value.pressure',
                        read: true,
                        write: false,
                    },
                    type: 'state',
                    native: {}
                };
                await this.updateObject(pressureObject);
            }
            await this.setState(pressureId, Math.round(pressure), true);
        }

        // create the alert flag
        const pressureAlertTextId = `${this.pgn2entry[data.pgn].Id}.pressure${NmeaAdapter.nameToId(data.fields.Source)}AlertText`;
        if (!this.createsChannelAndStates[pressureAlertTextId]) {
            this.createsChannelAndStates[pressureAlertTextId] = true;
            const pressureAlertTextObject: ioBroker.StateObject = {
                _id: pressureAlertTextId,
                common: {
                    name: `Pressure ${data.fields.Source} Alert`,
                    type: 'string',
                    role: 'value',
                    read: true,
                    write: false,
                },
                type: 'state',
                native: {}
            };
            await this.updateObject(pressureAlertTextObject);
        }

        const pressureAlertId = `${this.pgn2entry[data.pgn].Id}.pressure${NmeaAdapter.nameToId(data.fields.Source)}Alert`;
        if (!this.createsChannelAndStates[pressureAlertId]) {
            this.createsChannelAndStates[pressureAlertId] = true;
            const pressureAlertObject: ioBroker.StateObject = {
                _id: pressureAlertId,
                common: {
                    name: `Pressure ${data.fields.Source} Alert`,
                    type: 'boolean',
                    role: 'indicator.alarm',
                    read: true,
                    write: false,
                },
                type: 'state',
                native: {
                }
            };
            await this.updateObject(pressureAlertObject);
        }

        // create the according flag
        const pressureAlertHistoryId = `${this.pgn2entry[data.pgn].Id}.pressure${NmeaAdapter.nameToId(data.fields.Source)}AlertHistory`;
        if (!this.createsChannelAndStates[pressureAlertHistoryId]) {
            this.createsChannelAndStates[pressureAlertHistoryId] = true;
            const pressureHistoryObject: ioBroker.StateObject = {
                _id: pressureAlertHistoryId,
                common: {
                    name: `Pressure ${data.fields.Source} Alert History`,
                    type: 'array',
                    role: 'state',
                    read: true,
                    write: false,
                },
                type: 'state',
                native: {
                }
            };
            await this.updateObject(pressureHistoryObject);

            // read history
            const history = await this.getStateAsync(pressureAlertHistoryId);
            if (history?.val) {
                try {
                    this.pressureHistory[pressureId] = JSON.parse(history.val as string);
                } catch (e) {
                    this.pressureHistory[pressureId] = [];
                }
            }
        }

        const history = this.pressureHistory[pressureId];
        if (history) {
            // do not make the calculations too often (every minute is enough)
            // delete all entries older than this.config.pressureAlertMinutes
            for (let h = 0; h < history.length; h++) {
                if (Date.now() - history[h].ts > this.nmConfig.pressureAlertMinutes * 60000) {
                    history.splice(h, 1);
                }
            }
            if (!history.length || history[history.length - 1].ts - Date.now() > 60000) {
                history.push({ val: pressure, ts: Date.now() });
                await this.setState(pressureAlertHistoryId, JSON.stringify(history), true);
                // find out if the pressure is falling on more than 4 mbar in 4 hours
                let min: { val: number, ts: number } | undefined;
                let max: { val: number, ts: number } | undefined;
                for (let i = 0; i < history.length; i++) {
                    if (!min || min.val > history[i].val) {
                        min = history[i];
                    }
                    if (!max || max.val < history[i].val) {
                        max = history[i];
                    }
                }
                if (min && max && min.ts > max.ts) {
                    const diff = max.val - min.val;
                    if (diff > this.nmConfig.pressureAlertDiff) {
                        const minTs = moment(new Date(min.ts));
                        const maxTs = moment(new Date(max.ts));
                        const tsDiff = minTs.from(maxTs);

                        const alertText = t(`Pressure is falling by %s mbar in %s`, this.lang, diff, tsDiff);
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

    async processTemperatureEvent(data: PgnDataEvent): Promise<void> {
        // check what the type of event it is
        if (data.fields['Temperature Source']) {
            // create the according pressure
            const tempId = `${this.pgn2entry[data.pgn].Id}.temperature${NmeaAdapter.nameToId(data.fields['Temperature Source'])}`;
            if (!this.createsChannelAndStates[tempId]) {
                this.createsChannelAndStates[tempId] = true;
                const tempObject: ioBroker.StateObject = {
                    _id: tempId,
                    common: {
                        name: `Temperature ${data.fields['Temperature Source']}`,
                        type: 'number',
                        unit: '°C',
                        role: 'value.temperature',
                        read: true,
                        write: false,
                    },
                    type: 'state',
                    native: {
                    },
                };
                await this.updateObject(tempObject);
            }

            await this.setState(tempId, Math.round((data.fields.Temperature - 273.15) * 10) / 10, true);
        }
    }

    async processActualTemperatureEvent(data: PgnDataEvent): Promise<void> {
        // check what the type of event it is
        // (data.fields['Actual Temperature'] && data.fields.Source) {
        if (data.fields.Source) {
            // create the according pressure
            const tempId = `${this.pgn2entry[data.pgn].Id}.actualTemperature${NmeaAdapter.nameToId(data.fields.Source)}`;
            if (!this.createsChannelAndStates[tempId]) {
                this.createsChannelAndStates[tempId] = true;
                const tempObject: ioBroker.StateObject = {
                    _id: tempId,
                    common: {
                        name: `Temperature ${data.fields.Source}`,
                        type: 'number',
                        unit: '°C',
                        role: 'value.temperature',
                        read: true,
                        write: false,
                    },
                    type: 'state',
                    native: {
                    },
                };
                await this.updateObject(tempObject);
            }

            await this.setState(tempId, Math.round((data.fields['Actual Temperature'] - 273.15) * 10) / 10, true);
        }
    }

    static nameToID(name: string): string {
        return name.replace(/[.\s]/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
    }

    cleanAisNames(): void {
        if (this.lastCleanNames && Date.now() - this.lastCleanNames < this.nmConfig.deleteAisAfter) {
            return;
        }
        this.lastCleanNames = Date.now();
        Object.keys(this.userId2Name).forEach(k => {
            if (Date.now() - this.userId2Name[k].ts > 3600000) {
                delete this.userId2Name[k];
            }
        });

        // delete all AIS data older than one hour
        setTimeout(async(): Promise<void> => {
            const groups = [...WELL_KNOWN_AIS_GROUPS, this.aisGroups];
            for (let l = 0; l < groups.length; l++) {
                const states = await this.getStatesAsync(`${this.namespace}.${groups[l]}.*`);
                const ids = Object.keys(states);
                for (let s = 0; s < ids.length; s++) {
                    const id = ids[s];
                    if (!states[id] || states[id].ts > Date.now() - this.nmConfig.deleteAisAfter * 1000) {
                        // delete object
                        await this.delObjectAsync(id);
                    }
                }
            }
        }, 1000);
    }

    async processAisData(data: PgnDataEvent): Promise<void> {
        const aisId = `${this.pgn2entry[data.pgn].Id}.${data.fields['User ID']}`;
        if (data.fields.Name) {
            this.userId2Name[data.fields['User ID']] = { name: data.fields.Name as string, ts: Date.now() };
        }
        if (!this.aisGroups.includes(this.pgn2entry[data.pgn].Id)) {
            this.aisGroups.push(this.pgn2entry[data.pgn].Id);
        }

        this.cleanAisNames();

        if (!this.createsChannelAndStates[aisId]) {
            this.createsChannelAndStates[aisId] = true;
            const aisObject: ioBroker.StateObject = {
                _id: aisId,
                common: {
                    name: data.fields.Name as string || this.userId2Name[data.fields['User ID']]?.name || '',
                    type: 'object',
                    role: 'value',
                    read: true,
                    write: false,
                },
                type: 'state',
                native: {
                }
            };
            await this.updateObject(aisObject);
        }

        if (data.fields.SID) {
            // @ts-expect-error no idea why this is not working
            delete data.fields.SID;
        }

        await this.setState(aisId, JSON.stringify(data.fields), true);
    }

    onData = async(data: PgnDataEvent): Promise<void> => {
        this.lastMessageReceived = Date.now();

        if (!this.connectedInterval) {
            await this.setState('info.connection', true, true);
            this.connectedInterval = this.setInterval(async() => {
                if (!this.lastMessageReceived || Date.now() - this.lastMessageReceived >= 10000) {
                    await this.setState('info.connection', false, true);
                    this.clearInterval(this.connectedInterval);
                    this.connectedInterval = null;
                    this.sendEnvironmentInterval && this.clearInterval(this.sendEnvironmentInterval);
                    this.sendEnvironmentInterval = null;
                }
            }, 5000);
            if (this.nmConfig.simulationEnabled) {
                this.sendEnvironmentInterval = this.setInterval(() => this.sendEnvironment(), 1000);
            }
        }

        if (data.pgn && data.fields) {
            if (await this.createNmeaChannel(data.pgn, data.src)) {
                const keys = Object.keys(data.fields);
                const withReference: string[] = [];
                if (!data.fields['User ID']) {
                    for (let k = 0; k < keys.length; k++) {
                        if (keys[k] === 'SID') {
                            continue;
                        }
                        if (data.fields[`${keys[k]} Reference`]) {
                            withReference.push(keys[k]);
                        } else if (keys[k] === 'Heading' && data.fields.Reference) {
                            withReference.push(keys[k]);
                        }
                        const val = data.fields[keys[k]];
                        const options = { pgn: data.pgn, name: keys[k], value: val };
                        const id = await this.createNmeaState(options);
                        if (id) {
                            await this.writeState(id, options.value);
                        }
                    }
                }
                if (data.fields['Wind Speed'] && data.fields['Wind Angle']) {
                    await this.processWindEvent(data);
                } else if (data.fields.Longitude && data.fields.Latitude) {
                    await this.processPositionEvent(data);
                } else if (withReference.length && this.values[this.nmConfig.magneticVariation || 'magneticVariation.variation']) {
                    await this.processMagneticVariation(data, withReference);
                } else if (data.fields.Pressure && data.fields.Source) {
                    await this.processPressureEvent(data);
                } else if (data.fields.Temperature && data.fields['Temperature Source']) {
                    await this.processTemperatureEvent(data);
                } else if (data.fields['Actual Temperature'] && data.fields.Source) {
                    await this.processActualTemperatureEvent(data);
                } else if (data.fields['User ID']) {
                    await this.processAisData(data);
                }
            }
        }
    };

    async onReady(): Promise<void> {
        this.nmConfig = this.config as NmeaConfig;

        const connectionState = await this.getStateAsync('info.connection');
        if (connectionState?.val) {
            await this.setState('info.connection', false, true);
        }
        if (this.nmConfig.updateAtLeastEveryMs === undefined) {
            this.nmConfig.updateAtLeastEveryMs = 60000;
        }

        this.nmConfig.approximateMs = parseInt(this.nmConfig.approximateMs as any as string, 10) || 10000;
        this.nmConfig.deleteAisAfter = parseInt(this.nmConfig.deleteAisAfter as any as string, 10) || 3600;
        this.nmConfig.pressureAlertDiff = parseInt(this.nmConfig.pressureAlertDiff as any as string, 10) || 4;
        this.nmConfig.pressureAlertMinutes = parseInt(this.nmConfig.pressureAlertMinutes as any as string, 10) || 240;

        const systemConfig: ioBroker.SystemConfigObject | null | undefined = await this.getForeignObjectAsync('system.config');

        this.lang = systemConfig?.common?.language || 'en';
        moment.locale(this.lang); // set default locale

        await this.subscribeStatesAsync('test.rawString');

        if (this.nmConfig.type === 'ngt1') {
            this.nmeaDriver = new NGT1(this, this.nmConfig, this.onData);
        } else if (this.nmConfig.type === 'picanm') {
            this.nmeaDriver = new PicanM(this, this.nmConfig, this.onData);
        } else {
            this.log.error(`Unknown driver type: ${this.nmConfig.type}`);
            return;
        }

        this.nmeaDriver?.start();
    }

    async createNmeaChannel(pgn: number, srcAddress: number): Promise<boolean> {
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
            if (pgn === 126720 && this.nmeaDriver) {
                this.autoPilot = new AutoPilot(this, this.nmConfig, this.nmeaDriver, srcAddress, this.values);
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
        } catch (e) {
            // ignore
        }
        if (existingObject) {
            // try to update all settings
            let changed = false;
            Object.keys(stateObj.common).forEach(attr => {
                if (JSON.stringify((stateObj.common as Record<string, any>)[attr]) !== JSON.stringify((existingObject.common as Record<string, any>)[attr])) {
                    (existingObject.common as Record<string, any>)[attr] = (stateObj.common as Record<string, any>)[attr];
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

    async createNmeaState(options: { pgn: number, name: string, value: number | string }): Promise<string | false> {
        const { pgn, name, value } = options;
        const pgnObj = this.pgn2entry[pgn];
        const field = pgnObj.Fields.find(f => f.Name === name);
        let id;
        let states;
        let role;
        let commonType: ioBroker.CommonType | undefined;
        let unit;
        if (!field) {
            id = `${pgnObj.Id}.${name}`;
            commonType = typeof value as ioBroker.CommonType;
            if (commonType === 'object') {
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
                    lookUp.EnumValues.forEach(v => states[v.Value] = v.Name);
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
            }  else if (field.FieldType === 'INDIRECT_LOOKUP') {
                commonType = 'number';
                role = 'value';
            } else if (field.FieldType === 'BINARY') {
                commonType = typeof value as ioBroker.CommonType;
                role = 'value';
            } else if (field.FieldType === 'SPARE') {
                commonType = typeof value as ioBroker.CommonType;
                role = 'value';
            } else if (field.FieldType === 'RESERVED') {
                // skip
                return false;
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
                options.value = valueNum * 180 / Math.PI;
            } else if (metaData.meterPerSecond) {
                options.value = valueNum * 1.9438444924574;
            }
            if (metaData.factor) {
                options.value = options.value as number * metaData.factor;
            }
            if (metaData.offset !== undefined) {
                options.value = options.value as number + metaData.offset;
            }
            // round value to X digits
            if (metaData.round !== undefined) {
                options.value = Math.round(options.value as number * metaData.round) / metaData.round;
            }

            if (metaData.applyMagneticVariation) {
                if (this.values[this.nmConfig.magneticVariation || 'magneticVariation.variation']) {
                    const val = options.value as number + (this.values[this.nmConfig.magneticVariation || 'magneticVariation.variation'].val as number);
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
                        native: {
                        },
                    };

                    await this.updateObject(stateObj);

                    await this.writeState(mId, val);
                }
            }
        }

        if (!commonType) {
            return false;
        }

        if (this.createsChannelAndStates[id]) {
            return id;
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
            native: {
            }
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
            Object.keys(states).forEach(s => texts[states[s]] = states[s]);
            stateObj.common.states = texts;
        }
        await this.updateObject(stateObj);
        this.createsChannelAndStates[id] = true;
        return id;
    }

    async onStateChange(id: string, state?: ioBroker.State | null): Promise<void> {
        if (id.endsWith('.test.rawString') && state?.val && !state.ack && typeof state.val === 'string') {
            let lines = [];
            if (state.val.endsWith('.txt')) {
                if (fs.existsSync(`${__dirname}/test/${state.val}`)) {
                    lines = fs.readFileSync(`${__dirname}/test/${state.val}`).toString().split('\n');
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
                    if (json && json.fields) {
                        await this.onData(json);
                    } else {
                        this.log.warn(`Cannot decode line: ${lines[i]}, ${JSON.stringify(json)}`);
                    }
                } catch (e) {
                    this.log.warn(`Cannot decode line: ${lines[i]}`);
                }
            }
        }
        if (this.nmConfig.simulate) {
            for (let s = 0; s < this.nmConfig.simulate.length; s++) {
                if (this.nmConfig.simulate[s].oid === id) {
                    this.simulationsValues[id] = state ? state.val as number : null;
                }
            }
        }
        this.autoPilot && this.autoPilot.onStateChange(id, state);
    }

    onMessage(obj: ioBroker.Message): void {
        if (!obj || !obj.command) {
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

                                            this.sendTo(obj.from, obj.command, ports.map(item => ({
                                                label: item.path,
                                                value: item.path
                                            })), obj.callback);
                                        })
                                        .catch((e: string) => {
                                            this.sendTo(obj.from, obj.command, [], obj.callback);
                                            this.log.error(e);
                                        });
                                } else {
                                    this.log.warn('Module "serialport" is not available');
                                    this.sendTo(obj.from, obj.command, [{ label: 'Not available', value: '' }], obj.callback);
                                }
                            }).catch((e: string) => {
                                this.log.error(`Cannot list serial ports: ${e}`);
                                this.sendTo(obj.from, obj.command, [{ label: 'Not available', value: '' }], obj.callback);
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
                        import ('child_process')
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

                                exec('ip link show', (error: ExecException | null, stdout: string | Buffer, stderr: string | Buffer) => {
                                    if (error) {
                                        this.log.error(`error: ${error.message}`);
                                        return;
                                    }
                                    if (stderr) {
                                        this.log.error(`stderr: ${stderr}`);
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
                                });
                            })
                            .catch((e: string) => {
                                this.log.error(`Cannot list CAN ports: ${e}`);
                                this.sendTo(obj.from, obj.command, [{ label: 'Not available', value: '' }], obj.callback);
                            });
                    } catch (e) {
                        this.sendTo(obj.from, obj.command, [{ label: 'Not available', value: '' }], obj.callback);
                    }
                }

                break;

            default:
                this.log.warn(`Unknown command: ${obj.command}`);
                break;
        }
    }

    async onUnload(callback: () => void): Promise<void> {
        try {
            this.autoPilot && this.autoPilot.stop();
            this.autoPilot = null;
            this.connectedInterval && this.clearInterval(this.connectedInterval);
            this.connectedInterval = null;
            this.sendEnvironmentInterval && this.clearInterval(this.sendEnvironmentInterval);
            this.sendEnvironmentInterval = null;
            this.setState('info.connection', false, true)
                .catch(e => this.log.error(`Cannot set info.connection to false: ${e}`));
            this.nmeaDriver?.stop();
            callback();
        } catch (e) {
            callback();
        }
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<utils.AdapterOptions>) => new NmeaAdapter(options);
} else {
    // otherwise start the instance directly
    new NmeaAdapter();
}
