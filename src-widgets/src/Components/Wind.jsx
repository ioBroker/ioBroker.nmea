import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import {
    Arc, BigArrow, CenterText, Lines, Ship, SmallArrow, SvgContainer, RADIUS,
    useAngle,
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
    ship: {
        transform: `translate(${RADIUS}px, ${RADIUS}px)`,
        pointerEvents: 'all',
    },
    centerTextContainer: {
        pointerEvents: 'all',
        cursor: 'pointer',
    },
    centerText: {
        fontSize: RADIUS / 8,
    },
    centerText2: {
        fontSize: RADIUS / 5,
    },
};

const Wind = props => {
    // const [angle, setAngle] = useState(-90);
    const [text, setText] = useState('tws');
    const twdAngle = useAngle(props.twd);
    const awdAngle = useAngle(props.awd);

    // useEffect(() => {
    //     setAngle(_angle => closestEquivalentAngle(_angle, props.angle) - 90);
    // }, [props.angle]);

    const compass = useMemo(() => <>
        <ellipse
            fill={props.themeType === 'dark' ? '#000' : '#FFF'}
            stroke={props.themeType === 'dark' ? '#FFF' : '#000'}
            strokeWidth={2}
            cx={RADIUS}
            cy={RADIUS}
            rx={RADIUS}
            ry={RADIUS}
        />
        <Lines textCallback={_angle => (_angle % 30 ? '' : (_angle > 180 ? 360 - _angle : _angle))} />
        {[30, 120, 210, 300].map(_angle => <Arc
            key={_angle}
            x={RADIUS}
            y={RADIUS}
            radius={RADIUS}
            angleStart={_angle}
            angleEnd={_angle + 30}
            color={_angle === 30 || _angle === 120 ? '#00FF00AA' : '#FF0000AA'}
        />)}
    </>, [props.themeType]); // eslint-disable-line react-hooks/exhaustive-deps

    return <div style={styles.content}>
        <div style={styles.header}>
            {Generic.t('Wind')}
        </div>
        <div style={styles.contentInner}>
            <BigArrow
                angle={twdAngle}
                zIndex={3}
            />
            <SmallArrow
                angle={awdAngle}
                zIndex={4}
            />
            <SvgContainer angle={-90}>
                {compass}
            </SvgContainer>
            <SvgContainer scale={2}>
                <Ship style={styles.ship} />
            </SvgContainer>
            <CenterText style={styles.centerTextContainer}>
                <div onClick={() => setText(_text => (_text === 'tws' ? 'aws' : 'tws'))}>
                    <div style={styles.centerText}>
                        {Generic.t(text).toUpperCase()}
                    </div>
                    <div style={styles.centerText2}>
                        {Number.isNaN(props[text]) || props[text] === null || props[text] === undefined ? '---' : Math.round(props[text] * 10) / 10}
                    </div>
                    <div>{Generic.t('kts')}</div>
                </div>
            </CenterText>
        </div>
    </div>;
};

Wind.propTypes = {
    twd: PropTypes.number,
    awd: PropTypes.number,
    // eslint-disable-next-line react/no-unused-prop-types
    tws: PropTypes.number,
    // eslint-disable-next-line react/no-unused-prop-types
    aws: PropTypes.number,
    themeType: PropTypes.string,
};

export default Wind;
