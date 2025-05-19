import { Transform } from 'node:stream';
// @ts-expect-error no types
import SerialPort from '@canboat/canboatjs/lib/serial';
// @ts-expect-error no types
import { FromPgn } from '@canboat/canboatjs';
import { type NmeaConfig, type PgnDataEvent, type PGNMessage, type WritePgnData } from '../types';
import { GenericDriver } from './genericDriver';

class NGT1 extends GenericDriver {
    private readonly serialPort: string;

    private serial: SerialPort;

    private readonly pgnErrors: Record<string, boolean>;

    constructor(adapter: ioBroker.Adapter, settings: NmeaConfig, onData: (event: PgnDataEvent) => void) {
        super(adapter, settings, onData);
        this.serialPort = settings.serialPort;
        this.serial = null;
        this.pgnErrors = {};

        this.app.setProviderStatus = (id: string, msg: string) => {
            if (msg.startsWith('Connected to')) {
                this.adapter.log.debug('Connected to NGT1');
            } else {
                this.adapter.log.debug(`NGT1: ${msg}`);
            }
        };

        this.app.setProviderError = (id: string, msg: string) => {
            this.adapter.log.error(`NGT1: ${msg}`);
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

        this.serial = new SerialPort({
            app: this.app,
            device: this.serialPort,
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
        this.adapter.log.debug(`Sending ${JSON.stringify(data)} to NGT1`);
        this.app?.emit('nmea2000out', data);
    }

    stop(): void {
        this.serial?.end();
        this.app?.removeAllListeners();
    }
}

export default NGT1;
