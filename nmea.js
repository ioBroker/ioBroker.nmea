'use strict';

const utils = require('@iobroker/adapter-core');
const fs = require('node:fs');
const adapterName = require('./package.json').name.split('.').pop();
const PGNS = require('@canboat/pgns/canboat.json');
const META_DATA = require('./lib/metaData');
const AutoPilot = require('./lib/seaTalkAutoPilot');
const { FromPgn } = require('@canboat/canboatjs');

class NMEA extends utils.Adapter {
    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    constructor(options) {
        super({
            ...options,
            name: adapterName,
        });

        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));

        this.createsChannelAndStates = {};
        this.values = {};
        this.lastMessageReceived = 0;
        this.connectedInterval = null;
        this.sendEnvironmentInterval = null;
        this.autoPilot = null;
        this.simulationsValues = {};
        this.parser = new FromPgn();
    }

    sendCombinedEnvironment() {
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
            src: this.config.simulateAddress || 204,
        };

        for (let s = 0; s < this.config.simulate.length; s++) {
            const sim = this.config.simulate[s];
            if (sim.type === 'temperature') {
                if (this.simulationsValues[sim.oid] !== null && this.simulationsValues[sim.oid] !== undefined) {
                    obj.fields.Temperature = Math.round(this.simulationsValues[sim.oid] + 273.15);
                    obj.fields['Temperature Source'] = sim.subType || 'Outside Temperature';
                }
            } else if (sim.type === 'humidity') {
                if (this.simulationsValues[sim.oid] !== null && this.simulationsValues[sim.oid] !== undefined) {
                    obj.fields.Humidity = this.simulationsValues[sim.oid];
                    obj.fields['Humidity Source'] = sim.subType || 'Outside';
                }
            } else if (sim.type === 'pressure' && sim.subType === 'Atmospheric') {
                if (this.simulationsValues[sim.oid] !== null && this.simulationsValues[sim.oid] !== undefined) {
                    obj.fields['Atmospheric Pressure'] = this.simulationsValues[sim.oid];
                }
            }
        }

        console.log(`send combined${JSON.stringify(obj)}`);

        this.nmeaDriver.write(obj);
    }

    sendTemperature(temperature, subType) {
        const actualTemperature = 22;
        // convert to Kelvin
        const kelvin = Math.round(actualTemperature + 273.15);

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
            src: this.config.simulateAddress || 204,
        };
        this.nmeaDriver.write(obj);
    }

    sendHumidity(humidity = 97, subType) {
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
            src: this.config.simulateAddress || 204,
        };
        this.nmeaDriver.write(obj);
    }

    sendPressure(pressure = 0, subType) {
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
            src: this.config.simulateAddress || 204,
        };
        this.nmeaDriver.write(obj);
    }

    async sendEnvironment() {
        if (this.config.simulate) {
            let anyData = false;
            for (let s = 0; s < this.config.simulate.length; s++) {
                const sim = this.config.simulate[s];
                if (!sim || !sim.oid) {
                    continue;
                }
                if (this.simulationsValues[sim.oid] === undefined) {
                    await this.subscribeForeignStatesAsync(sim.oid);
                    this.simulationsValues[sim.oid] = await this.getForeignStateAsync(sim.oid);
                    if (this.simulationsValues[sim.oid]) {
                        this.simulationsValues[sim.oid] = this.simulationsValues[sim.oid].val;
                    } else {
                        this.simulationsValues[sim.oid] = null;
                    }
                }
                this.log.debug(`Simulate [${sim.type}] ${sim.oid} = ${this.simulationsValues[sim.oid]}`)
                if (!this.config.combinedEnvironment) {
                    if (sim.type === 'temperature') {
                        if (this.simulationsValues[sim.oid] !== null && this.simulationsValues[sim.oid] !== undefined) {
                            this.sendTemperature(this.simulationsValues[sim.oid], sim.subType);
                        }
                    } else if (sim.type === 'humidity') {
                        if (this.simulationsValues[sim.oid] !== null && this.simulationsValues[sim.oid] !== undefined) {
                            this.sendHumidity(this.simulationsValues[sim.oid], sim.subType);
                        }
                    } else if (sim.type === 'pressure') {
                        if (this.simulationsValues[sim.oid] !== null && this.simulationsValues[sim.oid] !== undefined) {
                            this.sendPressure(this.simulationsValues[sim.oid], sim.subType);
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

    onData = async data => {
        this.lastMessageReceived = Date.now();

        if (!this.connectedInterval) {
            this.setState('info.connection', true, true);
            this.connectedInterval = this.setInterval(() => {
                if (!this.lastMessageReceived || Date.now() - this.lastMessageReceived >= 10000) {
                    this.setState('info.connection', false, true);
                    this.clearInterval(this.connectedInterval);
                    this.connectedInterval = null;
                    this.sendEnvironmentInterval && this.clearInterval(this.sendEnvironmentInterval);
                    this.sendEnvironmentInterval = null;
                }
            }, 5000);
            if (this.config.simulationEnabled) {
                this.sendEnvironmentInterval = this.setInterval(() => this.sendEnvironment(), 1000);
            }
        }

        if (data.pgn && data.fields) {
            if (await this.createNmeaChannel(data.pgn, data.src)) {
                const keys = Object.keys(data.fields);
                const withReference = [];
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
                        if (!this.values[id] || options.value !== this.values[id].val || !this.config.updateAtLeastEveryMs || Date.now() - this.values[id].ts >= this.config.updateAtLeastEveryMs) {
                            this.values[id] = { val: options.value, ts: Date.now() };
                            await this.setStateAsync(id, options.value, true);
                        }
                    }
                }
                if (data.fields['Wind Speed'] && data.fields['Wind Angle']) {
                    // calculate true wind speed and angle
                    // try to find a true direction and true speed
                    let trueCog;
                    if (this.values['cogSogRapidUpdate.cogTrue']) {
                        trueCog = this.values['cogSogRapidUpdate.cogTrue'].val;
                    } else if (this.values['directionData.cogTrue']) {
                        trueCog = this.values['directionData.cogTrue'].val;
                    } else if (this.values['seatalkPilotHeading.headingMagneticTrue']) {
                        trueCog = this.values['seatalkPilotHeading.headingMagneticTrue'].val;
                    } else if (this.values['vesselHeading.headingTrue']) {
                        trueCog = this.values['vesselHeading.headingTrue'].val;
                    } else if (this.values['vesselHeading.headingMagnetic']) {
                        trueCog = this.values['vesselHeading.headingMagnetic'].val;
                    }
                    if (trueCog !== undefined) {
                        let trueSog;
                        if (this.values['cogSogRapidUpdate.sog']) {
                            trueSog = this.values['cogSogRapidUpdate.sog'].val;
                        } else if (this.values['directionData.sog']) {
                            trueSog = this.values['directionData.sog'].val;
                        }

                        if (trueSog !== undefined) {
                            // convert from radian to degree
                            const windAngle = data.fields['Wind Angle'] * 180 / Math.PI;
                            // convert frm m/s to kn
                            const windSpeed = data.fields['Wind Speed'] * 1.9438444924574;

                            let trueWindDirectionRounded;
                            let trueWindSpeedRounded;
                            let apparentWindDirectionRounded;
                            let apparentWindSpeedRounded;

                            if (data.fields.Reference && data.fields.Reference.includes('Apparent')) {
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
                                trueWindDirectionRounded = (trueCog + windAngle + this.values[this.config.magneticVariation || 'magneticVariation.variation'].val) % 360;
                                apparentWindDirectionRounded = Math.round((trueCog - trueWindDirectionRounded) * 10) / 10;
                            } else {
                                // True
                                trueWindSpeedRounded = windSpeed;
                                trueWindDirectionRounded = windAngle;
                            }
                            const twdId = `${this.createsChannelAndStates[data.pgn].Id}.windDirectionTrue`;
                            if (!this.createsChannelAndStates[twdId]) {
                                this.createsChannelAndStates[twdId] = true;
                                const trueWindAngleObject = {
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
                            const twsId = `${this.createsChannelAndStates[data.pgn].Id}.windSpeedTrue`;
                            if (!this.createsChannelAndStates[twsId]) {
                                this.createsChannelAndStates[twsId] = true;
                                const trueWindSpeedObject = {
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

                            const avwdId = `${this.createsChannelAndStates[data.pgn].Id}.windDirectionAverage`;
                            if (!this.createsChannelAndStates[avwdId]) {
                                this.createsChannelAndStates[avwdId] = true;
                                const averageWindAngleObject = {
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
                            const avwsId = `${this.createsChannelAndStates[data.pgn].Id}.windSpeedAverage`;
                            if (!this.createsChannelAndStates[avwsId]) {
                                this.createsChannelAndStates[avwsId] = true;
                                const averageWindSpeedObject = {
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

                            const maxwsId = `${this.createsChannelAndStates[data.pgn].Id}.windSpeedMax`;
                            if (!this.createsChannelAndStates[maxwsId]) {
                                this.createsChannelAndStates[maxwsId] = true;
                                const maxWindSpeedObject = {
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

                            const awdId = `${this.createsChannelAndStates[data.pgn].Id}.windDirectionApparent`;
                            if (!this.createsChannelAndStates[awdId]) {
                                this.createsChannelAndStates[awdId] = true;
                                const apparentWindDirectionObject = {
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
                            const awsId = `${this.createsChannelAndStates[data.pgn].Id}.windSpeedApparent`;
                            if (!this.createsChannelAndStates[awsId]) {
                                this.createsChannelAndStates[awsId] = true;
                                const apparentWindSpeedObject = {
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
                            // Delete all entries older than 30 seconds
                            this.windSpeeds = this.windSpeeds.filter(w => now - w.ts < 30000);

                            this.windDirs = this.windDirs || [];
                            this.windDirs.push({ twd: trueWindDirectionRounded, ts: now });
                            // Delete all entries older than 30 seconds
                            this.windDirs = this.windDirs.filter(w => now - w.ts < 30000);

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

                            await this.setStateAsync(twdId, trueWindDirectionRounded, true);
                            await this.setStateAsync(twsId, trueWindSpeedRounded, true);
                            await this.setStateAsync(awdId, apparentWindDirectionRounded, true);
                            await this.setStateAsync(awsId, apparentWindSpeedRounded, true);
                            await this.setStateAsync(avwsId, sumSpeed, true);
                            await this.setStateAsync(avwdId, sumDirection, true);
                            await this.setStateAsync(maxwsId, maxSpeed, true);
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
                } else if (data.fields.Longitude && data.fields.Latitude) {
                    const id = `${this.createsChannelAndStates[data.pgn].Id}.position`;
                    const val = `${data.fields.Longitude};${data.fields.Latitude}`;
                    if (!this.createsChannelAndStates[id]) {
                        this.createsChannelAndStates[id] = true;
                        const positionObject = {
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

                    if (!this.values[id] || val !== this.values[id].val || !this.config.updateAtLeastEveryMs || Date.now() - this.values[id].ts >= this.config.updateAtLeastEveryMs) {
                        this.values[id] = { val, ts: Date.now() };
                        await this.setStateAsync(id, val, true);
                    }
                } else if (withReference.length && this.values[this.config.magneticVariation || 'magneticVariation.variation']) {
                    for (let r = 0; r < withReference.length; r++) {
                        const name = withReference[r];
                        const pgnObj = this.createsChannelAndStates[data.pgn];
                        const field = pgnObj.Fields.find(f => f.Name === name);
                        if (!field) {
                            continue;
                        }
                        const mId = `${this.createsChannelAndStates[data.pgn].Id}.${field.Id}True`;
                        if (!this.createsChannelAndStates[mId]) {
                            const headingObject = {
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
                        let val = this.values[`${this.createsChannelAndStates[data.pgn].Id}.${field.Id}`].val;
                        let referenceVal = this.values[`${this.createsChannelAndStates[data.pgn].Id}.${field.Id}Reference`];
                        if (!referenceVal) {
                            referenceVal = this.values[`${this.createsChannelAndStates[data.pgn].Id}.reference`];
                        }
                        if (referenceVal && referenceVal.val === 'Magnetic') {
                            val = val + this.values[this.config.magneticVariation || 'magneticVariation.variation'].val;
                        }

                        if (!this.values[mId] || this.values[mId].val !== val || !this.config.updateAtLeastEveryMs || Date.now() - this.values[mId].ts >= this.config.updateAtLeastEveryMs) {
                            this.values[mId] = { val, ts: Date.now() };
                            await this.setStateAsync(mId, val, true);
                        }
                    }
                }
            }
        }
    }

    async onReady() {
        if ((await this.getStateAsync('info.connection')).val) {
            await this.setStateAsync('info.connection', false, true);
        }
        if (this.config.updateAtLeastEveryMs === undefined) {
            this.config.updateAtLeastEveryMs = 60000;
        }

        await this.subscribeStatesAsync('test.rawString');

        if (this.config.type === 'ngt1') {
            this.nmeaDriver = new (require('./lib/ngt1'))(this, this.config, this.onData);
        } else if (this.config.type === 'picanm') {
            this.nmeaDriver = new (require('./lib/picanM'))(this, this.config, this.onData);
        } else {
            this.log.error(`Unknown driver type: ${this.config.type}`);
            return;
        }

        this.nmeaDriver.start();
    }

    async createNmeaChannel(pgn, srcAddress) {
        if (this.createsChannelAndStates[pgn]) {
            return this.createsChannelAndStates[pgn];
        }

        const obj = PGNS.PGNs.find(p => p.PGN === pgn);
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
            this.createsChannelAndStates[pgn] = obj;

            // if seatalk1PilotMode
            if (pgn === 126720) {
                this.autoPilot = new AutoPilot(this, this.config, this.nmeaDriver, srcAddress);
            }
        } else {
            this.log.warn(`Unknown pgn: ${pgn}`);
            return false;
        }
    }

    async updateObject(stateObj) {
        let existingObject;
        try {
            existingObject = await this.getObjectAsync(stateObj._id);
        } catch (e) {
            // ignore
        }
        if (existingObject) {
            // try to update all settings
            let changed = false;
            Object.keys(stateObj.common).forEach(attr => {
                if (JSON.stringify(stateObj.common[attr]) !== JSON.stringify(existingObject.common[attr])) {
                    existingObject.common[attr] = stateObj.common[attr];
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

    async createNmeaState(options) {
        const { pgn, name, value } = options;
        const pgnObj = this.createsChannelAndStates[pgn];
        const field = pgnObj.Fields.find(f => f.Name === name);
        let id;
        let states;
        let role;
        let commonType;
        let unit;
        if (!field) {
            id = `${pgnObj.Id}.${name}`;
            commonType = typeof value;
            if (commonType === 'object') {
                options.value = JSON.stringify(value);
                commonType = 'json';
            }
        } else {
            id = `${pgnObj.Id}.${field.Id}`;
        }

        if (field) {
            if (field.FieldType === 'STRING_FIX' || field.FieldType === 'STRING_LAU') {
                commonType = 'string';
            } else
            if (field.FieldType === 'LOOKUP' && field.LookupEnumeration) {
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
                commonType = typeof value;
                role = 'value';
            } else if (field.FieldType === 'SPARE') {
                commonType = typeof value;
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

        // try to find meta data
        let metaData = META_DATA[id];
        if (!metaData) {
            const fieldId = id.split('.').pop();
            metaData = META_DATA[fieldId];
        }
        if (metaData) {
            role = metaData.role || role;
            unit = metaData.unit;
            if (metaData.radians) {
                options.value = value * 180 / Math.PI;
                options.value = Math.round(options.value * 10) / 10;
            } else if (metaData.meterPerSecond) {
                options.value = value * 1.9438444924574;
                options.value = Math.round(options.value * 100) / 100;
            }
            if (metaData.applyMagneticVariation) {
                if (this.values[this.config.magneticVariation || 'magneticVariation.variation']) {
                    const val = options.value + this.values[this.config.magneticVariation || 'magneticVariation.variation'].val;
                    // create state with magnetic variation
                    let mId = `${id}True`;
                    const stateObj = {
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
                        }
                    }
                    await this.updateObject(stateObj);
                    if (!this.values[mId] || val !== this.values[mId].val || !this.config.updateAtLeastEveryMs || Date.now() - this.values[mId].ts >= this.config.updateAtLeastEveryMs) {
                        this.values[mId] = { val, ts: Date.now() };
                        await this.setStateAsync(mId, val, true);
                    }
                }
            }
        }

        if (!commonType) {
            return false;
        }

        if (this.createsChannelAndStates[id]) {
            return id;
        }

        const stateObj = {
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
        }
        if (unit) {
            stateObj.common.unit = unit;
        }
        if (role) {
            stateObj.common.role = role;
        }
        if (states) {
            stateObj.native.states = states;
            const texts = {};
            Object.keys(states).forEach(s => texts[states[s]] = states[s]);
            stateObj.common.states = texts;
        }
        await this.updateObject(stateObj);
        this.createsChannelAndStates[id] = true;
        return id;
    }

    /**
     * @param {string} id
     * @param {ioBroker.State | null | undefined} state
     */
    async onStateChange(id, state) {
        if (id.endsWith('.test.rawString') && !state.ack && state.val && typeof state.val === 'string') {
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
        if (this.config.simulate) {
            for (let s = 0; s < this.config.simulate.length; s++) {
                if (this.config.simulate[s].oid === id) {
                    this.simulationsValues[id] = state ? state.val : null;
                }
            }
        }
        this.autoPilot && this.autoPilot.onStateChange(id, state);
    }

    /**
     * @param {ioBroker.Message} obj
     */
    onMessage(obj) {
        if (!obj || !obj.command) {
            return;
        }

        switch (obj.command) {
            case 'list':
                if (obj.callback) {
                    try {
                        const { SerialPort } = require('serialport');
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
                                .catch(e => {
                                    this.sendTo(obj.from, obj.command, [], obj.callback);
                                    this.log.error(e)
                                });
                        } else {
                            this.log.warn('Module serialport is not available');
                            this.sendTo(obj.from, obj.command, [{ label: 'Not available', value: '' }], obj.callback);
                        }
                    } catch (e) {
                        this.sendTo(obj.from, obj.command, [{ label: 'Not available', value: '' }], obj.callback);
                    }
                }

                break;

            case 'listCan':
                if (obj.callback) {
                    try {
                        // cmd: ip link show
                        const { SerialPort } = require('serialport');
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
                                .catch(e => {
                                    this.sendTo(obj.from, obj.command, [], obj.callback);
                                    this.log.error(e)
                                });
                        } else {
                            this.log.warn('Module serialport is not available');
                            this.sendTo(obj.from, obj.command, [{ label: 'Not available', value: '' }], obj.callback);
                        }
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

    /**
     * @param {() => void} callback
     */
    async onUnload(callback) {
        try {
            this.autoPilot && this.autoPilot.stop();
            this.autoPilot = null;
            this.connectedInterval && this.clearInterval(this.connectedInterval);
            this.connectedInterval = null;
            this.sendEnvironmentInterval && this.clearInterval(this.sendEnvironmentInterval);
            this.sendEnvironmentInterval = null;
            this.setState('info.connection', false, true);
            this.nmeaDriver && this.nmeaDriver.stop();
            callback();
        } catch (e) {
            callback();
        }
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    module.exports = (options) => new NMEA(options);
} else {
    // otherwise start the instance directly
    new NMEA();
}
