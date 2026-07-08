import { Transform } from 'node:stream';
import { FromPgn, canbus as CanPort } from '@canboat/canboatjs';
import { type NmeaConfig, type PGNMessage } from '../types';
import { GenericDriver } from './genericDriver';
import type { PGN } from '@canboat/ts-pgns';

export default class PicanM extends GenericDriver {
    private readonly canPort: string;

    private readonly pgnErrors: Record<string, boolean>;

    private serial: any;

    constructor(adapter: ioBroker.Adapter, settings: NmeaConfig, onData: (event: PGN) => void) {
        super(adapter, settings, onData);
        this.canPort = settings.canPort;
        this.serial = null;
        this.pgnErrors = {};

        this.app.setProviderStatus = (id: string, msg: string) => {
            if (msg.startsWith('Connected to')) {
                this.adapter.log.debug('Connected to PICAN-M');
            } else {
                this.adapter.log.debug(`PICAN-M: ${msg}`);
            }
        };

        this.app.setProviderError = (id: string, msg: string): void => {
            this.adapter.log.error(`PICAN-M: ${msg}`);
        };
    }

    start(): void {
        const parser = new FromPgn({ includeRawData: true });

        parser.on('warning', (pgn: PGNMessage, warning: string) => {
            if (this.pgnErrors[pgn.pgn]) {
                return;
            }
            this.pgnErrors[pgn.pgn] = true;
            this.adapter.log.warn(`${pgn.pgn} ${warning}`);
        });

        // canboatjs emits 'error' (not throw) when a frame cannot be parsed. Without a listener,
        // Node re-throws it as ERR_UNHANDLED_ERROR ("Unhandled error.") from inside parseString().
        // In the throw path the first arg is the raw line (with a timestamp), so we dedup on the
        // 8-hex CAN-ID token (stable per PGN+source) instead of the whole line to avoid log spam.
        parser.on('error', (pgn: PGNMessage | string, error: Error) => {
            const key = typeof pgn === 'string' ? (pgn.match(/\b[0-9A-Fa-f]{8}\b/)?.[0] ?? pgn) : String(pgn?.pgn);
            if (this.pgnErrors[key]) {
                return;
            }
            this.pgnErrors[key] = true;
            this.adapter.log.warn(`Cannot parse frame ${key}: ${error?.message ?? error}`);
        });

        this.serial = CanPort({
            app: this.app,
            device: this.canPort,
            plainText: true,
            disableSetTransmitPGNs: true,
            outputOnly: false,
        });

        const adapter = this.adapter;
        const onData = this.onData;

        const toStringTr = new Transform({
            objectMode: true,

            transform(chunk, encoding, callback) {
                const line = chunk.toString();
                try {
                    const json = parser.parseString(line);
                    if (json?.fields) {
                        onData?.(json);
                    }
                } catch (error) {
                    adapter.log.error(`Cannot parse NMEA message: ${error}`);
                }

                callback();
            },
        });

        this.serial.pipe(toStringTr);
    }

    write(data: string): void {
        this.adapter.log.debug(`Sending ${typeof data === 'object' ? JSON.stringify(data) : data} to PicanM`);
        this.app?.emit('nmea2000out', data);
    }

    stop(): void {
        this.app?.removeAllListeners();
        this.serial?.end();
    }
}
