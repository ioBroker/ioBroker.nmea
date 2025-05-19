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

export interface NmeaConfig extends ioBroker.AdapterConfig {
    serialPort: string;
    type: string;
    canPort: string;
    updateAtLeastEveryMs: number;
    magneticVariation: string;
    simulationEnabled: false;
    combinedEnvironment: false;
    simulate: {
        oid: string;
        type: 'temperature' | 'humidity' | 'pressure';
        subType: string;
    }[];
    simulateAddress: number;
    approximateMs: number;
    applyGpsTimeZoneToSystem: false;
    deleteAisAfter: number;
    pressureAlertDiff: number;
    pressureAlertMinutes: number;
}

export interface PGNMessage {
    pgn: number;
}

export interface WritePgnData {
    dst: number;
    prio: number;
    pgn: number;
    fields: {
        SID: number;
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
