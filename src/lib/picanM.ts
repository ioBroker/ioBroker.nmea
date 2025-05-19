import { Transform } from 'node:stream';
// @ts-expect-error no types
import CanPort from '@canboat/canboatjs/lib/canbus';
// @ts-expect-error no types
import { FromPgn } from '@canboat/canboatjs';
import { type NmeaConfig, type PgnDataEvent, type PGNMessage, type WritePgnData } from '../types';
import { GenericDriver } from './genericDriver';

class PicanM extends GenericDriver {
    private readonly canPort: string;

    private readonly pgnErrors: Record<string, boolean>;

    private serial: CanPort;

    constructor(adapter: ioBroker.Adapter, settings: NmeaConfig, onData: (event: PgnDataEvent) => void) {
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

        this.app.setProviderError = (id: string, msg: string) => {
            this.adapter.log.error(`PICAN-M: ${msg}`);
        };
    }

    start(): void {
        const parser = new FromPgn();

        parser.on('warning', (pgn: PGNMessage, warning: string) => {
            if (this.pgnErrors[pgn.pgn]) {
                return;
            }
            this.pgnErrors[pgn.pgn] = true;
            this.adapter.log.warn(`${pgn.pgn} ${warning}`);
        });

        this.serial = new CanPort({
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
                // console.log(chunk.toString());
                try {
                    const json = parser.parseString(chunk.toString());
                    if (json && json.fields) {
                        onData && onData(json);
                    }
                } catch (error) {
                    adapter.log.error(`Cannot parse NMEA message: ${error}`);
                }

                callback();
            },
        });

        this.serial.pipe(toStringTr);
    }

    write(data: WritePgnData): void {
        this.adapter.log.debug(`Sending ${typeof data === 'object' ? JSON.stringify(data) : data} to PicanM`);
        this.app && this.app.emit('nmea2000out', data);
    }

    stop(): void {
        this.app.removeAllListeners();
        this.serial && this.serial.end();
    }
}

export default PicanM;
