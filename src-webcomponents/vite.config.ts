import react from '@vitejs/plugin-react';
import { checkManifest, getReactImportPath, REACT_SPECIFIERS } from '@iobroker/web-components';
import { readFileSync } from 'node:fs';
import type { Plugin, UserConfig } from 'vite';

// with the extension: Vite may load its config natively, without a bundler that would add it
import { COMPONENT_NAMES, getManifestFile, getModuleFile, getModulePath, type ComponentName } from './src/constants.ts';
import { getManifest } from './src/manifest.ts';
import { NAMES } from './src/names.ts';

/**
 * The web components of the NMEA adapter, `<iob-nmea-wind>`, `<iob-nmea-autopilot>`, ...: one ES module each,
 * `admin/webcomponents/<name>.js`, and its manifest `<name>.json` next to it (`common.webComponents`). Every host -
 * vis-2, devices, Aura, admin - reads them from `/adapter/nmea/webcomponents/`. No module federation: the host
 * shares nothing but the socket.
 *
 * One build per component - `vite build --mode wind`, `vite build --mode autopilot`, ... (`npm run build`): a host
 * imports exactly one URL per component, so each module is one file, with the shared code compiled into each. One
 * build with several entries would move the shared code into chunks of their own.
 *
 * React is not bundled: the four React imports point at `lib/esm/react-19.js`, which web and admin serve beside
 * `adapter/`. The path is relative to the module, so a path prefix of a reverse proxy stays.
 *
 * Maps are tiles drawn as SVG images and charts are SVG paths: no map or chart library is bundled.
 */

/** The module of each component */
const ENTRIES: Record<ComponentName, string> = {
    wind: './src/Wind.tsx',
    'history-chart': './src/HistoryChart.tsx',
    autopilot: './src/Autopilot.tsx',
    'ais-radar': './src/AisRadar.tsx',
    'anchor-position': './src/AnchorPosition.tsx',
    instrument: './src/Instrument.tsx',
    compass: './src/Compass.tsx',
    rudder: './src/Rudder.tsx',
};

/** The devices widget that shows the same as a component: its label is the name of the component */
const DEVICE_WIDGETS: Partial<Record<ComponentName, string>> = {
    wind: 'NmeaWindComponent',
    'history-chart': 'NmeaHistoryChartComponent',
    autopilot: 'NmeaAutopilotComponent',
    'ais-radar': 'NmeaAisRadarComponent',
    'anchor-position': 'NmeaAnchorPositionComponent',
};

/** The vis-2 widget that shows the same as a component: the key of its title in `src-widgets/src/i18n/` */
const VIS_WIDGETS: Partial<Record<ComponentName, string>> = {
    instrument: 'instrument',
};

const LANGUAGES: ioBroker.Languages[] = ['en', 'de', 'ru', 'pt', 'nl', 'fr', 'it', 'es', 'pl', 'uk', 'zh-cn'];

function readJson<T>(path: string): T {
    return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

/**
 * Why the name of a component is not the label of its native widget, or null if it is: vis-2 and devices offer
 * their own widget and leave out a web component with the same name, so the names must not drift apart.
 *
 * @param name the component
 */
function checkName(name: ComponentName): string | null {
    const ownName = NAMES[name];
    const deviceWidget = DEVICE_WIDGETS[name];
    const visWidget = VIS_WIDGETS[name];
    let label: ioBroker.StringOrTranslated | undefined;
    let source = '';
    if (deviceWidget) {
        const ioPackage = readJson<{
            common: { deviceWidgets?: { components?: { name: string; label?: ioBroker.StringOrTranslated }[] } };
        }>('../io-package.json');
        label = ioPackage.common.deviceWidgets?.components?.find(component => component.name === deviceWidget)?.label;
        source = `io-package.json, common.deviceWidgets "${deviceWidget}"`;
    } else if (visWidget) {
        label = Object.fromEntries(
            LANGUAGES.map(lang => [
                lang,
                readJson<Record<string, string>>(`../src-widgets/src/i18n/${lang}.json`)[visWidget],
            ]),
        ) as ioBroker.Translated;
        source = `src-widgets/src/i18n, "${visWidget}"`;
    } else {
        return null;
    }
    if (!label) {
        return `${source}: no label`;
    }
    for (const lang of LANGUAGES) {
        const text = typeof label === 'string' ? label : label[lang];
        if (text !== ownName[lang]) {
            return `${source}: "${String(text)}" (${lang}) is not the name "${ownName[lang]}" of src/names.ts`;
        }
    }
    return null;
}

/** Writes `<name>.json` next to the module, checked like a host checks it */
function manifestFile(name: ComponentName): Plugin {
    return {
        name: 'nmea-web-component-manifest',
        generateBundle() {
            const manifest = getManifest(name);
            const problem = checkManifest(manifest);
            if (problem) {
                this.error(`${getManifestFile(name)}: ${problem}`);
            }
            if (manifest.module !== getModuleFile(name)) {
                this.error(`${getManifestFile(name)}: "module" must be "${getModuleFile(name)}"`);
            }
            const nameProblem = checkName(name);
            if (nameProblem) {
                this.error(`${getManifestFile(name)}: ${nameProblem}`);
            }
            this.emitFile({
                type: 'asset',
                fileName: getManifestFile(name),
                source: `${JSON.stringify(manifest, null, 4)}\n`,
            });
        },
    };
}

export default ({ mode }: { mode: string }): UserConfig => {
    const name = COMPONENT_NAMES.find(component => component === mode);
    if (!name) {
        throw new Error(`Build one component at a time: vite build --mode <${COMPONENT_NAMES.join('|')}>`);
    }
    const reactImport = getReactImportPath(getModulePath(name));

    return {
        plugins: [react(), manifestFile(name)],
        define: {
            'process.env.NODE_ENV': JSON.stringify('production'),
        },
        build: {
            target: 'es2022',
            outDir: './build',
            // the builds of all components write into the same folder: only the first one empties it
            emptyOutDir: name === COMPONENT_NAMES[0],
            lib: {
                entry: ENTRIES[name],
                formats: ['es'],
                fileName: (): string => getModuleFile(name),
            },
            rollupOptions: {
                external: [...REACT_SPECIFIERS],
                output: {
                    paths: Object.fromEntries(REACT_SPECIFIERS.map(specifier => [specifier, reactImport])),
                    // one file: a host imports exactly one URL
                    codeSplitting: false,
                    // library mode keeps whitespace for the bundler of a consumer; this module is loaded as it is
                    minify: true,
                },
            },
        },
    };
};
