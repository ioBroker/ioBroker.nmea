const META_DATA = {
    headingMagnetic: {
        unit: '°',
        radians: true,
        role: 'value.nautical.course',
        applyMagneticVariation: true,
    },
    cog: {
        unit: '°',
        radians: true,
        role: 'value.direction.overground',
    },
    heading: {
        unit: '°',
        radians: true,
        role: 'value.direction',
    },
    cow: {
        unit: '°',
        radians: true,
        role: 'value.direction.overwater',
    },
    depth: {
        unit: 'm',
        role: 'value.depth',
    },
    'waterDepth.offset': {
        unit: 'm',
        role: 'value.depth.offset',
    },
    windAngle: {
        unit: '°',
        radians: true,
        role: 'value.direction.wind',
    },
    windSpeed: {
        meterPerSecond: true,
        unit: 'kn',
        role: 'value.speed.wind'
    },
    drift: {
        meterPerSecond: true,
        unit: 'kn',
        role: 'value.drift',
    },
    sog: {
        meterPerSecond: true,
        unit: 'kn',
        role: 'value.speed.overground',
    },
    'directionData.set':{
        unit: '°',
        radians: true,
        role: 'value.direction',
    },
    'setDriftRapidUpdate.set': {
        unit: '°',
        radians: true,
        role: 'value.direction',
    },
    sow: {
        meterPerSecond: true,
        unit: 'kn',
        role: 'value.speed.overwater',
    },
    speedWaterReferenced: {
        meterPerSecond: true,
        unit: 'kn',
        role: 'value.speed.overwater',
    },
    'rudder.position': {
        unit: '°',
        radians: true,
    },
    latitude: {
        unit: '°',
        role: 'value.gps.latitude',
    },
    longitude: {
        unit: '°',
        role: 'value.gps.longitude',
    },
    'magneticVariation.variation': {
        unit: '°',
        radians: true,
    },
    altitude: {
        unit: 'm'
    },
    beam: {
        unit: 'm'
    },
    length: {
        unit: 'm'
    },
    positionReferenceFromBow: {
        unit: 'm'
    },
    positionReferenceFromStarboard: {
        unit: 'm'
    },
    'distanceLog.log': {
        unit: 'm',
        role: 'value.distance'
    },
    'distanceLog.tripLog': {
        unit: 'm',
        role: 'value.distance'
    },
    targetHeadingMagnetic: {
        unit: '°',
        radians: true,
        applyMagneticVariation: true,
    }
};
module.exports = META_DATA;