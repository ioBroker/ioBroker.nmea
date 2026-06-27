import { type Server as HttpServer, createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import type { PGN } from '@canboat/ts-pgns';

import type { NmeaConfig, WritePgnData } from '../types';

interface DeltaValue {
    path: string;
    value: any;
}

interface SignalKDelta {
    context: string;
    updates: {
        source: { label: string; type: string; src?: number; pgn?: number };
        timestamp: string;
        values: DeltaValue[];
    }[];
}

interface IncomingDelta {
    context?: string;
    updates?: { values?: DeltaValue[] }[];
    put?: { path: string; value: any };
}

type PgnMapper = (fields: Record<string, any>, src?: number) => { path: string; value: any; context?: string }[];

// Reverse mapper: SignalK path + value → ioBroker state id (relative) + translated value, or a direct PGN to send.
type ReverseMapper = (value: any) => { stateId: string; value: ioBroker.StateValue } | { pgn: WritePgnData } | null;

export interface SignalKOptions {
    adapter: ioBroker.Adapter;
    config: NmeaConfig;
    serverVersion: string;
    writePgn: (pgn: WritePgnData) => void;
    simulateAddress?: number;
}

const SELF_CONTEXT = 'vessels.self';

function engineInstance(inst: unknown): string {
    if (typeof inst === 'number') {
        return inst.toString();
    }
    if (inst === 'Single Engine or Dual Engine Port') {
        return '0';
    }
    if (inst === 'Dual Engine Starboard') {
        return '1';
    }
    return '0';
}

function tempSourceToPath(src: string): string | null {
    switch (src) {
        case 'Sea Temperature':
            return 'environment.water.temperature';
        case 'Outside Temperature':
            return 'environment.outside.temperature';
        case 'Inside Temperature':
            return 'environment.inside.temperature';
        case 'Engine Room Temperature':
            return 'environment.inside.engineRoom.temperature';
        case 'Main Cabin Temperature':
            return 'environment.inside.mainCabin.temperature';
        case 'Refrigeration Temperature':
            return 'environment.inside.refrigerator.temperature';
        case 'Freezer Temperature':
            return 'environment.inside.freezer.temperature';
        case 'Exhaust Gas Temperature':
            return 'propulsion.0.exhaustTemperature';
        case 'Dew Point Temperature':
            return 'environment.outside.dewPointTemperature';
        default:
            return null;
    }
}

const PGN_MAPPERS: Record<number, PgnMapper> = {
    126992: f => {
        // System Time
        if (typeof f.Date === 'string' && typeof f.Time === 'string') {
            return [{ path: 'navigation.datetime', value: `${f.Date}T${f.Time}Z` }];
        }
        return [];
    },
    127245: f => {
        // Rudder
        const out: { path: string; value: any }[] = [];
        if (typeof f.Position === 'number') {
            out.push({ path: 'steering.rudderAngle', value: f.Position });
        }
        if (typeof f['Angle Order'] === 'number') {
            out.push({ path: 'steering.rudderAngleTarget', value: f['Angle Order'] });
        }
        return out;
    },
    127250: f => {
        // Vessel Heading
        const out: { path: string; value: any }[] = [];
        const h = f.Heading;
        if (typeof h === 'number') {
            if (f.Reference === 'Magnetic') {
                out.push({ path: 'navigation.headingMagnetic', value: h });
            } else if (f.Reference === 'True') {
                out.push({ path: 'navigation.headingTrue', value: h });
            }
        }
        if (typeof f.Deviation === 'number') {
            out.push({ path: 'navigation.magneticDeviation', value: f.Deviation });
        }
        if (typeof f.Variation === 'number') {
            out.push({ path: 'navigation.magneticVariation', value: f.Variation });
        }
        return out;
    },
    127251: f => {
        if (typeof f.Rate === 'number') {
            return [{ path: 'navigation.rateOfTurn', value: f.Rate }];
        }
        return [];
    },
    127257: f => {
        // Attitude
        const v: Record<string, number> = {};
        if (typeof f.Yaw === 'number') {
            v.yaw = f.Yaw;
        }
        if (typeof f.Pitch === 'number') {
            v.pitch = f.Pitch;
        }
        if (typeof f.Roll === 'number') {
            v.roll = f.Roll;
        }
        return Object.keys(v).length ? [{ path: 'navigation.attitude', value: v }] : [];
    },
    127488: f => {
        const out: { path: string; value: any }[] = [];
        const inst = engineInstance(f.Instance);
        if (typeof f.Speed === 'number') {
            // N2K gives RPM, SignalK spec expects Hz
            out.push({ path: `propulsion.${inst}.revolutions`, value: f.Speed / 60 });
        }
        if (typeof f['Boost Pressure'] === 'number') {
            out.push({ path: `propulsion.${inst}.boostPressure`, value: f['Boost Pressure'] });
        }
        if (typeof f['Tilt/Trim'] === 'number') {
            out.push({ path: `propulsion.${inst}.trim`, value: f['Tilt/Trim'] });
        }
        return out;
    },
    127489: f => {
        const out: { path: string; value: any }[] = [];
        const inst = engineInstance(f.Instance);
        if (typeof f['Oil Temperature'] === 'number') {
            out.push({ path: `propulsion.${inst}.oilTemperature`, value: f['Oil Temperature'] });
        }
        if (typeof f['Oil Pressure'] === 'number') {
            out.push({ path: `propulsion.${inst}.oilPressure`, value: f['Oil Pressure'] });
        }
        if (typeof f.Temperature === 'number') {
            out.push({ path: `propulsion.${inst}.temperature`, value: f.Temperature });
        }
        if (typeof f['Alternator Potential'] === 'number') {
            out.push({ path: `propulsion.${inst}.alternatorVoltage`, value: f['Alternator Potential'] });
        }
        if (typeof f['Fuel Rate'] === 'number') {
            out.push({ path: `propulsion.${inst}.fuel.rate`, value: f['Fuel Rate'] });
        }
        if (typeof f['Total Engine hours'] === 'number') {
            out.push({ path: `propulsion.${inst}.runTime`, value: f['Total Engine hours'] });
        }
        if (typeof f['Engine Load'] === 'number') {
            out.push({ path: `propulsion.${inst}.engineLoad`, value: f['Engine Load'] / 100 });
        }
        if (typeof f['Engine Torque'] === 'number') {
            out.push({ path: `propulsion.${inst}.engineTorque`, value: f['Engine Torque'] / 100 });
        }
        return out;
    },
    127505: f => {
        // Fluid Level
        const out: { path: string; value: any }[] = [];
        const type = typeof f.Type === 'string' ? f.Type.toLowerCase().replace(/[^a-z0-9]/g, '') : 'other';
        const inst = typeof f.Instance === 'number' ? f.Instance : 0;
        if (typeof f.Level === 'number') {
            out.push({ path: `tanks.${type}.${inst}.currentLevel`, value: f.Level / 100 });
        }
        if (typeof f.Capacity === 'number') {
            out.push({ path: `tanks.${type}.${inst}.capacity`, value: f.Capacity });
        }
        return out;
    },
    127508: f => {
        // Battery Status
        const out: { path: string; value: any }[] = [];
        const inst = typeof f.Instance === 'number' ? f.Instance : 0;
        if (typeof f.Voltage === 'number') {
            out.push({ path: `electrical.batteries.${inst}.voltage`, value: f.Voltage });
        }
        if (typeof f.Current === 'number') {
            out.push({ path: `electrical.batteries.${inst}.current`, value: f.Current });
        }
        if (typeof f.Temperature === 'number') {
            out.push({ path: `electrical.batteries.${inst}.temperature`, value: f.Temperature });
        }
        return out;
    },
    128259: f => {
        const out: { path: string; value: any }[] = [];
        if (typeof f['Speed Water Referenced'] === 'number') {
            out.push({ path: 'navigation.speedThroughWater', value: f['Speed Water Referenced'] });
        }
        if (typeof f['Speed Ground Referenced'] === 'number') {
            out.push({ path: 'navigation.speedOverGround', value: f['Speed Ground Referenced'] });
        }
        return out;
    },
    128267: f => {
        const out: { path: string; value: any }[] = [];
        if (typeof f.Depth === 'number') {
            out.push({ path: 'environment.depth.belowTransducer', value: f.Depth });
        }
        if (typeof f.Offset === 'number') {
            out.push({ path: 'environment.depth.surfaceToTransducer', value: f.Offset });
        }
        return out;
    },
    128275: f => {
        const out: { path: string; value: any }[] = [];
        if (typeof f.Log === 'number') {
            out.push({ path: 'navigation.log', value: f.Log });
        }
        if (typeof f['Trip Log'] === 'number') {
            out.push({ path: 'navigation.logTrip', value: f['Trip Log'] });
        }
        return out;
    },
    129025: f => {
        if (typeof f.Latitude === 'number' && typeof f.Longitude === 'number') {
            return [{ path: 'navigation.position', value: { latitude: f.Latitude, longitude: f.Longitude } }];
        }
        return [];
    },
    129026: f => {
        const out: { path: string; value: any }[] = [];
        if (typeof f.COG === 'number') {
            const path =
                f['COG Reference'] === 'Magnetic'
                    ? 'navigation.courseOverGroundMagnetic'
                    : 'navigation.courseOverGroundTrue';
            out.push({ path, value: f.COG });
        }
        if (typeof f.SOG === 'number') {
            out.push({ path: 'navigation.speedOverGround', value: f.SOG });
        }
        return out;
    },
    129029: f => {
        const out: { path: string; value: any }[] = [];
        if (typeof f.Latitude === 'number' && typeof f.Longitude === 'number') {
            const pos: Record<string, number> = { latitude: f.Latitude, longitude: f.Longitude };
            if (typeof f.Altitude === 'number') {
                pos.altitude = f.Altitude;
            }
            out.push({ path: 'navigation.position', value: pos });
        }
        if (typeof f.HDOP === 'number') {
            out.push({ path: 'navigation.gnss.horizontalDilution', value: f.HDOP });
        }
        if (typeof f['Number of SVs'] === 'number') {
            out.push({ path: 'navigation.gnss.satellites', value: f['Number of SVs'] });
        }
        if (typeof f['GNSS type'] === 'string') {
            out.push({ path: 'navigation.gnss.type', value: f['GNSS type'] });
        }
        if (typeof f.Method === 'string') {
            out.push({ path: 'navigation.gnss.methodQuality', value: f.Method });
        }
        return out;
    },
    130306: f => {
        const out: { path: string; value: any }[] = [];
        const angle = typeof f['Wind Angle'] === 'number' ? f['Wind Angle'] : undefined;
        const speed = typeof f['Wind Speed'] === 'number' ? f['Wind Speed'] : undefined;
        const ref = typeof f.Reference === 'string' ? f.Reference : '';
        if (ref.includes('Apparent')) {
            if (angle !== undefined) {
                out.push({ path: 'environment.wind.angleApparent', value: angle });
            }
            if (speed !== undefined) {
                out.push({ path: 'environment.wind.speedApparent', value: speed });
            }
        } else if (ref.includes('True') && ref.includes('Ground')) {
            if (angle !== undefined) {
                out.push({ path: 'environment.wind.directionTrue', value: angle });
            }
            if (speed !== undefined) {
                out.push({ path: 'environment.wind.speedOverGround', value: speed });
            }
        } else if (ref.includes('True') && ref.includes('Water')) {
            if (angle !== undefined) {
                out.push({ path: 'environment.wind.angleTrueWater', value: angle });
            }
            if (speed !== undefined) {
                out.push({ path: 'environment.wind.speedTrue', value: speed });
            }
        } else if (ref.includes('Magnetic')) {
            if (angle !== undefined) {
                out.push({ path: 'environment.wind.directionMagnetic', value: angle });
            }
            if (speed !== undefined) {
                out.push({ path: 'environment.wind.speedOverGround', value: speed });
            }
        }
        return out;
    },
    130310: f => {
        const out: { path: string; value: any }[] = [];
        if (typeof f['Water Temperature'] === 'number') {
            out.push({ path: 'environment.water.temperature', value: f['Water Temperature'] });
        }
        if (typeof f['Outside Ambient Air Temperature'] === 'number') {
            out.push({ path: 'environment.outside.temperature', value: f['Outside Ambient Air Temperature'] });
        }
        if (typeof f['Atmospheric Pressure'] === 'number') {
            out.push({ path: 'environment.outside.pressure', value: f['Atmospheric Pressure'] });
        }
        return out;
    },
    130311: f => {
        const out: { path: string; value: any }[] = [];
        const ts = typeof f['Temperature Source'] === 'string' ? f['Temperature Source'] : '';
        const temp = typeof f.Temperature === 'number' ? f.Temperature : undefined;
        if (temp !== undefined) {
            const p = tempSourceToPath(ts);
            if (p) {
                out.push({ path: p, value: temp });
            }
        }
        const hs = typeof f['Humidity Source'] === 'string' ? f['Humidity Source'] : '';
        const hum = typeof f.Humidity === 'number' ? f.Humidity : undefined;
        if (hum !== undefined) {
            out.push({
                path: hs === 'Inside' ? 'environment.inside.humidity' : 'environment.outside.humidity',
                value: hum / 100,
            });
        }
        if (typeof f['Atmospheric Pressure'] === 'number') {
            out.push({ path: 'environment.outside.pressure', value: f['Atmospheric Pressure'] });
        }
        return out;
    },
    130312: f => {
        const out: { path: string; value: any }[] = [];
        const src = typeof f.Source === 'string' ? f.Source : '';
        const temp = typeof f['Actual Temperature'] === 'number' ? f['Actual Temperature'] : undefined;
        if (temp !== undefined) {
            const p = tempSourceToPath(src);
            if (p) {
                out.push({ path: p, value: temp });
            }
        }
        return out;
    },
    130313: f => {
        const hum = typeof f['Actual Humidity'] === 'number' ? f['Actual Humidity'] : undefined;
        if (hum === undefined) {
            return [];
        }
        const src = typeof f.Source === 'string' ? f.Source : '';
        return [
            {
                path: src === 'Inside' ? 'environment.inside.humidity' : 'environment.outside.humidity',
                value: hum / 100,
            },
        ];
    },
    130314: f => {
        const p = typeof f.Pressure === 'number' ? f.Pressure : undefined;
        if (p === undefined) {
            return [];
        }
        const src = typeof f.Source === 'string' ? f.Source : '';
        return [
            {
                path: src === 'Atmospheric' ? 'environment.outside.pressure' : 'environment.misc.pressure',
                value: p,
            },
        ];
    },
    // AIS Class A Position Report
    129038: f => {
        const out: { path: string; value: any; context?: string }[] = [];
        const mmsi = f['User ID'];
        if (!mmsi) {
            return [];
        }
        const context = `vessels.urn:mrn:imo:mmsi:${mmsi}`;
        if (typeof f.Latitude === 'number' && typeof f.Longitude === 'number') {
            out.push({
                context,
                path: 'navigation.position',
                value: { latitude: f.Latitude, longitude: f.Longitude },
            });
        }
        if (typeof f.COG === 'number') {
            out.push({ context, path: 'navigation.courseOverGroundTrue', value: f.COG });
        }
        if (typeof f.SOG === 'number') {
            out.push({ context, path: 'navigation.speedOverGround', value: f.SOG });
        }
        if (typeof f.Heading === 'number') {
            out.push({ context, path: 'navigation.headingTrue', value: f.Heading });
        }
        if (typeof f['Rate of Turn'] === 'number') {
            out.push({ context, path: 'navigation.rateOfTurn', value: f['Rate of Turn'] });
        }
        return out;
    },
    // AIS Class B Position Report
    129039: f => {
        const out: { path: string; value: any; context?: string }[] = [];
        const mmsi = f['User ID'];
        if (!mmsi) {
            return [];
        }
        const context = `vessels.urn:mrn:imo:mmsi:${mmsi}`;
        if (typeof f.Latitude === 'number' && typeof f.Longitude === 'number') {
            out.push({
                context,
                path: 'navigation.position',
                value: { latitude: f.Latitude, longitude: f.Longitude },
            });
        }
        if (typeof f.COG === 'number') {
            out.push({ context, path: 'navigation.courseOverGroundTrue', value: f.COG });
        }
        if (typeof f.SOG === 'number') {
            out.push({ context, path: 'navigation.speedOverGround', value: f.SOG });
        }
        return out;
    },
};

// Writeable SignalK paths — translate into adapter state writes (existing handlers map them to PGNs).
// For autopilot, the adapter already exposes writeable states autoPilot.* wired to the active autopilot driver.
const AUTOPILOT_STATE_VALUES: Record<string, number> = {
    standby: 0,
    auto: 1,
    wind: 2,
    route: 3,
    track: 3,
    nodrift: 4,
};

const REVERSE_MAPPERS: Record<string, ReverseMapper> = {
    'steering.autopilot.state': (value: any) => {
        if (typeof value !== 'string' && typeof value !== 'number') {
            return null;
        }
        const key = typeof value === 'string' ? value.toLowerCase() : null;
        const num =
            typeof value === 'number'
                ? value
                : key && AUTOPILOT_STATE_VALUES[key] !== undefined
                  ? AUTOPILOT_STATE_VALUES[key]
                  : null;
        return num === null ? null : { stateId: 'autoPilot.state', value: num };
    },
    'steering.autopilot.target.headingTrue': (value: any) => {
        if (typeof value !== 'number') {
            return null;
        }
        // radians → degrees (adapter state is degrees)
        return { stateId: 'autoPilot.heading', value: Math.round((value * 180) / Math.PI) };
    },
    'steering.autopilot.target.headingMagnetic': (value: any) => {
        if (typeof value !== 'number') {
            return null;
        }
        return { stateId: 'autoPilot.heading', value: Math.round((value * 180) / Math.PI) };
    },
};

function rawToString(raw: Buffer | ArrayBuffer | Buffer[] | string): string {
    if (typeof raw === 'string') {
        return raw;
    }
    if (Buffer.isBuffer(raw)) {
        return raw.toString('utf8');
    }
    if (Array.isArray(raw)) {
        return Buffer.concat(raw).toString('utf8');
    }
    return Buffer.from(raw).toString('utf8');
}

function setByPath(
    tree: Record<string, any>,
    dottedPath: string,
    leaf: { value: any; timestamp: string; $source: string },
): void {
    const parts = dottedPath.split('.');
    let node = tree;
    for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i];
        if (typeof node[key] !== 'object' || node[key] === null) {
            node[key] = {};
        }
        node = node[key];
    }
    node[parts[parts.length - 1]] = leaf;
}

function contextToTreePath(context: string): string[] {
    // vessels.self → ['vessels', 'self']; vessels.urn:mrn:imo:mmsi:123 → ['vessels', 'urn:mrn:imo:mmsi:123']
    const dot = context.indexOf('.');
    if (dot < 0) {
        return [context];
    }
    return [context.substring(0, dot), context.substring(dot + 1)];
}

function getByPath(tree: Record<string, any>, segments: string[]): any {
    let node: any = tree;
    for (const seg of segments) {
        if (node == null || typeof node !== 'object') {
            return undefined;
        }
        node = node[seg];
    }
    return node;
}

export class SignalKServer {
    private readonly adapter: ioBroker.Adapter;
    private readonly config: NmeaConfig;
    private readonly serverVersion: string;
    private readonly writePgn: (pgn: WritePgnData) => void;
    private readonly simulateAddress: number;

    private httpServer: HttpServer | null = null;
    private wss: WebSocketServer | null = null;
    private clients: Set<WebSocket> = new Set();
    private tree: Record<string, any> = { vessels: { self: {} } };
    private readonly serverId: string;

    constructor(opts: SignalKOptions) {
        this.adapter = opts.adapter;
        this.config = opts.config;
        this.serverVersion = opts.serverVersion;
        this.writePgn = opts.writePgn;
        this.simulateAddress = opts.simulateAddress ?? 204;
        this.serverId = `iobroker-nmea-${randomUUID().slice(0, 8)}`;
    }

    start(port: number): void {
        if (this.httpServer) {
            return;
        }
        this.httpServer = createServer((req, res) => this.handleHttp(req, res));
        this.wss = new WebSocketServer({ server: this.httpServer, path: '/signalk/v1/stream' });
        this.wss.on('connection', (ws, req) => this.handleWs(ws, req));
        this.httpServer.on('error', err => this.adapter.log.error(`SignalK server error: ${err.message}`));
        this.httpServer.listen(port, () => {
            this.adapter.log.info(`SignalK server listening on port ${port}`);
        });
    }

    stop(): void {
        for (const ws of this.clients) {
            try {
                ws.close();
            } catch {
                // ignore
            }
        }
        this.clients.clear();
        this.wss?.close();
        this.wss = null;
        this.httpServer?.close();
        this.httpServer = null;
    }

    onPGN(pgn: PGN): void {
        if (!pgn?.pgn || !pgn.fields) {
            return;
        }
        const mapper = PGN_MAPPERS[pgn.pgn];
        if (!mapper) {
            return;
        }
        const fields = pgn.fields as Record<string, any>;
        const src = pgn.src;
        const items = mapper(fields, src);
        if (!items.length) {
            return;
        }

        const byContext: Record<string, DeltaValue[]> = {};
        for (const item of items) {
            const ctx = item.context || SELF_CONTEXT;
            (byContext[ctx] = byContext[ctx] || []).push({ path: item.path, value: item.value });
        }

        const ts = new Date().toISOString();
        for (const context of Object.keys(byContext)) {
            const values = byContext[context];
            const source = {
                label: 'nmea-2000',
                type: 'NMEA2000',
                src,
                pgn: pgn.pgn,
            };
            this.applyToTree(context, values, ts, `${pgn.pgn}.${src ?? ''}`);
            this.broadcast({ context, updates: [{ source, timestamp: ts, values }] });
        }
    }

    private applyToTree(context: string, values: DeltaValue[], timestamp: string, sourceLabel: string): void {
        const [root, ...rest] = contextToTreePath(context);
        if (!this.tree[root]) {
            this.tree[root] = {};
        }
        const subRootKey = rest.join('.');
        if (!this.tree[root][subRootKey]) {
            this.tree[root][subRootKey] = {};
        }
        for (const v of values) {
            setByPath(this.tree[root][subRootKey], v.path, {
                value: v.value,
                timestamp,
                $source: sourceLabel,
            });
        }
    }

    private broadcast(delta: SignalKDelta): void {
        if (!this.clients.size) {
            return;
        }
        const payload = JSON.stringify(delta);
        for (const ws of this.clients) {
            if (ws.readyState === 1 /* OPEN */) {
                try {
                    ws.send(payload);
                } catch {
                    // ignore
                }
            }
        }
    }

    private handleHttp(req: IncomingMessage, res: ServerResponse): void {
        const url = req.url || '/';
        // CORS: SignalK is commonly consumed from browsers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        if (req.method === 'OPTIONS') {
            res.statusCode = 204;
            res.end();
            return;
        }

        if (req.method === 'GET' && (url === '/signalk' || url === '/signalk/')) {
            this.sendJson(res, 200, this.discoveryDocument(req));
            return;
        }

        if (url.startsWith('/signalk/v1/api')) {
            if (req.method === 'GET') {
                this.handleRestGet(url, res);
                return;
            }
            if (req.method === 'PUT' && this.config.signalKBidirectional) {
                this.handleRestPut(url, req, res);
                return;
            }
        }

        res.statusCode = 404;
        res.end('Not found');
    }

    private discoveryDocument(req: IncomingMessage): any {
        const host = (req.headers.host || `localhost`).replace(/\[|\]/g, '');
        return {
            endpoints: {
                v1: {
                    version: '1.0.0',
                    'signalk-http': `http://${host}/signalk/v1/api/`,
                    'signalk-ws': `ws://${host}/signalk/v1/stream`,
                },
            },
            server: {
                id: this.serverId,
                version: this.serverVersion,
            },
        };
    }

    private handleRestGet(url: string, res: ServerResponse): void {
        // strip /signalk/v1/api(/rest)
        const tail = url.replace(/^\/signalk\/v1\/api\/?/, '');
        const cleanTail = tail.split('?')[0].split('#')[0];
        if (!cleanTail) {
            this.sendJson(res, 200, this.tree);
            return;
        }
        const segments = cleanTail.split('/').filter(Boolean);
        const node = getByPath(this.tree, segments);
        if (node === undefined) {
            res.statusCode = 404;
            res.end();
            return;
        }
        this.sendJson(res, 200, node);
    }

    private handleRestPut(url: string, req: IncomingMessage, res: ServerResponse): void {
        const tail = url.replace(/^\/signalk\/v1\/api\/?/, '');
        const cleanTail = tail.split('?')[0].split('#')[0];
        // vessels/self/<path>
        const segments = cleanTail.split('/').filter(Boolean);
        if (segments.length < 3 || segments[0] !== 'vessels' || segments[1] !== 'self') {
            res.statusCode = 400;
            res.end('Only vessels/self PUT supported');
            return;
        }
        const path = segments.slice(2).join('.');
        this.readJson(req, (err, body) => {
            if (err) {
                res.statusCode = 400;
                res.end(err.message);
                return;
            }
            const value = body?.value !== undefined ? body.value : body;
            this.applyIncomingWrite(path, value);
            this.sendJson(res, 200, { state: 'COMPLETED', statusCode: 200 });
        });
    }

    private readJson(req: IncomingMessage, cb: (err: Error | null, body?: any) => void): void {
        let data = '';
        req.on('data', chunk => {
            data += chunk;
            if (data.length > 65536) {
                req.destroy();
                cb(new Error('Body too large'));
            }
        });
        req.on('end', () => {
            try {
                cb(null, data ? JSON.parse(data) : {});
            } catch (e) {
                cb(e as Error);
            }
        });
        req.on('error', e => cb(e));
    }

    private handleWs(ws: WebSocket, _req: IncomingMessage): void {
        this.clients.add(ws);
        const hello = {
            name: 'iobroker-nmea',
            version: this.serverVersion,
            timestamp: new Date().toISOString(),
            self: SELF_CONTEXT,
            roles: ['master', 'main'],
        };
        try {
            ws.send(JSON.stringify(hello));
        } catch {
            // ignore
        }
        ws.on('close', () => this.clients.delete(ws));
        ws.on('error', () => this.clients.delete(ws));
        ws.on('message', raw => {
            if (!this.config.signalKBidirectional) {
                return;
            }
            try {
                const text = rawToString(raw);
                const msg = JSON.parse(text) as IncomingDelta;
                this.processIncomingDelta(msg);
            } catch (e) {
                this.adapter.log.debug(`SignalK: invalid WS message: ${(e as Error).message}`);
            }
        });
    }

    private processIncomingDelta(msg: IncomingDelta): void {
        if (msg.put) {
            this.applyIncomingWrite(msg.put.path, msg.put.value);
            return;
        }
        if (!msg.updates) {
            return;
        }
        for (const upd of msg.updates) {
            if (!upd.values) {
                continue;
            }
            for (const v of upd.values) {
                this.applyIncomingWrite(v.path, v.value);
            }
        }
    }

    private applyIncomingWrite(path: string, value: any): void {
        const mapper = REVERSE_MAPPERS[path];
        if (mapper) {
            const mapped = mapper(value);
            if (!mapped) {
                this.adapter.log.debug(`SignalK: unsupported value for ${path}: ${JSON.stringify(value)}`);
                return;
            }
            if ('stateId' in mapped) {
                void this.adapter
                    .setState(mapped.stateId, mapped.value, false)
                    .catch(e => this.adapter.log.warn(`SignalK: cannot write state ${mapped.stateId}: ${e}`));
                return;
            }
            if ('pgn' in mapped) {
                this.writePgn(mapped.pgn);
                return;
            }
        }

        // Environment paths → emit PGN 130312/130313/130314 on the bus as simulated sources
        const envPgn = this.environmentDeltaToPgn(path, value);
        if (envPgn) {
            this.writePgn(envPgn);
            return;
        }

        this.adapter.log.debug(`SignalK: no reverse mapping for path ${path}`);
    }

    private environmentDeltaToPgn(path: string, value: any): WritePgnData | null {
        if (typeof value !== 'number') {
            return null;
        }
        // Outside air temperature (Kelvin in SignalK, Kelvin in N2K)
        if (path === 'environment.outside.temperature') {
            return this.buildTemperaturePgn(value, 'Outside Temperature');
        }
        if (path === 'environment.inside.temperature') {
            return this.buildTemperaturePgn(value, 'Inside Temperature');
        }
        if (path === 'environment.water.temperature') {
            return this.buildTemperaturePgn(value, 'Sea Temperature');
        }
        if (path === 'environment.outside.humidity') {
            return this.buildHumidityPgn(value * 100, 'Outside');
        }
        if (path === 'environment.inside.humidity') {
            return this.buildHumidityPgn(value * 100, 'Inside');
        }
        if (path === 'environment.outside.pressure') {
            return this.buildPressurePgn(value, 'Atmospheric');
        }
        return null;
    }

    private buildTemperaturePgn(kelvin: number, source: string): WritePgnData {
        // SignalK sends temperature in Kelvin (SI); pass through as-is, guarding against accidental Celsius input.
        const v = Math.round(kelvin < 200 ? kelvin + 273.15 : kelvin);
        return {
            dst: 255,
            prio: 2,
            pgn: 130312,
            fields: {
                sid: 0,
                instance: 0,
                source: source,
                actualTemperature: v,
                setTemperature: 0,
                reserved: 0,
            },
            src: this.simulateAddress,
        };
    }

    private buildHumidityPgn(percent: number, source: string): WritePgnData {
        return {
            dst: 255,
            prio: 2,
            pgn: 130313,
            fields: {
                sid: 0,
                instance: 0,
                source: source,
                actualHumidity: Math.round(percent),
                setHumidity: 0,
                reserved: 0,
            },
            src: this.simulateAddress,
        };
    }

    private buildPressurePgn(pascal: number, source: string): WritePgnData {
        return {
            dst: 255,
            prio: 2,
            pgn: 130314,
            fields: {
                sid: 0,
                instance: 0,
                source: source,
                pressure: Math.round(pascal),
                reserved: 0,
            },
            src: this.simulateAddress,
        };
    }

    private sendJson(res: ServerResponse, status: number, body: any): void {
        res.statusCode = status;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(body));
    }
}
