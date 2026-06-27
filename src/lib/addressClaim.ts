// NMEA-2000 device announcement.
//
// Broadcasts ISO Address Claim (PGN 60928), Product Information (PGN 126996), and a
// Raymarine-style Device Identification (PGN 126720) so the autopilot / chart-plotter
// recognises this adapter as a known controller. Without this, some autopilots silently
// reject group-function commands (e.g. PGN 126208 → 65345 Pilot Wind Datum) coming from
// an unclaimed source address — observed against a Raymarine SmartPilot driven by a p70:
// mode/heading commands from src=7 worked, the wind-datum command did not.
//
// Schedule:
//   • PGN 60928 (Address Claim) — once on start, then re-broadcast every 60 s as a refresh.
//   • PGN 126996 (Product Information) — initially after ~500 ms (let the claim settle),
//     then every 10 s.
//   • PGN 126720 (Raymarine Device Identification) — every 2 s when enabled, mimicking
//     what the p70 does on the bus.
//
// All frames use the same src (the configured / claimed address). dst = 255 (broadcast).

import { encodeActisense } from '@canboat/canboatjs/dist/stringMsg';
import type { GenericDriver } from './genericDriver';

export interface AddressClaimConfig {
    /** CAN source address. Same value should be used by everything we transmit. */
    src: number;
    /** 21-bit unique number for the NAME field. Defaults to 12345. */
    uniqueNumber?: number;
    /** 11-bit manufacturer code. Defaults to 2046 (reserved / unassigned — safe for private use). */
    manufacturerCode?: number;
    /** 8-bit device function. Default 130 ("PC Gateway"). */
    deviceFunction?: number;
    /** 7-bit device class. Default 25 ("Internetwork device"). */
    deviceClass?: number;
    /** 3-bit industry group. Default 4 (Marine). */
    industryGroup?: number;
    /** uint16 product code for PGN 126996. */
    productCode?: number;
    modelId?: string;
    softwareVersion?: string;
    modelVersion?: string;
    modelSerial?: string;
    /**
     * Raymarine-proprietary device byte for the PGN 126720 device-identification frame.
     * The p70 advertises 0x03 ("S100"). Set 0 to disable that frame entirely (we still send
     * the standard 60928 + 126996 announcements, which is enough for any compliant device).
     */
    raymarineDeviceId?: number;
}

export class AddressClaim {
    private intervals: ReturnType<typeof setInterval>[] = [];
    private timeouts: ReturnType<typeof setTimeout>[] = [];
    private name: bigint;

    constructor(
        private adapter: ioBroker.Adapter,
        private driver: GenericDriver,
        private cfg: AddressClaimConfig,
    ) {
        this.name = this.buildName();
    }

    /**
     * Build the 64-bit NMEA-2000 NAME field. Bit layout (LSB → MSB):
     *   [0..20]  Unique Number          (21 bits)
     *   [21..31] Manufacturer Code      (11 bits)
     *   [32..34] Device Instance Lower  (3 bits, 0)
     *   [35..39] Device Instance Upper  (5 bits, 0)
     *   [40..47] Device Function        (8 bits)
     *   [48]     Reserved               (1, must be 1)
     *   [49..55] Device Class           (7 bits)
     *   [56..59] System Instance        (4 bits, 0)
     *   [60..62] Industry Group         (3 bits, 4 = Marine)
     *   [63]     Self-configurable      (1)
     */
    private buildName(): bigint {
        const u = BigInt(this.cfg.uniqueNumber ?? 12345) & BigInt(0x1fffff);
        const mc = BigInt(this.cfg.manufacturerCode ?? 2046) & BigInt(0x7ff);
        const fn = BigInt(this.cfg.deviceFunction ?? 130) & BigInt(0xff);
        const dc = BigInt(this.cfg.deviceClass ?? 25) & BigInt(0x7f);
        const ig = BigInt(this.cfg.industryGroup ?? 4) & BigInt(0x7);
        const ONE = BigInt(1);
        return (
            u |
            (mc << BigInt(21)) |
            // device instance + upper = 0 → bits 32..39 stay 0
            (fn << BigInt(40)) |
            (ONE << BigInt(48)) | // reserved
            (dc << BigInt(49)) |
            // system instance = 0
            (ig << BigInt(60)) |
            (ONE << BigInt(63)) // self-configurable
        );
    }

    private nameToBuffer(): Buffer {
        const buf = Buffer.alloc(8);
        let n = this.name;
        const MASK = BigInt(0xff);
        const SHIFT = BigInt(8);
        for (let i = 0; i < 8; i++) {
            buf[i] = Number(n & MASK);
            n >>= SHIFT;
        }
        return buf;
    }

    start(): void {
        this.adapter.log.info(`[addressClaim] enabled, src=${this.cfg.src}, NAME=0x${this.name.toString(16)}`);
        // Address-Claim immediately so anyone listening can build their device list.
        this.sendAddressClaim();
        this.intervals.push(setInterval(() => this.sendAddressClaim(), 60_000));

        // Product info shortly after (let the claim propagate first).
        this.timeouts.push(setTimeout(() => this.sendProductInfo(), 500));
        this.intervals.push(setInterval(() => this.sendProductInfo(), 10_000));

        if (this.cfg.raymarineDeviceId && this.cfg.raymarineDeviceId !== 0) {
            this.timeouts.push(setTimeout(() => this.sendRaymarineDeviceId(), 1000));
            this.intervals.push(setInterval(() => this.sendRaymarineDeviceId(), 2000));
        }
    }

    stop(): void {
        for (const t of this.intervals) {
            clearInterval(t);
        }
        for (const t of this.timeouts) {
            clearTimeout(t);
        }
        this.intervals = [];
        this.timeouts = [];
    }

    private sendAddressClaim(): void {
        try {
            const data = encodeActisense({
                prio: 6,
                pgn: 60928,
                src: this.cfg.src,
                dst: 255,
                data: this.nameToBuffer(),
            });
            this.driver.write(data);
            this.adapter.log.debug(`[addressClaim] PGN 60928 (Address Claim) src=${this.cfg.src}`);
        } catch (e: any) {
            this.adapter.log.warn(`[addressClaim] sendAddressClaim failed: ${e?.message ?? e}`);
        }
    }

    /**
     * Pad an ASCII string to `len` bytes. NMEA-2000 fixed-length string fields are typically
     * padded with `@` (0x40) per the spec, but most decoders accept null/space padding too —
     * we use `@` for spec compliance.
     */
    private padString(s: string, len: number): Buffer {
        const buf = Buffer.alloc(len, 0x40);
        const ascii = Buffer.from(s.slice(0, len), 'ascii');
        ascii.copy(buf);
        return buf;
    }

    private sendProductInfo(): void {
        try {
            const buf = Buffer.alloc(134);
            buf.writeUInt16LE(2100, 0); // N2K database version 2.100
            buf.writeUInt16LE(this.cfg.productCode ?? 0xc001, 2);
            this.padString(this.cfg.modelId ?? 'ioBroker.nmea', 32).copy(buf, 4);
            this.padString(this.cfg.softwareVersion ?? '0.4.2', 32).copy(buf, 36);
            this.padString(this.cfg.modelVersion ?? '1.0', 32).copy(buf, 68);
            this.padString(this.cfg.modelSerial ?? `iob-${this.cfg.uniqueNumber ?? 12345}`, 32).copy(buf, 100);
            buf.writeUInt8(2, 132); // certification level
            buf.writeUInt8(1, 133); // load equivalency number
            const data = encodeActisense({
                prio: 6,
                pgn: 126996,
                src: this.cfg.src,
                dst: 255,
                data: buf,
            });
            this.driver.write(data);
            this.adapter.log.debug(`[addressClaim] PGN 126996 (Product Information)`);
        } catch (e: any) {
            this.adapter.log.warn(`[addressClaim] sendProductInfo failed: ${e?.message ?? e}`);
        }
    }

    private sendRaymarineDeviceId(): void {
        // Mirrors the on-bus pattern observed from a real Raymarine p70 broadcast:
        //   3B 9F  manufacturerCode = Raymarine (0x73B) + industry group bits
        //   F0 81  proprietaryId = "Seatalk 1 Encoded"
        //   90     command = "Device Identification"
        //   00     reserved
        //   <dev>  device byte (0x03 = S100, 0x05 = Course Computer, 0x10 = …)
        const dev = this.cfg.raymarineDeviceId ?? 0x03;
        const buf = Buffer.from([0x3b, 0x9f, 0xf0, 0x81, 0x90, 0x00, dev]);
        try {
            const data = encodeActisense({
                prio: 7,
                pgn: 126720,
                src: this.cfg.src,
                dst: 255,
                data: buf,
            });
            this.driver.write(data);
        } catch (e: any) {
            this.adapter.log.warn(`[addressClaim] sendRaymarineDeviceId failed: ${e?.message ?? e}`);
        }
    }
}
