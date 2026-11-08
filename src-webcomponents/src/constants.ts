/**
 * The web components of the NMEA adapter. Each one is built on its own (`vite build --mode <name>`, see
 * `vite.config.ts`), so that each is ONE module file: a host imports exactly one URL per component.
 */

/** Name of a component: the mode of its build and the base name of its files */
export type ComponentName =
    | 'wind'
    | 'history-chart'
    | 'autopilot'
    | 'ais-radar'
    | 'anchor-position'
    | 'instrument'
    | 'compass'
    | 'rudder';

export const COMPONENT_NAMES: ComponentName[] = [
    'wind',
    'history-chart',
    'autopilot',
    'ais-radar',
    'anchor-position',
    'instrument',
    'compass',
    'rudder',
];

/** Tag of a component: `<iob-nmea-wind>`, ... */
export function getTag(name: ComponentName): string {
    return `iob-nmea-${name}`;
}

/** The built module, next to its manifest */
export function getModuleFile(name: ComponentName): string {
    return `${name}.js`;
}

/** The manifest the build writes next to the module; `common.webComponents` names this one */
export function getManifestFile(name: ComponentName): string {
    return `${name}.json`;
}

/** Where `tasks.mts` puts the module in the admin folder; the React import is relative to it */
export function getModulePath(name: ComponentName): string {
    return `webcomponents/${getModuleFile(name)}`;
}

/** The settings every component of an instance has: e.g. `nmea.0` */
export type InstanceSettings = {
    instance?: string;
};

/** `<iob-nmea-wind>`, like the devices widget `NmeaWindComponent` */
export type WindSettings = InstanceSettings & {
    /** Seconds of apparent wind shown as a heat map, 0 = none */
    historySeconds?: number;
    /** Half angle of the close-hauled bands at the bow */
    closeHauledAngle?: number;
    speedUnit?: 'knots' | 'm/s' | 'km/h';
    showSail?: boolean;
};

/** `<iob-nmea-history-chart>`, like the devices widget `NmeaHistoryChartComponent` */
export type HistoryChartSettings = {
    stateId?: string;
    /** Empty: the name of the state */
    label?: string;
    /** Empty: the unit of the state */
    unit?: string;
    historySeconds?: number;
    yMin?: number;
    yMax?: number;
    autoScale?: boolean;
    showMin?: boolean;
    showAvg?: boolean;
    showMax?: boolean;
    decimals?: number;
    /** Empty: the primary color of the theme */
    color?: string;
};

/** `<iob-nmea-autopilot>`, like the devices widget `NmeaAutopilotComponent` */
export type AutopilotSettings = InstanceSettings & {
    showAwa?: boolean;
    showRudder?: boolean;
};

/** `<iob-nmea-ais-radar>`, like the devices widget `NmeaAisRadarComponent` */
export type AisRadarSettings = InstanceSettings & {
    rangeNm?: number;
    staleMinutes?: number;
    showVectors?: boolean;
    vectorMinutes?: number;
    courseUp?: boolean;
    ownMmsi?: string;
};

/** `<iob-nmea-anchor-position>`, like the devices widget `NmeaAnchorPositionComponent` */
export type AnchorPositionSettings = InstanceSettings & {
    /** A state with "lat;lon"; empty: `<instance>.anchorAlarm.anchorPosition` unless lat/lon are given */
    anchorPosition?: string;
    anchorLat?: string;
    anchorLon?: string;
    /** Empty: `<instance>.gnssPositionData.latitude` */
    positionLat?: string;
    /** Empty: `<instance>.gnssPositionData.longitude` */
    positionLon?: string;
    chainLength?: string;
    depthAtDrop?: string;
    mapStyle?: 'osm' | 'satellite';
};

/** How many values `<iob-nmea-instrument>` can show, one after the other */
export const INSTRUMENT_VALUES = 4;

/** `<iob-nmea-instrument>`, like the vis-2 widget "Instrument": `oid1`, `name1`, ... `oid4`, `name4`, ... */
export type InstrumentSettings = Record<string, string | number | boolean | undefined>;

/** `<iob-nmea-compass>`: the "Navigation" window of the vis-2 widget "Complex" */
export type CompassSettings = InstanceSettings & {
    showRudder?: boolean;
};

/** `<iob-nmea-rudder>`: the "Rudder" window of the vis-2 widget "Complex" */
export type RudderSettings = InstanceSettings & {
    /** Empty: from `common.min`/`common.max` of the state, else 50 */
    rudderMinMax?: number;
    rudderZoomAt?: number;
    rudderZoomDelay?: number;
};
