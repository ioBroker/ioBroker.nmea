import {
    Button, Select, MenuItem,
} from '@mui/material';
import { withStyles } from '@mui/styles';
import {
    useMemo, useRef,
} from 'react';
import PropTypes from 'prop-types';
import {
    CenterText, Lines, Ship, SvgContainer, RADIUS,
    Arc,
    useAngle, Rudder,
} from './Elements';
import Generic from '../Generic';

const styles = {
    content: {
        display: 'grid',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        gridTemplateRows: 'min-content min-content auto min-content',
        position: 'absolute',
        padding: 10,
        boxSizing: 'border-box',
    },
    header: {
        textAlign: 'center',
    },
    contentInner: {
        overflow: 'hidden',
        position: 'relative',
    },
    orangeLine: {
        fill: 'orange',
        stroke: 'orange',
    },
    ship: {
        transform: `translate(${RADIUS}px, ${RADIUS}px)`,
    },
    centerText: {
        position: 'relative', top: -20,
    },
    centerTextInner: {
        fontSize: RADIUS / 5,
    },
    bottomPanel: {
        display: 'flex',
        justifyContent: 'space-between',
        width: '100%',
    },
    bottomPanelButtons: {
        display: 'flex',
        gap: 8,
        justifyContent: 'center',
        width: '100%',
        flexWrap: 'wrap',
    },
    rudderContainer: {
        height: 60,
        position: 'relative',
    },
    mode: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: 90,
        zIndex: 1,
    },
};

const Autopilot = props => {
    const angle = useAngle(-props.cog - 90);
    const headingAngle = useAngle(angle + 90 + props.heading);
    const modeType = useRef(null);

    const compassStatic = useMemo(() => <>
        <ellipse
            strokeWidth={2}
            fill={props.themeType === 'dark' ? '#000' : '#FFF'}
            stroke={props.themeType === 'dark' ? '#FFF' : '#000'}
            cx={RADIUS}
            cy={RADIUS}
            rx={RADIUS}
            ry={RADIUS}
        />
        <ellipse
            strokeWidth={10}
            fill={props.themeType === 'dark' ? '#000' : '#FFF'}
            stroke={props.themeType === 'dark' ? '#FFF' : '#000'}
            cx={RADIUS}
            cy={RADIUS}
            rx={RADIUS - 20}
            ry={RADIUS - 20}
        />
        <Arc
            x={RADIUS}
            y={RADIUS}
            radius={RADIUS}
            angleStart={90}
            angleEnd={270}
            flat
            color="red"
        />
        <Arc
            x={RADIUS}
            y={RADIUS}
            radius={RADIUS}
            angleStart={270}
            angleEnd={450}
            flat
            color="green"
        />
    </>, [props.themeType]); // eslint-disable-line react-hooks/exhaustive-deps

    const compass = useMemo(() => <Lines
        color={props.themeType === 'dark' ? '#FFF' : '#000'}
        textCallback={_angle => {
            if (_angle === 0) {
                return 'N';
            }
            if (_angle === 90) {
                return 'O';
            }
            if (_angle === 180) {
                return 'S';
            }
            if (_angle === 270) {
                return 'W';
            }
            return _angle % 30 ? '' : _angle;
        }}
    />, [props.themeType]); // eslint-disable-line react-hooks/exhaustive-deps

    let autopilotStates;
    if (props.modeId && props.autopilotStates) {
        autopilotStates = props.autopilotStates;
        if (Array.isArray(autopilotStates)) {
            const _autopilotStates = {};
            autopilotStates.forEach(state => _autopilotStates[state] = state);
            autopilotStates = _autopilotStates;
        }
    }

    let buttonsVisible = true;
    if (!props.minus10Id && !props.minus1Id && !props.plus1Id && !props.plus10Id) {
        // no control buttons
        buttonsVisible = false;
    } else if (props.mode !== false && ((props.mode || 0) === 0 || props.mode === '0')) {
        // autopilot is OFF
        buttonsVisible = false;
    } else if (
        props.mode !== false &&
        autopilotStates?.[props.mode || 0]?.toLowerCase().includes('track')
    ) {
        // Autopilot is track
        buttonsVisible = false;
    }

    return <div className={props.classes.content}>
        <div className={props.classes.header}>
            {Generic.t('Autopilot')}
        </div>
        {props.rudder === false ? null : <div>
            <div className={props.classes.rudderContainer}>
                <SvgContainer height={30} style={{ padding: 4 }}>
                    <Rudder rudder={props.rudder} y={0} />
                </SvgContainer>
            </div>
        </div>}
        <div className={props.classes.contentInner}>
            {props.mode !== false && props.modeId && autopilotStates ? <div className={props.classes.mode}>
                <Select
                    style={{ width: '100%' }}
                    value={props.mode || 0}
                    variant="standard"
                    onChange={async e => {
                        if (modeType.current === null) {
                            try {
                                const obj = await props.context.socket.getObject(props.modeId);
                                if (obj.common.type) {
                                    modeType.current = obj.common.type;
                                }
                            } catch (err) {
                                // ignore
                            }
                        }
                        if (modeType.current === 'number') {
                            props.context.setValue(props.modeId, Number.isNaN(e.target.value) ? 0 : parseInt(e.target.value, 10));
                        } else {
                            props.context.setValue(props.modeId, e.target.value.toString());
                        }
                    }}
                >
                    {Object.keys(autopilotStates).map(key =>
                        <MenuItem key={key} value={key}>{autopilotStates[key]}</MenuItem>)}
                </Select>
            </div> : null}
            <SvgContainer
                angle={0}
                height={(RADIUS + 10) / 2}
                preserveAspectRatio="xMidYMax meet"
                containerStyle={{
                    position: 'initial',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '100%',
                    height: '100%',
                }}
                style={{
                    overflow: 'hidden',
                    zIndex: 0,
                    width: '',
                    height: '',
                    maxWidth: '100%',
                    maxHeight: '100%',
                }}
            >
                <foreignObject width={RADIUS * 2} height={RADIUS * 2}>
                    {/* <SmallArrow
                angle={angle + 90 + props.smallWindAngle}
                zIndex={4}
            /> */}
                    <SvgContainer>
                        {compassStatic}
                    </SvgContainer>
                    <SvgContainer angle={angle}>
                        {compass}
                    </SvgContainer>
                    <SvgContainer angle={headingAngle}>
                        <line
                            className={props.classes.orangeLine}
                            strokeWidth={4}
                            x1={RADIUS}
                            y1={20}
                            x2={RADIUS}
                            y2={60}
                        />
                    </SvgContainer>
                    <SvgContainer scale={2}>
                        <Ship className={props.classes.ship} />
                    </SvgContainer>
                    <CenterText className={props.classes.centerText}>
                        <div className={props.classes.centerTextInner}>
                            {`${props.heading === null || props.heading === undefined || Number.isNaN(parseFloat(props.heading)) ? '---' : Math.round(parseFloat(props.heading)).toString().padStart(3, '0')}°`}
                        </div>
                    </CenterText>
                </foreignObject>
            </SvgContainer>
        </div>
        {buttonsVisible ? <div className={props.classes.bottomPanel}>
            <div className={props.classes.bottomPanelButtons}>
                {[
                    { id: props.minus10Id, name: '-10' },
                    { id: props.minus1Id, name: '-1' },
                    { id: props.plus1Id, name: '+1' },
                    { id: props.plus10Id, name: '+10' },
                ].map(button => (button.id ? <div key={button.name}>
                    <Button
                        variant="contained"
                        color="grey"
                        onClick={() => props.context.setValue(button.id, true)}
                    >
                        {button.name}
                    </Button>
                </div> : null))}
            </div>
        </div> : null}
    </div>;
};

Autopilot.propTypes = {
    autopilotStates: PropTypes.object,
    cog: PropTypes.number,
    heading: PropTypes.number,
    mode: PropTypes.number,
    rudder: PropTypes.number,
    minus10Id: PropTypes.string,
    minus1Id: PropTypes.string,
    modeId: PropTypes.string,
    plus10Id: PropTypes.string,
    plus1Id: PropTypes.string,
    context: PropTypes.object.isRequired,
    themeType: PropTypes.string,
};

export default withStyles(styles)(Autopilot);
