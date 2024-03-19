import { withStyles } from '@mui/styles';
import { useMemo } from 'react';
import PropTypes from 'prop-types';
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
    const factor = 120 / 50;

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
                for (let i = -50; i <= 50; i++) {
                    angles.push(i);
                }
                return angles;
            }}
            factor={factor}
            radius={RADIUS - 20}
            textRotate={-90}
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
    </>, [props.themeType]); // eslint-disable-line react-hooks/exhaustive-deps

    return <div className={props.classes.content}>
        <div className={props.classes.header}>
            {Generic.t('Rudder')}
        </div>
        <div className={props.classes.contentInner}>
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
            {props.rudder !== null && props.rudder !== undefined ? <SvgContainer
                angle={props.rudder * -1 * factor + 180}
                zIndex={3}
            >
                <path
                    d="M -8 -40 L -4 -200 L 4 -200 L 8 -40 Z"
                    fill="#FF0000AA"
                    className={props.classes.arrow}
                />
            </SvgContainer> : null}
        </div>
    </div>;
};

Rudder.propTypes = {
    rudder: PropTypes.number,
    themeType: PropTypes.string,
};

export default withStyles(styles)(Rudder);
