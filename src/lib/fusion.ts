import { encodeActisense } from '@canboat/canboatjs/dist/stringMsg';
import type { NmeaConfig } from '../types';
import type { GenericDriver } from './genericDriver';
import type { PGN } from '@canboat/ts-pgns';

// Garmin/Fusion entertainment systems speak two proprietary NMEA-2000 PGNs:
//   • PGN 126720 — COMMANDS (controller → stereo). Every frame starts with the 2-byte
//     manufacturer/industry prefix [0xA3,0x99] = Fusion (419) + Marine Industry (4), followed
//     by a 16-bit little-endian "message id" and the command-specific payload.
//   • PGN 130820 — STATUS (stereo → controller). Same prefix, then a 16-bit "Message ID"
//     (values ≥ 0x8000, decoded by canboat into the string labels matched below) and the
//     status payload (track/artist/album/volume/mute/power/…).
//
// We DECODE 130820 through the adapter's existing canboatjs FromPgn parser (fields arrive as
// camelCase ids, lookups as their string label) and we SEND 126720 as raw byte buffers via
// `encodeActisense` — exactly the transport the autopilot uses, which is known to work on the
// real gateways. The field-name-based canboat encoder cannot reliably resolve the proprietary
// 126720 sub-variants, so hand-built byte frames are the robust choice here.
//
// The whole thing is surfaced as a standard ioBroker `mediaPlayer.*` device so the generic
// media widgets / device-manager recognise it.

// 2-byte Fusion manufacturer (419) + Marine industry (4) prefix, little-endian.
const FUSION_PREFIX = [0xa3, 0x99];

// PGN 126720 message ids (FUSION_MESSAGE_ID).
const MSG_REQUEST_STATUS = 0x01;
const MSG_SET_SOURCE = 0x02;
const MSG_MEDIA_COMMAND = 0x03;
const MSG_SET_MUTE = 0x11;
const MSG_SET_ZONE_VOLUME = 0x18;
const MSG_POWER = 0x1c;

// FUSION_COMMAND (media transport).
const CMD_PLAY = 0x01;
const CMD_PAUSE = 0x02;
const CMD_NEXT = 0x04;
const CMD_PREV = 0x06;

// FUSION_MUTE_COMMAND / FUSION_POWER_STATE.
const MUTE_ON = 0x01;
const MUTE_OFF = 0x02;
const POWER_ON = 0x01;
const POWER_OFF = 0x02;

// Fusion zone volume is reported / accepted as 0..24 on the NMEA-2000 bus. The ioBroker
// `level.volume` role is a percentage, so we scale between the two.
const FUSION_VOLUME_MAX = 24;

// Play-state numbers used for `mediaPlayer.state` (matches the common ioBroker convention).
const STATE_STOP = 0;
const STATE_PAUSE = 1;
const STATE_PLAY = 2;

type StateDef = {
    id: string;
    name: string;
    role: string;
    type: ioBroker.CommonType;
    write: boolean;
    read?: boolean;
    unit?: string;
    min?: number;
    max?: number;
    states?: Record<number, string>;
};

// All states live under the `mediaPlayer` channel. Read-only info states + writable controls.
const STATE_DEFS: StateDef[] = [
    {
        id: 'state',
        name: 'Play state',
        role: 'media.state',
        type: 'number',
        write: true,
        states: { [STATE_STOP]: 'stop', [STATE_PAUSE]: 'pause', [STATE_PLAY]: 'play' },
    },
    { id: 'play', name: 'Play', role: 'button.play', type: 'boolean', write: true, read: false },
    { id: 'pause', name: 'Pause', role: 'button.pause', type: 'boolean', write: true, read: false },
    { id: 'stop', name: 'Stop', role: 'button.stop', type: 'boolean', write: true, read: false },
    { id: 'next', name: 'Next track', role: 'button.next', type: 'boolean', write: true, read: false },
    { id: 'prev', name: 'Previous track', role: 'button.prev', type: 'boolean', write: true, read: false },
    { id: 'mute', name: 'Mute', role: 'media.mute', type: 'boolean', write: true },
    { id: 'volume', name: 'Volume', role: 'level.volume', type: 'number', write: true, unit: '%', min: 0, max: 100 },
    { id: 'power', name: 'Power', role: 'switch.power', type: 'boolean', write: true },
    { id: 'title', name: 'Title', role: 'media.title', type: 'string', write: false },
    { id: 'artist', name: 'Artist', role: 'media.artist', type: 'string', write: false },
    { id: 'album', name: 'Album', role: 'media.album', type: 'string', write: false },
    { id: 'duration', name: 'Track duration', role: 'media.duration', type: 'number', write: false, unit: 'sec' },
    { id: 'elapsed', name: 'Track elapsed', role: 'media.elapsed', type: 'number', write: false, unit: 'sec' },
    { id: 'source', name: 'Active source id', role: 'media.input', type: 'number', write: true },
    { id: 'sourceName', name: 'Active source', role: 'media.player.type', type: 'string', write: false },
    { id: 'playerName', name: 'Device name', role: 'media.player.name', type: 'string', write: false },
    { id: 'connected', name: 'Reachable', role: 'indicator.reachable', type: 'boolean', write: false },
];

export default class Fusion {
    private readonly adapter: ioBroker.Adapter;

    private readonly config: NmeaConfig;

    private readonly nmeaDriver: GenericDriver;

    /** CAN source address of the Fusion stereo on the bus — destination of every command. */
    private readonly dst: number;

    /** CAN source address used as `src` in outbound frames (shared with the announce/autopilot setting). */
    private readonly src: number;

    /** Currently selected source id, learned from status — needed as a parameter of media commands. */
    private activeSourceId = 0;

    private lastSeen = 0;

    private reachable: boolean | null = null;

    private currentState: number | null = null;

    private currentMute: boolean | null = null;

    // Per-zone volume support. Fusion exposes up to 4 independent zones; we learn how many the
    // unit actually has (and their display names) from the "Zone Name" status, and surface one
    // `mediaPlayer.zones.zoneN` level.volume state per configured zone.
    private readonly zoneNames = new Map<number, string>();

    private zoneCount = 0;

    private readonly createdZones = new Set<number>();

    private keepAlive: ioBroker.Interval | undefined;

    constructor(adapter: ioBroker.Adapter, config: NmeaConfig, nmeaDriver: GenericDriver, fusionAddress: number) {
        this.adapter = adapter;
        this.config = config;
        this.nmeaDriver = nmeaDriver;
        this.dst = fusionAddress;

        const cfgSrc = parseInt(config.announceSrc as unknown as string, 10);
        this.src = isFinite(cfgSrc) && cfgSrc > 0 && cfgSrc < 252 ? cfgSrc : 7;
    }

    async start(): Promise<void> {
        await this.adapter.setObjectNotExistsAsync('mediaPlayer', {
            type: 'device',
            common: {
                name: 'Fusion media player',
                role: 'media.music',
            },
            native: {
                // Persist the stereo's bus address so commands keep working straight after an
                // adapter restart, before the first status frame is received again.
                src: this.dst,
            },
        });

        for (const def of STATE_DEFS) {
            const common: ioBroker.StateCommon = {
                name: def.name,
                type: def.type,
                role: def.role,
                read: def.read !== false,
                write: def.write,
            };
            if (def.unit !== undefined) {
                common.unit = def.unit;
            }
            if (def.min !== undefined) {
                common.min = def.min;
            }
            if (def.max !== undefined) {
                common.max = def.max;
            }
            if (def.states) {
                common.states = def.states;
            }
            await this.adapter.setObjectNotExistsAsync(`mediaPlayer.${def.id}`, {
                type: 'state',
                common,
                native: {},
            });
        }

        // Container for the per-zone volume states. The concrete `zones.zoneN` states are created
        // lazily once the stereo tells us which zones exist (see ensureZone / onPGN).
        await this.adapter.setObjectNotExistsAsync('mediaPlayer.zones', {
            type: 'channel',
            common: { name: 'Volume zones' },
            native: {},
        });

        this.adapter.subscribeStates('mediaPlayer.*');

        // Ask the stereo to dump its full status so the states get populated immediately, and keep
        // refreshing periodically — also doubles as the reachability heartbeat.
        this.requestStatus();
        this.keepAlive = this.adapter.setInterval(() => {
            this.requestStatus();
            if (this.lastSeen && Date.now() - this.lastSeen > 70000 && this.reachable !== false) {
                this.reachable = false;
                void this.adapter.setState('mediaPlayer.connected', false, true);
            }
        }, 30000);
    }

    stop(): void {
        this.adapter.unsubscribeStates('mediaPlayer.*');
        if (this.keepAlive) {
            this.adapter.clearInterval(this.keepAlive);
            this.keepAlive = undefined;
        }
    }

    // ───────────────────────────── outbound: state writes → PGN 126720 ─────────────────────────────
    onStateChange(id: string, state?: ioBroker.State | null): void {
        if (!state || state.ack) {
            return;
        }
        if (!id.startsWith(`${this.adapter.namespace}.mediaPlayer.`) && !id.includes('.mediaPlayer.')) {
            return;
        }
        const sub = id.split('.').pop();
        switch (sub) {
            case 'play':
                this.mediaCommand(CMD_PLAY, 'Play');
                break;
            case 'pause':
                this.mediaCommand(CMD_PAUSE, 'Pause');
                break;
            case 'stop':
                // Fusion has no transport "stop" over NMEA — pause is the closest equivalent.
                this.mediaCommand(CMD_PAUSE, 'Stop→Pause');
                break;
            case 'next':
                this.mediaCommand(CMD_NEXT, 'Next');
                break;
            case 'prev':
                this.mediaCommand(CMD_PREV, 'Prev');
                break;
            case 'state': {
                const v = parseInt(state.val as string, 10);
                if (v === STATE_PLAY) {
                    this.mediaCommand(CMD_PLAY, 'Play');
                } else if (v === STATE_PAUSE || v === STATE_STOP) {
                    this.mediaCommand(CMD_PAUSE, 'Pause');
                }
                break;
            }
            case 'mute': {
                const on = state.val === true || state.val === 'true' || state.val === 1 || state.val === '1';
                this.send('SetMute', [...FUSION_PREFIX, MSG_SET_MUTE, 0x00, on ? MUTE_ON : MUTE_OFF]);
                break;
            }
            case 'power': {
                const on = state.val === true || state.val === 'true' || state.val === 1 || state.val === '1';
                this.send('SetPower', [...FUSION_PREFIX, MSG_POWER, 0x00, on ? POWER_ON : POWER_OFF]);
                break;
            }
            case 'volume':
                // Primary volume controls the main zone (index 0).
                this.sendZoneVolume(0, state.val);
                break;
            case 'source': {
                const sourceId = parseInt(state.val as string, 10);
                if (!isFinite(sourceId)) {
                    return;
                }
                this.send('SetSource', [...FUSION_PREFIX, MSG_SET_SOURCE, 0x00, sourceId & 0xff]);
                break;
            }
            default: {
                // Per-zone volume: `mediaPlayer.zones.zoneN` → Set Zone Volume for zone index N-1.
                const zoneMatch = sub?.match(/^zone(\d+)$/);
                if (zoneMatch) {
                    this.sendZoneVolume(parseInt(zoneMatch[1], 10) - 1, state.val);
                }
                break;
            }
        }
    }

    private sendZoneVolume(zoneIndex: number, value: ioBroker.StateValue): void {
        const pct = parseFloat(value as string);
        if (!isFinite(pct)) {
            return;
        }
        const vol = Fusion.pctToFusion(Math.max(0, Math.min(100, pct)));
        this.send(`SetZoneVolume[${zoneIndex}]`, [
            ...FUSION_PREFIX,
            MSG_SET_ZONE_VOLUME,
            0x00,
            zoneIndex & 0xff,
            vol & 0xff,
        ]);
    }

    private mediaCommand(command: number, label: string): void {
        this.send(label, [...FUSION_PREFIX, MSG_MEDIA_COMMAND, 0x00, this.activeSourceId & 0xff, command & 0xff]);
    }

    private requestStatus(): void {
        this.send('RequestStatus', [...FUSION_PREFIX, MSG_REQUEST_STATUS, 0x00]);
    }

    private send(label: string, bytes: number[]): void {
        const data = encodeActisense({
            prio: 6,
            pgn: 126720,
            src: this.src,
            dst: this.dst,
            data: Buffer.from(bytes),
        });
        this.adapter.log.debug(`[fusion → 0x${this.dst.toString(16)}] ${label}: ${data.trim()}`);
        this.nmeaDriver.write(data);
    }

    // Create (or relabel) the `mediaPlayer.zones.zoneN` volume state for a 1-based zone number.
    private async ensureZone(zoneNo: number, name?: string): Promise<void> {
        const stateId = `mediaPlayer.zones.zone${zoneNo}`;
        if (this.createdZones.has(zoneNo)) {
            if (name) {
                await this.adapter.extendObjectAsync(stateId, { common: { name } });
            }
            return;
        }
        this.createdZones.add(zoneNo);
        await this.adapter.setObjectNotExistsAsync(stateId, {
            type: 'state',
            common: {
                name: name || `Zone ${zoneNo}`,
                type: 'number',
                role: 'level.volume',
                unit: '%',
                min: 0,
                max: 100,
                read: true,
                write: true,
            },
            native: { zone: zoneNo - 1 },
        });
    }

    private static fusionToPct(raw: number): number {
        return Math.max(0, Math.min(100, Math.round((raw / FUSION_VOLUME_MAX) * 100)));
    }

    private static pctToFusion(pct: number): number {
        return Math.max(0, Math.min(FUSION_VOLUME_MAX, Math.round((pct / 100) * FUSION_VOLUME_MAX)));
    }

    // ───────────────────────────── inbound: PGN 130820 status → states ─────────────────────────────
    async onPGN(data: PGN): Promise<void> {
        const fields = data.fields as Record<string, any> | undefined;
        if (!fields) {
            return;
        }

        // Any status frame proves the stereo is alive.
        this.lastSeen = Date.now();
        if (this.reachable !== true) {
            this.reachable = true;
            await this.adapter.setState('mediaPlayer.connected', true, true);
        }

        // canboat decodes the 16-bit "Message ID" into these string labels.
        const messageId = fields.messageId as string | number;

        switch (messageId) {
            case 'Source':
                // Active source (sourceType + name). currentSourceId is what media commands target.
                if (typeof fields.currentSourceId === 'number') {
                    this.activeSourceId = fields.currentSourceId;
                    await this.adapter.setState('mediaPlayer.source', this.activeSourceId, true);
                } else if (typeof fields.sourceId === 'number') {
                    this.activeSourceId = fields.sourceId;
                }
                if (fields.sourceType !== undefined) {
                    await this.adapter.setState('mediaPlayer.sourceName', String(fields.sourceType), true);
                } else if (fields.source !== undefined) {
                    await this.adapter.setState('mediaPlayer.sourceName', String(fields.source), true);
                }
                break;

            case 'Track Info':
                // The combined media status: play state + track number/count + length + position.
                if (typeof fields.sourceId === 'number') {
                    this.activeSourceId = fields.sourceId;
                }
                await this.applyPlayStatus(fields.flags);
                {
                    const len = Fusion.parseDuration(fields.length);
                    if (len !== null) {
                        await this.adapter.setState('mediaPlayer.duration', len, true);
                    }
                    const pos = Fusion.parseDuration(fields.positionInTrack);
                    if (pos !== null) {
                        await this.adapter.setState('mediaPlayer.elapsed', pos, true);
                    }
                }
                break;

            case 'Track Title':
                await this.adapter.setState('mediaPlayer.title', Fusion.str(fields.track), true);
                break;

            case 'Track Artist':
                await this.adapter.setState('mediaPlayer.artist', Fusion.str(fields.artist), true);
                break;

            case 'Track Album':
                await this.adapter.setState('mediaPlayer.album', Fusion.str(fields.album), true);
                break;

            case 'Track Progress': {
                const prog = Fusion.parseDuration(fields.progress);
                if (prog !== null) {
                    await this.adapter.setState('mediaPlayer.elapsed', prog, true);
                }
                break;
            }

            case 'Mute': {
                const muted = fields.mute === 'Mute On' || fields.mute === MUTE_ON;
                if (this.currentMute !== muted) {
                    this.currentMute = muted;
                    await this.adapter.setState('mediaPlayer.mute', muted, true);
                }
                break;
            }

            case 'Zone Name': {
                // The stereo enumerates its configured zones (the same list the MFD shows). Use the
                // COUNT of names as the authoritative zone count and the names as labels. We map the
                // names by ascending index → zone1..N, so it works whether the unit indexes its
                // zones 0-based or 1-based.
                const num = fields.number;
                if (typeof num === 'number' && isFinite(num)) {
                    this.zoneNames.set(num, Fusion.str(fields.name));
                    this.zoneCount = this.zoneNames.size;
                    const keys = [...this.zoneNames.keys()].sort((a, b) => a - b);
                    for (let pos = 0; pos < keys.length; pos++) {
                        await this.ensureZone(pos + 1, this.zoneNames.get(keys[pos]) || undefined);
                    }
                }
                break;
            }

            case 'Volume': {
                // Per-zone volumes (zone1..zone4, 0..24 on the bus → %). Limit to the zones the unit
                // actually has when we know the count; otherwise expose every zone that reports a
                // valid value (unused zones report "unknown" and are decoded as null/undefined).
                const limit = this.zoneCount || 4;
                for (let n = 1; n <= 4 && n <= limit; n++) {
                    const raw = fields[`zone${n}`];
                    if (typeof raw !== 'number' || !isFinite(raw)) {
                        continue;
                    }
                    await this.ensureZone(n);
                    await this.adapter.setState(`mediaPlayer.zones.zone${n}`, Fusion.fusionToPct(raw), true);
                }
                // The primary `volume` mirrors zone 1 (the main zone). Bus update → ack:true.
                if (typeof fields.zone1 === 'number' && isFinite(fields.zone1)) {
                    await this.adapter.setState('mediaPlayer.volume', Fusion.fusionToPct(fields.zone1), true);
                }
                break;
            }

            case 'Power': {
                const on = fields.state === 'On' || fields.state === POWER_ON;
                await this.adapter.setState('mediaPlayer.power', on, true);
                if (!on && this.currentState !== STATE_STOP) {
                    this.currentState = STATE_STOP;
                    await this.adapter.setState('mediaPlayer.state', STATE_STOP, true);
                }
                break;
            }

            case 'Unit Name':
                if (fields.name !== undefined) {
                    await this.adapter.setState('mediaPlayer.playerName', Fusion.str(fields.name), true);
                }
                break;

            default:
                // All other Fusion status variants (tuner, EQ, SiriusXM, settings, …) are ignored
                // for the media-player abstraction.
                break;
        }
    }

    private async applyPlayStatus(flags: unknown): Promise<void> {
        let newState: number | null = null;
        if (flags === 'Playing' || flags === 1) {
            newState = STATE_PLAY;
        } else if (flags === 'Paused' || flags === 2) {
            newState = STATE_PAUSE;
        } else if (flags === 'Stopped' || flags === 'Invalid' || flags === 3 || flags === 0) {
            newState = STATE_STOP;
        }
        if (newState !== null && newState !== this.currentState) {
            this.currentState = newState;
            await this.adapter.setState('mediaPlayer.state', newState, true);
        }
    }

    private static str(v: unknown): string {
        if (v === undefined || v === null) {
            return '';
        }
        if (typeof v === 'string') {
            return v;
        }
        if (typeof v === 'number' || typeof v === 'boolean') {
            return String(v);
        }
        return JSON.stringify(v);
    }

    // canboat renders DURATION fields as "HH:MM:SS" (optionally "<n> days, HH:MM:SS"). Convert to
    // whole seconds for the numeric media.duration / media.elapsed states; tolerate raw numbers.
    private static parseDuration(v: unknown): number | null {
        if (typeof v === 'number') {
            return isFinite(v) ? Math.round(v) : null;
        }
        if (typeof v !== 'string') {
            return null;
        }
        let s = v.trim();
        if (!s) {
            return null;
        }
        let days = 0;
        const dm = s.match(/(\d+)\s*days?,?\s*/i);
        if (dm) {
            days = parseInt(dm[1], 10);
            s = s.replace(dm[0], '').trim();
        }
        const parts = s.split(':').map(p => parseInt(p, 10));
        if (parts.some(p => isNaN(p))) {
            return null;
        }
        let sec: number;
        if (parts.length === 3) {
            sec = parts[0] * 3600 + parts[1] * 60 + parts[2];
        } else if (parts.length === 2) {
            sec = parts[0] * 60 + parts[1];
        } else if (parts.length === 1) {
            sec = parts[0];
        } else {
            return null;
        }
        return days * 86400 + sec;
    }
}
