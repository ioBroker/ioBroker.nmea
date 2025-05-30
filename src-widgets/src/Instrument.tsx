import React, { useState } from 'react';

import { Button } from '@mui/material';

import { Edit } from '@mui/icons-material';

import type {
    RxRenderWidgetProps,
    RxWidgetInfo,
    RxWidgetInfoCustomComponentContext,
    VisRxWidgetProps,
    WidgetData,
} from '@iobroker/types-vis-2';

import Generic, { type GenericState } from './Generic';
import ItemsEditorDialog, { type InstrumentItem } from './Components/ItemsEditorDialog';

const styles: Record<string, React.CSSProperties> = {
    content: {
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
    },
    indicatorCard: {
        padding: 10,
        width: '100%',
        height: '100%',
        overflow: 'hidden',
    },
    bottomPanel: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: '100%',
        zIndex: 1,
    },
    mainPanel: {
        overflow: 'hidden',
        width: '100%',
        height: '100%',
    },
    carousel: {
        transition: 'all .35s ease-in-out',
        width: '100%',
        height: '100%',
    },
    windowPanel: {
        minHeight: '100%',
        maxHeight: '100%',
    },
    name: {
        fontWeight: 'bold',
        whiteSpace: 'nowrap',
        height: '20%',
    },
    unit: {
        opacity: 0.5,
        display: 'inline-block',
    },
    numberContainer: {
        width: '100%',
        textAlign: 'center',
        whiteSpace: 'nowrap',
        height: '80%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'baseline',
    },
    number: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    newValue: {
        animation: 'nmea-newValueAnimation 2s ease-in-out',
    },
};

export interface InstrumentRxData {
    noCard: boolean;
    widgetTitle: string;
    // It is a stringified array of InstrumentItem
    items: string;
    sync: boolean;
}

function ItemsEditor(props: {
    context: RxWidgetInfoCustomComponentContext;
    data: InstrumentRxData;
    id: string;
    setData: (data: WidgetData) => void;
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
                    context={props.context}
                    data={props.data}
                    wid={props.id}
                    onClose={(items?: string): void => {
                        if (items) {
                            const data: InstrumentRxData = JSON.parse(JSON.stringify(props.data));
                            data.items = items;
                            props.setData(data);
                        }
                        setOpen(false);
                    }}
                />
            ) : null}
        </>
    );
}

function calculateTextWidth(text: string, fontSize: number): number {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    ctx!.font = `${fontSize}px Roboto, Arial`; // Set your font-size
    const metrics = ctx!.measureText(text);

    return metrics.width;
}

interface InstrumentState extends GenericState {
    myValues: Record<string, ioBroker.StateValue>;
    divWidth: number | null;
}

export default class Instrument extends Generic<InstrumentRxData, InstrumentState> {
    private readonly contentRef: React.RefObject<HTMLDivElement> = React.createRef();
    private subscribed: string | null = null;
    private fontSize: Record<string, number> = {};

    constructor(props: VisRxWidgetProps) {
        super(props);
        this.state = {
            ...this.state,
            index: parseInt(window.localStorage.getItem(`vis.${this.props.id}`) || '0', 10) || 0,
            myValues: {},
            divWidth: null,
        };
    }

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplNmeaInstrument',
            visSet: 'nmea',

            visWidgetLabel: 'instrument', // Label of widget
            visName: 'Instrument',
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
                            label: 'editor',
                            type: 'custom',
                            noBinding: true,
                            component: (field, data, setData, props) => (
                                <ItemsEditor
                                    id={props.selectedWidget}
                                    data={data as InstrumentRxData}
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
            ],
            visDefaultStyle: {
                width: '100%',
                height: 200,
                position: 'relative',
            },
            visPrev: 'widgets/nmea/img/prev_instrument.png',
        };
    }

    getWidgetInfo(): RxWidgetInfo {
        return Instrument.getWidgetInfo();
    }

    onMyStateChanged = (id: string, state: ioBroker.State | null | undefined): void => {
        if (state && state.val !== null && state.val !== undefined && this.state.myValues[id] !== state.val) {
            const myValues = JSON.parse(JSON.stringify(this.state.myValues || {}));
            myValues[id] = state.val;
            this.setState({ myValues });
        }
    };

    async onRxDataChanged(): Promise<void> {
        await this.initSync();
    }

    async componentDidMount(): Promise<void> {
        await super.componentDidMount();
        // read one time the values
        const items =
            typeof this.state.data.items === 'string'
                ? JSON.parse(this.state.data.items || '[]')
                : this.state.data.items || [];
        if (items) {
            const myValues = JSON.parse(JSON.stringify(this.state.myValues || {}));
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.oid) {
                    const state = await this.props.context.socket.getState(item.oid);
                    if (state && state.val !== null && state.val !== undefined) {
                        myValues[item.oid] = state.val;
                    }
                }
            }

            this.setState({ myValues });
        }
        await super.initSync();
    }

    componentWillUnmount(): void {
        super.componentWillUnmount();
        this.subscribed && this.props.context.socket.unsubscribeState(this.subscribed, this.onMyStateChanged);
    }

    renderInstrument(item: InstrumentItem, index: number): React.JSX.Element | null {
        if (!item) {
            return null;
        }
        const width = this.contentRef.current ? this.contentRef.current.clientWidth : 0;
        if (!width || this.state.divWidth !== width) {
            width && setTimeout(() => this.setState({ divWidth: width }), 0);

            return null;
        }

        const val = item.oid ? this.state.myValues[item.oid] : null;
        const height = this.contentRef.current ? this.contentRef.current.clientHeight : 0;
        const fontSize = height / 2;
        const nameFontSize = fontSize / 2;
        // Calculate width of the text
        const nameKey = `NAME_${item.name}_${width}`;
        if (item.name && !this.fontSize[nameKey]) {
            const w = calculateTextWidth(item.name, nameFontSize);
            if (w > width) {
                this.fontSize[nameKey] = Math.ceil((nameFontSize * width) / (w * 1.2));
            } else {
                this.fontSize[nameKey] = Math.ceil(nameFontSize);
            }
        }
        // Calculate width of value with unit
        let text = item.showPlus && (val as number) > 0 ? '+' : '';
        let parts: string[] | undefined;
        if (val === null || val === undefined) {
            text = '---';
        } else if (Number.isNaN(parseFloat(val as unknown as string))) {
            text += val;
        } else {
            parts = Generic.zeroBeforeAfterComma(
                parseFloat(val as string) || 0,
                parseInt((item.beforeComma as string) || '0', 10) || 0,
                parseInt((item.afterComma as string) || '0', 10) || 0,
                this.props.context.systemConfig.common.isFloatComma,
                false,
            ) as string[];
            parts[0] = text + parts[0];
            text = parts.join('');
        }
        const valKey = `VALUE_${text + (item.unit || '')}_${width}`;
        if (!this.fontSize[valKey]) {
            if (parts) {
                const w1 = calculateTextWidth(parts[0], fontSize);
                const w2 = parts[1] ? calculateTextWidth(parts[1], fontSize / 1.2) : 0;
                const u = item.unit ? calculateTextWidth(item.unit, fontSize / 2) : 0;
                if (w1 + w2 + u > width) {
                    this.fontSize[valKey] = Math.ceil((fontSize * width) / ((w1 + w2 + u) * 1.2));
                } else {
                    this.fontSize[valKey] = Math.ceil(fontSize);
                }
            } else {
                const w1 = calculateTextWidth(text, fontSize);
                const u = item.unit ? calculateTextWidth(item.unit, fontSize / 2) : 0;
                if (w1 + u > width) {
                    this.fontSize[valKey] = Math.ceil((fontSize * width) / (w1 + u));
                } else {
                    this.fontSize[valKey] = Math.ceil(fontSize);
                }
            }
        }

        return (
            <div
                key={index}
                style={{ ...styles.indicatorCard, color: item.color || undefined }}
            >
                <div style={{ ...styles.name, fontSize: this.fontSize[nameKey] }}>{item.name}</div>
                <div style={styles.numberContainer}>
                    <div
                        key={valKey}
                        style={{
                            ...styles.number,
                            ...(item.changes ? styles.newValue : undefined),
                            fontSize: this.fontSize[valKey],
                            height: height * 0.7,
                        }}
                    >
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
                                    this.fontSize[valKey] / 1.2,
                                )}
                    </div>
                    {item.unit ? (
                        <div style={{ ...styles.unit, fontSize: this.fontSize[valKey] / 2 }}>{item.unit}</div>
                    ) : null}
                </div>
            </div>
        );
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element | React.JSX.Element[] | null {
        super.renderWidgetBody(props);
        let items: InstrumentItem[] =
            typeof this.state.data.items === 'string'
                ? JSON.parse(this.state.data.items || '[]')
                : this.state.data.items || [];

        if (!items?.length) {
            return this.wrapContent(<span>{Generic.t('No items defined!')}</span>);
        }
        items = items.filter(item => item.enabled !== false);

        // If window index does not exist, reset it to 0
        if (this.state.index >= items.length) {
            setTimeout(() => this.setState({ index: 0 }), 50);
            return null;
        }

        const oid = items[this.state.index] && items[this.state.index].oid;
        if (this.subscribed !== oid) {
            const unsubscribe = this.subscribed;
            this.subscribed = oid;
            setTimeout(
                _unsubscribe => {
                    if (_unsubscribe) {
                        this.props.context.socket.unsubscribeState(_unsubscribe, this.onMyStateChanged);
                    }
                    if (this.subscribed) {
                        void this.props.context.socket.subscribeState(this.subscribed, this.onMyStateChanged);
                    }
                },
                100,
                unsubscribe,
            );
        }

        let currentIndex = 1;
        if (this.state.nextIndex !== undefined) {
            currentIndex = 2;
        }
        if (this.state.prevIndex !== undefined) {
            currentIndex = 0;
        }

        const content = (
            <div style={styles.content}>
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
                <div style={styles.mainPanel}>
                    <div
                        style={{
                            ...styles.carousel,
                            transform: `translate3d(0px, ${-currentIndex * 100}%, 0px)`,
                            transition:
                                this.state.nextIndex !== undefined || this.state.prevIndex !== undefined
                                    ? undefined
                                    : 'none',
                            width: '100%',
                            height: '100%',
                        }}
                        ref={this.contentRef}
                    >
                        {[this.state.prevIndex, this.state.index, this.state.nextIndex].map((index, i) => (
                            <div
                                key={i}
                                style={styles.windowPanel}
                            >
                                {index === undefined || !items[index]
                                    ? null
                                    : this.renderInstrument(items[index], index)}
                            </div>
                        ))}
                    </div>
                </div>
                {items.length > 1 ? this.renderNextPrevButtons(items.length, styles.bottomPanel) : null}
            </div>
        );

        return this.wrapContent(content);
    }
}
