import { withStyles } from '@mui/styles';
import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import {
    Arc, BigArrow, CenterText, Lines, Ship, SmallArrow, SvgContainer, RADIUS,
    useAngle,
} from './Elements';
import Generic from '../Generic';

const styles = theme => ({
    compass: {
        fill: theme.palette.background.default,
        stroke: theme.palette.text.primary,
        strokeWidth: 2,
    },
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
});

const Wind = props => {
    // const [angle, setAngle] = useState(-90);
    const [text, setText] = useState('tws');
    const twdAngle = useAngle(props.twd);
    const awdAngle = useAngle(props.awd);

    // useEffect(() => {
    //     setAngle(_angle => closestEquivalentAngle(_angle, props.angle) - 90);
    // }, [props.angle]);

    const compas = useMemo(() => <>
        <ellipse
            className={props.classes.compass}
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
    </>, []); // eslint-disable-line react-hooks/exhaustive-deps

    return <div className={props.classes.content}>
        <div className={props.classes.header}>
            {Generic.t('Wind')}
        </div>
        <div className={props.classes.contentInner}>
            <BigArrow
                angle={twdAngle}
                zIndex={3}
            />
            <SmallArrow
                angle={awdAngle}
                zIndex={4}
            />
            <SvgContainer angle={-90}>
                {compas}
            </SvgContainer>
            <SvgContainer scale={2}>
                <Ship className={props.classes.ship} />
            </SvgContainer>
            <CenterText className={props.classes.centerTextContainer}>
                <div onClick={() => setText(_text => (_text === 'tws' ? 'aws' : 'tws'))}>
                    <div className={props.classes.centerText}>
                        {Generic.t(text).toUpperCase()}
                    </div>
                    <div className={props.classes.centerText2}>
                        {Math.round(props[text] * 10) / 10}
                    </div>
                    <div>{Generic.t('kts')}</div>
                </div>
            </CenterText>
        </div>
    </div>;
};

Wind.propTypes = {
    twd: PropTypes.number.isRequired,
    awd: PropTypes.number.isRequired,
    // eslint-disable-next-line react/no-unused-prop-types
    tws: PropTypes.number.isRequired,
    // eslint-disable-next-line react/no-unused-prop-types
    aws: PropTypes.number.isRequired,
};

export default withStyles(styles)(Wind);
