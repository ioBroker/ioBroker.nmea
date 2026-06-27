export type PGNFieldEntry = {
    Order: number;
    Id: string;
    Name: string;
    Description: string;
    BitLength: number;
    BitOffset: number;
    BitStart: number;
    Resolution: number;
    Signed: boolean;
    RangeMin: number;
    RangeMax: number;
    FieldType:
        | 'NUMBER'
        | 'LOOKUP'
        | 'RESERVED'
        | 'STRING_FIX'
        | 'STRING_LAU'
        | 'DATE'
        | 'TIME'
        | 'MMSI'
        | 'INDIRECT_LOOKUP'
        | 'BINARY'
        | 'SPARE';
    LookupEnumeration?: string;
};
export type PGNEntry = {
    PGN: number;
    Id: string;
    Description: string;
    Explanation: string;
    Type: 'Single' | 'ISO';
    Complete: boolean;
    FieldCount: number;
    Length: number;
    TransmissionIrregular: boolean;
    Fields: PGNFieldEntry[];
};

export type PGNLookupEnumeration = {
    Name: string;
    MaxValue: number;
    EnumValues: { Name: string; Value: number }[];
};

export type PGNType = {
    PGNs: PGNEntry[];
    LookupEnumerations: PGNLookupEnumeration[];
};

/** Kind of value a simulated source emits (selects the PGN family). */
export type SimulateType = 'temperature' | 'humidity' | 'pressure' | 'tank';

export interface SimulateItem {
    /** ioBroker state ID whose value is read and forwarded to the bus. */
    oid: string;
    type: SimulateType;
    /** NMEA enum name forwarded 1:1 into the PGN (e.g. "Outside Temperature", "Fuel"). */
    subType: string;
    /** Tank PGN 127505 instance (0..13). Ignored for non-tank rows. */
    instance?: number;
    /** Tank total capacity in liters (PGN 127505 Capacity). Ignored for non-tank rows. */
    capacity?: number;
}

export interface NmeaConfig extends ioBroker.AdapterConfig {
    serialPort: string;
    type: 'ngt1' | 'picanm' | 'ydwg';
    ydwgIp: string;
    ydwgPort: string | number;
    ydwgProtocol: 'udp' | 'tcp';
    canPort: string;
    updateAtLeastEveryMs: number;
    magneticVariation: string;
    simulationEnabled: false;
    combinedEnvironment: false;
    simulate: SimulateItem[];
    simulateAddress: number;
    approximateMs: number;
    applyGpsTimeZoneToSystem: false;
    deleteAisAfter: number;
    pressureAlertDiff: number;
    pressureAlertMinutes: number;
    signalKEnabled: boolean;
    signalKPort: number;
    signalKBidirectional: boolean;

    /**
     * Optional foreign state ID providing a boat position as a "lat;lon" string or as a JSON
     * `{ lat, lon }`. When set, the anchor-alarm watcher uses this state in preference to the
     * NMEA-decoded GNSS position — handy when the boat carries an aux GPS that publishes to a
     * different adapter, or to feed the alarm from a non-NMEA source. Empty string ⇒ NMEA only.
     */
    auxPosition?: string;
    /**
     * Optional foreign state ID providing a chain length in meters as a number or numeric string.
     * When set, the anchor-alarm watcher uses this state in preference to the fixed chain length configured in the adapter settings — handy when the chain length is variable (e.g. a windlass with a rotary encoder). Empty string ⇒ fixed length from settings only.
     */
    chainLength?: string;
    /**
     * Optional ioBroker instance to receive anchor-alarm notifications (e.g. "telegram.0",
     * "pushover.0"). The adapter calls `sendTo(<instance>, <text>)` when the alarm triggers.
     * Empty / "0" / unset ⇒ notifications disabled.
     */
    notificationInstance?: string;

    // ── NMEA-2000 Address Claim / device announcement ───────────────────────────────────
    // When true, the adapter periodically broadcasts ISO Address Claim (PGN 60928), Product
    // Information (PGN 126996), and a Raymarine-style Device Identification (PGN 126720)
    // so the autopilot / chart-plotter recognises us as a known controller. Useful when
    // some commands (typically Wind-Datum / advanced PGN-126208 group functions) get
    // silently dropped by the autopilot because the source address isn't claimed.
    announceDevice?: boolean;
    announceSrc?: number; // CAN source address used for both announcement and outbound commands. Default 7.
    announceUniqueNumber?: number; // 21-bit unique number for the NAME field. Default 12345.
    announceManufacturerCode?: number; // 11-bit. Default 2046 (reserved/unassigned — fine for a private adapter).
    announceProductCode?: number; // uint16. Default 0xC001.
    announceModelId?: string; // up to 32 chars. Default "ioBroker.nmea".
    announceRaymarineDeviceId?: number; // Raymarine-proprietary device byte for PGN 126720 ("S100" = 0x03). 0 disabled.
}

export interface PGNMessage {
    pgn: number;
}

export interface WritePgnData {
    dst: number;
    prio: number;
    pgn: number;
    fields: {
        sid: number;
        [key: string]: number | string;
    };
    src: number;
}

export interface PgnDataEvent {
    pgn: number;
    src: number;
    fields: {
        SID: number;
        'Wind Angle': number;
        'Wind Speed': number;
        Reference: string;
        Latitude: number;
        Longitude: number;
        Source: string;
        Pressure: number;
        Temperature: number;
        'Temperature Source': string;
        'Actual Temperature': number;
        [key: string]: number | string;
    };
}
