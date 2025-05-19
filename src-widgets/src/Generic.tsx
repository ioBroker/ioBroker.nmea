import React from 'react';

import { IconButton } from '@mui/material';
import { KeyboardArrowDown, KeyboardArrowUp } from '@mui/icons-material';

import type { VisRxWidgetProps, VisRxWidgetState } from '@iobroker/types-vis-2';
import type VisRxWidget from '@iobroker/types-vis-2/visRxWidget';

export interface GenericState extends VisRxWidgetState {
    index: number;
    prevIndex: number | undefined;
    nextIndex: number | undefined;
}

export default class Generic<
    RxData extends Record<string, any>,
    State extends Partial<GenericState> = GenericState,
> extends (window.visRxWidget as typeof VisRxWidget)<RxData, State> {
    private widgetStateId: string | null = null;
    private subscribeInited = false;

    constructor(props: VisRxWidgetProps) {
        super(props);
        this.state = {
            ...this.state,
            index: 0,
        };
    }

    getPropertyValue = (stateName: string): any => this.state.values[`${(this.state.rxData as any)[stateName]}.val`];

    static getI18nPrefix(): string {
        return 'nmea_';
    }

    static DATA: Record<
        string,
        {
            indicatorDigitsBeforeComma?: number;
            indicatorDigitsAfterComma: number;
            indicatorShowPlus?: true;
            unit?: string;
            changes?: boolean;
            name?: string;
        }
    > = {
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

    static zeroBeforeAfterComma(
        num: number,
        beforeLength?: number,
        afterLength?: number,
        useComma?: boolean,
        fontSizeAfterComma?: number | false,
    ): (React.JSX.Element | string)[] {
        const numParts: (React.JSX.Element | string)[] = num.toString().split('.');
        if (beforeLength) {
            numParts[0] = (numParts[0] as string).padStart(beforeLength, '0');
        }
        if (afterLength) {
            (numParts[0] as string) += useComma ? ',' : '.';
            if (fontSizeAfterComma === false) {
                numParts[1] = parseFloat(num as unknown as string)
                    .toFixed(afterLength)
                    .split('.')[1];
            } else {
                numParts[1] = (
                    <span style={{ fontSize: fontSizeAfterComma || 30 }}>
                        {
                            parseFloat(num as unknown as string)
                                .toFixed(afterLength)
                                .split('.')[1]
                        }
                    </span>
                );
            }
        } else {
            numParts.splice(1, 1);
        }

        return numParts;
    }

    async getParentObject(id: string): Promise<ioBroker.Object | null> {
        const parts = id.split('.');
        parts.pop();
        const parentOID = parts.join('.');
        return await this.props.context.socket.getObject(parentOID);
    }

    static getObjectIcon(obj: ioBroker.Object, id: string, imagePrefix?: string): string | null {
        imagePrefix ||= '../..'; // http://localhost:8081';
        let src = '';
        const common = obj?.common;

        if (common) {
            const cIcon = common.icon;
            if (cIcon) {
                if (!cIcon.startsWith('data:image/')) {
                    if (cIcon.includes('.')) {
                        let instance;
                        if (obj.type === 'instance' || obj.type === 'adapter') {
                            src = `${imagePrefix}/adapter/${common.name as string}/${cIcon}`;
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

    onWidgetStateUpdate = (id: string, state: ioBroker.State | null | undefined): void => {
        if (id === this.widgetStateId && state?.val && !state.ack) {
            let index: number;
            if (state.val.toString().startsWith('-')) {
                index = parseInt(state.val.toString().replace('-', ''), 10);
                if (this.state.index !== index && this.state.prevIndex !== index) {
                    if (this.subscribeInited) {
                        this.setState({ prevIndex: index });
                        setTimeout(
                            () =>
                                this.setState({
                                    index,
                                    prevIndex: undefined,
                                }),
                            500,
                        );
                    } else {
                        this.setState({ index });
                        this.subscribeInited = true;
                    }
                    window.localStorage.setItem(`vis.${this.props.id}`, index.toString());
                } else {
                    this.subscribeInited = true;
                }
            } else {
                index = parseInt(state.val.toString().replace('+', ''), 10);
                if (this.state.index !== index && this.state.nextIndex !== index) {
                    window.localStorage.setItem(`vis.${this.props.id}`, index.toString());
                    if (this.subscribeInited) {
                        this.setState({ nextIndex: index });
                        setTimeout(
                            () =>
                                this.setState({
                                    index,
                                    nextIndex: undefined,
                                }),
                            500,
                        );
                    } else {
                        this.setState({ index });
                        this.subscribeInited = true;
                    }
                } else {
                    this.subscribeInited = true;
                }
            }
        }
    };

    async componentDidMount(): Promise<void> {
        super.componentDidMount();
        await this.initSync();
    }

    async initSync(): Promise<void> {
        let syncObj;
        if (this.state.rxData.sync && !this.widgetStateId) {
            // Check if the sync object exists
            this.widgetStateId = `${this.props.context.adapterName}.${this.props.context.instance}.widgets.${this.props.context.projectName}.${this.props.id}`;
            try {
                syncObj = await this.props.context.socket.getObject(this.widgetStateId);
            } catch (e) {
                console.error(`Cannot get sync object: ${e as Error}`);
            }
            if (!syncObj) {
                await this.props.context.socket.setObject(this.widgetStateId, {
                    type: 'state',
                    common: {
                        name: `Widget state synchronization for ${this.props.id}`,
                        type: 'string',
                        role: 'state',
                        read: true,
                        write: true,
                    },
                    native: {},
                });
            }
            this.subscribeInited = false;
            await this.props.context.socket.subscribeState(this.widgetStateId, this.onWidgetStateUpdate);
        } else if (!this.state.rxData.sync && this.widgetStateId) {
            this.subscribeInited = false;
            this.props.context.socket.unsubscribeState(this.widgetStateId, this.onWidgetStateUpdate);
            try {
                syncObj = await this.props.context.socket.getObject(this.widgetStateId);
            } catch (e) {
                console.error(`Cannot get sync object: ${e as Error}`);
            }
            if (syncObj) {
                await this.props.context.socket.delObject(this.widgetStateId);
            }
            this.widgetStateId = null;
        }
    }

    componentWillUnmount(): void {
        super.componentWillUnmount();
        if (this.widgetStateId) {
            this.props.context.socket.unsubscribeState(this.widgetStateId, this.onWidgetStateUpdate);
            this.widgetStateId = null;
        }
    }

    renderNextPrevButtons(maxIndex: number, stylesBottomPanel?: React.CSSProperties): React.JSX.Element | null {
        return (
            <div style={stylesBottomPanel}>
                <IconButton
                    size="large"
                    onClick={() => {
                        const index = this.state.index === 0 ? maxIndex - 1 : this.state.index! - 1;
                        this.setState({ prevIndex: index }, () => {
                            if (this.widgetStateId) {
                                this.props.context.setValue(this.widgetStateId, `-${index}`);
                            }
                        });
                        window.localStorage.setItem(`vis.${this.props.id}`, index.toString());
                        setTimeout(
                            () =>
                                this.setState({
                                    index,
                                    prevIndex: undefined,
                                }),
                            500,
                        );
                    }}
                >
                    <KeyboardArrowUp />
                </IconButton>
                <IconButton
                    size="large"
                    onClick={() => {
                        const index = this.state.index! >= maxIndex - 1 ? 0 : this.state.index! + 1;
                        this.setState({ nextIndex: index }, () => {
                            if (this.widgetStateId) {
                                this.props.context.setValue(this.widgetStateId, `+${index}`);
                            }
                        });
                        window.localStorage.setItem(`vis.${this.props.id}`, index.toString());
                        setTimeout(
                            () =>
                                this.setState({
                                    index,
                                    nextIndex: undefined,
                                }),
                            500,
                        );
                    }}
                >
                    <KeyboardArrowDown />
                </IconButton>
            </div>
        );
    }
}
