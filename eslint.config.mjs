import config from '@iobroker/eslint-config';

export default [
    ...config,
    {
        languageOptions: {
            parserOptions: {
                projectService: {
                    allowDefaultProject: ['*.js', '*.mjs'],
                },
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
    {
        // disable temporary the rule 'jsdoc/require-param' and enable 'jsdoc/require-jsdoc'
        rules: {
            'jsdoc/require-jsdoc': 'off',
            'jsdoc/require-param': 'off',
        },
    },
    {
        ignores: [
            '*.mjs',
            'test/**/*.*',
            'admin/**/*.*',
            'build/**/*.*',
            'widgets/**/*.*',
            'tasks.mts',
            'src-widgets/**/*.*',
            'src-admin/build/**/*.*',
            'src-admin/.__mf__temp/**/*.*',
            'src-admin/node_modules/**/*.*',
            'src-devices/build/**/*.*',
            'src-devices/.__mf__temp/**/*.*',
            'src-devices/node_modules/**/*.*',
        ],
    },
    {
        files: ['src/lib/*.ts', 'src/*.ts'],
    },
];
