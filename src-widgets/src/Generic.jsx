import React from 'react';
import PropTypes from 'prop-types';

import { VisRxWidget } from '@iobroker/vis-2-widgets-react-dev';

class Generic extends (window.visRxWidget || VisRxWidget) {
    getPropertyValue = stateName => this.state.values[`${this.state.rxData[stateName]}.val`];

    static getI18nPrefix() {
        return 'nmea_';
    }

    static DATA = {
        heading: { indicatorDigitsBeforeComma: 3, indicatorDigitsAfterComma: 0 },
        headingTrue: { indicatorDigitsBeforeComma: 3, indicatorDigitsAfterComma: 0 },
        drift: { indicatorDigitsAfterComma: 1 },
        cogTrue: { indicatorDigitsBeforeComma: 3, indicatorDigitsAfterComma: 0 },
        cog: { indicatorDigitsBeforeComma: 3, indicatorDigitsAfterComma: 0 },
        set: { indicatorDigitsBeforeComma: 3, indicatorDigitsAfterComma: 0 },
        setTrue: { indicatorDigitsBeforeComma: 3, indicatorDigitsAfterComma: 0 },
        headingMagnetic: { indicatorDigitsBeforeComma: 3, indicatorDigitsAfterComma: 0 },
        headingMagneticTrue: { indicatorDigitsBeforeComma: 3, indicatorDigitsAfterComma: 0 },
        targetHeadingMagnetic: { indicatorDigitsBeforeComma: 3, indicatorDigitsAfterComma: 1 },
        targetHeadingMagneticTrue: { indicatorDigitsBeforeComma: 3, indicatorDigitsAfterComma: 1 },
        sog: { indicatorDigitsAfterComma: 1 },
        variation: { indicatorDigitsAfterComma: 1, indicatorShowPlus: true },
        'rudder.position': { indicatorDigitsAfterComma: 0, indicatorShowPlus: true },
        depth: { indicatorDigitsAfterComma: 1 },
        windSpeedAverage: { indicatorDigitsAfterComma: 1 },
        windSpeedApparent: { indicatorDigitsAfterComma: 1 },
        windSpeedMax: { indicatorDigitsAfterComma: 1 },
        windSpeed: { indicatorDigitsAfterComma: 1 },
        windSpeedTrue: { indicatorDigitsAfterComma: 1 },
    };

    // TODO: remove this method when vis-2-widgets-react-dev is updated
    static getText(text) {
        if (text && typeof text === 'object') {
            return text[(window.visRxWidget || VisRxWidget).getLanguage()] || text.en;
        }
        return text || null;
    }

    static zeroBeforeAfterComma(num, beforeLength, afterLength, useComma, fontSizeAfterComma) {
        const numParts = num.toString().split('.');
        if (beforeLength) {
            numParts[0] = numParts[0].padStart(beforeLength, '0');
        }
        if (afterLength) {
            numParts[0] += useComma ? ',' : '.';
            if (fontSizeAfterComma === false) {
                numParts[1] = parseFloat(num).toFixed(afterLength).split('.')[1];
            } else {
                numParts[1] = <span style={{ fontSize: fontSizeAfterComma || 30 }}>
                    {parseFloat(num).toFixed(afterLength).split('.')[1]}
                </span>;
            }
        } else {
            numParts.splice(1, 1);
        }

        return numParts;
    }

    async getParentObject(id) {
        const parts = id.split('.');
        parts.pop();
        const parentOID = parts.join('.');
        return this.props.context.socket.getObject(parentOID);
    }

    static getObjectIcon(obj, id, imagePrefix) {
        imagePrefix = imagePrefix || '../..'; // http://localhost:8081';
        let src = '';
        const common = obj && obj.common;

        if (common) {
            const cIcon = common.icon;
            if (cIcon) {
                if (!cIcon.startsWith('data:image/')) {
                    if (cIcon.includes('.')) {
                        let instance;
                        if (obj.type === 'instance' || obj.type === 'adapter') {
                            src = `${imagePrefix}/adapter/${common.name}/${cIcon}`;
                        } else if (id && id.startsWith('system.adapter.')) {
                            instance = id.split('.', 3);
                            if (cIcon[0] === '/') {
                                instance[2] += cIcon;
                            } else {
                                instance[2] += `/${cIcon}`;
                            }
                            src = `${imagePrefix}/adapter/${instance[2]}`;
                        } else {
                            instance = id.split('.', 2);
                            if (cIcon[0] === '/') {
                                instance[0] += cIcon;
                            } else {
                                instance[0] += `/${cIcon}`;
                            }
                            src = `${imagePrefix}/adapter/${instance[0]}`;
                        }
                    } else {
                        return null;
                    }
                } else {
                    src = cIcon;
                }
            }
        }

        return src || null;
    }
}

Generic.propTypes = {
    context: PropTypes.object,
    themeType: PropTypes.string,
    style: PropTypes.object,
    data: PropTypes.object,
};

export default Generic;
