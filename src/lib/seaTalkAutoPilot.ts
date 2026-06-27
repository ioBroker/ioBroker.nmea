import { encodeActisense } from '@canboat/canboatjs/dist/stringMsg';
import type { NmeaConfig } from '../types';
import type { GenericDriver } from './genericDriver';
import AutoPilot from './autoPilot';
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

export default class SeaTalkAutoPilot extends AutoPilot {
    private currentMode: AutoPilotMode | null = null;

    private currentTargetHeading: number | null = null;

    // Last wind-datum value mirrored to `autoPilot.windAngle` (in degrees). Used to dedupe so
    // the inbound bus broadcast doesn't keep re-writing the same value every second.
    private currentWindAngle: number | null = null;

    /**
     * CAN source address used as `src` in every outbound frame. Configurable so the operator
     * can pick a value that matches their `addressClaim` advertisement (or use a different
     * one if 7 is already taken on their bus).
     */
    private readonly src: number;

    constructor(
        adapter: ioBroker.Adapter,
        config: NmeaConfig,
        nmeaDriver: GenericDriver,
        values: Record<string, { val: ioBroker.StateValue; ts: number }>,
        autoPilotAddress?: number,
    ) {
        super(adapter, config, nmeaDriver, values, autoPilotAddress);

        const cfgSrc = config.announceSrc;
        this.src = typeof cfgSrc === 'number' && cfgSrc > 0 && cfgSrc < 252 ? cfgSrc : 7;

        this.adapter.subscribeStates('seatalk1PilotMode.pilotMode');
        this.adapter.subscribeStates('seatalkPilotLockedHeading.*');
        this.adapter.subscribeStates('seatalkPilotMode.pilotMode');
        this.adapter.subscribeStates('seatalkPilotWindDatum.windDatum');
    }

    stop(): void {
        super.stop();
        this.adapter.unsubscribeStates('seatalk1PilotMode.pilotMode');
        this.adapter.unsubscribeStates('seatalkPilotLockedHeading.targetHeadingMagneticTrue');
        this.adapter.unsubscribeStates('seatalkPilotMode.pilotMode');
        this.adapter.unsubscribeStates('seatalkPilotWindDatum.windDatum');
    }

    onStateChange(id: string, state?: ioBroker.State | null): void {
        if (state) {
            if (id.endsWith('seatalkPilotMode.pilotMode')) {
                let mode: AutoPilotMode = 'Standby';
                if ((state.val as string).toLowerCase().includes('wind')) {
                    mode = 'Wind';
                } else if ((state.val as string).toLowerCase().includes('auto')) {
                    mode = 'Auto';
                } else if ((state.val as string).toLowerCase().includes('standby')) {
                    mode = 'Standby';
                } else if ((state.val as string).toLowerCase().includes('track')) {
                    mode = 'Track';
                }
                if (this.currentMode !== mode) {
                    this.currentMode = mode;
                    if (mode === 'Auto') {
                        void this.adapter.setState('autoPilot.state', 1, true); // Auto
                    } else if (mode === 'Wind') {
                        void this.adapter.setState('autoPilot.state', 2, true); // Auto Wind
                    } else if (mode === 'Track') {
                        void this.adapter.setState('autoPilot.state', 3, true); // Auto Track
                    } else if (mode === 'Standby') {
                        void this.adapter.setState('autoPilot.state', 0, true); // Standby
                    } else {
                        this.adapter.log.warn(`Unknown pilot mode ${state.val}`);
                    }
                }
            } else if (id.endsWith('seatalk1PilotMode.pilotMode') && state.ack) {
                if (this.currentMode !== state.val) {
                    this.currentMode = state.val as AutoPilotMode;
                    if (state.val === 'Auto') {
                        void this.adapter.setState('autoPilot.state', 1, true); // Auto
                    } else if (state.val === 'Wind') {
                        void this.adapter.setState('autoPilot.state', 2, true); // Auto Wind
                    } else if (state.val === 'Track') {
                        void this.adapter.setState('autoPilot.state', 3, true); // Auto Track
                    } else if (state.val === 'Standby') {
                        void this.adapter.setState('autoPilot.state', 0, true); // Standby
                    } else {
                        this.adapter.log.warn(`Unknown pilot mode ${state.val}`);
                    }
                }
            } else if (id.endsWith('seatalkPilotLockedHeading.targetHeadingMagneticTrue') && state.ack) {
                if (this.currentTargetHeading !== state.val) {
                    void this.adapter.setState('autoPilot.heading', state.val, true);
                    this.currentTargetHeading = state.val as any as number;
                }
            } else if (id.endsWith('seatalkPilotWindDatum.windDatum') && state.ack) {
                // Bus broadcast → mirror the (radian) datum onto `autoPilot.windAngle` in
                // degrees so the UI / scripts have a single canonical absolute-angle state.
                if (typeof state.val === 'number') {
                    const deg = ((((state.val * 180) / Math.PI) % 360) + 360) % 360;
                    const rounded = Math.round(deg * 10) / 10;
                    if (this.currentWindAngle !== rounded) {
                        this.adapter.log.debug(
                            `[autoPilot.windAngle ← bus] datum=${state.val.toFixed(4)} rad → ${rounded}° (was ${this.currentWindAngle ?? 'null'})`,
                        );
                        this.currentWindAngle = rounded;
                        void this.adapter.setState('autoPilot.windAngle', rounded, true);
                    }
                }
            }
            if (id.endsWith('autoPilot.state') && !state.ack) {
                if (state.val === 0 || state.val === '0') {
                    this.adapter.log.info('Set autoPilot to Standby');
                    this.currentMode = 'Standby';
                    this.setStandby();
                } else if (state.val === 1 || state.val === '1') {
                    this.adapter.log.info('Set autoPilot to Auto');
                    this.currentMode = 'Auto';
                    this.setAuto();
                } else if (state.val === 2 || state.val === '2') {
                    this.adapter.log.info('Set autoPilot to Auto Wind');
                    this.currentMode = 'Wind';
                    this.setAutoWind();
                } else if (state.val === 3 || state.val === '3') {
                    this.adapter.log.info('Set autoPilot to Auto Track');
                    this.currentMode = 'Track';
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
                newHeading %= 360;
                this.currentTargetHeading = newHeading;
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
                newHeading %= 360;
                this.currentTargetHeading = newHeading;
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
                newHeading %= 360;
                this.currentTargetHeading = newHeading;
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
                newHeading %= 360;
                this.currentTargetHeading = newHeading;
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
                newHeading %= 360;
                this.currentTargetHeading = newHeading;
                this.adapter.log.info(`Set autoPilot heading to ${newHeading}°`);
                this.setLockedHeading(newHeading);
            } else if (id.endsWith('autoPilot.windAngleChange') && !state.ack) {
                if (this.currentMode !== 'Wind') {
                    this.adapter.log.warn('Cannot set wind angle when not in Wind mode');
                    return;
                }
                this.adapter.log.info(`Set autoPilot wind angle to ${state.val}°`);
                this.setWindAngle(parseInt(state.val as string, 10) as 1 | -1 | 10 | -10);
            } else if (id.endsWith('autoPilot.windAngle') && !state.ack) {
                if (this.currentMode !== 'Wind') {
                    this.adapter.log.warn(
                        `Cannot set wind angle when not in Wind mode (currentMode=${this.currentMode ?? 'null'})`,
                    );
                    return;
                }
                this.adapter.log.warn(`Not implemented`);
                return;

                // if (typeof state.val !== 'number' && typeof state.val !== 'string') {
                //     this.adapter.log.warn(`Invalid wind angle value ${state.val}`);
                //     return;
                // }
                // const orig = parseFloat(state.val as any);
                // if (!isFinite(orig)) {
                //     this.adapter.log.warn(`Invalid wind angle value ${state.val}`);
                //     return;
                // }
                // const angleDeg = ((orig % 360) + 360) % 360;
                // this.adapter.log.info(
                //     `[autoPilot.windAngle ← user] raw=${orig} → normalized=${angleDeg}° (mode=${this.currentMode})`,
                // );
                // this.setWindAngleAbsolute(angleDeg);
            }
        }
    }

    // commands for NGT-1 in Canboat format
    // "Z,3,126208,7,204, 17,01,63,ff,00,f8,04,01,3b,07,03,04,04,00,00,05,ff,ff"; // set standby
    // "Z,3,126208,7,204, 17,01,63,ff,00,f8,04,01,3b,07,03,04,04,40,00,05,ff,ff"; // set auto
    // "Z,3,126208,7,204, 14,01,50,ff,00,f8,03,01,3b,07,03,04,06,00,00"; // set 0 magnetic
    // "Z,3,126208,7,204, 14,01,50,ff,00,f8,03,01,3b,07,03,04,06,9f,3e"; // set 92 magnetic
    // "Z,3,126208,7,204, 14,01,50,ff,00,f8,03,01,3b,07,03,04,06,4e,3f"; // set 93 magnetic
    private logAndWrite(label: string, data: string): void {
        // Make every autopilot frame sent to the bus visible in the default-level log so the
        // operator can confirm the Command Panel button actually reached the gateway and inspect
        // the exact Actisense frame that was emitted (PGN, source/destination, payload bytes).
        this.adapter.log.debug(`[autoPilot → 0x${this.autoPilotAddress.toString(16)}] ${label}: ${data.trim()}`);
        this.nmeaDriver.write(data);
    }

    private setStandby(): void {
        const data = encodeActisense({
            prio: 3,
            pgn: 126208,
            src: this.src,
            dst: this.autoPilotAddress,
            data: Buffer.from([
                0x01, 0x63, 0xff, 0x00, 0xf8, 0x04, 0x01, 0x3b, 0x07, 0x03, 0x04, 0x04, 0x00, 0x00, 0x05, 0xff, 0xff,
            ]),
        });
        this.logAndWrite('Standby', data);
    }

    private setAuto(): void {
        const data = encodeActisense({
            prio: 3,
            pgn: 126208,
            src: this.src,
            dst: this.autoPilotAddress,
            data: Buffer.from([
                0x01, 0x63, 0xff, 0x00, 0xf8, 0x04, 0x01, 0x3b, 0x07, 0x03, 0x04, 0x04, 0x40, 0x00, 0x05, 0xff, 0xff,
            ]),
        });
        this.logAndWrite('Auto', data);
    }

    private setAutoWind(): void {
        const data = encodeActisense({
            prio: 3,
            pgn: 126208,
            src: this.src,
            dst: this.autoPilotAddress,
            data: Buffer.from([
                0x01, 0x63, 0xff, 0x00, 0xf8, 0x04, 0x01, 0x3b, 0x07, 0x03, 0x04, 0x04, 0x00, 0x01, 0x05, 0xff, 0xff,
            ]),
        });
        this.logAndWrite('AutoWind', data);
    }

    private setAutoTrack(): void {
        const data = encodeActisense({
            prio: 3,
            pgn: 126208,
            src: this.src,
            dst: this.autoPilotAddress,
            data: Buffer.from([
                0x01, 0x63, 0xff, 0x00, 0xf8, 0x04, 0x01, 0x3b, 0x07, 0x03, 0x04, 0x04, 0x80, 0x01, 0x05, 0xff, 0xff,
            ]),
        });
        this.logAndWrite('AutoTrack', data);
    }

    private setLockedHeading(angle: number): void {
        // Convert the True heading back to Magnetic (Raymarine protocol uses magnetic).
        if (
            this.values[this.config.magneticVariation || 'magneticVariation.variation'] &&
            this.values[this.config.magneticVariation || 'magneticVariation.variation'].val
        ) {
            angle -= this.values[this.config.magneticVariation || 'magneticVariation.variation'].val as number;
        }

        // Normalize to [0, 360) so the 16-bit encoding never goes negative.
        angle = ((angle % 360) + 360) % 360;

        this.adapter
            .setState('autoPilot.heading', angle, true)
            .catch(e => this.adapter.log.warn(`Cannot set locked heading: ${e?.message ?? e}`));

        const rad = (angle * Math.PI) / 180;
        const a = Math.round(rad / 0.0001);
        const data = encodeActisense({
            prio: 3,
            pgn: 126208,
            src: this.src,
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
        this.logAndWrite(`LockedHeading ${angle}° (mag)`, data);
    }
    // Pick the transport based on which pilot-mode PGN the autopilot is publishing.
    // Older Raymarine units (ST*-series SmartPilots) report PGN 126720 (Seatalk1
    // Encoded) → respond to the Seatalk1 keystroke; newer ones (e.g. S100/Evolution)
    // report PGN 65345 (Pilot Wind Datum) → we read the current datum, apply the delta
    // in degrees, and send the new ABSOLUTE value via `setWindAngleAbsolute`. This
    // matches what the p70 itself does on the wire (confirmed by bus-sniffing the
    // physical control panel: every wind-angle adjustment is an absolute datum write,
    // never a delta) and keeps the +1/+10/-1/-10 buttons and `autoPilot.windAngle`
    // sharing a single outbound code path.
    private setWindAngle(command: 1 | -1 | 10 | -10): void {
        if (command !== 1 && command !== -1 && command !== 10 && command !== -10) {
            this.adapter.log.warn('Invalid wind angle command');
            return;
        }
        if (this.values['seatalk1PilotMode.pilotMode']) {
            this.setWindAngleByKeystroke(command);
            return;
        }
        const datumState = this.values['seatalkPilotWindDatum.windDatum'];
        if (datumState && typeof datumState.val === 'number') {
            const currentDeg = (datumState.val * 180) / Math.PI;
            const newDeg = (((currentDeg + command) % 360) + 360) % 360;
            this.setWindAngleAbsolute(newDeg);
            return;
        }
        this.adapter.log.warn(
            'Cannot adjust wind angle: pilot mode source unknown (no seatalk1PilotMode or seatalkPilotWindDatum received yet)',
        );
    }

    // decrement 1:  0x05FA
    // decrement 10: 0x06F9
    // increment 1:  0x07F8
    // increment 10: 0x08F7
    private setWindAngleByKeystroke(command: 1 | -1 | 10 | -10): void {
        let angleCommand: number;
        if (command === 1) {
            angleCommand = 0x07f8;
        } else if (command === -1) {
            angleCommand = 0x05fa;
        } else if (command === 10) {
            angleCommand = 0x08f7;
        } else {
            angleCommand = 0x06f9;
        }
        const data = encodeActisense({
            prio: 3,
            pgn: 126720,
            src: this.src,
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
        this.logAndWrite(`WindAngleByKeystroke ${command > 0 ? '+' : ''}${command}°`, data);
    }

    // Set the locked wind angle to an absolute value (degrees, 0–360). Captured wire format
    // from a Raymarine S100 controller (src 1 → autopilot 204):
    //   PGN 126208 Command group function, target PGN 65345 (Seatalk: Pilot Wind Datum),
    //   3 parameters: manufacturerCode=Raymarine, industryCode=Marine Industry,
    //   windDatum=<absolute angle in radians, encoded as 2-byte LE * 0.0001>.
    //
    // Example raw payload for 153.5° → 2.6785 rad → 0x68A1:
    //   01 41 ff 00 f8 03 01 3b 07 03 04 04 a1 68
    //
    // Only meaningful for newer Raymarine units that publish PGN 65345 (S100 / Evolution); the
    // ST*-series SmartPilots accept only ±1°/±10° keystrokes (PGN 126720) and have no
    // "set absolute angle" path — the caller should fall back to `setWindAngle()` stepping for
    // those, or just refuse the operation.
    private setWindAngleAbsolute(angleDeg: number): void {
        if (!this.values['seatalkPilotWindDatum.windDatum']) {
            this.adapter.log.warn(
                'Cannot set absolute wind angle: target unit does not publish seatalkPilotWindDatum (older ST*-series SmartPilots only support ±1°/±10° wind-angle adjustments via keystrokes — use autoPilot.windAngleChange)',
            );
            return;
        }
        const TWO_PI = 2 * Math.PI;
        let rad = (angleDeg * Math.PI) / 180;
        rad = ((rad % TWO_PI) + TWO_PI) % TWO_PI;
        const encoded = Math.round(rad / 0.0001) & 0xffff;
        const lo = encoded & 0xff;
        const hi = (encoded >> 8) & 0xff;

        // Detailed encoding diagnostic — ±1°/±10° and direct-write paths both end up here, so
        // logging the input degree, computed radians, encoded counts, and final two payload
        // bytes makes any divergence between the two trivial to spot when comparing logs.
        const cached = this.values['seatalkPilotWindDatum.windDatum']?.val;
        const cachedDeg = typeof cached === 'number' ? ((((cached * 180) / Math.PI) % 360) + 360) % 360 : null;
        this.adapter.log.debug(
            `[setWindAngleAbsolute] target=${angleDeg.toFixed(2)}° (${rad.toFixed(4)} rad, encoded=${encoded} → 0x${lo
                .toString(16)
                .padStart(2, '0')} 0x${hi
                .toString(16)
                .padStart(2, '0')}); previous datum=${cachedDeg !== null ? `${cachedDeg.toFixed(2)}°` : 'unknown'}`,
        );

        const data = encodeActisense({
            prio: 3,
            pgn: 126208,
            src: this.src,
            dst: this.autoPilotAddress,
            data: Buffer.from([
                0x01, // function code: Command
                0x41,
                0xff,
                0x00, // target PGN 65345 (LE)
                0xf8, // priority: leave unchanged + reserved
                0x03, // 3 parameters
                0x01,
                0x3b,
                0x07, // param 1: manufacturerCode = Raymarine
                0x03,
                0x04, // param 3: industryCode = Marine Industry
                0x04,
                lo,
                hi, // param 4: windDatum (rad / 0.0001)
            ]),
        });
        this.logAndWrite(`WindAngleAbsolute ${angleDeg.toFixed(2)}°`, data);
    }
}
