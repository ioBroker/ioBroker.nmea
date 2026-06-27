import { encodeActisense } from '@canboat/canboatjs/dist/stringMsg';
import type { NmeaConfig } from '../types';
import type { GenericDriver } from './genericDriver';
import AutoPilot from './autoPilot';

type AutoPilotMode = 'Heading' | 'Wind' | 'Nav' | 'No Drift';

export default class NavicoAutoPilot extends AutoPilot {
    private currentMode: AutoPilotMode | null = null;
    private isAutopilot: 'Manual' | 'Automatic' | null = null;

    constructor(
        adapter: ioBroker.Adapter,
        config: NmeaConfig,
        nmeaDriver: GenericDriver,
        values: Record<string, { val: ioBroker.StateValue; ts: number }>,
        autoPilotAddress?: number,
    ) {
        super(adapter, config, nmeaDriver, values, autoPilotAddress);
        this.adapter.subscribeStates('simnetAutopilotAngle.mode');
        this.adapter.subscribeStates('simnetDeviceStatus.status');
    }

    stop(): void {
        super.stop();
        this.adapter.unsubscribeStates('simnetAutopilotAngle.mode');
        this.adapter.unsubscribeStates('simnetDeviceStatus.status');
    }

    onStateChange(id: string, state?: ioBroker.State | null): void {
        if (state) {
            if (id.endsWith('simnetAutopilotAngle.mode') && state.ack) {
                if (this.currentMode !== state.val) {
                    this.currentMode = state.val as AutoPilotMode;
                    if (this.isAutopilot === 'Automatic') {
                        if (this.currentMode === 'Heading') {
                            void this.adapter.setState('autoPilot.state', 1, true); // Auto
                        } else if (this.currentMode === 'Wind') {
                            void this.adapter.setState('autoPilot.state', 2, true); // Auto Wind
                        } else if (this.currentMode === 'Nav') {
                            void this.adapter.setState('autoPilot.state', 3, true); // Auto Track
                        } else if (this.currentMode === 'No Drift') {
                            void this.adapter.setState('autoPilot.state', 4, true); // Auto Track
                        } else {
                            this.adapter.log.warn(`Unknown pilot mode ${this.currentMode as any}`);
                        }
                    } else {
                        void this.adapter.setState('autoPilot.state', 0, true); // Standby
                    }
                }
            } else if (id.endsWith('simnetDeviceStatus.status') && state.ack) {
                if (this.isAutopilot !== state.val) {
                    this.isAutopilot = state.val as 'Manual' | 'Automatic';
                    if (this.isAutopilot === 'Automatic') {
                        if (this.currentMode === 'Heading') {
                            void this.adapter.setState('autoPilot.state', 1, true); // Auto
                        } else if (this.currentMode === 'Wind') {
                            void this.adapter.setState('autoPilot.state', 2, true); // Auto Wind
                        } else if (this.currentMode === 'Nav') {
                            void this.adapter.setState('autoPilot.state', 3, true); // Auto Track
                        } else if (this.currentMode === 'No Drift') {
                            void this.adapter.setState('autoPilot.state', 4, true); // Auto Track
                        } else {
                            this.adapter.log.warn(`Unknown pilot mode ${this.currentMode}`);
                        }
                    } else {
                        void this.adapter.setState('autoPilot.state', 0, true); // Standby
                    }
                }
            } else if (id.endsWith('autoPilot.state') && !state.ack) {
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
                this.setHeadingAngle(1);
            } else if (id.endsWith('autoPilot.headingPlus10') && !state.ack) {
                this.setHeadingAngle(10);
            } else if (id.endsWith('autoPilot.headingMinus1') && !state.ack) {
                this.setHeadingAngle(-1);
            } else if (id.endsWith('autoPilot.headingMinus10') && !state.ack) {
                this.setHeadingAngle(-10);
            } else if (id.endsWith('autoPilot.heading') && !state.ack) {
                if (this.isAutopilot !== 'Automatic') {
                    this.adapter.log.warn('Cannot set locked heading when not in Auto mode');
                    return;
                }
                let newHeading = Math.round((state.val as unknown as number) % 360);
                if (newHeading < 0) {
                    newHeading += 360;
                }
                newHeading %= 360;
                this.adapter.log.info(`Set autoPilot heading to ${newHeading}°`);
                this.setLockedHeading(newHeading);
            } else if (id.endsWith('autoPilot.windAngleChange') && !state.ack) {
                if (this.currentMode !== 'Wind') {
                    this.adapter.log.warn('Cannot set wind angle when not in Wind mode');
                    return;
                }
                this.adapter.log.info(`Set autoPilot wind angle to ${state.val}°`);
                this.adapter.log.warn(`Not implemented yet: setWindAngle(${state.val})`);
            }
        }
    }

    // commands for NGT-1 in Canboat format
    private setStandby(): void {
        const data = encodeActisense({
            prio: 2,
            pgn: 130850,
            src: this.autoPilotAddress,
            dst: 255,
            // 2025-08-14T15:15:15.257Z,2,130850,5,255,12,41,9f,04,ff,ff,0a,06,00,ff,ff,ff,ff
            data: Buffer.from([
                0x41, // 11 bits, 1857: Simrad, 2 bits reserved, 3 bits - 	4: Marine Industry
                0x9f, // 0x742 = 1857
                0x04, // NMEA 2000 address of commanded device
                0xff, // reserved
                0xff, // Autopilot address
                0x0a, // AP status: 2 - manual, 0a - auto
                0x06, // AP Command: 06 standby, 09
                0x00, // Spare - always 0
                0xff, // Direction
                0xff, // Angle
                0xff, // Angle
                0xff,
            ]),
        });
        this.nmeaDriver.write(data);
    }

    private setAuto(): void {
        const data = encodeActisense({
            prio: 2,
            pgn: 130850,
            src: this.autoPilotAddress,
            dst: 255,
            data: Buffer.from([0x41, 0x9f, 0x04, 0xff, 0xff, 0x0a, 0x09, 0x00, 0xff, 0xff, 0xff, 0xff]),
        });
        this.nmeaDriver.write(data);
    }

    private setAutoWind(): void {
        // Not implemented yet
        this.adapter.log.warn('Setting Auto Wind is not implemented yet');
    }

    private setAutoTrack(): void {
        // Not implemented yet
        this.adapter.log.warn('Setting Auto Track is not implemented yet');
    }

    private setLockedHeading(_angle: number): void {
        // Not implemented yet
        this.adapter.log.warn('Setting locked heading is not implemented yet');
    }

    private setHeadingAngle(command: 1 | -1 | 10 | -10): void {
        // Byte 8 = direction (0x02 port-to-starboard / +, 0x03 starboard-to-port / -).
        // Bytes 9-10 = magnitude in 0.0001 rad little-endian: 1° ≈ 0x00ae, 10° ≈ 0x06d1.
        const directionByte = command > 0 ? 0x02 : 0x03;
        const magnitude = Math.abs(command) === 10 ? [0xd1, 0x06] : [0xae, 0x00];
        const data = encodeActisense({
            prio: 2,
            pgn: 130850,
            src: this.autoPilotAddress,
            dst: 255,
            data: Buffer.from([
                0x41,
                0x9f,
                0x04,
                0xff,
                0xff,
                0x0a,
                0x1a,
                0x00,
                directionByte,
                magnitude[0],
                magnitude[1],
                0xff,
            ]),
        });
        this.nmeaDriver.write(data);
    }
}
