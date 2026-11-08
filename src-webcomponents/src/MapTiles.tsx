/**
 * A slippy map without a map library: the tiles of a tile server as `<image>` elements of an SVG, placed in the
 * user units of the drawing around it. The native widgets use Leaflet for this; a radar and an anchorage need no
 * more than a static picture that follows the boat, so the module stays small.
 *
 * Web Mercator is conformal: at the latitude of the center, one meter east and one meter north are the same number
 * of units, so targets projected with `projectToMeters()` lie on the right place of the map.
 */
import type { JSX } from 'react';

import { DEG_TO_RAD } from './nautic';

/** Meters per pixel of a 256 px tile at zoom 0 on the equator */
const MERCATOR_M_PER_PX = 156543.03392;

export interface TileSource {
    /**
     * The URL of a tile
     *
     * @param z zoom
     * @param x column
     * @param y row
     */
    url: (z: number, x: number, y: number) => string;
    maxZoom: number;
    /** The copyright the tile server asks for */
    attribution: string;
}

/**
 * The tile servers of the native widgets. All of them work without an API key (CARTO answers every tile with
 * "API KEY REQUIRED" now).
 */
export const TILE_SOURCES: Record<'dark' | 'street' | 'satellite', TileSource> = {
    /** The AIS radar: Esri Dark Gray. Above zoom 16 it has no tiles, only "Map data not yet available" */
    dark: {
        url: (z: number, x: number, y: number): string =>
            `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/${z}/${y}/${x}`,
        maxZoom: 16,
        attribution: '© Esri, HERE, Garmin, © OpenStreetMap contributors',
    },
    /** The anchor position, "Map": OpenStreetMap, whose tile policy asks for this attribution to be visible */
    street: {
        url: (z: number, x: number, y: number): string => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors',
    },
    /** The anchor position, "Satellite": Esri World Imagery */
    satellite: {
        url: (z: number, x: number, y: number): string =>
            `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
        maxZoom: 19,
        attribution: '© Esri',
    },
};

export interface MapTilesProps {
    source: TileSource;
    /** The point of the map at (cx, cy) */
    lat: number;
    lon: number;
    cx: number;
    cy: number;
    /** The scale of the drawing */
    metersPerUnit: number;
    /** The part of the drawing to cover, in user units */
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    /** Only the tiles that touch this circle around (cx, cy) */
    radius?: number;
    /**
     * A tile is about this many user units wide, up to twice of it: big enough to read, few enough to load fast
     */
    tileUnits?: number;
}

/** The tiles that cover a part of a drawing */
export function MapTiles(props: MapTilesProps): JSX.Element | null {
    const { source, lat, lon, cx, cy, metersPerUnit } = props;
    const tileUnits = props.tileUnits || 400;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !(metersPerUnit > 0) || Math.abs(lat) > 85) {
        return null;
    }
    const cosLat = Math.cos(lat * DEG_TO_RAD);
    // the zoom at which a tile is between `tileUnits` and twice of it wide
    let z = Math.floor(Math.log2((256 * MERCATOR_M_PER_PX * cosLat) / (metersPerUnit * tileUnits)));
    z = Math.max(1, Math.min(source.maxZoom, z));
    const tiles = 2 ** z;
    // user units per pixel of a tile
    const scale = (MERCATOR_M_PER_PX * cosLat) / tiles / metersPerUnit;
    const size = 256 * scale;
    // the center in pixels of the whole world at this zoom
    const sinLat = Math.sin(lat * DEG_TO_RAD);
    const px = ((lon + 180) / 360) * 256 * tiles;
    const py = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * 256 * tiles;

    const toTileX = (ux: number): number => Math.floor((px + (ux - cx) / scale) / 256);
    const toTileY = (uy: number): number => Math.floor((py + (uy - cy) / scale) / 256);
    const images: JSX.Element[] = [];
    for (let ty = Math.max(0, toTileY(props.y0)); ty <= Math.min(tiles - 1, toTileY(props.y1)); ty++) {
        for (let tx = toTileX(props.x0); tx <= toTileX(props.x1); tx++) {
            const x = cx + (tx * 256 - px) * scale;
            const y = cy + (ty * 256 - py) * scale;
            if (props.radius) {
                // the point of the tile nearest to the center
                const nx = Math.max(x, Math.min(cx, x + size));
                const ny = Math.max(y, Math.min(cy, y + size));
                if ((nx - cx) ** 2 + (ny - cy) ** 2 > props.radius ** 2) {
                    continue;
                }
            }
            const column = ((tx % tiles) + tiles) % tiles;
            images.push(
                <image
                    key={`${z}/${column}/${ty}/${tx}`}
                    href={source.url(z, column, ty)}
                    x={x}
                    y={y}
                    // a little overlap, so no hairline shows between the tiles
                    width={size + 0.6}
                    height={size + 0.6}
                    preserveAspectRatio="none"
                />,
            );
        }
    }
    return <g className="tiles">{images}</g>;
}
