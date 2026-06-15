// Live dev harness — opens a real socket.io connection to the ioBroker admin at
// localhost:8081, wires a minimal StateContext, and renders the NMEA widgets so the
// SVG + rAF animation can be tested against actual PGN data in the browser.
//
// NOT part of the production bundle. Only loaded by src/index.tsx (Vite dev server).

import React, { useEffect, useState } from 'react';
import { Connection, type ThemeType } from '@iobroker/adapter-react-v5';
import type { IStateContext, StateChangeListener, ObjectChangeListener } from '@iobroker/dm-widgets';
import NmeaWindCompass from './NmeaWindComponent';
import NmeaHistoryChartComponent from './NmeaHistoryChartComponent';
import NmeaAutopilotComponent from './NmeaAutopilotComponent';
import NmeaAisRadarComponent from './NmeaAisRadarComponent';
import NmeaAnchorPositionComponent, { type AnchorPositionSettings } from './NmeaAnchorPositionComponent';

const IOB_HOST = '192.168.1.129';
const IOB_PORT = 8081;
const DEFAULT_INSTANCE = 'nmea.0';

type WidgetTab = 'wind' | 'autopilot' | 'aisradar' | 'anchor' | 'chart-aws' | 'chart-tws' | 'chart-sog' | 'chart-stw';

const ACTIVE_TAB_KEY = 'nmeaDevHarness.activeTab';
const VALID_TABS: readonly WidgetTab[] = [
    'wind',
    'autopilot',
    'aisradar',
    'anchor',
    'chart-aws',
    'chart-tws',
    'chart-sog',
    'chart-stw',
];

/**
 * Read the last-selected tab from localStorage; fall back to the Wind compass on first visit or
 *  whenever the stored value isn't one of the currently-defined tabs (e.g. after a rename).
 */
function loadStoredTab(): WidgetTab {
    try {
        const raw = window.localStorage.getItem(ACTIVE_TAB_KEY);
        if (raw && (VALID_TABS as readonly string[]).includes(raw)) {
            return raw as WidgetTab;
        }
    } catch {
        // Storage may be disabled (private mode, SSR, etc.) — silently fall back.
    }
    return 'wind';
}

interface ChartPreset {
    id: WidgetTab;
    tabLabel: string;
    stateId: string; // relative to instance
    label: string;
    unit: string;
    historySeconds?: number;
}

const CHART_PRESETS: ChartPreset[] = [
    {
        id: 'chart-aws',
        tabLabel: 'AWS Chart',
        stateId: 'nmea.0.windData.windSpeedApparent',
        label: 'AWS',
        unit: 'knots',
        historySeconds: 10,
    },
    {
        id: 'chart-tws',
        tabLabel: 'TWS Chart',
        stateId: 'nmea.0.windData.windSpeedTrue',
        label: 'TWS',
        unit: 'knots',
        historySeconds: 20,
    },
    {
        id: 'chart-sog',
        tabLabel: 'SOG Chart',
        stateId: 'nmea.0.cogSogRapidUpdate.sog',
        label: 'SOG',
        unit: 'knots',
        historySeconds: 30,
    },
    {
        id: 'chart-stw',
        tabLabel: 'STW Chart',
        stateId: 'nmea.0.speed.speedWaterReferenced',
        label: 'STW',
        unit: 'knots',
        historySeconds: 40,
    },
];

const overlayStyle: React.CSSProperties = {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#191c1d',
    color: '#d8dde0',
    fontFamily: 'system-ui, sans-serif',
    fontSize: 18,
};

const toolbarStyle: React.CSSProperties = {
    padding: '10px 16px',
    borderBottom: '1px solid #2a2f33',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
};

const tabButtonStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 18px',
    borderRadius: 6,
    border: `1px solid ${active ? '#4a9eff' : '#3a3f43'}`,
    background: active ? '#1b3a5c' : '#0b0f14',
    color: active ? '#ffffff' : '#d8dde0',
    fontFamily: 'system-ui, sans-serif',
    fontSize: 14,
    fontWeight: active ? 600 : 400,
    cursor: 'pointer',
    transition: 'background 120ms, border-color 120ms',
});

/**
 * Minimal IStateContext implementation that routes getState/removeState to a real
 * `@iobroker/socket-client` Connection. Fan-out per ID is handled locally so the
 * same state can have multiple subscribers (widget instance + dev UI, for example).
 */
class DevStateContext implements IStateContext {
    private handlers = new Map<string, Set<StateChangeListener>>();
    private readonly socket: Connection;

    // Fields required by IStateContext — sensible dev defaults.
    defaultHistory: string | null = null;
    instanceId = '';
    admin = false;
    language: ioBroker.Languages = 'en';
    longitude: number | null = null;
    latitude: number | null = null;
    isFloatComma = true;
    dateFormat = 'DD.MM.YYYY';
    imagePrefix = '../../files/';
    themeType: ThemeType = 'dark';

    constructor(socket: Connection) {
        this.socket = socket;
    }

    getState(id: string, handler: StateChangeListener): void {
        let set = this.handlers.get(id);
        if (!set) {
            set = new Set();
            this.handlers.set(id, set);
            void this.socket.subscribeState(id, (sid, state) => {
                const listeners = this.handlers.get(sid);
                if (!listeners || !state) {
                    return;
                }
                for (const cb of listeners) {
                    cb(sid, state);
                }
            });
            void this.socket
                .getState(id)
                .then(state => {
                    if (state) {
                        handler(id, state);
                    }
                })
                .catch(() => {});
        }
        set.add(handler);
    }

    removeState(id: string, handler: StateChangeListener): void {
        const set = this.handlers.get(id);
        if (!set) {
            return;
        }
        set.delete(handler);
        if (set.size === 0) {
            this.socket.unsubscribeState(id);
            this.handlers.delete(id);
        }
    }

    async getObject<T>(id: string): Promise<T | undefined> {
        try {
            return (await this.socket.getObject(id)) as unknown as T;
        } catch {
            return undefined;
        }
    }

    getObjectProperty(_id: string, _property: string, _cb: ObjectChangeListener): void {}
    async removeObject(_id: string, _cb: ObjectChangeListener): Promise<void> {}

    getSocket(): Connection {
        return this.socket;
    }

    getImagePath(fileName: string | null | undefined): string | null {
        return fileName || '';
    }

    destroy(): void {
        for (const id of this.handlers.keys()) {
            this.socket.unsubscribeState(id);
        }
        this.handlers.clear();
    }

    setCoordinates(latitude: number | null, longitude: number | null): void {
        this.latitude = latitude;
        this.longitude = longitude;
    }
}

/**
 * Dev subclass — the real WidgetGeneric is provided by the host via Module Federation and is
 * stubbed in the installed dm-widgets package, so `render()` returns null when the widget is
 * loaded standalone. Override it to render the compass SVG directly; all the other lifecycle
 * (subscribe/unsubscribe, rAF animations) runs unchanged.
 */
class DevWindCompass extends NmeaWindCompass {
    override render(): React.JSX.Element {
        return this.renderCompassSvg(Math.min(window.innerWidth, window.innerHeight) - 40, false);
    }
}

/**
 * The same trick for the history chart — WidgetGeneric is stubbed in dev, so call the private
 * renderChartSvg directly and wrap it in a size-constrained container.
 */
class DevHistoryChart extends NmeaHistoryChartComponent {
    override render(): React.JSX.Element {
        console.log('tick');
        const w = Math.min(window.innerWidth - 40, 1100);
        const h = Math.min(window.innerHeight - 120, Math.round(w / 1.5));
        return <div style={{ width: w, height: h }}>{this.renderChartSvg(false)}</div>;
    }
}

/**
 * Dev variant of the anchor-position widget — renders the map at a generous size for
 * inspection in the standalone harness.
 */
class DevAnchorPosition extends NmeaAnchorPositionComponent {
    override render(): React.JSX.Element {
        const w = Math.min(window.innerWidth - 40, 1400);
        const h = Math.min(window.innerHeight - 120, 800);
        return (
            <div
                style={{ display: 'flex', justifyContent: 'center' }}
                onClick={() => this.setState({ dialogOpen: true })}
            >
                <div style={{ width: w, height: h }}>{(this as any).renderMap('100%', 'dev')}</div>
                {this.state.dialogOpen ? this.renderDialog() : null}
            </div>
        );
    }
}

/**
 * Dev variant of the AIS radar — renders the radar at a square size constrained by the
 * viewport. The component manages its own Leaflet map internally; we just need to give it a
 * sized container.
 */
class DevAisRadar extends NmeaAisRadarComponent {
    override render(): React.JSX.Element {
        // Fill the available viewport — the radar SVG centres itself within whatever rectangle
        // we provide, while the Leaflet map underneath uses the full area. Caps so the harness
        // stays comfortable on huge monitors.
        const w = Math.min(window.innerWidth - 40, 1600);
        const h = Math.min(window.innerHeight - 120, 900);
        return (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
                <div style={{ width: w, height: h }}>{(this as any).renderRadar('100%', 'dev')}</div>
            </div>
        );
    }
}

/**
 * Dev variant of the autopilot dial — renders the half-circle SVG directly plus the mode +
 * heading-adjust controls, so the widget can be tested standalone without the host shell.
 *
 * In dev, we don't usually have an autopilot connected; instead, a small simulator pushes
 * synthetic values into the component's state every 200 ms so the dial demonstrates HDG
 * drift, locked-heading display, AWA pointer, and rudder bar against realistic-looking data.
 * The simulator's mode is controlled by a local `simMode` field — clicking the widget's
 * mode buttons updates it directly, bypassing the socket writing that would otherwise be
 * required for the change to be visible.
 */
class DevAutopilot extends NmeaAutopilotComponent {
    private simInterval: ReturnType<typeof setInterval> | null = null;
    private simStart = Date.now();
    private simMode = 1; // start in Auto

    override componentDidMount(): void {
        super.componentDidMount?.();
        // Tick at 5 Hz — quick enough to look smooth, light enough on the CPU.
        this.simInterval = setInterval(() => this.tickSimulation(), 200);
        this.tickSimulation();
    }

    override componentWillUnmount(): void {
        if (this.simInterval) {
            clearInterval(this.simInterval);
            this.simInterval = null;
        }
        super.componentWillUnmount?.();
    }

    private tickSimulation(): void {
        const t = (Date.now() - this.simStart) / 1000;
        // HDG slowly oscillates around the locked heading, so the rotating compass scale moves
        // visibly on screen. ±8° ≈ realistic helmsman drift / wave-driven yaw.
        const heading = (((175 + Math.sin(t / 4) * 8) % 360) + 360) % 360;
        const lockedHeading = 174;
        // AWA wobbles slowly around 35° starboard. Sign toggles every ~12 s so the pointer
        // crosses the bow now and then.
        const awa = Math.sin(t / 6) * 50;
        // Rudder oscillates ±8° to show the bar swinging port/stbd.
        const rudder = Math.sin(t / 2) * 8;
        this.setState({
            heading,
            lockedHeading,
            awa,
            rudder,
            mode: this.simMode,
        } as any);
    }

    /**
     * Intercept the mode-button clicks: in production the widget writes to the socket and
     * the new mode propagates back via subscribeAll → setState; in dev the socket write
     * silently no-ops, so capture the intent locally and let the simulator pick it up on
     * the next tick.
     */
    override render(): React.JSX.Element {
        const w = Math.min(window.innerWidth - 40, 1200);
        const showRudder = this.props.settings.showRudder !== false;
        const aspect = showRudder ? 1000 / 580 : 2;
        const h = Math.min(window.innerHeight - 200, Math.round(w / aspect));

        // Re-implement the controls inline so we can short-circuit to `simMode` instead of
        // routing through the (no-op-in-dev) socket writing. Heading-adjust buttons just bump
        // the simulated locked heading directly, ignoring boolean-button semantics.
        // The same colour scheme as the production widget — distinct hue per mode, so the active
        // state is recognisable at a glance (Standby red / Auto green / Wind blue / Track orange).
        const modes: { val: number; label: string; color: string }[] = [
            { val: 0, label: 'Standby', color: '#d32f2f' },
            { val: 1, label: 'Auto', color: '#2e7d32' },
            { val: 2, label: 'Wind', color: '#29b6f6' },
            { val: 3, label: 'Track', color: '#ed6c02' },
        ];
        const setSimMode = (m: number): void => {
            this.simMode = m;
            this.setState({ mode: m } as any);
        };
        const adjustLocked = (delta: number): void => {
            const cur = (this.state as any).lockedHeading ?? 0;
            const next = ((Math.round(cur + delta) % 360) + 360) % 360;
            this.setState({ lockedHeading: next } as any);
        };
        const mode = this.state.mode ?? 1;
        const adjustDisabled = mode === 0 || mode === 3;

        const MODE_BTN_WIDTH = 110;
        const modeButtonStyle = (active: boolean, accent: string): React.CSSProperties => ({
            width: MODE_BTN_WIDTH,
            padding: '6px 0',
            border: `1px solid ${accent}`,
            background: active ? accent : 'transparent',
            color: active ? '#fff' : accent,
            borderRadius: 6,
            fontFamily: 'system-ui, sans-serif',
            fontSize: 14,
            fontWeight: active ? 700 : 500,
            cursor: 'pointer',
        });
        const adjustButtonStyle = (disabled: boolean): React.CSSProperties => ({
            width: 60,
            padding: '6px 0',
            border: '1px solid #3a3f43',
            background: '#0b0f14',
            color: '#d8dde0',
            borderRadius: 6,
            fontFamily: 'system-ui, sans-serif',
            fontSize: 14,
            fontWeight: 500,
            opacity: disabled ? 0.4 : 1,
            cursor: disabled ? 'not-allowed' : 'pointer',
        });

        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <div style={{ width: w, height: h }}>{this.renderDialSvg('100%', false, true)}</div>
                <div style={{ display: 'flex', gap: 6 }}>
                    {modes.map(m => (
                        <button
                            type="button"
                            key={m.val}
                            style={modeButtonStyle(mode === m.val, m.color)}
                            onClick={() => setSimMode(m.val)}
                        >
                            {m.label}
                        </button>
                    ))}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                    {[-10, -1, 1, 10].map(delta => (
                        <button
                            type="button"
                            key={delta}
                            disabled={adjustDisabled}
                            style={adjustButtonStyle(adjustDisabled)}
                            onClick={() => adjustLocked(delta)}
                        >
                            {delta > 0 ? `+${delta}` : `${delta}`}
                        </button>
                    ))}
                </div>
                <div style={{ fontSize: 12, color: '#7e878e', fontFamily: 'system-ui, sans-serif' }}>
                    Simulating: HDG drifting around 174°, AWA ±50°, rudder ±8°
                </div>
            </div>
        );
    }
}

type ConnState = 'connecting' | 'ready' | { error: string };

export default function App(): React.JSX.Element {
    const [ctx, setCtx] = useState<DevStateContext | null>(null);
    const [conn, setConn] = useState<ConnState>('connecting');
    // Lazy initializer so localStorage is only read once on mount, not on every render.
    const [activeTab, setActiveTab] = useState<WidgetTab>(() => loadStoredTab());

    // Persist the tab whenever it changes, so a hard-refresh lands on the same widget.
    useEffect(() => {
        try {
            window.localStorage.setItem(ACTIVE_TAB_KEY, activeTab);
        } catch {
            // localStorage may be unavailable — non-fatal.
        }
    }, [activeTab]);

    useEffect(() => {
        let socket: Connection | null = null;
        try {
            socket = new Connection({
                host: IOB_HOST,
                port: IOB_PORT,
                protocol: 'http:',
                name: 'nmea-dev-harness',
                admin5only: true,
                onReady: () => {
                    setCtx(new DevStateContext(socket!));
                    setConn('ready');
                },
                onError: (err: Error) => setConn({ error: String(err?.message || err) }),
            } as any);
        } catch (err) {
            setConn({ error: String(err) });
        }
        return () => {
            try {
                socket?.destroy?.();
            } catch {
                // ignore
            }
        };
    }, []);

    if (conn === 'connecting') {
        return <div style={overlayStyle}>Connecting to {`http://${IOB_HOST}:${IOB_PORT}`} …</div>;
    }
    if (typeof conn === 'object' && 'error' in conn) {
        return <div style={{ ...overlayStyle, color: '#ff6b6b' }}>Connection error: {conn.error}</div>;
    }
    if (!ctx) {
        return <div style={overlayStyle}>Initializing state context …</div>;
    }

    // Minimal WidgetInfo — the widgets never read most of these, but the prop type requires them.
    const widget = {
        id: `dev-${activeTab}`,
        type: 'widget' as const,
        name: activeTab,
        control: {
            states: [],
            type: 'unknown',
            storeId: '',
            parentId: '',
            deviceId: '',
            channelId: '',
        },
    };

    const windSettings = {
        size: '2x1' as const,
        name: 'Wind',
        favorite: false,
        color: '',
        chartHours: 0,
        icon: '',
        iconActive: '',
        text: '',
        textActive: '',
        instance: DEFAULT_INSTANCE,
        historySeconds: 60,
        speedUnit: 'knots' as const,
        closeHauledAngle: 60,
    };

    const autopilotSettings = {
        size: '2x1' as const,
        name: 'Autopilot',
        favorite: false,
        color: '',
        chartHours: 0,
        icon: '',
        iconActive: '',
        text: '',
        textActive: '',
        instance: DEFAULT_INSTANCE,
        showAwa: true,
        showRudder: true,
    };

    const chartPreset = CHART_PRESETS.find(p => p.id === activeTab);
    const chartSettings = chartPreset
        ? {
              size: '2x1' as const,
              name: chartPreset.label,
              favorite: false,
              color: '',
              chartHours: 0,
              icon: '',
              iconActive: '',
              text: '',
              textActive: '',
              instance: DEFAULT_INSTANCE,
              stateId: chartPreset.stateId,
              label: chartPreset.label,
              unit: chartPreset.unit,
              historySeconds: chartPreset.historySeconds ?? 300,
              yMin: 0,
              yMax: 0,
              decimals: 1,
          }
        : null;

    const tabs: { id: WidgetTab; label: string }[] = [
        { id: 'wind', label: 'Wind Compass' },
        { id: 'autopilot', label: 'Autopilot' },
        { id: 'aisradar', label: 'AIS Radar' },
        { id: 'anchor', label: 'Anchor' },
        ...CHART_PRESETS.map(p => ({ id: p.id, label: p.tabLabel })),
    ];

    const anchorSettings: AnchorPositionSettings = {
        type: 'plugin',
        id: 'aaa',
        size: '2x1' as const,
        name: 'Anchor',
        favorite: false,
        color: '',
        chartHours: 0,
        icon: '',
        iconActive: '',
        text: '',
        textActive: '',
        instance: DEFAULT_INSTANCE,
        anchorPosition: '0_userdata.0.anchor.position',
        chainLength: '0_userdata.0.anchor.length',
        depthAtDrop: '0_userdata.0.anchor.depthAtDrop',
        mapStyle: 'osm' as const,
    };

    const aisRadarSettings = {
        size: '2x1' as const,
        name: 'AIS Radar',
        favorite: false,
        color: '',
        chartHours: 0,
        icon: '',
        iconActive: '',
        text: '',
        textActive: '',
        instance: DEFAULT_INSTANCE,
        rangeNm: 6,
        showVectors: true,
        vectorMinutes: 6,
        courseUp: false,
        staleMinutes: 10,
    };

    return (
        <div
            style={{ minHeight: '100vh', background: '#191c1d', color: '#d8dde0', fontFamily: 'system-ui, sans-serif' }}
        >
            <div style={toolbarStyle}>
                {tabs.map(t => (
                    <button
                        key={t.id}
                        type="button"
                        style={tabButtonStyle(activeTab === t.id)}
                        onClick={() => setActiveTab(t.id)}
                    >
                        {t.label}
                    </button>
                ))}
                <span style={{ marginLeft: 'auto', opacity: 0.6, fontSize: 13 }}>
                    connected to {IOB_HOST}:{IOB_PORT}
                </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}>
                {activeTab === 'wind' ? (
                    // Key forces a full remount on tab switch so refs/subscriptions reset cleanly.
                    <DevWindCompass
                        key="wind"
                        widget={widget as any}
                        stateContext={ctx}
                        settings={windSettings as any}
                        onHide={() => {}}
                    />
                ) : activeTab === 'autopilot' ? (
                    <DevAutopilot
                        key="autopilot"
                        widget={widget as any}
                        stateContext={ctx}
                        settings={autopilotSettings as any}
                        onHide={() => {}}
                    />
                ) : activeTab === 'aisradar' ? (
                    <DevAisRadar
                        key="aisradar"
                        widget={widget as any}
                        stateContext={ctx}
                        settings={aisRadarSettings as any}
                        onHide={() => {}}
                    />
                ) : activeTab === 'anchor' ? (
                    <DevAnchorPosition
                        key="anchor"
                        widget={widget as any}
                        stateContext={ctx}
                        settings={anchorSettings}
                        onHide={() => {}}
                    />
                ) : chartSettings ? (
                    <DevHistoryChart
                        key={activeTab}
                        widget={widget as any}
                        stateContext={ctx}
                        settings={chartSettings as any}
                        onHide={() => {}}
                    />
                ) : null}
            </div>
        </div>
    );
}
