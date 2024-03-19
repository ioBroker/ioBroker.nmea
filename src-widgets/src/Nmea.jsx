import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { withStyles } from '@mui/styles';

import {
    Button, Card,
    CircularProgress,
    IconButton,
    Menu,
    MenuItem,
} from '@mui/material';

import { KeyboardArrowUp, KeyboardArrowDown } from '@mui/icons-material';

import Generic from './Generic';
import Wind from './Components/Wind';
import Navigation from './Components/Navigation';
import Rudder from './Components/Rudder';
import Autopilot from './Components/Autopilot';

const styles = () => ({
    indicatorNumber: {
        fontSize: 40,
        display: 'inline-block',
        overflow: 'visible',
    },
    indicatorNumberContainer: {
        whiteSpace: 'nowrap',
    },
    indicatorName: {
        height: 19,
    },
    indicatorCard: {
        padding: 4,
        margin: 4,
        overflow: 'visible',
    },
    content: {
        width: '100%',
        flex: 1,
        display: 'grid',
        overflow: 'hidden',
        gap: 16,
        position: 'relative',
    },
    leftPanel: {
        gridArea: 'left',
        display: 'flex',
        overflow: 'auto',
    },
    rightPanel: {
        gridArea: 'right',
        display: 'flex',
        overflow: 'auto',
    },
    bottomPanel: {
        // gridArea: 'bottom',
        bottom: 0,
        left: 0,
        width: '100%',
        position: 'absolute',
    },
    carousel: {
        transition: 'all .35s ease-in-out',
        height: '100%',
    },
    mainPanel: {
        overflow: 'hidden',
        gridArea: 'main',
    },
    windowPanel: {
        minHeight: '100%',
        maxHeight: '100%',
    },
});

const POSSIBLE_NAMES = {
    oid_tws: ['windData.windSpeedTrue'],
    oid_aws: ['windData.windSpeedApparent'],
    oid_twd: ['windData.windDirectionTrue'],
    oid_awa: ['windData.windAngle'],
    oid_awd: ['windData.windDirectionApparent'],
    oid_cog: ['directionData.cogTrue'],
    oid_sog: ['directionData.sog'],
    oid_rudder: ['rudder.position'],
    oid_depth: ['waterDepth.depth'],
    oid_heading: ['vesselHeading.headingTrue'],
    oid_autopilot_mode: ['autoPilot.state'],
    oid_autopilot_plus_1: ['autoPilot.headingPlus1'],
    oid_autopilot_plus_10: ['autoPilot.headingPlus10'],
    oid_autopilot_minus_1: ['autoPilot.headingMinus1'],
    oid_autopilot_minus_10: ['autoPilot.headingMinus10'],
};

const loadIndicator = async (field, data, changeData, socket) => {
    if (data[field.name]) {
        // read object
        const obj = await socket.getObject(data[field.name]);
        if (obj) {
            const parts = data[field.name].split('.');
            const last = parts.pop();
            const butLast = parts.pop();
            let changed = false;
            if (Generic.DATA[last] || Generic.DATA[`${butLast}.${last}`]) {
                const attr = Generic.DATA[`${butLast}.${last}`] ? `${butLast}.${last}` : last;
                for (const key in Generic.DATA[attr]) {
                    if (data[key + field.index] === undefined || data[key + field.index] === null || data[key + field.index] === '') {
                        data[key + field.index] = Generic.DATA[attr][key];
                        changed = true;
                    }
                }
            }
            // take unit and name from an object
            if (obj.common?.unit && !data[`indicatorUnit${field.index}`]) {
                data[`indicatorUnit${field.index}`] = obj.common.unit;
                changed = true;
            }
            if (obj.common?.name && !data[`indicatorName${field.index}`]) {
                data[`indicatorName${field.index}`] = Generic.getText(obj.common.name);
                changed = true;
            }
            if (obj.common?.color && !data[`indicatorColor${field.index}`]) {
                data[`indicatorColor${field.index}`] = obj.common.color;
                changed = true;
            }

            changed && changeData(data);
        }
    }
};

const InstanceField = props => {
    const [instances, setInstances] = useState(null);
    const [anchorEl, setAnchorEl] = useState(null);

    useEffect(() => {
        (async () => {
            const _instances = [];
            const instanceObjs = await props.context.socket.getAdapterInstances('nmea');
            instanceObjs.forEach(_instance => {
                const instanceId = _instance._id.split('.').pop();
                _instances.push({
                    value: `nmea.${instanceId}`,
                    label: `nmea.${instanceId}`,
                });
            });
            setInstances(_instances);
        })();
    }, [props.context.socket]);

    return instances ? <>
        <Button
            style={{ whiteSpace: 'nowrap' }}
            onClick={event => setAnchorEl(event.currentTarget)}
            variant="outlined"
        >
            {Generic.t('Use instance')}
        </Button>
        <Menu
            anchorEl={anchorEl}
            open={!!anchorEl}
            onClose={() => setAnchorEl(null)}
        >
            {instances.map(_instance => <MenuItem
                onClick={async () => {
                    const prefix = `${_instance.value}.`;
                    const data = JSON.parse(JSON.stringify(props.data));
                    const ids = Object.keys(POSSIBLE_NAMES);
                    let changed = false;
                    for (let i = 0; i < ids.length; i++) {
                        const oid = ids[i];
                        for (let k = 0; k < POSSIBLE_NAMES[oid].length; k++) {
                            const obj = await props.context.socket.getObject(prefix + POSSIBLE_NAMES[oid][k]);
                            if (obj) {
                                changed = true;
                                data[oid] = prefix + POSSIBLE_NAMES[oid][k];
                                break;
                            }
                        }
                    }
                    changed && props.setData(data);
                    setAnchorEl(null);
                }}
                key={_instance.value}
                value={_instance.value}
            >
                {_instance.label}
            </MenuItem>)}
        </Menu>
    </> : <CircularProgress />;
};

class Nmea extends Generic {
    contentRef = React.createRef();

    constructor(props) {
        super(props);
        this.state.window = parseInt(window.localStorage.getItem(`vis.${this.props.id}`), 10) || 0;
        this.state.prevWindow = undefined;
        this.state.nextWindow = undefined;
        this.state.angle = 0;
        this.state.smallWindAngle = 20;
        this.state.bigWindAngle = 40;
        this.state.width = 2;
        this.state.height = 2;
        this.state.autopilotStates = { 0: 'Standby' };
    }

    static getWidgetInfo() {
        return {
            id: 'tplNmeaComplex',
            visSet: 'nmea',

            visSetLabel: 'set_label', // Label of this widget set
            visSetColor: '#0783ff', // Color of this widget set

            visWidgetLabel: 'complex',  // Label of widget
            visName: 'Nmea',
            visAttrs: [
                {
                    name: 'common',
                    fields: [
                        {
                            name: 'noCard',
                            label: 'without_card',
                            type: 'checkbox',
                        },
                        {
                            name: 'widgetTitle',
                            label: 'name',
                            hidden: '!!data.noCard',
                        },
                        {
                            name: 'indicatorsCount',
                            label: 'Indicators count',
                            type: 'number',
                            default: 2,
                        },
                    ],
                },
                {
                    name: 'states',
                    label: 'states',
                    fields: [
                        {
                            name: 'instance',
                            label: '',
                            type: 'custom',
                            component: (field, data, setData, props) => <InstanceField
                                field={field}
                                data={data}
                                setData={setData}
                                context={props.context}
                            />,
                        },
                        {
                            name: 'oid_tws',
                            label: 'TWS',
                            tooltip: 'True Wind Speed (relative to the fixed earth)',
                            type: 'id',
                        },
                        {
                            name: 'oid_aws',
                            label: 'AWS',
                            tooltip: 'Apparent Wind Speed (relative to the boat)',
                            type: 'id',
                        },
                        {
                            name: 'oid_twd',
                            label: 'TWD',
                            tooltip: 'True Wind Direction (relative to true north)',
                            type: 'id',
                        },
                        {
                            name: 'oid_awa',
                            label: 'AWA',
                            tooltip: 'Apparent Wind Angle (relative to the bow, 0 to 180, starboard plus, port minus)',
                            type: 'id',
                        },
                        {
                            name: 'oid_awd',
                            label: 'AWD',
                            tooltip: 'Apparent Wind Direction (relative to true north)',
                            type: 'id',
                        },
                        {
                            name: 'oid_cog',
                            label: 'COG',
                            tooltip: 'Course Over Ground (relative to the fixed earth)',
                            type: 'id',
                        },
                        {
                            name: 'oid_sog',
                            label: 'SOG',
                            tooltip: 'Speed Over Ground (relative to the fixed earth)',
                            type: 'id',
                        },
                        {
                            name: 'oid_rudder',
                            label: 'Rudder',
                            tooltip: 'Rudder position',
                            type: 'id',
                        },
                        {
                            name: 'oid_depth',
                            label: 'Water depth',
                            tooltip: 'Water depth',
                            type: 'id',
                        },
                        {
                            name: 'oid_heading',
                            label: 'Heading',
                            tooltip: 'Magnetic heading',
                            type: 'id',
                        },
                        {
                            name: 'oid_autopilot_mode',
                            label: 'Autopilot mode',
                            type: 'id',
                        },
                        {
                            name: 'oid_autopilot_plus_1',
                            label: 'Autopilot plus 1',
                            type: 'id',
                        },
                        {
                            name: 'oid_autopilot_plus_10',
                            label: 'Autopilot plus 10',
                            type: 'id',
                        },
                        {
                            name: 'oid_autopilot_minus_1',
                            label: 'Autopilot minus 1',
                            type: 'id',
                        },
                        {
                            name: 'oid_autopilot_minus_10',
                            label: 'Autopilot minus 10',
                            type: 'id',
                        },
                    ],
                },
                {
                    name: 'displays',
                    label: 'displays',
                    fields: [
                        {
                            name: 'displayWind',
                            label: 'wind',
                            type: 'select',
                            options: [
                                { value: '1', label: 'order 1' },
                                { value: '2', label: 'order 2' },
                                { value: '3', label: 'order 3' },
                                { value: '4', label: 'order 4' },
                                { value: '0', label: 'hide' },
                            ],
                            default: '1',
                        },
                        {
                            name: 'displayCompass',
                            label: 'compass',
                            options: [
                                { value: '1', label: 'order 1' },
                                { value: '2', label: 'order 2' },
                                { value: '3', label: 'order 3' },
                                { value: '4', label: 'order 4' },
                                { value: '0', label: 'hide' },
                            ],
                            type: 'select',
                            default: '2',
                        },
                        {
                            name: 'displayRudder',
                            label: 'rudder',
                            options: [
                                { value: '1', label: 'order 1' },
                                { value: '2', label: 'order 2' },
                                { value: '3', label: 'order 3' },
                                { value: '4', label: 'order 4' },
                                { value: '0', label: 'hide' },
                            ],
                            type: 'select',
                            default: '3',
                        },
                        {
                            name: 'displayAutopilot',
                            label: 'autopilot',
                            options: [
                                { value: '1', label: 'order 1' },
                                { value: '2', label: 'order 2' },
                                { value: '3', label: 'order 3' },
                                { value: '4', label: 'order 4' },
                                { value: '0', label: 'hide' },
                            ],
                            type: 'select',
                            default: '4',
                        },
                    ],
                },
                {
                    name: 'indicator',
                    label: 'group_indicator',
                    indexFrom: 1,
                    indexTo: 'indicatorsCount',
                    fields: [
                        {
                            name: 'indicatorPosition',
                            type: 'select',
                            label: 'Position',
                            options: [
                                {
                                    value: 'left',
                                    label: 'Left / Top',
                                },
                                {
                                    value: 'right',
                                    label: 'Right / Bottom',
                                },
                            ],
                            default: 'left',
                        },
                        {
                            name: 'indicatorId',
                            label: 'id',
                            type: 'id',
                            onChange: loadIndicator,
                        },
                        {
                            name: 'indicatorName',
                            label: 'Name',
                        },
                        {
                            name: 'indicatorUnit',
                            label: 'Unit',
                        },
                        {
                            name: 'indicatorColor',
                            label: 'Color',
                            type: 'color',
                        },
                        {
                            name: 'indicatorDigitsBeforeComma',
                            label: 'Digits before comma',
                            type: 'number',
                        },
                        {
                            name: 'indicatorDigitsAfterComma',
                            label: 'Digits after comma',
                            type: 'number',
                        },
                        {
                            name: 'indicatorShowPlus',
                            label: 'Show plus',
                            type: 'checkbox',
                        },
                    ],
                },
            ],
            visDefaultStyle: {
                width: '100%',
                height: 350,
                position: 'relative',
            },
            visPrev: 'widgets/nmea/img/prev_complex.png',
        };
    }

    // eslint-disable-next-line class-methods-use-this
    getWidgetInfo() {
        return Nmea.getWidgetInfo();
    }

    async propertiesUpdate() {
        if (this.state.rxData.oid_autopilot_mode !== this.oid_autopilot_mode) {
            this.oid_autopilot_mode = this.state.rxData.oid_autopilot_mode;
            const autopilotMode = await this.props.context.socket.getObject(this.state.rxData.oid_autopilot_mode);
            if (autopilotMode) {
                this.setState({ autopilotStates: autopilotMode.common.states });
            } else {
                this.setState({ autopilotStates: {} });
            }
        }
    }

    async componentDidMount() {
        super.componentDidMount();
        await this.propertiesUpdate();
    }

    async onRxDataChanged() {
        await this.propertiesUpdate();
    }

    setValue(name, value) {
        if (this.state.rxData[`${name}-oid`]) {
            this.props.context.socket.setState(this.state.rxData[`${name}-oid`], value);
        }
    }

    renderIndicator(i) {
        const val = this.getPropertyValue(`indicatorId${i}`);

        return <Card
            key={i}
            style={{ color: this.state.rxData[`indicatorColor${i}`] }}
            className={this.props.classes.indicatorCard}
        >
            <div className={this.props.classes.indicatorName}>{this.state.rxData[`indicatorName${i}`] || ''}</div>
            <div className={this.props.classes.indicatorNumberContainer}>
                <div className={this.props.classes.indicatorNumber}>
                    {this.state.rxData[`indicatorShowPlus${i}`] && val > 0
                        ? '+' : ''}
                    {val === null || val === undefined ? '---' : (Number.isNaN(parseFloat(val)) ? val : Generic.zeroBeforeAfterComma(
                        val || 0,
                        this.state.rxData[`indicatorDigitsBeforeComma${i}`] || 0,
                        this.state.rxData[`indicatorDigitsAfterComma${i}`] || 0,
                        this.props.context.systemConfig.common.isFloatComma,
                    ))}
                </div>
                {this.state.rxData[`indicatorDigitsAfterComma${i}`] ? this.state.rxData[`indicatorUnit${i}`] : <span className={this.props.classes.indicatorNumber}>{this.state.rxData[`indicatorUnit${i}`]}</span>}
            </div>
        </Card>;
    }

    renderIndicatorsBlock(position) {
        const indicators = [];
        for (let i = 1; i <= this.state.rxData.indicatorsCount; i++) {
            if (this.state.rxData[`indicatorPosition${i}`] === position) {
                indicators.push(this.renderIndicator(i));
            }
        }
        return indicators;
    }

    renderWind() {
        const tws = this.getPropertyValue('oid_tws');
        const aws = this.getPropertyValue('oid_aws');
        const twd = this.getPropertyValue('oid_twd');
        const awd = this.getPropertyValue('oid_awd');

        return <Wind
            smallWindAngle={this.state.smallWindAngle}
            bigWindAngle={this.state.bigWindAngle}
            tws={tws === undefined ? null : tws}
            aws={aws === undefined ? null : aws}
            twd={twd === undefined ? null : twd}
            awd={awd === undefined ? null : awd}
            themeType={this.props.context.themeType}
        />;
    }

    renderNavigation() {
        const twd = this.getPropertyValue('oid_twd');
        const cog = this.getPropertyValue('oid_cog');
        const rudder = this.getPropertyValue('oid_rudder');

        return <Navigation
            angle={this.state.angle}
            smallWindAngle={this.state.smallWindAngle}
            bigWindAngle={this.state.bigWindAngle}
            twd={twd === undefined ? null : twd}
            cog={cog === undefined ? null : cog}
            rudder={rudder === undefined ? null : rudder}
            themeType={this.props.context.themeType}
        />;
    }

    renderRudder() {
        const rudder = this.getPropertyValue('oid_rudder');
        return <Rudder
            rudder={rudder === undefined ? null : rudder}
            themeType={this.props.context.themeType}
        />;
    }

    renderAutopilot() {
        const heading = this.getPropertyValue('oid_heading');
        const cog = this.getPropertyValue('oid_cog');
        const autopilotMode = this.getPropertyValue('oid_autopilot_mode');
        const rudder = this.getPropertyValue('oid_rudder');

        return <Autopilot
            cog={cog === undefined ? null : cog}
            heading={heading === undefined ? null : heading}
            mode={autopilotMode === undefined ? null : autopilotMode}
            modeId={this.state.rxData.oid_autopilot_mode}
            plus1Id={this.state.rxData.oid_autopilot_plus_1}
            plus10Id={this.state.rxData.oid_autopilot_plus_10}
            minus1Id={this.state.rxData.oid_autopilot_minus_1}
            minus10Id={this.state.rxData.oid_autopilot_minus_10}
            autopilotStates={this.state.autopilotStates}
            context={this.props.context}
            rudder={rudder === undefined ? null : rudder}
            themeType={this.props.context.themeType}
        />;
    }

    renderWidgetBody(props) {
        super.renderWidgetBody(props);

        let windows = [
            this.state.rxData.displayWind !== '0' ? {
                order: parseInt(this.state.rxData.displayWind) || 0,
                el: this.renderWind.bind(this),
            } : null,
            this.state.rxData.displayCompass !== '0' ? {
                order: parseInt(this.state.rxData.displayCompass) || 0,
                el: this.renderNavigation.bind(this),
            } : null,
            this.state.rxData.displayRudder !== '0' ? {
                order: parseInt(this.state.rxData.displayRudder) || 0,
                el: this.renderRudder.bind(this),
            } : null,
            this.state.rxData.displayAutopilot !== '0' ? {
                order: parseInt(this.state.rxData.displayAutopilot) || 0,
                el: this.renderAutopilot.bind(this),
            } : null,
        ]
            .filter(n => n);

        windows.sort((a, b) => a.order - b.order);

        // If window index does not exist, reset it to 0
        if (this.state.window >= windows.length) {
            setTimeout(() => this.setState({ window: 0 }), 50);
            return null;
        }

        // Render only visible windows
        windows = windows.map((item, index) =>
            ((index === this.state.window || index === this.state.prevWindow || index === this.state.nextWindow) ? item.el : null));

        const vertical = this.contentRef.current?.offsetHeight > this.contentRef.current?.offsetWidth;

        let currentWindow = 1;
        if (this.state.nextWindow !== undefined) {
            currentWindow = 2;
        }
        if (this.state.prevWindow !== undefined) {
            currentWindow = 0;
        }

        const content = <div
            style={vertical ? {
                gridTemplateRows: 'min-content auto min-content min-content',
                gridTemplateColumns: 'auto',
                gridTemplateAreas: '"left" "main" "right" "bottom"',
            } :
                {
                    gridTemplateColumns: 'min-content auto min-content',
                    gridTemplateRows: 'auto min-content',
                    gridTemplateAreas: '"left main right" "bottom bottom bottom"',
                }}
            className={this.props.classes.content}
            ref={this.contentRef}
        >
            <div
                style={{ flexDirection: vertical ? 'row' : 'column' }}
                className={this.props.classes.leftPanel}
            >
                {this.renderIndicatorsBlock('left')}
            </div>
            <div className={this.props.classes.mainPanel}>
                <div
                    style={{
                        transform: `translate3d(0px, ${-currentWindow * 100}%, 0px)`,
                        transition: this.state.nextWindow !== undefined || this.state.prevWindow !== undefined ? undefined : 'none',
                    }}
                    className={this.props.classes.carousel}
                >
                    {[this.state.prevWindow, this.state.window, this.state.nextWindow].map((windowIndex, i) => <div
                        key={windowIndex === undefined ? 1000 + i : windowIndex}
                        className={this.props.classes.windowPanel}
                    >
                        {windowIndex === undefined || !windows[windowIndex] ? null : windows[windowIndex]()}
                    </div>)}
                </div>
            </div>
            <div
                style={{ flexDirection: vertical ? 'row' : 'column' }}
                className={this.props.classes.rightPanel}
            >
                {this.renderIndicatorsBlock('right')}
            </div>
            {windows.length > 1 ? <div className={this.props.classes.bottomPanel}>
                <IconButton
                    onClick={() => {
                        const _window = this.state.window === 0 ? windows.length - 1 : this.state.window - 1;
                        this.setState({ prevWindow: _window });
                        window.localStorage.setItem(`vis.${this.props.id}`, _window.toString());
                        setTimeout(() => this.setState({
                            window: _window,
                            prevWindow: undefined,
                        }), 500);
                    }}
                >
                    <KeyboardArrowUp />
                </IconButton>
                <IconButton
                    onClick={() => {
                        const _window = this.state.window >= windows.length - 1 ? 0 : this.state.window + 1;
                        this.setState({ nextWindow: _window });
                        window.localStorage.setItem(`vis.${this.props.id}`, _window.toString());
                        setTimeout(() => this.setState({
                            window: _window,
                            nextWindow: undefined,
                        }), 500);
                    }}
                >
                    <KeyboardArrowDown />
                </IconButton>
            </div> : null}
        </div>;

        return this.wrapContent(content);
    }
}

Nmea.propTypes = {
    systemConfig: PropTypes.object,
    socket: PropTypes.object,
    themeType: PropTypes.string,
    style: PropTypes.object,
    data: PropTypes.object,
};

export default withStyles(styles)(Nmea);
