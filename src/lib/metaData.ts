const META_DATA: Record<
    string,
    {
        unit: string;
        role?: string;
        radians?: boolean;
        applyMagneticVariation?: boolean;
        round?: number;
        factor?: number;
        meterPerSecond?: boolean;
        offset?: number;
        /**
         * Drop the sample if the converted value falls below this threshold. Useful for fields
         *  where some sensors emit obviously invalid values (out-of-range placeholders) that
         *  would otherwise pollute the state with bogus readings.
         */
        min?: number;
        /**
         * Same idea but for the upper bound. e.g. depth sensors typically max out around a
         *  few hundred metres; values orders of magnitude beyond that are out-of-range markers.
         */
        max?: number;
    }
> = {
    headingMagnetic: {
        unit: '°',
        radians: true,
        role: 'value.nautical.course',
        applyMagneticVariation: true,
        round: 10,
    },
    cog: {
        unit: '°',
        radians: true,
        role: 'value.direction.overground',
        round: 10,
    },
    heading: {
        unit: '°',
        radians: true,
        round: 10,
        role: 'value.direction',
    },
    cow: {
        unit: '°',
        radians: true,
        role: 'value.direction.overwater',
        round: 10,
    },
    depth: {
        unit: 'm',
        role: 'value.depth',
        // Negative depth makes no physical sense; values above 1000 m are out-of-range markers
        // from echo sounders that have lost the bottom (some emit 0xFFFFFFFF → ~4.3e9 m).
        // Samples outside this band are dropped before they reach the state.
        min: 0,
        max: 1000,
    },
    'waterDepth.offset': {
        unit: 'm',
        role: 'value.depth.offset',
    },
    windAngle: {
        unit: '°',
        radians: true,
        round: 10,
        role: 'value.direction.wind',
    },
    windSpeed: {
        meterPerSecond: true,
        unit: 'kn',
        role: 'value.speed.wind',
        round: 100,
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
    'directionData.set': {
        unit: '°',
        radians: true,
        role: 'value.direction',
        round: 10,
    },
    'setDriftRapidUpdate.set': {
        unit: '°',
        radians: true,
        role: 'value.direction',
        round: 10,
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
        round: 10,
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
        round: 10,
    },
    altitude: {
        unit: 'm',
    },
    beam: {
        unit: 'm',
    },
    length: {
        unit: 'm',
    },
    positionReferenceFromBow: {
        unit: 'm',
    },
    positionReferenceFromStarboard: {
        unit: 'm',
    },
    'distanceLog.log': {
        unit: 'm',
        role: 'value.distance',
    },
    'distanceLog.tripLog': {
        unit: 'm',
        role: 'value.distance',
    },
    targetHeadingMagnetic: {
        unit: '°',
        radians: true,
        applyMagneticVariation: true,
        round: 10,
    },
    pressure: {
        unit: 'mbar',
        role: 'value.pressure',
        factor: 0.01,
        round: 1,
    },
    actualTemperature: {
        unit: '°C',
        role: 'value.temperature',
        round: 10,
        offset: -273.15,
    },
    atmosphericPressure: {
        unit: 'mbar',
        role: 'value.pressure',
        factor: 0.01,
        round: 1,
    },
    humidity: {
        unit: '%',
        role: 'value.humidity',
        round: 1,
    },
    temperature: {
        unit: '°C',
        role: 'value.temperature',
        round: 10,
        offset: -273.15,
    },
    rateOfTurn: {
        unit: '°/s',
        role: 'value',
        round: 10,
        factor: 57.295779513, // rad/s * 180/pi = °/s
    },
    distanceToWaypoint: {
        unit: 'nm',
        role: 'value.distance',
        factor: 1 / 1852, // meters to nautical miles conversion
        round: 100,
    },
    waypointClosingVelocity: {
        unit: 'kn',
        role: 'value.speed',
        round: 100,
        // convert m/s to kn: 1 m/s = 1.9438444924574 kn
        factor: 1.9438444924574,
    },
    'engineParametersDynamic.alternatorPotential': {
        unit: 'V',
        role: 'value.voltage',
        round: 100,
    },
};

export default META_DATA;
