/**
 * Pure helpers shared by the components: angles, the polar coordinates of the dials, positions on the earth and
 * the formatting of numbers. The same calculations as in the native widgets (`src-devices/src/`).
 */

export const DEG_TO_RAD = Math.PI / 180;

/** The adapter writes speeds in knots, AIS reports them in m/s */
export const MS_TO_KN = 1.9438444924574;

export const M_PER_NM = 1852;

const EARTH_RADIUS_M = 6_371_000;

/** 0..360 */
export function normDeg(deg: number): number {
    return ((deg % 360) + 360) % 360;
}

/** -180..180 */
export function signedDeg(deg: number): number {
    const d = normDeg(deg);
    return d > 180 ? d - 360 : d;
}

/** The smallest angle between two bearings, 0..180 */
export function angularDiff(a: number, b: number): number {
    const d = normDeg(a - b);
    return d > 180 ? 360 - d : d;
}

/**
 * A point of a dial in compass convention: 0° up, clockwise
 *
 * @param cx center x
 * @param cy center y
 * @param r radius
 * @param deg bearing
 */
export function polar(cx: number, cy: number, r: number, deg: number): { x: number; y: number } {
    const a = deg * DEG_TO_RAD;
    return { x: cx + r * Math.sin(a), y: cy - r * Math.cos(a) };
}

/** An annular sector between two bearings */
export function sectorPath(cx: number, cy: number, rInner: number, rOuter: number, from: number, to: number): string {
    const sweep = normDeg(to - from);
    const largeArc = sweep > 180 ? 1 : 0;
    const p1 = polar(cx, cy, rOuter, from);
    const p2 = polar(cx, cy, rOuter, to);
    const p3 = polar(cx, cy, rInner, to);
    const p4 = polar(cx, cy, rInner, from);
    return `M ${p1.x} ${p1.y} A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${p2.x} ${p2.y} L ${p3.x} ${p3.y} A ${rInner} ${rInner} 0 ${largeArc} 0 ${p4.x} ${p4.y} Z`;
}

/** An arc between two bearings, clockwise */
export function arcPath(cx: number, cy: number, r: number, from: number, to: number): string {
    const sweep = normDeg(to - from);
    const p1 = polar(cx, cy, r, from);
    const p2 = polar(cx, cy, r, to);
    return `M ${p1.x} ${p1.y} A ${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${p2.x} ${p2.y}`;
}

/**
 * Keeps the angles of rotating parts continuous, so a CSS transition from 359° to 1° turns by 2° and not back
 * by 358°: every new value is taken as the equivalent within ±180° of the last one
 */
export class AngleUnwrapper {
    readonly #angles = new Map<string, number>();

    /**
     * The angle to draw for this value
     *
     * @param key which rotating part
     * @param target the new angle; null keeps the last one
     */
    get(key: string, target: number | null | undefined): number {
        const current = this.#angles.get(key);
        if (target === null || target === undefined || !Number.isFinite(target)) {
            return current ?? 0;
        }
        if (current === undefined) {
            this.#angles.set(key, target);
            return target;
        }
        const next = current + signedDeg(target - current);
        this.#angles.set(key, next);
        return next;
    }
}

/** A number of a state, or null */
export function toNumber(val: ioBroker.StateValue | undefined): number | null {
    if (val === null || val === undefined || val === '') {
        return null;
    }
    const n = typeof val === 'string' ? parseFloat(val.replace(',', '.')) : Number(val);
    return Number.isFinite(n) ? n : null;
}

/**
 * A number with fixed decimals and the decimal separator of the system; `—` without a value
 *
 * @param val the number
 * @param decimals digits after the separator
 * @param comma true if the system writes `1,5`
 */
export function formatNum(val: number | null | undefined, decimals: number, comma: boolean): string {
    if (val === null || val === undefined || !Number.isFinite(val)) {
        return '—';
    }
    const s = val.toFixed(decimals);
    return comma ? s.replace('.', ',') : s;
}

/** A bearing with three digits: `007` */
export function pad3(deg: number | null | undefined): string {
    if (deg === null || deg === undefined || !Number.isFinite(deg)) {
        return '---';
    }
    return (Math.round(normDeg(deg)) % 360).toString().padStart(3, '0');
}

/**
 * Meters east and north of a reference point - an equirectangular projection, accurate to centimeters over the
 * distances of a radar or an anchorage
 */
export function projectToMeters(
    lat: number,
    lon: number,
    refLat: number,
    refLon: number,
): { east: number; north: number } {
    const meanLat = (lat + refLat) * 0.5 * DEG_TO_RAD;
    return {
        east: (lon - refLon) * DEG_TO_RAD * Math.cos(meanLat) * EARTH_RADIUS_M,
        north: (lat - refLat) * DEG_TO_RAD * EARTH_RADIUS_M,
    };
}

/** The great-circle distance in meters */
export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const dLat = (lat2 - lat1) * DEG_TO_RAD;
    const dLon = (lon2 - lon1) * DEG_TO_RAD;
    const a =
        Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) * Math.sin(dLon / 2) ** 2;
    return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** The 16 points of the compass, as the vis-2 widget shows them under the course */
const POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

export function compassPoint(deg: number | null | undefined): string {
    if (deg === null || deg === undefined || !Number.isFinite(deg)) {
        return '--';
    }
    return POINTS[Math.round(normDeg(deg) / 22.5) % 16];
}
