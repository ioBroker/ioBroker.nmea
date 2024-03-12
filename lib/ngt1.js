const SerialPort = require('@canboat/canboatjs/lib/serial');
const EventEmitter = require('node:events');
const { FromPgn } = require('@canboat/canboatjs');
const { Transform } = require('node:stream');

class NGT1 {
    constructor(adapter, settings, onData) {
        this.adapter = adapter;
        this.serialPort = settings.serialPort;
        this.app = new EventEmitter();
        this.serial = null;
        this.onData = onData;
        this.pgnErrors = {};

        this.app.setProviderStatus = (id, msg) => {
            if (msg.startsWith('Connected to')) {
                this.adapter.log.debug('Connected to NGT1');
            } else {
                this.adapter.log.debug(`NGT1: ${msg}`);
            }
        };

        this.app.setProviderError = (id, msg) => {
            this.adapter.log.error(`NGT1: ${msg}`);
        };
    }

    start() {
        const parser = new FromPgn();

        parser.on('warning', (pgn, warning) => {
            if (this.pgnErrors[pgn]) {
                return;
            }
            this.pgnErrors[pgn] = true;
            this.adapter.log.warn(`${pgn.pgn} ${warning}`);
        });

        this.serial = new SerialPort({
            app: this.app,
            device: this.serialPort,
            plainText: true,
            disableSetTransmitPGNs: true,
            outputOnly: false,
        });

        const that = this;

        const toStringTr = new Transform({
            objectMode: true,

            transform(chunk, encoding, callback) {
                // console.log(chunk.toString());
                try {
                    const json = parser.parseString(chunk.toString());
                    if (json && json.fields) {
                        that.onData && that.onData(json);
                    }
                } catch (error) {
                    that.adapter.log.error(`Cannot parse NMEA message: ${error}`);
                }

                callback();
            }
        });

        this.serial.pipe(toStringTr);
    }

    write(data) {
        this.adapter.log.debug(`Sending ${JSON.stringify(data)} to NGT1`);
        this.app && this.app.emit('nmea2000out', data);
    }

    stop() {
        this.serial && this.serial.end();
        this.app.removeAllListeners();
    }
}

module.exports = NGT1;
