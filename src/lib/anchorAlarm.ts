// Anchor-alarm watcher. Owns four states under the `anchorAlarm` channel and decides whether
// the boat has drifted outside the configured radius of the drop point. Position input comes
// either from a user-configured foreign state (`config.auxPosition`) or from the adapter's own
// NMEA GNSS pipeline — whichever arrives first wins; if both are present the foreign source
// takes precedence (it's explicitly opt-in).
//
// States created (all under `<namespace>.anchorAlarm.*`):
//   - isActive       boolean  RW   — operator-armed flag
//   - isAlarm        boolean  R    — backend-set output; latched once tripped while armed
//   - alarmRadius    number   RW   — radius in metres
//   - anchorPosition string   RW   — "lat;lon" — anchor reference point
//
// Behaviour:
//   - When `isActive` is flipped from false → true and no anchor reference is known (neither
//     `anchorPosition` nor a tracker-supplied one — see below), the current boat fix is captured
//     and written to `anchorPosition`.
//   - On every fresh position fix, while armed and with a valid radius + anchor, distance is
//     computed by haversine. If `dist > radius` the alarm latches on; it stays on until the
//     operator disarms (`isActive = false`). Latching matters because a boat at the edge of the
//     swing circle would otherwise toggle the alarm every few metres of wave motion.
//   - Disarming clears `isAlarm`. The widget UI can re-arm to reset.
//
// AnchorTracker integration:
//   - When the tracker is active (`anchor.info.active === true`) OR the alarm's own
//     `anchorPosition` is empty, the alarm uses the tracker's `anchor.bottom.position` as the
//     anchor reference. If no bottom yet, it falls back to `anchor.drop.position`. This lets
//     the chain-length-driven drop event automatically become the alarm's reference point
//     without the operator having to manually press a "set anchor here" button.

import type { I18n } from '@iobroker/adapter-core';
import type { NmeaConfig } from '../types';
import { haversine } from './anchorTracker';

/** Accept "lat;lon" / "lat,lon" strings, JSON `{lat, lon}` objects, or `[lat, lon]` arrays. */
function parseLatLon(val: unknown): { lat: number; lon: number } | null {
    if (val == null) {
        return null;
    }
    if (typeof val === 'string') {
        // Try JSON first — the aux source may publish structured data; fall back to the
        // "lat;lon" / "lat,lon" string form used elsewhere in the adapter.
        const trimmed = val.trim();
        if (!trimmed) {
            return null;
        }
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            try {
                return parseLatLon(JSON.parse(trimmed));
            } catch {
                // fall through
            }
        }
        const parts = trimmed.split(/[;,]/).map(s => s.trim());
        if (parts.length !== 2) {
            return null;
        }
        const lat = parseFloat(parts[0]);
        const lon = parseFloat(parts[1]);
        if (!isFinite(lat) || !isFinite(lon)) {
            return null;
        }
        return { lat, lon };
    }
    if (Array.isArray(val) && val.length >= 2) {
        const lat = Number(val[0]);
        const lon = Number(val[1]);
        if (!isFinite(lat) || !isFinite(lon)) {
            return null;
        }
        return { lat, lon };
    }
    if (typeof val === 'object') {
        const o = val as Record<string, unknown>;
        const lat = Number(o.lat ?? o.latitude);
        const lon = Number(o.lon ?? o.lng ?? o.longitude);
        if (!isFinite(lat) || !isFinite(lon)) {
            return null;
        }
        return { lat, lon };
    }
    return null;
}

export class AnchorAlarm {
    private adapter: ioBroker.Adapter;
    /** Translator. Pass the I18n singleton from `@iobroker/adapter-core` after `I18n.init()`. */
    private readonly i18n: typeof I18n;
    /** Configured aux-position foreign state, or null when we should use NMEA. */
    private readonly auxPositionStateId: string | null;
    /** Configured notification target instance (e.g. "telegram.0"), or null when disabled. */
    private readonly notificationInstance: string | null;

    private active = false;
    private alarmRadius: number | null = null;
    private anchorLat: number | null = null;
    private anchorLon: number | null = null;
    private boatLat: number | null = null;
    private boatLon: number | null = null;
    /** Latched alarm output — cleared on disarming only. */
    private alarmLatched = false;

    // Mirror of the AnchorTracker's published state. The alarm consumes these to derive its
    // effective anchor reference — see `effectiveAnchorPosition()`. All three states are
    // written by the tracker with ack=true, so the onStateChange path reads them regardless
    // of ack.
    private trackerActive = false;
    private trackerBottomLat: number | null = null;
    private trackerBottomLon: number | null = null;
    private trackerDropLat: number | null = null;
    private trackerDropLon: number | null = null;

    constructor(adapter: ioBroker.Adapter, config: NmeaConfig, i18n: typeof I18n) {
        this.adapter = adapter;
        this.i18n = i18n;
        const aux = typeof config.auxPosition === 'string' ? config.auxPosition.trim() : '';
        this.auxPositionStateId = aux || null;
        // jsonConfig's "instance" type yields strings like "telegram.0"; default is the literal
        // "0" / "" when nothing was picked. Strip a leading "system.adapter." in case the user
        // picker handed us the full object ID instead of the bare form sendTo expects.
        const notif =
            typeof config.notificationInstance === 'string'
                ? config.notificationInstance.replace(/^system\.adapter\./, '').trim()
                : '';
        this.notificationInstance = notif && notif !== '0' ? notif : null;
    }

    async start(): Promise<void> {
        // Hydrate runtime state from whatever the user/adapter last persisted. Skipping this
        // would reset the alarm after the every adapter restart, which is wrong for an unattended
        // anchor watch left running overnight.
        const isActiveState = await this.adapter.getStateAsync('anchorAlarm.isActive');
        this.active = isActiveState?.val === true;
        const radiusState = await this.adapter.getStateAsync('anchorAlarm.alarmRadius');
        if (typeof radiusState?.val === 'number' && isFinite(radiusState.val)) {
            this.alarmRadius = radiusState.val;
        }
        const anchorState = await this.adapter.getStateAsync('anchorAlarm.anchorPosition');
        const anchor = parseLatLon(anchorState?.val);
        if (anchor) {
            this.anchorLat = anchor.lat;
            this.anchorLon = anchor.lon;
        }
        const alarmFlagState = await this.adapter.getStateAsync('anchorAlarm.isAlarm');
        this.alarmLatched = alarmFlagState?.val === true;

        await this.adapter.subscribeStatesAsync('anchorAlarm.isActive');
        await this.adapter.subscribeStatesAsync('anchorAlarm.alarmRadius');
        await this.adapter.subscribeStatesAsync('anchorAlarm.anchorPosition');

        // AnchorTracker outputs we consume. Read the current values up front so the alarm has a
        // usable reference immediately after restart, then subscribe for live updates. These are
        // owned by AnchorTracker — the alarm only reads.
        const trackerActiveState = await this.adapter.getStateAsync('anchor.info.active');
        this.trackerActive = trackerActiveState?.val === true;
        const trackerBottom = parseLatLon((await this.adapter.getStateAsync('anchor.bottom.position'))?.val);
        if (trackerBottom) {
            this.trackerBottomLat = trackerBottom.lat;
            this.trackerBottomLon = trackerBottom.lon;
        }
        const trackerDrop = parseLatLon((await this.adapter.getStateAsync('anchor.drop.position'))?.val);
        if (trackerDrop) {
            this.trackerDropLat = trackerDrop.lat;
            this.trackerDropLon = trackerDrop.lon;
        }
        await this.adapter.subscribeStatesAsync('anchor.info.active');
        await this.adapter.subscribeStatesAsync('anchor.bottom.position');
        await this.adapter.subscribeStatesAsync('anchor.drop.position');

        if (this.auxPositionStateId) {
            try {
                await this.adapter.subscribeForeignStatesAsync(this.auxPositionStateId);
                const cur = await this.adapter.getForeignStateAsync(this.auxPositionStateId);
                if (cur) {
                    this.applyExternalPosition(cur.val);
                }
            } catch (e) {
                this.adapter.log.warn(
                    `anchorAlarm: cannot subscribe to aux position state "${this.auxPositionStateId}": ${e instanceof Error ? e.message : String(e)}`,
                );
            }
        }
    }

    /**
     * Called by the adapter whenever an NMEA GNSS PGN produced a fresh fix. Ignored when an
     * aux-position foreign state is configured — that source is the operator's explicit choice,
     * and mixing both would make the alarm fire on whichever stream lags.
     */
    onNmeaPosition(lat: number, lon: number): void {
        if (this.auxPositionStateId) {
            return;
        }
        if (!isFinite(lat) || !isFinite(lon)) {
            return;
        }
        this.boatLat = lat;
        this.boatLon = lon;
        this.evaluate();
    }

    /** Forwarded state changes for own and foreign state subscriptions. */
    async onStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void> {
        if (!state) {
            return;
        }
        if (this.auxPositionStateId && id === this.auxPositionStateId) {
            this.applyExternalPosition(state.val);
            return;
        }
        if (!id.startsWith(`${this.adapter.namespace}.`)) {
            return;
        }
        const short = id.substring(this.adapter.namespace.length + 1);

        // AnchorTracker outputs — backend-written with ack=true, so handled before the
        // ack-based filter that gates anchorAlarm.* operator writes.
        if (short === 'anchor.info.active') {
            this.trackerActive = state.val === true;
            this.evaluate();
            return;
        }
        if (short === 'anchor.bottom.position') {
            const p = parseLatLon(state.val);
            this.trackerBottomLat = p ? p.lat : null;
            this.trackerBottomLon = p ? p.lon : null;
            this.evaluate();
            return;
        }
        if (short === 'anchor.drop.position') {
            const p = parseLatLon(state.val);
            this.trackerDropLat = p ? p.lat : null;
            this.trackerDropLon = p ? p.lon : null;
            this.evaluate();
            return;
        }

        // Operator writes on anchorAlarm.* (ack=false). Backend self-writes are ack=true and
        // would loop right back through here without this filter.
        if (!short.startsWith('anchorAlarm.')) {
            return;
        }
        if (short === 'anchorAlarm.isActive' && !state.ack) {
            await this.handleActiveWrite(state.val === true);
        } else if (short === 'anchorAlarm.alarmRadius' && !state.ack) {
            const v = Number(state.val);
            if (isFinite(v) && v > 0) {
                this.alarmRadius = v;
                await this.adapter.setState('anchorAlarm.alarmRadius', v, true);
                this.evaluate();
            }
        } else if (short === 'anchorAlarm.anchorPosition') {
            const parsed = parseLatLon(state.val);
            if (parsed) {
                this.anchorLat = parsed.lat;
                this.anchorLon = parsed.lon;
                await this.adapter.setState('anchorAlarm.anchorPosition', `${parsed.lat};${parsed.lon}`, true);
                this.evaluate();
            } else if (typeof state.val === 'string' && state.val.trim() === '') {
                // Allow an explicit empty writing to "forget" the anchor — useful when re-dropping.
                this.anchorLat = null;
                this.anchorLon = null;
                await this.adapter.setState('anchorAlarm.anchorPosition', '', true);
            }
        }
    }

    private async handleActiveWrite(armed: boolean): Promise<void> {
        this.active = armed;
        // Snapshot only when no anchor reference is available from any source — neither operator-
        // set `anchorPosition` nor a tracker bottom/drop position. The tracker, when it has data,
        // is preferred over snapshotting the live boat position.
        if (armed && this.effectiveAnchorPosition() == null) {
            if (this.boatLat != null && this.boatLon != null) {
                this.anchorLat = this.boatLat;
                this.anchorLon = this.boatLon;
                await this.adapter.setState('anchorAlarm.anchorPosition', `${this.anchorLat};${this.anchorLon}`, true);
            } else {
                this.adapter.log.warn(
                    'anchorAlarm: armed without a known position fix — alarm will not evaluate until a position arrives',
                );
            }
        }
        await this.adapter.setState('anchorAlarm.isActive', armed, true);
        if (!armed) {
            await this.setAlarm(false);
        }
        this.evaluate();
    }

    /**
     * Choose the anchor reference point. Tracker output (bottom > drop) wins when the tracker is
     * active OR when the operator hasn't set `anchorPosition` — the latter case lets the tracker
     * serve as a default when present, while still letting the operator override with an explicit
     * value when the tracker is dormant.
     */
    private effectiveAnchorPosition(): { lat: number; lon: number } | null {
        const trackerHasBottom = this.trackerBottomLat != null && this.trackerBottomLon != null;
        const trackerHasDrop = this.trackerDropLat != null && this.trackerDropLon != null;
        const trackerHasAnything = trackerHasBottom || trackerHasDrop;
        const alarmHasAnchor = this.anchorLat != null && this.anchorLon != null;

        if (trackerHasAnything && (this.trackerActive || !alarmHasAnchor)) {
            if (trackerHasBottom) {
                return { lat: this.trackerBottomLat as number, lon: this.trackerBottomLon as number };
            }
            return { lat: this.trackerDropLat as number, lon: this.trackerDropLon as number };
        }
        if (alarmHasAnchor) {
            return { lat: this.anchorLat as number, lon: this.anchorLon as number };
        }
        return null;
    }

    private applyExternalPosition(val: unknown): void {
        const parsed = parseLatLon(val);
        if (!parsed) {
            return;
        }
        this.boatLat = parsed.lat;
        this.boatLon = parsed.lon;
        this.evaluate();
    }

    private evaluate(): void {
        if (!this.active) {
            return;
        }
        if (this.alarmRadius == null || this.alarmRadius <= 0) {
            return;
        }
        if (this.boatLat == null || this.boatLon == null) {
            return;
        }
        const anchor = this.effectiveAnchorPosition();
        if (!anchor) {
            return;
        }
        const dist = haversine(anchor.lat, anchor.lon, this.boatLat, this.boatLon);
        void this.setAlarm(dist > this.alarmRadius);
    }

    private async setAlarm(flag: boolean): Promise<void> {
        if (this.alarmLatched === flag) {
            return;
        }
        this.alarmLatched = flag;
        await this.adapter.setState('anchorAlarm.isAlarm', flag, true);
        if (flag) {
            this.adapter.log.warn('Anchor alarm triggered — boat is outside the configured radius');
            await this.sendNotification();
        }
    }

    /**
     * Push the alarm event to the configured notification instance (telegram / pushover etc.).
     * Sends a plain string — both supported adapters accept that; richer payloads (titles,
     * priorities) would need per-adapter shaping, which isn't worth the complexity here.
     * Silent no-op when no instance is configured.
     */
    private async sendNotification(): Promise<void> {
        if (!this.notificationInstance) {
            return;
        }
        const anchor = this.effectiveAnchorPosition();
        const distance =
            anchor && this.boatLat != null && this.boatLon != null
                ? haversine(anchor.lat, anchor.lon, this.boatLat, this.boatLon)
                : null;
        // %s placeholders kept simple: radius first, then current distance. Both rounded for
        // readability; the precise distance is already published on `anchorAlarm.isAlarm`'s
        // event chain via the state itself.
        const text =
            distance != null
                ? this.i18n.t(
                      'Anchor alarm: boat is %s m from the anchor (radius %s m).',
                      String(Math.round(distance)),
                      String(Math.round(this.alarmRadius ?? 0)),
                  )
                : this.i18n.t('Anchor alarm: boat is outside the configured radius.');
        try {
            await this.adapter.sendToAsync(this.notificationInstance, text);
        } catch (e) {
            this.adapter.log.warn(
                `anchorAlarm: cannot send notification via ${this.notificationInstance}: ${e instanceof Error ? e.message : String(e)}`,
            );
        }
    }
}
