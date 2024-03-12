const makeFederation = require('@iobroker/vis-2-widgets-react-dev/modulefederation.config');

module.exports = makeFederation(
    'vis2Nmea',
    {
        './Nmea': './src/Nmea',
        './Instrument': './src/Instrument',
        './translations': './src/translations',
    }
);
