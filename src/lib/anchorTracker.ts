// Anchor-drop tracker. Ported from the user's JavaScript-adapter script: when the chain pays
// out, records the GPS position at the moment of drop and a second position once the chain
// length roughly equals the corrected water depth (anchor reached the bottom). Continuously
// publishes distance from the bottom (or drop, while bottom is unknown) to the live boat fix.
//
// States created (under `<namespace>.anchor.*`):
//   - active                 boolean R  — anchor cycle in progress
//   - distanceToAnchor       number  R  — metres from reference to the current fix
//   - text                   string  R  — human-readable status line
//   - drop.{latitude,longitude,position,time,chainLength,depth}
//   - bottom.{latitude,longitude,position,time,chainLength,depth}
//
// Sources:
//   - chainLength: `config.chainLength` (foreign state ID). When empty/missing, the tracker is
//     dormant (everything else still creates the states but no events fire).
//   - depth / offset: local `waterDepth.depth` / `waterDepth.offset` (PGN 128267).
//   - position: NMEA GNSS pipeline via `onNmeaPosition()` called from `processPositionEvent`.
//
// Behaviour mirrors the original script:
//   - chainLength < DROP_THRESHOLD_M ⇒ reset (anchor recovered); zero distance, deactivate.
//   - First time chainLength ≥ DROP_THRESHOLD_M (rising edge) ⇒ snapshot drop, mark active.
//   - First time after that with chainLength ≥ correctedDepth - BOTTOM_TOLERANCE_M ⇒ snapshot
//     bottom. correctedDepth = max(0, depth + offset). offset is the transducer-to-keel/-waterline
//     correction stored alongside depth in PGN 128267.
//   - Internal "saved" flags are derived from persisted state on start, so an adapter restart
//     mid-anchor doesn't re-fire the drop event.

import type { I18n } from '@iobroker/adapter-core';
import type { NmeaConfig } from '../types';

const EARTH_RADIUS_M = 6_371_000;
const RAD = Math.PI / 180;
const DROP_THRESHOLD_M = 1;
const BOTTOM_TOLERANCE_M = 0.5;
// Belt-and-suspenders periodic distance refresh — every position fix already triggers an
// update, but a 10 s tick guards against a stalled GNSS source (still showing the last
// position) so the user can see the live distance not lagging the actual situation.
const DISTANCE_UPDATE_INTERVAL_MS = 10_000;
const MS_TO_KN = 1.9438444924574;
/**
 * Above this SOG the boat is unambiguously making way — at-anchor drift from wind/current is
 * typically ≤ 1 kn; 2.5 kn means the chain is up, regardless of whatever the windlass counter
 * still reports (slack, frozen, miscounted, etc.).
 */
const ANCHOR_RECOVERED_SOG_KN = 2.5;

export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const dLat = (lat2 - lat1) * RAD;
    const dLon = (lon2 - lon1) * RAD;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_RADIUS_M * c;
}

export class AnchorTracker {
    private adapter: ioBroker.Adapter;
    /** Translator. Pass the I18n singleton from `@iobroker/adapter-core` after `I18n.init()`. */
    private readonly i18n: typeof I18n;
    /** Foreign state ID delivering the deployed chain length in metres. */
    private readonly chainLengthStateId: string | null;

    private chainLength = 0;
    private depth = 0;
    private boatLat: number | null = null;
    private boatLon: number | null = null;

    // The two "edge already fired" flags — rehydrated from the persisted drop.* / bottom.*
    // states on start so a mid-anchor restart doesn't re-snapshot.
    private dropSaved = false;
    private bottomSaved = false;

    private distanceInterval: ioBroker.Interval | null | undefined = null;
    /**
     * Guard against concurrent re-entry of checkAnchor() — state setters are async, and we
     *  must not interleave drop / bottom transitions.
     */
    private checkRunning = false;

    constructor(adapter: ioBroker.Adapter, config: NmeaConfig, i18n: typeof I18n) {
        this.adapter = adapter;
        this.i18n = i18n;
        const chain = typeof config.chainLength === 'string' ? config.chainLength.trim() : '';
        this.chainLengthStateId = chain || null;
    }

    async start(): Promise<void> {
        if (!this.chainLengthStateId) {
            this.adapter.log.debug(
                'anchorTracker: no chain-length state configured (config.chainLength is empty) — tracker is dormant',
            );
            return;
        }
        await this.ensureStates();
        await this.hydrate();

        try {
            await this.adapter.subscribeForeignStatesAsync(this.chainLengthStateId);
            const cur = await this.adapter.getForeignStateAsync(this.chainLengthStateId);
            if (cur && typeof cur.val === 'number') {
                this.chainLength = cur.val;
            } else if (cur && cur.val != null) {
                const n = Number(cur.val);
                if (isFinite(n)) {
                    this.chainLength = n;
                }
            }
        } catch (e) {
            this.adapter.log.warn(
                `anchorTracker: cannot subscribe to chain length state "${this.chainLengthStateId}": ${e instanceof Error ? e.message : String(e)}`,
            );
        }

        // Initial water-depth values (in case the PGN already fired before us).
        const depthState = await this.adapter.getStateAsync('waterDepth.waterDepthTrue');
        if (typeof depthState?.val === 'number') {
            this.depth = depthState.val;
        }

        await this.checkAnchor();

        // 10 s safety tick — see DISTANCE_UPDATE_INTERVAL_MS comment.
        this.distanceInterval = this.adapter.setInterval(() => {
            void this.updateDistance();
        }, DISTANCE_UPDATE_INTERVAL_MS);
    }

    stop(): void {
        if (this.distanceInterval) {
            this.adapter.clearInterval(this.distanceInterval);
            this.distanceInterval = null;
        }
    }

    /**
     * Called by the adapter on every NMEA GNSS fix. Cheap — only stores the values and triggers
     *  a distance recomputation. The drop / bottom transitions are driven by chain-length and
     *  depth changes, not by position alone.
     */
    onNmeaPosition(lat: number, lon: number): void {
        if (!isFinite(lat) || !isFinite(lon) || !this.chainLengthStateId) {
            return;
        }
        this.boatLat = lat;
        this.boatLon = lon;
        void this.updateDistance();
    }

    /**
     * Called by the adapter with the corrected water depth (waterDepthTrue = depth + offset).
     * A depth change alone can flip the "bottom reached" condition (chain ≈ depth) without any
     * chain movement, so trigger a full re-check.
     */
    onNmeaDepth(depth: number): void {
        if (!isFinite(depth) || depth < 0 || !this.chainLengthStateId) {
            return;
        }
        this.depth = depth;
        void this.checkAnchor();
    }

    /**
     * Speed-over-ground guard. If the boat is making way faster than ANCHOR_RECOVERED_SOG_KN,
     * the anchor cannot still be deployed — force-reset the operator's chain-length state to 0.
     * The writing loops back through onStateChange and drives the normal "chain recovered" reset
     * path, so all tracker states are cleaned up consistently.
     */
    onNmeaSog(sog: number): void {
        if (!isFinite(sog) || !this.chainLengthStateId) {
            return;
        }
        // PGN frames deliver sog in m/s — convert once for the readable threshold check below.
        const sogKn = sog * MS_TO_KN;
        if (sogKn > ANCHOR_RECOVERED_SOG_KN && this.chainLength > DROP_THRESHOLD_M) {
            this.adapter.log.info(
                `anchorTracker: SOG ${sogKn.toFixed(1)} kn > ${ANCHOR_RECOVERED_SOG_KN} kn — resetting chain length to 0`,
            );
            // ack=false: this is a directive ("the anchor is up, system — please reflect that"),
            // not an authoritative measurement we own.
            void this.adapter
                .setForeignStateAsync(this.chainLengthStateId, 0, false)
                .catch(e =>
                    this.adapter.log.warn(
                        `anchorTracker: cannot reset chain length: ${e instanceof Error ? e.message : String(e)}`,
                    ),
                );
        }
    }

    async onStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void> {
        if (!state || !this.chainLengthStateId) {
            return;
        }
        if (id === this.chainLengthStateId) {
            const v = Number(state.val);
            if (isFinite(v)) {
                this.chainLength = v;
                await this.checkAnchor();
            }
        }
    }

    private async ensureStates(): Promise<void> {
        await this.adapter.setObjectNotExistsAsync('anchor', {
            type: 'device',
            common: { name: 'Anchor drop tracker' },
            native: {},
        });
        await this.adapter.setObjectNotExistsAsync('anchor.drop', {
            type: 'channel',
            common: { name: 'Drop event' },
            native: {},
        });
        await this.adapter.setObjectNotExistsAsync('anchor.info', {
            type: 'channel',
            common: { name: 'Information about anchor' },
            native: {},
        });
        await this.adapter.setObjectNotExistsAsync('anchor.bottom', {
            type: 'channel',
            common: { name: 'Anchor on bottom event' },
            native: {},
        });

        const num = (id: string, name: string, unit?: string): Promise<unknown> =>
            this.adapter.setObjectNotExistsAsync(id, {
                type: 'state',
                common: {
                    name,
                    type: 'number',
                    role: 'value',
                    read: true,
                    write: false,
                    unit,
                    def: 0,
                },
                native: {},
            });
        const str = (id: string, name: string, role = 'text'): Promise<unknown> =>
            this.adapter.setObjectNotExistsAsync(id, {
                type: 'state',
                common: {
                    name,
                    type: 'string',
                    role,
                    read: true,
                    write: false,
                    def: '',
                },
                native: {},
            });

        await this.adapter.setObjectNotExistsAsync('anchor.info.active', {
            type: 'state',
            common: {
                name: 'Anchor cycle active',
                type: 'boolean',
                role: 'indicator',
                read: true,
                write: false,
                def: false,
            },
            native: {},
        });
        await num('anchor.info.distanceToAnchor', 'Distance to anchor', 'm');
        await str('anchor.info.text', 'Last status text');

        await num('anchor.drop.latitude', 'Drop latitude', '°');
        await num('anchor.drop.longitude', 'Drop longitude', '°');
        await str('anchor.drop.position', 'Drop position (lat;lon)', 'value.gps');
        await str('anchor.drop.time', 'Drop timestamp (ISO)', 'date');
        await num('anchor.drop.chainLength', 'Chain length at drop', 'm');
        await num('anchor.drop.depth', 'Corrected depth at drop', 'm');

        await num('anchor.bottom.latitude', 'Bottom latitude', '°');
        await num('anchor.bottom.longitude', 'Bottom longitude', '°');
        await str('anchor.bottom.position', 'Bottom position (lat;lon)', 'value.gps');
        await str('anchor.bottom.time', 'Bottom timestamp (ISO)', 'date');
        await num('anchor.bottom.chainLength', 'Chain length when bottom reached', 'm');
        await num('anchor.bottom.depth', 'Corrected depth when bottom reached', 'm');
    }

    /** Recover `dropSaved` / `bottomSaved` from the persisted state so a restart doesn't re-snapshot. */
    private async hydrate(): Promise<void> {
        const dropLat = await this.adapter.getStateAsync('anchor.drop.latitude');
        const dropLon = await this.adapter.getStateAsync('anchor.drop.longitude');
        const active = await this.adapter.getStateAsync('anchor.info.active');
        const isActive = active?.val === true;
        if (
            isActive &&
            typeof dropLat?.val === 'number' &&
            typeof dropLon?.val === 'number' &&
            (dropLat.val !== 0 || dropLon.val !== 0)
        ) {
            this.dropSaved = true;
        }

        const bottomLat = await this.adapter.getStateAsync('anchor.bottom.latitude');
        const bottomLon = await this.adapter.getStateAsync('anchor.bottom.longitude');
        if (
            isActive &&
            typeof bottomLat?.val === 'number' &&
            typeof bottomLon?.val === 'number' &&
            (bottomLat.val !== 0 || bottomLon.val !== 0)
        ) {
            this.bottomSaved = true;
        }
    }

    private async checkAnchor(): Promise<void> {
        if (this.checkRunning) {
            return;
        }
        this.checkRunning = true;
        try {
            const depthCorrected = Math.max(0, this.depth);

            // Chain fully recovered → reset everything.
            if (this.chainLength < DROP_THRESHOLD_M) {
                if (this.dropSaved || this.bottomSaved) {
                    await this.adapter.setState('anchor.info.active', false, true);
                    await this.adapter.setState('anchor.info.distanceToAnchor', 0, true);
                    await this.adapter.setState('anchor.info.text', this.i18n.t('Anchor recovered / inactive.'), true);
                    this.adapter.log.info('anchorTracker: chain recovered — tracker reset');
                }
                this.dropSaved = false;
                this.bottomSaved = false;
                return;
            }

            // Rising edge: chain just started paying out.
            if (!this.dropSaved && this.chainLength >= DROP_THRESHOLD_M) {
                this.dropSaved = true;
                await this.saveDrop(this.chainLength, depthCorrected);
            }

            // Anchor has reached the bottom: chain ≈ depth (with tolerance).
            if (
                this.dropSaved &&
                !this.bottomSaved &&
                depthCorrected > 0 &&
                this.chainLength >= depthCorrected - BOTTOM_TOLERANCE_M
            ) {
                this.bottomSaved = true;
                await this.saveBottom(this.chainLength, depthCorrected);
            }

            await this.updateDistance();
        } finally {
            this.checkRunning = false;
        }
    }

    private async saveDrop(chainLength: number, depthCorrected: number): Promise<void> {
        if (this.boatLat == null || this.boatLon == null) {
            this.adapter.log.warn('anchorTracker: chain started paying out but no GPS fix yet');
            // Still, mark active so the user knows the cycle is in progress — position will be
            // backfilled when the first fix arrives (next NMEA position event triggers the
            // distance update; the drop position itself is not retroactively recoverable).
            await this.adapter.setState('anchor.info.active', true, true);
            return;
        }
        const time = new Date().toISOString();
        await this.adapter.setState('anchor.drop.latitude', this.boatLat, true);
        await this.adapter.setState('anchor.drop.longitude', this.boatLon, true);
        await this.adapter.setState('anchor.drop.position', `${this.boatLat};${this.boatLon}`, true);
        await this.adapter.setState('anchor.drop.time', time, true);
        await this.adapter.setState('anchor.drop.chainLength', chainLength, true);
        await this.adapter.setState('anchor.drop.depth', depthCorrected, true);
        await this.adapter.setState('anchor.info.active', true, true);
        await this.adapter.setState(
            'anchor.info.text',
            this.i18n.t(
                'Anchor dropped at %s, %s. Depth: %s m.',
                this.boatLat.toFixed(6),
                this.boatLon.toFixed(6),
                depthCorrected.toFixed(1),
            ),
            true,
        );
        this.adapter.log.info(
            `anchorTracker: drop at ${this.boatLat.toFixed(6)},${this.boatLon.toFixed(6)} chain=${chainLength.toFixed(1)}m depth=${depthCorrected.toFixed(1)}m`,
        );
    }

    private async saveBottom(chainLength: number, depthCorrected: number): Promise<void> {
        if (this.boatLat == null || this.boatLon == null) {
            this.adapter.log.warn('anchorTracker: bottom reached but no GPS fix yet');
            return;
        }
        const time = new Date().toISOString();
        await this.adapter.setState('anchor.bottom.latitude', this.boatLat, true);
        await this.adapter.setState('anchor.bottom.longitude', this.boatLon, true);
        await this.adapter.setState('anchor.bottom.position', `${this.boatLat};${this.boatLon}`, true);
        await this.adapter.setState('anchor.bottom.time', time, true);
        await this.adapter.setState('anchor.bottom.chainLength', chainLength, true);
        await this.adapter.setState('anchor.bottom.depth', depthCorrected, true);
        await this.adapter.setState(
            'anchor.info.text',
            this.i18n.t(
                'Anchor likely reached bottom at %s, %s. Chain: %s m, Depth: %s m.',
                this.boatLat.toFixed(6),
                this.boatLon.toFixed(6),
                chainLength.toFixed(1),
                depthCorrected.toFixed(1),
            ),
            true,
        );
        this.adapter.log.info(
            `anchorTracker: bottom at ${this.boatLat.toFixed(6)},${this.boatLon.toFixed(6)} chain=${chainLength.toFixed(1)}m depth=${depthCorrected.toFixed(1)}m`,
        );
    }

    private async updateDistance(): Promise<void> {
        const activeState = await this.adapter.getStateAsync('anchor.info.active');
        if (activeState?.val !== true) {
            // Note: we don't zero the distance here on every tick — that's already done in
            // the reset branch of checkAnchor() when the chain is recovered.
            return;
        }
        if (this.boatLat == null || this.boatLon == null) {
            return;
        }
        // Prefer the bottom position (= actual anchor location). Fall back to the drop position
        // while the bottom hasn't been reached yet — useful for the first ~10-30 s of the cycle.
        const refLat = this.bottomSaved
            ? Number((await this.adapter.getStateAsync('anchor.bottom.latitude'))?.val)
            : Number((await this.adapter.getStateAsync('anchor.drop.latitude'))?.val);
        const refLon = this.bottomSaved
            ? Number((await this.adapter.getStateAsync('anchor.bottom.longitude'))?.val)
            : Number((await this.adapter.getStateAsync('anchor.drop.longitude'))?.val);
        if (!isFinite(refLat) || !isFinite(refLon) || (refLat === 0 && refLon === 0)) {
            return;
        }
        const dist = haversine(refLat, refLon, this.boatLat, this.boatLon);
        await this.adapter.setState('anchor.info.distanceToAnchor', Math.round(dist * 10) / 10, true);
    }
}
