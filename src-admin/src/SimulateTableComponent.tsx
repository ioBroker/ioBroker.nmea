import React from 'react';

import {
    Button,
    FormControl,
    IconButton,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    TextField,
    Tooltip,
} from '@mui/material';
import { Add, Close, Delete, DragIndicator, Edit } from '@mui/icons-material';
import { I18n, SelectID } from '@iobroker/adapter-react-v5';
import { ConfigGeneric, type ConfigGenericProps, type ConfigGenericState } from '@iobroker/json-config';
import type { NmeaConfig, SimulateItem, SimulateType } from '../../src/types';

/** Available main types (PGN families), their translation keys and a representative emoji. */
const TYPES: { value: SimulateType; label: string; emoji: string }[] = [
    { value: 'temperature', label: 'custom_nmea_type_temperature', emoji: '🌡️' },
    { value: 'humidity', label: 'custom_nmea_type_humidity', emoji: '💧' },
    { value: 'pressure', label: 'custom_nmea_type_pressure', emoji: '💨' },
    { value: 'tank', label: 'custom_nmea_type_tank', emoji: '🛢️' },
];

/**
 * Subtypes per main type. The `value` is the NMEA enum name that the backend forwards 1:1 into the
 * PGN (see `sendTemperature`/`sendPressure`/`sendTank` in main.ts), so it must not be translated.
 * The `label` is shown to the user.
 */
const SUB_TYPES: Record<SimulateType, { value: string; label: string }[]> = {
    temperature: [
        'Sea Temperature',
        'Outside Temperature',
        'Inside Temperature',
        'Engine Room Temperature',
        'Main Cabin Temperature',
        'Live Well Temperature',
        'Bait Well Temperature',
        'Refrigeration Temperature',
        'Heating System Temperature',
        'Dew Point Temperature',
        'Apparent Wind Chill Temperature',
        'Theoretical Wind Chill Temperature',
        'Heat Index Temperature',
        'Freezer Temperature',
        'Exhaust Gas Temperature',
        'Shaft Seal Temperature',
    ].map(value => ({ value, label: value })),
    humidity: [
        { value: 'Outside', label: 'Outside' },
        { value: 'Inside', label: 'Inside' },
    ],
    pressure: [
        { value: 'Atmospheric', label: 'Atmospheric' },
        { value: 'Water', label: 'Water' },
        { value: 'Steam', label: 'Steam' },
        { value: 'Compressed Air', label: 'Compressed Air' },
        { value: 'Hydraulic', label: 'Hydraulic' },
        { value: 'Filter', label: 'Filter' },
        { value: 'AltimeterSetting', label: 'Altimeter Setting' },
        { value: 'Oil', label: 'Oil' },
        { value: 'Fuel', label: 'Fuel' },
    ],
    tank: [
        { value: 'Fuel', label: 'Fuel' },
        { value: 'Water', label: 'Water' },
        { value: 'Gray water', label: 'Gray water' },
        { value: 'Live well', label: 'Live well' },
        { value: 'Oil', label: 'Oil' },
        { value: 'Black water', label: 'Black water' },
    ],
};

/** Mirrors the `defaultFunc` of the old jsonConfig table. */
function defaultSubType(type: SimulateType): string {
    if (type === 'tank') {
        return 'Fuel';
    }
    if (type === 'pressure') {
        return 'Atmospheric';
    }
    if (type === 'humidity') {
        return 'Outside';
    }
    return 'Outside Temperature';
}

/** Live snapshot of a source state: current value and its configured unit. */
interface SourceValue {
    val: number | null;
    unit: string;
}

interface SimulateTableComponentState extends ConfigGenericState {
    /** Index of the row whose object ID is being picked, or null if the dialog is closed. */
    showSelectId: number | null;
    /** Current value + unit of every referenced object ID, kept live via subscriptions. */
    values: Record<string, SourceValue>;
    /** Row currently being dragged (drag-and-drop reordering), or null. */
    dragIndex: number | null;
    /** Row the dragged item is hovering over, for the drop-target highlight. */
    dragOverIndex: number | null;
}

const LITER_UNITS = ['l', 'liter', 'liters', 'litre', 'litres'];

export default class SimulateTableComponent extends ConfigGeneric<ConfigGenericProps, SimulateTableComponentState> {
    /** Object IDs we are currently subscribed to. */
    private subscribed = new Set<string>();

    constructor(props: ConfigGenericProps) {
        super(props);
        this.state = {
            ...this.state,
            showSelectId: null,
            values: {},
            dragIndex: null,
            dragOverIndex: null,
        };
    }

    async componentDidMount(): Promise<void> {
        await super.componentDidMount();
        void this.syncSubscriptions();
    }

    componentDidUpdate(): void {
        void this.syncSubscriptions();
    }

    componentWillUnmount(): void {
        for (const oid of this.subscribed) {
            this.props.oContext.socket.unsubscribeState(oid, this.onValueChange);
        }
        this.subscribed.clear();
        super.componentWillUnmount();
    }

    /** Live value handler — keeps the previously fetched unit. */
    onValueChange = (id: string, state: ioBroker.State | null | undefined): void => {
        this.setState(prev => ({
            values: {
                ...prev.values,
                [id]: { val: (state?.val as number) ?? null, unit: prev.values[id]?.unit || '' },
            },
        }));
    };

    /** Subscribe to all object IDs in use, drop the ones no longer referenced. */
    async syncSubscriptions(): Promise<void> {
        const oids = new Set(
            this.getSimulate()
                .map(s => s.oid)
                .filter(Boolean),
        );

        for (const oid of oids) {
            if (!this.subscribed.has(oid)) {
                this.subscribed.add(oid);
                await this.props.oContext.socket.subscribeState(oid, this.onValueChange);
                const obj = await this.props.oContext.socket.getObject(oid);
                const unit = (obj?.common?.unit || '').toString();
                const st = await this.props.oContext.socket.getState(oid);
                this.setState(prev => ({
                    values: { ...prev.values, [oid]: { val: (st?.val as number) ?? null, unit } },
                }));
            }
        }

        for (const oid of Array.from(this.subscribed)) {
            if (!oids.has(oid)) {
                this.subscribed.delete(oid);
                this.props.oContext.socket.unsubscribeState(oid, this.onValueChange);
            }
        }
    }

    /** Round away float noise (e.g. 1021.3000000000001 → 1021.3); trailing zeros are dropped. */
    private static round(n: number, digits = 2): number {
        const f = 10 ** digits;
        return Math.round(n * f) / f;
    }

    /** Human-readable representation of what is currently sent to the NMEA bus for a row. */
    formatSentValue(item: SimulateItem): string {
        const v = this.state.values[item.oid];
        if (!v || v.val === null || v.val === undefined || (typeof v.val === 'number' && isNaN(v.val))) {
            return I18n.t('custom_nmea_current_na');
        }
        const round = SimulateTableComponent.round;
        if (item.type === 'tank') {
            const unit = (v.unit || '').trim().toLowerCase();
            if (LITER_UNITS.includes(unit) && item.capacity && item.capacity > 0) {
                const pct = (v.val / item.capacity) * 100;
                return `${round(v.val)} ${v.unit} → ${round(pct, 1)} %`;
            }
            return `${round(v.val, 1)} %`;
        }
        return v.unit ? `${round(v.val)} ${v.unit}` : `${round(v.val)}`;
    }

    /** Read the current simulate list out of the global config data. */
    getSimulate(): SimulateItem[] {
        const config = this.props.data as NmeaConfig;
        return Array.isArray(config.simulate) ? config.simulate : [];
    }

    /** Persist a new simulate list back into the adapter config. */
    onSimulateChanged(simulate: SimulateItem[]): void {
        const data: NmeaConfig = JSON.parse(JSON.stringify(this.props.data));
        data.simulate = simulate;
        this.props.onChange(data);
    }

    /** Update one field of one row (immutably) and store it. */
    updateRow(index: number, changes: Partial<SimulateItem>): void {
        const simulate = this.getSimulate().map((item, i) => (i === index ? { ...item, ...changes } : item));
        this.onSimulateChanged(simulate);
    }

    addRow(): void {
        const simulate = [...this.getSimulate()];
        simulate.push({
            type: 'temperature',
            subType: defaultSubType('temperature'),
            oid: '',
            instance: this.nextFreeInstance(-1, 'temperature'),
        });
        this.onSimulateChanged(simulate);
    }

    deleteRow(index: number): void {
        const simulate = this.getSimulate().filter((_, i) => i !== index);
        this.onSimulateChanged(simulate);
    }

    /** Move a row from one position to another (drag-and-drop reordering). */
    moveRow(from: number, to: number): void {
        if (from === to) {
            return;
        }
        const simulate = [...this.getSimulate()];
        const [moved] = simulate.splice(from, 1);
        simulate.splice(to, 0, moved);
        this.onSimulateChanged(simulate);
    }

    /** Smallest instance not used by any other row of the same type. */
    nextFreeInstance(excludeIndex: number, type: SimulateType): number {
        const max = type === 'tank' ? 13 : 252;
        const used = new Set(
            this.getSimulate()
                .filter((s, i) => i !== excludeIndex && s.type === type && typeof s.instance === 'number')
                .map(s => s.instance as number),
        );
        for (let i = 0; i <= max; i++) {
            if (!used.has(i)) {
                return i;
            }
        }
        return 0;
    }

    renderSelectIdDialog(): React.JSX.Element | null {
        if (this.state.showSelectId === null) {
            return null;
        }
        const index = this.state.showSelectId;
        const item = this.getSimulate()[index];

        return (
            <SelectID
                imagePrefix={this.props.oContext.imagePrefix || '../..'}
                socket={this.props.oContext.socket}
                theme={this.props.oContext.theme}
                themeType={this.props.oContext.themeType}
                lang={I18n.getLanguage()}
                selected={item?.oid || ''}
                types={['state']}
                onOk={selected => {
                    const oid = Array.isArray(selected) ? selected[0] : selected;
                    this.setState({ showSelectId: null }, () => this.updateRow(index, { oid: oid || '' }));
                }}
                onClose={() => this.setState({ showSelectId: null })}
            />
        );
    }

    renderRow(item: SimulateItem, index: number): React.JSX.Element {
        const isTank = item.type === 'tank';
        const subTypes = SUB_TYPES[item.type] || [];
        const dupInstance = this.getSimulate().some(
            (s, i) => i !== index && s.type === item.type && (s.instance ?? 0) === (item.instance ?? 0),
        );

        return (
            <Paper
                key={index}
                onDragOver={e => {
                    // Must preventDefault on every dragover, otherwise the browser never fires onDrop.
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (this.state.dragOverIndex !== index) {
                        this.setState({ dragOverIndex: index });
                    }
                }}
                onDrop={e => {
                    e.preventDefault();
                    // Source index travels in dataTransfer (reliable, not subject to setState timing).
                    const raw = e.dataTransfer.getData('text/plain');
                    const from = raw === '' ? this.state.dragIndex : parseInt(raw, 10);
                    this.setState({ dragIndex: null, dragOverIndex: null }, () => {
                        if (from !== null && !isNaN(from as number) && from !== index) {
                            this.moveRow(from as number, index);
                        }
                    });
                }}
                style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 12,
                    alignItems: 'flex-end',
                    padding: 12,
                    marginBottom: 8,
                    opacity: this.state.dragIndex === index ? 0.4 : 1,
                    outline:
                        this.state.dragOverIndex === index && this.state.dragIndex !== index
                            ? '2px dashed #4dabf5'
                            : 'none',
                }}
            >
                {/* Drag handle for reordering */}
                <Tooltip title={I18n.t('custom_nmea_reorder')}>
                    <span
                        draggable
                        onDragStart={e => {
                            e.dataTransfer.setData('text/plain', String(index));
                            e.dataTransfer.effectAllowed = 'move';
                            this.setState({ dragIndex: index, dragOverIndex: index });
                        }}
                        onDragEnd={() => this.setState({ dragIndex: null, dragOverIndex: null })}
                        style={{
                            cursor: 'grab',
                            display: 'flex',
                            alignItems: 'center',
                            alignSelf: 'center',
                            color: '#888',
                        }}
                    >
                        <DragIndicator />
                    </span>
                </Tooltip>

                {/* Type */}
                <FormControl
                    variant="standard"
                    style={{ minWidth: 160 }}
                >
                    <InputLabel>{I18n.t('custom_nmea_type')}</InputLabel>
                    <Select
                        variant="standard"
                        value={item.type}
                        onChange={e => {
                            const type = e.target.value as SimulateType;
                            // reset the sub-type to a valid default for the new type; auto-assign the
                            // next free instance for this type so two sensors never collide (the MFD
                            // identifies a sensor by its instance — same instance ⇒ values get merged).
                            this.updateRow(index, {
                                type,
                                subType: defaultSubType(type),
                                instance: item.instance ?? this.nextFreeInstance(index, type),
                                capacity: type === 'tank' ? item.capacity || 0 : undefined,
                            });
                        }}
                    >
                        {TYPES.map(t => (
                            <MenuItem
                                key={t.value}
                                value={t.value}
                            >
                                <span style={{ marginRight: 8 }}>{t.emoji}</span>
                                {I18n.t(t.label)}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>

                {/* Sub-type */}
                <FormControl
                    variant="standard"
                    style={{ minWidth: 220 }}
                >
                    <InputLabel>{I18n.t('custom_nmea_subtype')}</InputLabel>
                    <Select
                        variant="standard"
                        value={item.subType || ''}
                        onChange={e => this.updateRow(index, { subType: e.target.value })}
                    >
                        {subTypes.map(s => (
                            <MenuItem
                                key={s.value}
                                value={s.value}
                            >
                                {s.label}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>

                {/* Object ID */}
                <TextField
                    variant="standard"
                    style={{ flexGrow: 1, minWidth: 260 }}
                    label={I18n.t('custom_nmea_oid')}
                    value={item.oid || ''}
                    onChange={e => this.updateRow(index, { oid: e.target.value })}
                    slotProps={{
                        input: {
                            endAdornment: (
                                <>
                                    {item.oid ? (
                                        <IconButton
                                            size="small"
                                            onClick={() => this.updateRow(index, { oid: '' })}
                                        >
                                            <Close />
                                        </IconButton>
                                    ) : null}
                                    <Tooltip title={I18n.t('custom_nmea_select_oid')}>
                                        <IconButton
                                            size="small"
                                            onClick={() => this.setState({ showSelectId: index })}
                                        >
                                            <Edit />
                                        </IconButton>
                                    </Tooltip>
                                </>
                            ),
                        },
                    }}
                />

                {/* Tank-only: capacity (rendered before the instance so the instance field stays in the
                    same right-most position for every type) */}
                {isTank ? (
                    <TextField
                        variant="standard"
                        style={{ width: 130 }}
                        type="number"
                        label={I18n.t('custom_nmea_capacity')}
                        value={item.capacity ?? 0}
                        slotProps={{ htmlInput: { min: 0 } }}
                        onChange={e => {
                            const capacity = Math.max(0, parseFloat(e.target.value) || 0);
                            this.updateRow(index, { capacity });
                        }}
                    />
                ) : null}

                {/* Instance — for every type (NMEA identifies a sensor by its instance). Kept last so it
                    aligns across all rows regardless of the tank capacity field. */}
                <TextField
                    variant="standard"
                    style={{ width: 130 }}
                    type="number"
                    label={I18n.t('custom_nmea_instance')}
                    value={item.instance ?? 0}
                    slotProps={{ htmlInput: { min: 0, max: isTank ? 13 : 252 } }}
                    onChange={e => {
                        const max = isTank ? 13 : 252;
                        let instance = Math.round(parseInt(e.target.value, 10) || 0);
                        instance = Math.max(0, Math.min(max, instance));
                        this.updateRow(index, { instance });
                    }}
                />

                {/* Delete */}
                <Tooltip title={I18n.t('custom_nmea_delete')}>
                    <IconButton onClick={() => this.deleteRow(index)}>
                        <Delete />
                    </IconButton>
                </Tooltip>

                {/* Note about tank units (full-width, so it does not affect the field alignment) */}
                {isTank ? (
                    <div style={{ flexBasis: '100%', fontSize: 12, opacity: 0.7 }}>
                        {I18n.t('custom_nmea_tank_hint')}
                    </div>
                ) : null}

                {/* Warn when two tanks share the same instance — Raymarine would merge them */}
                {dupInstance ? (
                    <div style={{ flexBasis: '100%', fontSize: 12, color: '#d32f2f' }}>
                        {I18n.t('custom_nmea_tank_instance_dup')}
                    </div>
                ) : null}

                {/* Live value currently sent to the NMEA bus */}
                {item.oid ? (
                    <div style={{ flexBasis: '100%', fontSize: 12, opacity: 0.85 }}>
                        {`→ ${I18n.t('custom_nmea_current')}: ${this.formatSentValue(item)}`}
                    </div>
                ) : null}
            </Paper>
        );
    }

    renderItem(): React.JSX.Element {
        const simulate = this.getSimulate();

        return (
            <div
                style={{ width: '100%' }}
                className="nmea_simulate"
            >
                <h4>{I18n.t('custom_nmea_simulate_title')}</h4>
                {simulate.length ? (
                    simulate.map((item, index) => this.renderRow(item, index))
                ) : (
                    <div style={{ opacity: 0.7, marginBottom: 8 }}>{I18n.t('custom_nmea_simulate_empty')}</div>
                )}
                <Button
                    variant="contained"
                    startIcon={<Add />}
                    onClick={() => this.addRow()}
                >
                    {I18n.t('custom_nmea_simulate_add')}
                </Button>
                {this.renderSelectIdDialog()}
            </div>
        );
    }
}
