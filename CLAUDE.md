# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`ioBroker.nmea` is an ioBroker adapter that bridges NMEA-2000/NMEA-0183 marine buses into ioBroker states. It supports several gateway hardwares (Actisense NGT-1/NGX-1, Raspberry Pi + PiCAN-M, Yacht Devices YDWG/YDEN) and exposes vis-2 widgets plus a device-manager component.

## Commands

All commands run from the repo root unless noted.

- `npm run build` — full build: TS backend (`build/`) + widget bundle (`widgets/nmea/`). Runs `build:ts` then `build:gui`.
- `npm run build:ts` — compile TypeScript backend via `tsconfig.build.json` and copy i18n.
- `npm run build:gui` — run `tasks.mts`, which triggers `npm install` inside `src-widgets/`, a Vite build, and copies the output into `widgets/nmea/`.
- `npm run lint` — ESLint on backend (flat config) and widgets. Must also run inside `src-widgets/` (the script does this).
- `npm test` — mocha against `test/*.engine.js` (package sanity + adapter startup via `@iobroker/legacy-testing`).
- `npm run test:integration` — mocha against `test/*.gui.js` (widget integration via `@iobroker/vis-2-widgets-testing`, uses a running js-controller + admin + web).
- `npm run test:package` — mocha on `test/package.test.js` only.
- `npm run npm` — install deps in root, `src-widgets/`, and `src-devices/` (needed after pulling).
- `npm run update-packages` — bump deps in all three package.json with `npm-check-updates`.
- `npm run release[-patch|-minor|-major]` — `@alcalzone/release-script` (tags + publishes via GitHub Actions).

Running a single backend test: `npx mocha test/testAdapter.engine.js --exit` (integration variant: `npx mocha test/widgets.gui.js --exit`). CI enables `DEBUG=testing:*` for integration runs.

## Architecture

The repo builds **three separate bundles** that ship together:

1. **Backend adapter** (`src/` → `build/`, entry `build/main.js`).
   - `src/main.ts` is the `NmeaAdapter` class. It opens one of several driver implementations and feeds raw bytes/packets into `@canboat/canboatjs`'s `FromPgn` parser, then maps PGN fields to ioBroker states using `src/lib/metaData.ts` (unit/role/radians/rounding/magnetic-variation rules). It also handles AIS grouping, simulated environment PGN emission, autopilot control, GPS→timezone (`geo-tz` + `sudo timedatectl`), and pressure-trend alerting.
   - Drivers live in `src/lib/` and all extend `GenericDriver` (`genericDriver.ts`): `ngt1.ts` (Actisense USB serial), `picanM.ts` (Raspberry Pi CAN socket), `ydwg.ts` (Yacht Devices YDWG/YDEN over TCP/UDP). `main.ts` instantiates exactly one based on adapter config.
   - Autopilot support is pluggable via `AutoPilot` (`autoPilot.ts`): currently `seaTalkAutoPilot.ts` (Raymarine, working) and `navicoAutopilot.ts` (Simrad/Navico/B&G, incomplete). The base class creates the `autoPilot.*` channel/states; subclasses translate state writes into PGN frames and send them through the active driver.
   - SignalK server (`signalK.ts`) is optional and off by default (toggled by `signalKEnabled`). When enabled, `main.ts` feeds every parsed PGN into `SignalKServer.onPGN()`, which applies an internal PGN→delta mapping, updates its in-memory `vessels.self` tree (plus `vessels.urn:mrn:imo:mmsi:*` for AIS), and broadcasts to WebSocket clients. It exposes `GET /signalk` (discovery), `GET /signalk/v1/api/...` (tree snapshots), `PUT /signalk/v1/api/vessels/self/...` and `WS /signalk/v1/stream`. When `signalKBidirectional` is true, incoming delta/PUT writes are routed through `REVERSE_MAPPERS` (autopilot paths → `autoPilot.*` state writes, environment paths → synthesized 130312/130313/130314 PGNs written via the active driver). Port defaults to 3000. No auth.
   - PGN definitions come from `@canboat/ts-pgns/canboat.json` (loaded at startup). AIS PGNs are matched against `WELL_KNOWN_AIS_GROUPS` to build per-vessel channels keyed by MMSI.

2. **vis-2 widgets** (`src-widgets/` → `widgets/nmea/` via module federation).
   - Vite + `@module-federation/vite`; federation name `vis2Nmea`, output `customWidgets.js`. Exposes `./Nmea` (composite boat dashboard), `./Instrument` (single-value instrument), and `./translations`.
   - Widgets extend `Generic` (`src-widgets/src/Generic.tsx`), the project's local base class over `@iobroker/types-vis-2`.
   - `tasks.mts` orchestrates the widget build: deletes `src-widgets/build/` and `widgets/`, runs `npm install` + Vite build inside `src-widgets/`, then `copyAllFiles()` filters out `index.html`, MF manifest, and the big shared vendor chunks (except the specific echarts/spectrum/uiw/sketch chunks the runtime needs) into `widgets/nmea/`.

3. **Device-manager component** (`src-devices/` → its own federated bundle).
   - Federation name `DevicesWidgetNmeaSet`, output `customDevices.js`. Currently exposes only `NmeaWindComponent` via `Components.tsx`. `src-devices/src/index.tsx` is a stub ("used only for simulation") — the real entry points are the federated exposes.

### Cross-cutting notes

- **Three package.jsons**: root (adapter runtime deps), `src-widgets/` (React/MUI/vis-2), `src-devices/` (React/dm-utils/dm-widgets). Always install via `npm run npm` after a fresh clone or a root `npm i`.
- **Node ≥ 20** (engines). CI matrixes 20/22/24 on Ubuntu.
- **i18n flow**: source JSON lives in `src/i18n/` and `src-widgets/src/i18n/` and `admin/i18n/`. Backend i18n is copied into `build/i18n/` by `tasks.mts --copy-i18n` (invoked from `build:ts`). Use `npm run translate` (`translate-adapter`) to sync languages. Supported languages come from the moment locales loaded in `main.ts`.
- **Admin UI** is JSON-config only (`admin/jsonConfig.json`, no React admin bundle).
- **Release**: tagging `vX.Y.Z` on a push triggers `ioBroker/testing-action-deploy` which re-builds and publishes to npm with trusted publishing. `.releaseconfig.json` configures the release-script plugins (iobroker + license).
