import { deleteFoldersRecursive, buildReact, npmInstall, copyFiles } from '@iobroker/build-tools';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SRC = 'src-devices/';
const src = `${__dirname}/${SRC}`;

function buildAdmin() {
    return buildReact(`${__dirname}/src-admin/`, { rootDir: `${__dirname}/src-admin/`, vite: true });
}

function cleanAdmin() {
    deleteFoldersRecursive(`${__dirname}/admin/custom`);
    deleteFoldersRecursive(`${__dirname}/src-admin/build`);
}

function copyAllAdminFiles() {
    copyFiles(
        ['src-admin/build/**/*', '!src-admin/build/index.html', '!src-admin/build/mf-manifest.json'],
        'admin/custom/',
    );
    copyFiles(['src-admin/src/i18n/*.json'], 'admin/custom/i18n');
}

function cleanDevices() {
    deleteFoldersRecursive(`${src}build`);
    deleteFoldersRecursive(`${__dirname}/admin/dm-widgets`);
}

function copyAllFilesDevices() {
    copyFiles([`${SRC}build/customDevices.js`], `admin/dm-widgets`);
    copyFiles([`${SRC}build/assets/*.*`], `admin/dm-widgets/assets`);
    copyFiles([`${SRC}build/img/*`], `admin/dm-widgets/img`);
    copyFiles([`${SRC}img/*.*`], `admin/dm-widgets`);
}

function copyAllFiles() {
    copyFiles(
        [
            'src-widgets/build/**/*',
            '!src-widgets/build/index.html',
            '!src-widgets/build/mf-manifest.json',
            '!src-widgets/build/static/js/*node_modules*.*',
            '!src-widgets/build/static/js/node_modules_*',
        ],
        'widgets/nmea/',
    );
    copyFiles(
        [
            `src-widgets/build/static/js/*echarts-for-react_lib_core*.*`,
            `src-widgets/build/static/js/*spectrum_color_dist_import_mjs*.*`,
            `src-widgets/build/static/js/*uiw_react-color-shade-slider*.*`,
            `src-widgets/build/static/js/*runtime_js-src_sketch_css*.*`,
            `src-widgets/build/static/js/*node_modules_babel_runtime_helpers_createForOfItera*.*`,
        ],
        'widgets/nmea/static/js',
    );
}

if (process.argv.includes('--admin-0-clean')) {
    cleanAdmin();
} else if (process.argv.includes('--admin-1-npm')) {
    npmInstall(`${__dirname}/src-admin/`).catch(e => console.error(e));
} else if (process.argv.includes('--admin-2-compile')) {
    buildAdmin().catch(e => console.error(e));
} else if (process.argv.includes('--admin-3-copy')) {
    copyAllAdminFiles();
} else if (process.argv.includes('--admin')) {
    cleanAdmin();
    npmInstall(`${__dirname}/src-admin/`)
        .then(() => buildAdmin())
        .then(() => copyAllAdminFiles())
        .catch(e => console.error(e));
} else if (process.argv.includes('--copy-files')) {
    copyAllFiles();
} else if (process.argv.includes('--build')) {
    buildReact(`${__dirname}/src-widgets`, { rootDir: __dirname, vite: true }).catch(() =>
        console.error('Error by build'),
    );
} else if (process.argv.includes('--copy-i18n')) {
    copyFiles(['src/i18n/**/*'], 'build/i18n/');
} else {
    deleteFoldersRecursive('src-widgets/build');
    deleteFoldersRecursive('widgets');
    npmInstall('src-widgets')
        .then(() => buildReact(`${__dirname}/src-widgets`, { rootDir: __dirname, vite: true }))
        .then(() => copyAllFiles())
        .then(() => cleanAdmin())
        .then(() => npmInstall(`${__dirname}/src-admin`))
        .then(() => buildAdmin())
        .then(() => copyAllAdminFiles())
        .then(() => cleanDevices())
        .then(() => npmInstall(src))
        .then(() => buildReact(src, { rootDir: src, vite: true }))
        .then(() => copyAllFilesDevices())
        .catch(e => console.error(`Cannot build: ${e}`));
}
