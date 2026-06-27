import type { NmeaConfig } from '../types';
import type { GenericDriver } from './genericDriver';

export default abstract class AutoPilot {
    protected readonly adapter: ioBroker.Adapter;

    protected readonly config: NmeaConfig;

    protected readonly nmeaDriver: GenericDriver;

    protected readonly values: Record<string, { val: ioBroker.StateValue; ts: number }>;

    protected readonly autoPilotAddress: number;

    protected constructor(
        adapter: ioBroker.Adapter,
        config: NmeaConfig,
        nmeaDriver: GenericDriver,
        values: Record<string, { val: ioBroker.StateValue; ts: number }>,
        autoPilotAddress?: number,
    ) {
        this.adapter = adapter;
        this.config = config;
        this.values = values;
        this.nmeaDriver = nmeaDriver;
        this.autoPilotAddress = autoPilotAddress || 0x04; // Address of the control device

        // create states
        void this.adapter.setObjectNotExists('autoPilot', {
            type: 'channel',
            common: {
                name: 'NavicoAutoPilot',
            },
            native: {
                autoPilotAddress,
            },
        });
        void this.adapter.setObjectNotExists('autoPilot.state', {
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
                    4: 'AutoNoDrift', // not supported by Raymarine
                },
            },
            native: {
                autoPilotAddress,
            },
        });
        void this.adapter.setObjectNotExists('autoPilot.heading', {
            type: 'state',
            common: {
                name: 'NavicoAutoPilot',
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
        void this.adapter.setObjectNotExists('autoPilot.headingPlus1', {
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
        void this.adapter.setObjectNotExists('autoPilot.headingPlus10', {
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

        void this.adapter.setObjectNotExists('autoPilot.headingMinus1', {
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

        void this.adapter.setObjectNotExists('autoPilot.headingMinus10', {
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
        void this.adapter.setObjectNotExists('autoPilot.windAngleChange', {
            type: 'state',
            common: {
                name: 'NavicoAutoPilot',
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
        // Absolute wind-angle target in degrees (relative to bow). Writing this state sends
        // a single PGN 126208 Command for PGN 65345 (Pilot Wind Datum) carrying the encoded
        // angle, instead of stepping with ±1°/±10° presses. Mirrors the ack'd value of the
        // last `seatalkPilotWindDatum.windDatum` received from the bus, so it can be bound
        // to a slider/knob in the UI.
        void this.adapter.setObjectNotExists('autoPilot.windAngle', {
            type: 'state',
            common: {
                name: 'Wind angle (target, absolute)',
                type: 'number',
                role: 'value.direction.autopilot',
                write: false,
                read: true,
                unit: '°',
                min: 0,
                max: 360,
            },
            native: {
                autoPilotAddress,
            },
        });

        this.adapter.subscribeStates('autoPilot.*');
    }

    stop(): void {
        this.adapter.unsubscribeStates('autoPilot.*');
    }

    abstract onStateChange(id: string, state?: ioBroker.State | null): void;
}
