const CanPort = require('@canboat/canboatjs/lib/canbus');
const EventEmitter = require('node:events');
const { FromPgn } = require('@canboat/canboatjs');
const { Transform } = require('node:stream');

class PicanM {
    constructor(adapter, settings, onData) {
        this.adapter = adapter;
        this.canPort = settings.canPort;
        this.app = new EventEmitter();
        this.serial = null;
        this.onData = onData;
        this.pgnErrors = {};

        this.app.setProviderStatus = (id, msg) => {
            if (msg.startsWith('Connected to')) {
                this.adapter.log.debug('Connected to PICAN-M');
            } else {
                this.adapter.log.debug(`PICAN-M: ${msg}`);
            }
        };

        this.app.setProviderError = (id, msg) => {
            this.adapter.log.error(`PICAN-M: ${msg}`);
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

        this.serial = new CanPort({
            app: this.app,
            device: this.canPort,
            plainText: true,
            disableSetTransmitPGNs: true,
            outputOnly: false
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
        this.adapter.log.debug(`Sending ${typeof data === 'object' ? JSON.stringify(data) : data } to PicanM`);
        this.app && this.app.emit('nmea2000out', data);
    }

    stop() {
        this.app.removeAllListeners();
        this.serial && this.serial.end();
    }
}

module.exports = PicanM;
