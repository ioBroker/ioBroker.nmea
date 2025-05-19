import React, { useEffect, useState } from 'react';

import { Button, Card, CircularProgress, Menu, MenuItem } from '@mui/material';

import { Edit } from '@mui/icons-material';

import type {
    RxRenderWidgetProps,
    RxWidgetInfo,
    RxWidgetInfoCustomComponentContext,
    VisRxWidgetProps,
    WidgetData,
} from '@iobroker/types-vis-2';

import Generic, { type GenericState } from './Generic';
import Wind from './Components/Wind';
import Navigation from './Components/Navigation';
import Rudder from './Components/Rudder';
import Autopilot from './Components/Autopilot';
import ItemsEditorDialog, { type InstrumentItem } from './Components/ItemsEditorDialog';

const styles: Record<string, React.CSSProperties> = {
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
        minWidth: 100,
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
        right: 0,
        position: 'absolute',
        zIndex: 1,
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
    newValue: {
        animation: 'nmea-newValueAnimation 2s ease-in-out',
    },
};

const POSSIBLE_NAMES: Record<string, string[]> = {
    oid_tws: ['windData.windSpeedTrue'],
    oid_aws: ['windData.windSpeedApparent'],
    oid_twd: ['windData.windDirectionTrue'],
    oid_awa: ['windData.windAngle'],
    oid_awd: ['windData.windDirectionApparent'],
    oid_cog: ['directionData.cogTrue'],
    oid_sog: ['directionData.sog'],
    oid_rudder: ['rudder.position'],
    oid_depth: ['waterDepth.depth'],
    oid_heading: ['autoPilot.heading'],
    oid_autopilot_mode: ['autoPilot.state'],
    oid_autopilot_plus_1: ['autoPilot.headingPlus1'],
    oid_autopilot_plus_10: ['autoPilot.headingPlus10'],
    oid_autopilot_minus_1: ['autoPilot.headingMinus1'],
    oid_autopilot_minus_10: ['autoPilot.headingMinus10'],
};

interface NmeaRxData {
    oid_tws?: string;
    oid_aws?: string;
    oid_twd?: string;
    oid_awa?: string;
    oid_awd?: string;
    oid_cog?: string;
    oid_sog?: string;
    oid_rudder?: string;
    oid_depth?: string;
    oid_heading?: string;
    oid_autopilot_mode?: string;
    oid_autopilot_plus_1?: string;
    oid_autopilot_plus_10?: string;
    oid_autopilot_minus_1?: string;
    oid_autopilot_minus_10?: string;

    rudderMinMax?: number;
    rudderZoomAt: number;
    rudderZoomDelay?: number;

    noCard: boolean;
    widgetTitle: string;
    sync: boolean;

    displayWind: '0' | '1' | '2' | '3' | '4';
    displayCompass: '0' | '1' | '2' | '3' | '4';
    displayRudder: '0' | '1' | '2' | '3' | '4';
    displayAutopilot: '0' | '1' | '2' | '3' | '4';
    items: string;
}

function ItemsEditor(props: {
    context: RxWidgetInfoCustomComponentContext;
    data: NmeaRxData;
    id: string;
    setData: (newData: WidgetData) => void;
}): React.JSX.Element {
    const [open, setOpen] = useState(false);

    return (
        <>
            <Button
                style={{ whiteSpace: 'nowrap' }}
                onClick={() => setOpen(true)}
                variant="outlined"
                startIcon={<Edit />}
            >
                {Generic.t('Edit items')}
            </Button>
            {open ? (
                <ItemsEditorDialog
                    withPosition
                    context={props.context}
                    data={props.data}
                    wid={props.id}
                    onClose={items => {
                        if (items) {
                            const data: NmeaRxData = JSON.parse(JSON.stringify(props.data));
                            data.items = JSON.stringify(items);
                            props.setData(data);
                        }
                        setOpen(false);
                    }}
                />
            ) : null}
        </>
    );
}

const InstanceField = (props: {
    context: RxWidgetInfoCustomComponentContext;
    data: WidgetData;
    setData: (data: WidgetData) => void;
}): React.JSX.Element => {
    const [instances, setInstances] = useState<
        | {
              value: `nmea.${string}`;
              label: `nmea.${string}`;
          }[]
        | null
    >(null);
    const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);

    useEffect(() => {
        (async () => {
            const _instances: {
                value: `nmea.${string}`;
                label: `nmea.${string}`;
            }[] = [];
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

    return instances ? (
        <>
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
                {instances.map(_instance => (
                    <MenuItem
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
                            if (changed) {
                                props.setData(data);
                            }
                            setAnchorEl(null);
                        }}
                        key={_instance.value}
                        value={_instance.value}
                    >
                        {_instance.label}
                    </MenuItem>
                ))}
            </Menu>
        </>
    ) : (
        <CircularProgress />
    );
};

interface NmeaState extends GenericState {
    angle: number;
    smallWindAngle: number;
    bigWindAngle: number;
    width: number;
    height: number;
    autopilotStates: Record<string, string>;
    myValues: Record<string, ioBroker.StateValue>;
    rudderMinMax: null | number;
}

export default class Nmea extends Generic<NmeaRxData, NmeaState> {
    private readonly subscribed: string[] = [];
    private readonly contentRef: React.RefObject<HTMLDivElement> = React.createRef();
    private oid_autopilot_mode: string | undefined;
    private oid_rudder: string | undefined;
    private subscribing: string | undefined;
    private myValuesTimer: ReturnType<typeof setTimeout> | null = null;
    private myValues: Record<string, ioBroker.StateValue> | null = null;

    constructor(props: VisRxWidgetProps) {
        super(props);
        this.state = {
            ...this.state,
            index: parseInt(window.localStorage.getItem(`vis.${this.props.id}`) || '0', 10) || 0,
            angle: 0,
            smallWindAngle: 20,
            bigWindAngle: 40,
            width: 2,
            height: 2,
            autopilotStates: { 0: 'Standby' },
            myValues: {},
            rudderMinMax: null,
        };
    }

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplNmeaComplex',
            visSet: 'nmea',

            visSetLabel: 'set_label', // Label of this widget set
            visSetColor: '#0783ff', // Color of this widget set

            visWidgetLabel: 'complex', // Label of widget
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
                            name: 'items',
                            label: 'Indicators',
                            type: 'custom',
                            noBinding: true,
                            component: (field, data, setData, props) => (
                                <ItemsEditor
                                    id={props.selectedWidget}
                                    data={data as NmeaRxData}
                                    setData={setData}
                                    context={props.context}
                                />
                            ),
                            default: '[]',
                        },
                        {
                            name: 'sync',
                            type: 'checkbox',
                            label: 'Synchronize',
                            tooltip: 'Synchronize with other browsers',
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
                            component: (field, data, setData, props) => (
                                <InstanceField
                                    data={data}
                                    setData={setData}
                                    context={props.context}
                                />
                            ),
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
                            label: 'Autopilot heading',
                            tooltip: 'Autopilot heading',
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
                    name: 'rudder',
                    label: 'rudder',
                    hidden: '!data.oid_rudder',
                    fields: [
                        {
                            name: 'rudderMinMax',
                            label: 'rudderMinMax',
                            type: 'slider',
                            min: 1,
                            max: 90,
                        },
                        {
                            name: 'rudderZoomAt',
                            label: 'rudderZoomAt',
                            type: 'slider',
                            min: 1,
                            max: 45,
                            default: 12,
                        },
                        {
                            name: 'rudderZoomDelay',
                            label: 'rudderZoomDelay',
                            type: 'slider',
                            min: 1,
                            max: 10,
                            default: 4,
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

    getWidgetInfo(): RxWidgetInfo {
        return Nmea.getWidgetInfo();
    }

    async propertiesUpdate(): Promise<void> {
        if (this.state.rxData.oid_autopilot_mode !== this.oid_autopilot_mode) {
            this.oid_autopilot_mode = this.state.rxData.oid_autopilot_mode;
            const autopilotMode =
                this.oid_autopilot_mode && (await this.props.context.socket.getObject(this.oid_autopilot_mode));
            if (autopilotMode) {
                this.setState({ autopilotStates: autopilotMode.common.states });
            } else {
                this.setState({ autopilotStates: {} });
            }
        }

        if (this.state.rxData.oid_rudder !== this.oid_rudder) {
            this.oid_rudder = this.state.rxData.oid_rudder;
            const rudderMinMax = this.oid_rudder && (await this.props.context.socket.getObject(this.oid_rudder));
            if (rudderMinMax) {
                this.setState({
                    rudderMinMax: Math.abs(rudderMinMax.common.max || rudderMinMax.common.min || 0) || null,
                });
            } else {
                this.setState({ rudderMinMax: null });
            }
        }

        const items: InstrumentItem[] =
            typeof this.state.data.items === 'string'
                ? JSON.parse(this.state.data.items || '[]')
                : this.state.data.items || [];

        if (items) {
            for (let i = 0; i < items.length; i++) {
                if (items[i].oid && !this.subscribed.includes(items[i].oid) && items[i].enabled !== false) {
                    this.subscribed.push(items[i].oid);
                    await this.props.context.socket.subscribeStateAsync(items[i].oid, this.onMyStateChanged);
                }
            }
            for (let i = this.subscribed.length - 1; i >= 0; i--) {
                if (!items.find(item => item.oid === this.subscribed[i] && item.enabled !== false)) {
                    this.props.context.socket.unsubscribeState(this.subscribed[i], this.onMyStateChanged);
                    this.subscribed.splice(i, 1);
                }
            }
            this.subscribed.sort();
            this.subscribing = JSON.stringify(this.subscribed);
        }

        await this.initSync();
    }

    async componentDidMount(): Promise<void> {
        await super.componentDidMount();
        await this.propertiesUpdate();
    }

    componentWillUnmount(): void {
        super.componentWillUnmount();
        if (this.myValuesTimer) {
            clearTimeout(this.myValuesTimer);
            this.myValuesTimer = null;
        }
        for (let i = 0; i < this.subscribed.length; i++) {
            this.props.context.socket.unsubscribeState(this.subscribed[i], this.onMyStateChanged);
        }
    }

    onMyStateChanged = (id: string, state: ioBroker.State | null | undefined): void => {
        if (state && state.val !== null && state.val !== undefined && this.state.myValues[id] !== state.val) {
            this.myValues ||= JSON.parse(JSON.stringify(this.state.myValues || {}));
            this.myValues![id] = state.val;
            this.myValuesTimer =
                this.myValuesTimer ||
                setTimeout(() => {
                    this.myValuesTimer = null;
                    const myValues = this.myValues;
                    this.myValues = null;
                    this.setState({ myValues: myValues! });
                }, 100);
        }
    };

    async onRxDataChanged(): Promise<void> {
        await this.propertiesUpdate();
    }

    renderIndicator(item: InstrumentItem, i: number): React.JSX.Element {
        const val = this.state.myValues[item.oid];

        return (
            <Card
                key={i}
                style={{ ...styles.indicatorCard, color: item.color }}
            >
                <div style={styles.indicatorName}>{item.name || ''}</div>
                <div style={styles.indicatorNumberContainer}>
                    <div style={{ ...styles.indicatorNumber, ...(item.changes ? styles.newValue : undefined) }}>
                        {item.showPlus && (val as number) > 0 ? '+' : ''}
                        {val === null || val === undefined
                            ? '---'
                            : Number.isNaN(parseFloat(val as string))
                              ? val
                              : Generic.zeroBeforeAfterComma(
                                    parseFloat(val as string) || 0,
                                    parseInt((item.beforeComma as string) || '0', 10) || 0,
                                    parseInt((item.afterComma as string) || '0', 10) || 0,
                                    this.props.context.systemConfig.common.isFloatComma,
                                )}
                    </div>
                    {item.afterComma ? item.unit : <span style={styles.indicatorNumber}>{item.unit}</span>}
                </div>
            </Card>
        );
    }

    renderIndicatorsBlock(items: InstrumentItem[], position?: 'left' | 'right'): React.JSX.Element[] | null {
        const indicators: React.JSX.Element[] = [];
        if (!items?.length) {
            return null;
        }
        for (let i = 0; i < items.length; i++) {
            if (
                items[i].enabled !== false &&
                (items[i].position === position || (!items[i].position && position === 'left'))
            ) {
                indicators.push(this.renderIndicator(items[i], i));
            }
        }
        return indicators;
    }

    renderWind(): React.JSX.Element {
        const tws = this.getPropertyValue('oid_tws');
        const aws = this.getPropertyValue('oid_aws');
        const twd = this.getPropertyValue('oid_twd');
        const awd = this.getPropertyValue('oid_awd');

        return (
            <Wind
                // smallWindAngle={this.state.smallWindAngle}
                // bigWindAngle={this.state.bigWindAngle}
                tws={tws === undefined ? null : tws}
                aws={aws === undefined ? null : aws}
                twd={twd === undefined ? null : twd}
                awd={awd === undefined ? null : awd}
                themeType={this.props.context.themeType}
            />
        );
    }

    renderNavigation(): React.JSX.Element {
        const twd = this.getPropertyValue('oid_twd');
        const cog = this.getPropertyValue('oid_cog');
        const rudder = this.state.rxData.oid_rudder ? this.getPropertyValue('oid_rudder') : false;

        return (
            <Navigation
                // angle={this.state.angle}
                // smallWindAngle={this.state.smallWindAngle}
                // bigWindAngle={this.state.bigWindAngle}
                twd={twd === undefined ? null : twd}
                cog={cog === undefined ? null : cog}
                rudder={rudder === undefined ? null : rudder}
                themeType={this.props.context.themeType}
            />
        );
    }

    renderRudder(): React.JSX.Element {
        const rudder = this.getPropertyValue('oid_rudder');
        return (
            <Rudder
                minMax={this.state.rxData.rudderMinMax || this.state.rudderMinMax || undefined}
                zoomAt={this.state.rxData.rudderZoomAt}
                zoomDelay={this.state.rxData.rudderZoomDelay || 4}
                rudder={rudder === undefined ? null : rudder}
                themeType={this.props.context.themeType}
            />
        );
    }

    renderAutopilot(): React.JSX.Element {
        const heading = this.getPropertyValue('oid_heading');
        const cog = this.getPropertyValue('oid_cog');
        const autopilotMode = this.getPropertyValue('oid_autopilot_mode');
        const rudder = this.state.rxData.oid_rudder ? this.getPropertyValue('oid_rudder') : false;

        return (
            <Autopilot
                cog={cog === undefined ? null : cog}
                heading={heading === undefined ? null : heading}
                mode={autopilotMode === undefined ? null : autopilotMode}
                rudder={rudder === undefined ? null : rudder}
                modeId={this.state.rxData.oid_autopilot_mode}
                plus1Id={this.state.rxData.oid_autopilot_plus_1}
                plus10Id={this.state.rxData.oid_autopilot_plus_10}
                minus1Id={this.state.rxData.oid_autopilot_minus_1}
                minus10Id={this.state.rxData.oid_autopilot_minus_10}
                autopilotStates={this.state.autopilotStates}
                context={this.props.context}
                themeType={this.props.context.themeType}
            />
        );
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element | React.JSX.Element[] | null {
        super.renderWidgetBody(props);

        const items: InstrumentItem[] =
            typeof this.state.data.items === 'string'
                ? JSON.parse(this.state.data.items || '[]')
                : this.state.data.items || [];

        const oids = items
            .filter(item => item.oid && item.enabled !== false)
            .map(item => item.oid)
            .filter(oid => oid)
            .sort();

        if (JSON.stringify(oids) !== this.subscribing) {
            this.subscribing = JSON.stringify(oids);
            setTimeout(() => this.propertiesUpdate(), 100);
        }

        const _windows: ({
            el: () => React.JSX.Element;
            order: number;
        } | null)[] = [
            this.state.rxData.displayWind !== '0'
                ? {
                      order: parseInt(this.state.rxData.displayWind) || 0,
                      el: this.renderWind.bind(this),
                  }
                : null,
            this.state.rxData.displayCompass !== '0'
                ? {
                      order: parseInt(this.state.rxData.displayCompass) || 0,
                      el: this.renderNavigation.bind(this),
                  }
                : null,
            this.state.rxData.displayRudder !== '0'
                ? {
                      order: parseInt(this.state.rxData.displayRudder) || 0,
                      el: this.renderRudder.bind(this),
                  }
                : null,
            this.state.rxData.displayAutopilot !== '0'
                ? {
                      order: parseInt(this.state.rxData.displayAutopilot) || 0,
                      el: this.renderAutopilot.bind(this),
                  }
                : null,
        ];

        const windows: {
            el: () => React.JSX.Element;
            order: number;
        }[] = _windows.filter(item => item !== null) as {
            el: () => React.JSX.Element;
            order: number;
        }[];

        windows.sort((a, b) => a.order - b.order);

        // If window index does not exist, reset it to 0
        if (this.state.index >= windows.length) {
            setTimeout(() => this.setState({ index: 0 }), 50);
            return null;
        }

        // Render only visible windows
        const windowElements = windows.map((item, index) =>
            index === this.state.index || index === this.state.prevIndex || index === this.state.nextIndex
                ? item.el
                : null,
        );

        const vertical = (this.contentRef.current?.offsetHeight || 0) > (this.contentRef.current?.offsetWidth || 0);

        let currentWindow = 1;
        if (this.state.nextIndex !== undefined) {
            currentWindow = 2;
        }
        if (this.state.prevIndex !== undefined) {
            currentWindow = 0;
        }

        const content = (
            <div
                style={{
                    ...styles.content,
                    ...(vertical
                        ? {
                              gridTemplateRows: 'min-content auto min-content min-content',
                              gridTemplateColumns: 'auto',
                              gridTemplateAreas: '"left" "main" "right" "bottom"',
                          }
                        : {
                              gridTemplateColumns: 'min-content auto min-content',
                              gridTemplateRows: 'auto min-content',
                              gridTemplateAreas: '"left main right" "bottom bottom bottom"',
                          }),
                }}
                ref={this.contentRef}
            >
                <style>
                    {`
@keyframes nmea-newValueAnimation {
    0% {
        color: #00f900;
    }
    80% {
        color: #008000;
    }
    100% {
        color: ${this.props.context.themeType === 'dark' ? '#fff' : '#000'};
    }
}               
`}
                </style>
                <div style={{ ...styles.leftPanel, flexDirection: vertical ? 'row' : 'column' }}>
                    {this.renderIndicatorsBlock(items, 'left')}
                </div>
                <div style={styles.mainPanel}>
                    <div
                        style={{
                            ...styles.carousel,
                            transform: `translate3d(0px, ${-currentWindow * 100}%, 0px)`,
                            transition:
                                this.state.nextIndex !== undefined || this.state.prevIndex !== undefined
                                    ? undefined
                                    : 'none',
                        }}
                    >
                        {[this.state.prevIndex, this.state.index, this.state.nextIndex].map((windowIndex, i) => (
                            <div
                                key={windowIndex === undefined ? 1000 + i : windowIndex}
                                style={styles.windowPanel}
                            >
                                {windowIndex === undefined || !windowElements[windowIndex]
                                    ? null
                                    : windowElements[windowIndex]()}
                            </div>
                        ))}
                    </div>
                </div>
                <div
                    style={{
                        ...styles.rightPanel,
                        flexDirection: vertical ? 'row' : 'column',
                        marginBottom: vertical && windowElements.length > 1 ? 24 : 0,
                    }}
                >
                    {this.renderIndicatorsBlock(items, 'right')}
                </div>
                {windowElements.length > 1
                    ? this.renderNextPrevButtons(windowElements.length, styles.bottomPanel)
                    : null}
            </div>
        );

        return this.wrapContent(content);
    }
}
