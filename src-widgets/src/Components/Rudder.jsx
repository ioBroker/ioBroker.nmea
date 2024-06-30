import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';

import { IconButton } from '@mui/material';

import { ZoomIn, ZoomOut } from '@mui/icons-material';

import {
    Arc, Lines, SvgContainer, RADIUS,
    Text,
} from './Elements';
import Generic from '../Generic';

const styles = {
    content: {
        display: 'grid',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        gridTemplateRows: 'min-content auto',
        position: 'absolute',
    },
    contentInner: {
        overflow: 'hidden',
        position: 'relative',
    },
    header: {
        textAlign: 'center',
    },
    arrow: {
        transform: `translate(${RADIUS}px, ${RADIUS}px)`,
    },
};

const Rudder = props => {
    const [zoomActive, setZoomActive] = useState(Math.abs(props.rudder) <= props.zoomAt);

    if (props.rudder !== null) {
        if (zoomActive && Math.abs(props.rudder) > props.zoomAt + (props.zoomDelay || 4)) {
            setZoomActive(false);
        } else if (!zoomActive && Math.abs(props.rudder) <= props.zoomAt - (props.zoomDelay || 4)) {
            setZoomActive(true);
        }
    }

    const minMax = zoomActive ? props.zoomAt + (props.zoomDelay || 4) : (typeof props.minMax === 'number' ? Math.abs(props.minMax) : 50);

    const factor = 120 / minMax;

    const compass = useMemo(() => <>
        <ellipse
            fill={props.themeType === 'dark' ? '#000' : '#FFF'}
            stroke={props.themeType === 'dark' ? '#FFFFFF' : '#000000'}
            strokeWidth={2}
            cx={RADIUS}
            cy={RADIUS}
            rx={RADIUS}
            ry={RADIUS}
        />
        <Lines
            color={props.themeType === 'dark' ? '#FFFFFF' : '#000000'}
            textCallback={_angle =>
                (_angle % 10 ?
                    '' :
                    (_angle > 0 ? _angle : -_angle))}
            paddingCallback={_angle =>
                (Math.abs(_angle) % 10 ? 0 : 20)}
            getAngles={() => {
                const angles = [];
                for (let i = -1 * minMax; i <= minMax; i++) {
                    angles.push(i);
                }
                return angles;
            }}
            factor={factor}
            radius={RADIUS - 20}
            textRotate={-90}
            width={1}
            marks={zoomActive ? null : [
                { color: '#0F0', width: 3, angle: -1 * (props.zoomAt - (props.zoomDelay || 4))  },
                { color: '#0F0', width: 3, angle: props.zoomAt - (props.zoomDelay || 4) },
            ]}
        />
        {[360 - 120, 0].map(_angle => <Arc
            key={_angle}
            x={RADIUS}
            y={RADIUS}
            radius={RADIUS}
            angleStart={_angle}
            angleEnd={_angle + 120}
            color={_angle === 0 ? '#FF0000AA' : '#00FF00AA'}
            flat
        />)}
        <ellipse cx={RADIUS} cy={RADIUS} rx={40} ry={40} fill="grey" />
    </>, [props.themeType, zoomActive, factor]); // eslint-disable-line react-hooks/exhaustive-deps

    return <div style={styles.content}>
        <div style={styles.header}>
            {Generic.t('Rudder')}
        </div>
        <div style={styles.contentInner}>
            <IconButton
                size="small"
                disableRipple
                onClick={() => setZoomActive(!zoomActive)}
                disabled={zoomActive ?
                    Math.abs(props.rudder) <= props.zoomAt - (props.zoomDelay || 4)
                    : Math.abs(props.rudder) > props.zoomAt + (props.zoomDelay || 4)}
                style={{
                    position: 'absolute',
                    left: 'calc(50% - 15px)',
                    top: 'calc(50% - 15px)',
                    zIndex: 1,
                    display: !zoomActive && Math.abs(props.rudder) > props.zoomAt + (props.zoomDelay || 4) ? 'none' : 'block',
                }}
            >
                {zoomActive ? <ZoomOut /> :  <ZoomIn />}
            </IconButton>
            <SvgContainer angle={90}>
                {compass}
            </SvgContainer>
            <SvgContainer>
                <Text
                    color={props.themeType === 'dark' ? '#FFF' : '#000'}
                    x={RADIUS}
                    y={RADIUS}
                    radius={RADIUS}
                    angle={220}
                    noRotate
                    text={Generic.t('PORT')}
                />
                <Text
                    color={props.themeType === 'dark' ? '#FFF' : '#000'}
                    x={RADIUS}
                    y={RADIUS}
                    radius={RADIUS}
                    angle={320}
                    noRotate
                    text={Generic.t('STBD')}
                />
            </SvgContainer>
            {/* Arrow */}
            {props.rudder !== null && props.rudder !== undefined ? <SvgContainer
                angle={props.rudder * -1 * factor + 180}
                zIndex={3}
            >
                <path
                    d="M -8 -40 L -4 -200 L 4 -200 L 8 -40 Z"
                    fill="#FF0000AA"
                    style={styles.arrow}
                />
            </SvgContainer> : null}
        </div>
    </div>;
};

Rudder.propTypes = {
    rudder: PropTypes.number,
    minMax: PropTypes.number,
    zoomAt: PropTypes.number,
    zoomDelay: PropTypes.number,
    themeType: PropTypes.string,
};

export default Rudder;
