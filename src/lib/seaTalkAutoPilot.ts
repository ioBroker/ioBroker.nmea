// @ts-expect-error no types
import { encodeActisense } from '@canboat/canboatjs/lib/stringMsg';
import type { NmeaConfig } from '../types';
import type { GenericDriver } from './genericDriver';
/*
//
// N2k
//
// https://github.com/BerndCirotzki/raymarine_autopilot_pi/blob/master/src/autopilot_pi.cpp
void SetN2kPGN126208(tN2kMsg& N2kMsg, uint8_t mode, uint8_t PilotSourceAddress) {
    N2kMsg.SetPGN(126208UL);
    N2kMsg.Priority = 3;
    N2kMsg.Destination = PilotSourceAddress;
    N2kMsg.AddByte(1); // Field 1, 1 = Command Message, 2 = Acknowledge Message...
    N2kMsg.AddByte(0x63);  // PGN 65379
    N2kMsg.AddByte(0xff);  //
    N2kMsg.AddByte(0x00);  // end PGN
    N2kMsg.AddByte(0xf8);  // priority + reserved
    N2kMsg.AddByte(0x04);  // 4 Parameter
    N2kMsg.AddByte(0x01);  // // first param - 1 of PGN 65379 (manufacturer code)
    N2kMsg.AddByte(0x3b);  // Raymarine
    N2kMsg.AddByte(0x07);  //     "
    N2kMsg.AddByte(0x03);  // second param -  3 of pgn 65369 (Industry code)
    N2kMsg.AddByte(0x04);  // Ind. code 4
    N2kMsg.AddByte(0x04);  // third parameter - 4 of pgn 65379 (mode)

    // 0x00 = standby, 0x40 = auto, 0x0100=vane, 0x0180=track
    switch (mode) {
    case STANDBY:
        N2kMsg.AddByte(0x00);
        N2kMsg.AddByte(0x00);
        break;
    case AUTO:
        N2kMsg.AddByte(0x40);
        N2kMsg.AddByte(0x00);
        break;
    case AUTOWIND:
        N2kMsg.AddByte(0x00);
        N2kMsg.AddByte(0x01);
        break;
    case AUTOTRACK:
        N2kMsg.AddByte(0x80);
        N2kMsg.AddByte(0x01);
        break;
    case AUTOTURNWP:  // Not Used here
        N2kMsg.AddByte(0x81);
        N2kMsg.AddByte(0x01);
        break;
    }
    N2kMsg.AddByte(0x05);  // value of weird raymarine param
    N2kMsg.AddByte(0xff);
    N2kMsg.AddByte(0xff);
}

void SetRaymarineLockedHeadingN2kPGN126208(tN2kMsg& N2kMsg, double Heading)
{
    N2kMsg.SetPGN(126208UL);
    N2kMsg.Priority = 3;

    N2kMsg.AddByte(0x01);  // Field 1, 1 = Command Message, 2 = Acknowledge Message...
    N2kMsg.AddByte(0x50);  // PGN 65360
    N2kMsg.AddByte(0xff);  //
    N2kMsg.AddByte(0x00);  // end PGN
    N2kMsg.AddByte(0xf8);  // priority + reserved
    N2kMsg.AddByte(0x03);  // 3 Parameter
    N2kMsg.AddByte(0x01);  // // first param - 1 of PGN 65360 (manufacturer code)
    N2kMsg.AddByte(0x3b);  // Raymarine
    N2kMsg.AddByte(0x07);  //     "
    N2kMsg.AddByte(0x03);  // second param -  3 of pgn 65360 (Industry code)
    N2kMsg.AddByte(0x04);  // Ind. code 4
    N2kMsg.AddByte(0x06);  // third parameter - 4 of pgn 65360 (mode)
    N2kMsg.Add2ByteUDouble(Heading, 0.0001);
}

// For Set new Windangle
void SetRaymarineKeyCommandPGN126720(tN2kMsg& N2kMsg, uint8_t destinationAddress, uint16_t command) {

    uint8_t commandByte0, commandByte1;
    commandByte0 = command >> 8;
    commandByte1 = command & 0xff;

    N2kMsg.SetPGN(126720UL);
    N2kMsg.Priority = 3;
    N2kMsg.Destination = destinationAddress;

    N2kMsg.AddByte(0x3b);  // Raymarine
    N2kMsg.AddByte(0x9f);
    N2kMsg.AddByte(0xf0);
    N2kMsg.AddByte(0x81);
    N2kMsg.AddByte(0x86);  // Key Command
    N2kMsg.AddByte(0x21);
    N2kMsg.AddByte(commandByte0);
    N2kMsg.AddByte(commandByte1);
    N2kMsg.AddByte(0xff);
    N2kMsg.AddByte(0xff);
    N2kMsg.AddByte(0xff);
    N2kMsg.AddByte(0xff);
    N2kMsg.AddByte(0xff);
    N2kMsg.AddByte(0xc1);
    N2kMsg.AddByte(0xc2);
    N2kMsg.AddByte(0xcd);
    N2kMsg.AddByte(0x66);
    N2kMsg.AddByte(0x80);
    N2kMsg.AddByte(0xd3);
    N2kMsg.AddByte(0x42);
    N2kMsg.AddByte(0xb1);
    N2kMsg.AddByte(0xc8);
}
 */
type AutoPilotMode = 'Standby' | 'Auto' | 'Wind' | 'Track';

class SeaTalkAutoPilot {
    private readonly adapter: ioBroker.Adapter;

    private readonly config: NmeaConfig;

    private readonly nmeaDriver: GenericDriver;

    private readonly autoPilotAddress: number;

    private currentMode: AutoPilotMode | null = null;

    private currentTargetHeading: number | null = null;

    private readonly values: Record<string, { val: ioBroker.StateValue; ts: number }>;

    constructor(
        adapter: ioBroker.Adapter,
        config: NmeaConfig,
        nmeaDriver: GenericDriver,
        autoPilotAddress: number,
        values: Record<string, { val: ioBroker.StateValue; ts: number }>,
    ) {
        this.adapter = adapter;
        this.config = config;
        this.values = values;

        // create states
        this.adapter.setObjectNotExists('autoPilot', {
            type: 'channel',
            common: {
                name: 'SeaTalkAutoPilot',
            },
            native: {
                autoPilotAddress,
            },
        });
        this.adapter.setObjectNotExists('autoPilot.state', {
            type: 'state',
            common: {
                name: 'Auto pilot mode',
                type: 'number',
                role: 'value.mode.autopilot',
                write: true,
                read: true,
                states: {
                    0: 'Standby',
                    1: 'Auto',
                    2: 'AutoWind',
                    3: 'AutoTrack',
                },
            },
            native: {
                autoPilotAddress,
            },
        });
        this.adapter.setObjectNotExists('autoPilot.heading', {
            type: 'state',
            common: {
                name: 'SeaTalkAutoPilot',
                type: 'number',
                role: 'value.direction.autopilot',
                write: true,
                read: true,
                unit: '°',
            },
            native: {
                autoPilotAddress,
            },
        });
        this.adapter.setObjectNotExists('autoPilot.headingPlus1', {
            type: 'state',
            common: {
                name: 'Increase heading by 1°',
                type: 'boolean',
                role: 'button',
                write: true,
                read: false,
                unit: '°',
            },
            native: {
                autoPilotAddress,
            },
        });
        this.adapter.setObjectNotExists('autoPilot.headingPlus10', {
            type: 'state',
            common: {
                name: 'Increase heading by 10°',
                type: 'boolean',
                role: 'button',
                write: true,
                read: false,
                unit: '°',
            },
            native: {
                autoPilotAddress,
            },
        });

        this.adapter.setObjectNotExists('autoPilot.headingMinus1', {
            type: 'state',
            common: {
                name: 'Decrease heading by 1°',
                type: 'boolean',
                role: 'button',
                write: true,
                read: false,
                unit: '°',
            },
            native: {
                autoPilotAddress,
            },
        });

        this.adapter.setObjectNotExists('autoPilot.headingMinus10', {
            type: 'state',
            common: {
                name: 'Decrease heading by 10°',
                type: 'boolean',
                role: 'button',
                write: true,
                read: false,
                unit: '°',
            },
            native: {
                autoPilotAddress,
            },
        });
        this.adapter.setObjectNotExists('autoPilot.windAngleChange', {
            type: 'state',
            common: {
                name: 'SeaTalkAutoPilot',
                type: 'number',
                role: 'value',
                write: true,
                read: false,
                states: {
                    1: 'Increment 1°',
                    10: 'Increment 10°',
                    '-1': 'Decrement 1°',
                    '-10': 'Decrement 10°',
                },
                unit: '°',
            },
            native: {
                autoPilotAddress,
            },
        });

        this.adapter.subscribeStates('autoPilot.*');
        this.adapter.subscribeStates('seatalk1PilotMode.pilotMode');
        // this.adapter.subscribeStates('seatalkPilotMode.*');
        this.adapter.subscribeStates('seatalkPilotLockedHeading.*');

        this.nmeaDriver = nmeaDriver;
        this.autoPilotAddress = autoPilotAddress;
    }

    stop(): void {
        this.adapter.unsubscribeStates('autoPilot.*');
        this.adapter.unsubscribeStates('seatalk1PilotMode.pilotMode');
        this.adapter.unsubscribeStates('seatalkPilotLockedHeading.targetHeadingMagneticTrue');
    }

    onStateChange(id: string, state?: ioBroker.State | null): void {
        if (state) {
            if (id.endsWith('seatalk1PilotMode.pilotMode') && state.ack) {
                if (this.currentMode !== state.val) {
                    this.currentMode = state.val as AutoPilotMode;
                    if (state.val === 'Auto') {
                        this.adapter.setState('autoPilot.state', 1, true); // Auto
                    } else if (state.val === 'Wind') {
                        this.adapter.setState('autoPilot.state', 2, true); // Auto Wind
                    } else if (state.val === 'Track') {
                        this.adapter.setState('autoPilot.state', 3, true); // Auto Track
                    } else if (state.val === 'Standby') {
                        this.adapter.setState('autoPilot.state', 0, true); // Standby
                    } else {
                        this.adapter.log.warn(`Unknown pilot mode ${state.val}`);
                    }
                }
            } else if (id.endsWith('seatalkPilotLockedHeading.targetHeadingMagneticTrue') && state.ack) {
                if (this.currentTargetHeading !== state.val) {
                    this.adapter.setState('autoPilot.heading', state.val, true);
                    this.currentTargetHeading = state.val as any as number;
                }
            }
            if (id.endsWith('autoPilot.state') && !state.ack) {
                if (state.val === 0 || state.val === '0') {
                    this.adapter.log.info('Set autoPilot to Standby');
                    this.setStandby();
                } else if (state.val === 1 || state.val === '1') {
                    this.adapter.log.info('Set autoPilot to Auto');
                    this.setAuto();
                } else if (state.val === 2 || state.val === '2') {
                    this.adapter.log.info('Set autoPilot to Auto Wind');
                    this.setAutoWind();
                } else if (state.val === 3 || state.val === '3') {
                    this.adapter.log.info('Set autoPilot to Auto Track');
                    this.setAutoTrack();
                }
            } else if (id.endsWith('autoPilot.headingPlus1') && !state.ack) {
                if (this.currentTargetHeading === null) {
                    this.adapter.log.warn('Cannot increase heading when target heading is unknown');
                    return;
                }
                let newHeading = Math.round((this.currentTargetHeading + 1) % 360);
                if (newHeading < 0) {
                    newHeading += 360;
                }
                newHeading = newHeading % 360;
                this.adapter.log.info(`Increase autoPilot heading by 1° to ${newHeading}°`);
                this.setLockedHeading(newHeading);
            } else if (id.endsWith('autoPilot.headingPlus10') && !state.ack) {
                if (this.currentTargetHeading === null) {
                    this.adapter.log.warn('Cannot increase heading when target heading is unknown');
                    return;
                }
                let newHeading = Math.round((this.currentTargetHeading + 10) % 360);
                if (newHeading < 0) {
                    newHeading += 360;
                }
                newHeading = newHeading % 360;
                this.adapter.log.info(`Increase autoPilot heading by 10° to ${newHeading}°`);
                this.setLockedHeading(newHeading);
            } else if (id.endsWith('autoPilot.headingMinus1') && !state.ack) {
                if (this.currentTargetHeading === null) {
                    this.adapter.log.warn('Cannot increase heading when target heading is unknown');
                    return;
                }
                let newHeading = Math.round((this.currentTargetHeading - 1) % 360);
                if (newHeading < 0) {
                    newHeading += 360;
                }
                newHeading = newHeading % 360;
                this.adapter.log.info(`Decrease autoPilot heading by 1° to ${newHeading}°`);
                this.setLockedHeading(newHeading);
            } else if (id.endsWith('autoPilot.headingMinus10') && !state.ack) {
                if (this.currentTargetHeading === null) {
                    this.adapter.log.warn('Cannot increase heading when target heading is unknown');
                    return;
                }
                let newHeading = Math.round((this.currentTargetHeading - 10) % 360);
                if (newHeading < 0) {
                    newHeading += 360;
                }
                newHeading = newHeading % 360;
                this.adapter.log.info(`Decrease autoPilot heading by 10° to ${newHeading}°`);
                this.setLockedHeading(newHeading);
            } else if (id.endsWith('autoPilot.heading') && !state.ack) {
                if (this.currentMode !== 'Auto') {
                    this.adapter.log.warn('Cannot set locked heading when not in Auto mode');
                    return;
                }
                let newHeading = Math.round((state.val as any as number) % 360);
                if (newHeading < 0) {
                    newHeading += 360;
                }
                newHeading = newHeading % 360;
                this.adapter.log.info(`Set autoPilot heading to ${newHeading}°`);
                this.setLockedHeading(newHeading);
            } else if (id.endsWith('autoPilot.windAngleChange') && !state.ack) {
                if (this.currentMode !== 'Wind') {
                    this.adapter.log.warn('Cannot set wind angle when not in Wind mode');
                    return;
                }
                this.adapter.log.info(`Set autoPilot wind angle to ${state.val}°`);
                this.setWindAngle(parseInt(state.val as string, 10) as 1 | -1 | 10 | -10);
            }
        }
    }

    // commands for NGT-1 in Canboat format
    // "Z,3,126208,7,204, 17,01,63,ff,00,f8,04,01,3b,07,03,04,04,00,00,05,ff,ff"; // set standby
    // "Z,3,126208,7,204, 17,01,63,ff,00,f8,04,01,3b,07,03,04,04,40,00,05,ff,ff"; // set auto
    // "Z,3,126208,7,204, 14,01,50,ff,00,f8,03,01,3b,07,03,04,06,00,00"; // set 0 magnetic
    // "Z,3,126208,7,204, 14,01,50,ff,00,f8,03,01,3b,07,03,04,06,9f,3e"; // set 92 magnetic
    // "Z,3,126208,7,204, 14,01,50,ff,00,f8,03,01,3b,07,03,04,06,4e,3f"; // set 93 magnetic
    setStandby(): void {
        const data = encodeActisense({
            prio: 3,
            pgn: 126208,
            src: 7,
            dst: this.autoPilotAddress,
            data: Buffer.from([
                0x01, 0x63, 0xff, 0x00, 0xf8, 0x04, 0x01, 0x3b, 0x07, 0x03, 0x04, 0x04, 0x00, 0x00, 0x05, 0xff, 0xff,
            ]),
        });
        this.nmeaDriver.write(data);
    }
    setAuto(): void {
        const data = encodeActisense({
            prio: 3,
            pgn: 126208,
            src: 7,
            dst: this.autoPilotAddress,
            data: Buffer.from([
                0x01, 0x63, 0xff, 0x00, 0xf8, 0x04, 0x01, 0x3b, 0x07, 0x03, 0x04, 0x04, 0x40, 0x00, 0x05, 0xff, 0xff,
            ]),
        });
        this.nmeaDriver.write(data);
    }
    setAutoWind(): void {
        const data = encodeActisense({
            prio: 3,
            pgn: 126208,
            src: 7,
            dst: this.autoPilotAddress,
            data: Buffer.from([
                0x01, 0x63, 0xff, 0x00, 0xf8, 0x04, 0x01, 0x3b, 0x07, 0x03, 0x04, 0x04, 0x00, 0x01, 0x05, 0xff, 0xff,
            ]),
        });
        this.nmeaDriver.write(data);
    }
    setAutoTrack(): void {
        const data = encodeActisense({
            prio: 3,
            pgn: 126208,
            src: 7,
            dst: this.autoPilotAddress,
            data: Buffer.from([
                0x01, 0x63, 0xff, 0x00, 0xf8, 0x04, 0x01, 0x3b, 0x07, 0x03, 0x04, 0x04, 0x80, 0x01, 0x05, 0xff, 0xff,
            ]),
        });
        this.nmeaDriver.write(data);
    }
    setLockedHeading(angle: number): void {
        // remove magnetic variation
        if (
            this.values[this.config.magneticVariation || 'magneticVariation.variation'] &&
            this.values[this.config.magneticVariation || 'magneticVariation.variation'].val
        ) {
            angle -= this.values[this.config.magneticVariation || 'magneticVariation.variation'].val as number;
        }

        const rad = (angle * Math.PI) / 180;
        const a = Math.round(rad / 0.0001);
        const data = encodeActisense({
            prio: 3,
            pgn: 126208,
            src: 7,
            dst: this.autoPilotAddress,
            data: Buffer.from([
                0x01,
                0x50,
                0xff,
                0x00,
                0xf8,
                0x03,
                0x01,
                0x3b,
                0x07,
                0x03,
                0x04,
                0x06,
                a & 0xff,
                (a >> 8) & 0xff,
            ]),
        });
        this.nmeaDriver.write(data);
    }
    // decrement 1:  0x05FA
    // decrement 10: 0x06F9
    // increment 1:  0x07F8
    // increment 10: 0x08F7

    setWindAngle(command: 1 | -1 | 10 | -10): void {
        let angleCommand: number;
        if (command === 1) {
            angleCommand = 0x07f8;
        } else if (command === -1) {
            angleCommand = 0x05fa;
        } else if (command === 10) {
            angleCommand = 0x08f7;
        } else if (command === -10) {
            angleCommand = 0x06f9;
        } else {
            this.adapter.log.warn('Invalid wind angle command');
            return;
        }
        const data = encodeActisense({
            prio: 3,
            pgn: 126720,
            src: 7,
            dst: this.autoPilotAddress,
            data: Buffer.from([
                0x3b,
                0x9f,
                0xf0,
                0x81,
                0x86,
                0x21,
                angleCommand & 0xff,
                (angleCommand >> 8) & 0xff,
                0xff,
                0xff,
                0xff,
                0xff,
                0xff,
                0xc1,
                0xc2,
                0xcd,
                0x66,
                0x80,
                0xd3,
                0x42,
                0xb1,
                0xc8,
            ]),
        });
        this.nmeaDriver.write(data);
    }
}

export default SeaTalkAutoPilot;
