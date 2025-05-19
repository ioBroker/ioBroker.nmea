import React, { useMemo, useRef } from 'react';
import { Button, Select, MenuItem } from '@mui/material';

import type { ThemeType } from '@iobroker/adapter-react-v5';
import type { VisContext } from '@iobroker/types-vis-2';

import { CenterText, Lines, Ship, SvgContainer, RADIUS, Arc, useAngle, Rudder } from './Elements';
import Generic from '../Generic';

const styles: Record<string, React.CSSProperties> = {
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
        position: 'relative',
        top: -20,
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

export default function Autopilot(props: {
    themeType: ThemeType;
    cog: number;
    heading: number;
    autopilotStates: Record<string, string> | string[];
    mode: number | false | string;
    rudder: number | false;
    minus10Id?: string;
    minus1Id?: string;
    modeId?: string;
    plus10Id?: string;
    plus1Id?: string;
    context: VisContext;
}): React.JSX.Element {
    const angle = useAngle(-props.cog - 90);
    const headingAngle = useAngle(angle + 90 + props.heading);
    const modeType = useRef(null);

    const compassStatic = useMemo(
        () => (
            <>
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
            </>
        ),
        [props.themeType],
    );

    const compass = useMemo(
        () => (
            <Lines
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
            />
        ),
        [props.themeType],
    );

    let autopilotStates: Record<string, string> | undefined;
    if (props.modeId && props.autopilotStates) {
        if (Array.isArray(props.autopilotStates)) {
            const _autopilotStates: Record<string, string> = {};
            props.autopilotStates.forEach(state => (_autopilotStates[state] = state));
            autopilotStates = _autopilotStates;
        } else {
            autopilotStates = props.autopilotStates;
        }
    }

    let buttonsVisible = true;
    if (!props.minus10Id && !props.minus1Id && !props.plus1Id && !props.plus10Id) {
        // no control buttons
        buttonsVisible = false;
    } else if (props.mode !== false && ((props.mode || 0) === 0 || props.mode === '0')) {
        // autopilot is OFF
        buttonsVisible = false;
    } else if (props.mode !== false && autopilotStates?.[props.mode || 0]?.toLowerCase().includes('track')) {
        // Autopilot is track
        buttonsVisible = false;
    }

    return (
        <div style={styles.content}>
            <div style={styles.header}>{Generic.t('Autopilot')}</div>
            {props.rudder === false ? null : (
                <div>
                    <div style={styles.rudderContainer}>
                        <SvgContainer
                            height={30}
                            style={{ padding: 4 }}
                        >
                            <Rudder
                                rudder={props.rudder}
                                y={0}
                            />
                        </SvgContainer>
                    </div>
                </div>
            )}
            <div style={styles.contentInner}>
                {props.mode !== false && props.modeId && autopilotStates ? (
                    <div style={styles.mode}>
                        <Select
                            style={{ width: '100%' }}
                            value={props.mode || 0}
                            variant="standard"
                            onChange={async e => {
                                if (modeType.current === null) {
                                    try {
                                        const obj = await props.context.socket.getObject(props.modeId!);
                                        if (obj.common.type) {
                                            modeType.current = obj.common.type;
                                        }
                                    } catch {
                                        // ignore
                                    }
                                }
                                if (modeType.current === 'number') {
                                    props.context.setValue(
                                        props.modeId!,
                                        Number.isNaN(e.target.value)
                                            ? 0
                                            : parseInt(e.target.value as unknown as string, 10),
                                    );
                                } else {
                                    props.context.setValue(props.modeId!, e.target.value.toString());
                                }
                            }}
                        >
                            {Object.keys(autopilotStates).map(key => (
                                <MenuItem
                                    key={key}
                                    value={key}
                                >
                                    {autopilotStates[key]}
                                </MenuItem>
                            ))}
                        </Select>
                    </div>
                ) : null}
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
                    <foreignObject
                        width={RADIUS * 2}
                        height={RADIUS * 2}
                    >
                        {/* <SmallArrow
                angle={angle + 90 + props.smallWindAngle}
                zIndex={4}
            /> */}
                        <SvgContainer>{compassStatic}</SvgContainer>
                        <SvgContainer angle={angle}>{compass}</SvgContainer>
                        <SvgContainer angle={headingAngle}>
                            <line
                                style={styles.orangeLine}
                                strokeWidth={4}
                                x1={RADIUS}
                                y1={20}
                                x2={RADIUS}
                                y2={60}
                            />
                        </SvgContainer>
                        <SvgContainer scale={2}>
                            <Ship style={styles.ship} />
                        </SvgContainer>
                        <CenterText style={styles.centerText}>
                            <div style={styles.centerTextInner}>
                                {`${
                                    props.heading === null ||
                                    props.heading === undefined ||
                                    Number.isNaN(parseFloat(props.heading as unknown as string))
                                        ? '---'
                                        : Math.round(parseFloat(props.heading as unknown as string))
                                              .toString()
                                              .padStart(3, '0')
                                }°`}
                            </div>
                        </CenterText>
                    </foreignObject>
                </SvgContainer>
            </div>
            {buttonsVisible ? (
                <div style={styles.bottomPanel}>
                    <div style={styles.bottomPanelButtons}>
                        {[
                            { id: props.minus10Id, name: '-10' },
                            { id: props.minus1Id, name: '-1' },
                            { id: props.plus1Id, name: '+1' },
                            { id: props.plus10Id, name: '+10' },
                        ].map(button =>
                            button.id ? (
                                <div key={button.name}>
                                    <Button
                                        variant="contained"
                                        color="grey"
                                        onClick={() => props.context.setValue(button.id!, true)}
                                    >
                                        {button.name}
                                    </Button>
                                </div>
                            ) : null,
                        )}
                    </div>
                </div>
            ) : null}
        </div>
    );
}
