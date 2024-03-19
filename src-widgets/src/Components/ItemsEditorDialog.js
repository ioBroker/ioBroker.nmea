import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { withStyles } from '@mui/styles';
import { v4 as uuid } from 'uuid';
import { DragDropContext, Draggable, Droppable } from 'react-beautiful-dnd';

import {
    Button,
    Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, Fab,
    IconButton,
    Menu,
    MenuItem,
    Switch,
    Table, TableBody,
    TableCell, TableHead,
    TableRow,
    TextField,
} from '@mui/material';

import {
    Add,
    Check,
    Close,
    Delete, TrackChanges,
} from '@mui/icons-material';

import { ColorPicker, SelectID } from '@iobroker/adapter-react-v5';

import Generic from '../Generic';
import ItemSelectorDialog from './ItemSelectorDialog';

const styles = () => ({

});

class ItemsEditorDialog extends Component {
    constructor(props) {
        super(props);
        let items = props.data.items;
        if (typeof items === 'string') {
            try {
                items = JSON.parse(items);
            } catch (e) {
                items = [];
            }
        }
        items = (items || []).map(item => ({ ...item, id: uuid() }));

        this.state = {
            instances: null,
            items,
            anchorEl: null,
            itemSelector: null,
            selectId: null,
            applyItems: JSON.stringify(props.data.items || []),
            objects: {},
        };
        this.originalItems = this.state.applyItems;
    }

    async componentDidMount() {
        if (!this.state.instances) {
            const instances = [];
            const instanceObjs = await this.props.context.socket.getAdapterInstances('nmea');
            instanceObjs.forEach(_instance => {
                const instanceId = _instance._id.split('.').pop();
                instances.push({
                    value: `nmea.${instanceId}`,
                    label: `nmea.${instanceId}`,
                });
            });
            this.setState({ instances });

            this.updateItems(this.state.items, true);
        }
    }

    renderItemSelector() {
        if (!this.state.itemSelector) {
            return null;
        }
        return <ItemSelectorDialog
            context={this.props.context}
            instance={this.state.itemSelector}
            wid={this.props.wid}
            usedIds={this.state.items.map(item => item.oid).filter(oid => oid)}
            onClose={objs => {
                if (objs && objs.length) {
                    const items = JSON.parse(JSON.stringify(this.state.items));

                    for (const obj of objs) {
                        // add item to list
                        const item = {
                            oid: obj._id,
                            name: Generic.getText(obj.common.name),
                            unit: obj.common.unit || '',
                            showPlus: false,
                            beforeComma: 0,
                            afterComma: 0,
                            color: obj.common.color || '',
                            enabled: true,
                            changes: true,
                            id: uuid(),
                        };
                        const parts = obj._id.split('.');
                        const name = parts.pop();
                        const channel = parts.pop();
                        if (Generic.DATA[name] || Generic.DATA[`${channel}.${name}`]) {
                            const key = Generic.DATA[name] ? name : `${channel}.${name}`;
                            if (Generic.DATA[key].unit) {
                                item.unit = Generic.DATA[key].unit;
                            }
                            if (Generic.DATA[key].indicatorDigitsBeforeComma !== undefined) {
                                item.beforeComma = Generic.DATA[key].indicatorDigitsBeforeComma;
                            }
                            if (Generic.DATA[key].indicatorDigitsAfterComma !== undefined) {
                                item.afterComma = Generic.DATA[key].indicatorDigitsAfterComma;
                            }
                            if (Generic.DATA[key].indicatorShowPlus) {
                                item.showPlus = Generic.DATA[key].indicatorShowPlus;
                            }
                            if (Generic.DATA[key].changes !== undefined) {
                                item.changes = Generic.DATA[key].changes;
                            }
                            if (Generic.DATA[key].name) {
                                item.name = Generic.DATA[key].name;
                            }
                        }

                        items.push(item);
                    }

                    this.setState({ itemSelector: null, anchorEl: null }, () => this.updateItems(items));
                } else {
                    this.setState({ itemSelector: null });
                }
            }}
        />;
    }

    updateItems(items, onlyObjects) {
        const applyItems = JSON.parse(JSON.stringify(items));
        applyItems.forEach(item => delete item.id);

        this.readObjects = this.readObjects || [];
        applyItems.forEach(item => {
            if (item.oid && this.state.objects[item.oid] === undefined) {
                this.readObjects.push(item.oid);
            }
        });
        if (this.readObjects.length) {
            this.readTimer && clearTimeout(this.readTimer);
            this.readTimer = setTimeout(async () => {
                this.readTimer = null;
                const readObjects = this.readObjects;
                this.readObjects = [];
                const obj = await this.props.context.socket.getObjectsById(readObjects);
                this.setState({ objects: { ...this.state.objects, ...obj } });
            }, 100);
        }

        if (!onlyObjects) {
            this.setState({ items, applyItems: JSON.stringify(applyItems) });
        }
    }

    renderSelectIdDialog() {
        if (this.state.selectId === null) {
            return null;
        }
        return <SelectID
            imagePrefix="../.."
            socket={this.props.context.socket}
            selected={this.state.items[this.state.selectId].oid}
            onOk={id => {
                this.setState({ selectId: null });
                if (id) {
                    const items = JSON.parse(JSON.stringify(this.state.items));
                    items[this.state.selectId].oid = id;
                    this.setState({ selectId: null, items });
                } else {
                    this.setState({ selectId: null });
                }
            }}
            onClose={() => this.setState({ selectId: null })}
        />;
    }

    renderInstanceSelector() {
        return <Menu
            anchorEl={this.state.anchorEl}
            open={!!this.state.anchorEl}
            onClose={() => this.setState({ anchorEl: null })}
        >
            {this.state.instances?.map(instance => <MenuItem
                onClick={async () => this.setState({ itemSelector: instance.value })}
                key={instance.value}
                value={instance.value}
            >
                {instance.label}
            </MenuItem>)}
            <MenuItem
                sx={theme => ({ color: theme.palette.primary.main })}
                onClick={() => {
                    const items = JSON.parse(JSON.stringify(this.state.items));
                    items.push({
                        name: '',
                        oid: '',
                        unit: '',
                        showPlus: false,
                        beforeComma: 0,
                        afterComma: 0,
                        color: '',
                        enabled: true,
                        changes: true,
                        id: uuid(),
                    });
                    this.setState({ anchorEl: null }, () => this.updateItems(items));
                }}
            >
                {Generic.t('Custom')}
            </MenuItem>
        </Menu>;
    }

    renderTableRow(item, index) {
        return <Draggable
            key={item.id}
            draggableId={item.id}
            index={index}
        >
            {(dragProvided /* dragSnapshot */) => <TableRow
                style={{ opacity: item.enabled !== false ? 1 : 0.5 }}
                ref={dragProvided.innerRef}
                {...dragProvided.draggableProps}
            >
                <TableCell style={{ cursor: 'grab' }} {...dragProvided.dragHandleProps}>
                    {index + 1}
                    .
                </TableCell>
                <TableCell>
                    <Switch
                        checked={item.enabled !== false}
                        onChange={e => {
                            const items = JSON.parse(JSON.stringify(this.state.items));
                            items[index].enabled = e.target.checked;
                            this.updateItems(items);
                        }}
                    />
                </TableCell>
                <TableCell>
                    <TextField
                        variant="standard"
                        fullWidth
                        value={item.name || ''}
                        onChange={e => {
                            const items = JSON.parse(JSON.stringify(this.state.items));
                            items[index].name = e.target.value;
                            this.updateItems(items);
                        }}
                        InputLabelProps={{ shrink: true }}
                    />
                </TableCell>
                <TableCell>
                    <TextField
                        variant="standard"
                        style={{ width: 'calc(100% - 50px)' }}
                        fullWidth
                        value={item.oid || ''}
                        inputProps={{ style: { textAlign: 'right' } }}
                        onChange={e => {
                            const items = JSON.parse(JSON.stringify(this.state.items));
                            items[index].oid = e.target.value;
                            this.updateItems(items);
                        }}
                        InputLabelProps={{ shrink: true }}
                    />
                    <Button
                        style={{
                            minWidth: 36,
                            marginLeft: 4,
                        }}
                        onClick={() => this.setState({ selectId: index })}
                        variant="outlined"
                    >
                        ...
                    </Button>
                </TableCell>
                <TableCell>
                    {!this.state.objects[item.oid] || this.state.objects[item.oid].common.type === 'number' || item.unit ? <TextField
                        variant="standard"
                        fullWidth
                        value={item.unit || ''}
                        onChange={e => {
                            const items = JSON.parse(JSON.stringify(this.state.items));
                            items[index].unit = e.target.value;
                            this.updateItems(items);
                        }}
                        InputLabelProps={{ shrink: true }}
                    /> : null}
                </TableCell>
                <TableCell>
                    <Checkbox
                        value={!!item.changes}
                        disabled={!!item.color}
                        onChange={e => {
                            const items = JSON.parse(JSON.stringify(this.state.items));
                            items[index].changes = e.target.value;
                            this.updateItems(items);
                        }}
                    />
                </TableCell>
                <TableCell>
                    {!this.state.objects[item.oid] || this.state.objects[item.oid].common.type === 'number' ? <Checkbox
                        value={!!item.showPlus}
                        onChange={e => {
                            const items = JSON.parse(JSON.stringify(this.state.items));
                            items[index].showPlus = e.target.value;
                            this.updateItems(items);
                        }}
                    /> : null}
                </TableCell>
                <TableCell>
                    {!this.state.objects[item.oid] || this.state.objects[item.oid].common.type === 'number' ? <TextField
                        variant="standard"
                        fullWidth
                        type="number"
                        min={0}
                        max={10}
                        value={item.beforeComma}
                        onChange={e => {
                            const items = JSON.parse(JSON.stringify(this.state.items));
                            items[index].beforeComma = e.target.value;
                            this.updateItems(items);
                        }}
                        InputLabelProps={{ shrink: true }}
                    /> : null}
                </TableCell>
                <TableCell>
                    {!this.state.objects[item.oid] || this.state.objects[item.oid].common.type === 'number' ? <TextField
                        variant="standard"
                        fullWidth
                        type="number"
                        min={0}
                        max={3}
                        value={item.afterComma}
                        onChange={e => {
                            const items = JSON.parse(JSON.stringify(this.state.items));
                            items[index].afterComma = e.target.value;
                            this.updateItems(items);
                        }}
                        InputLabelProps={{ shrink: true }}
                    /> : null}
                </TableCell>
                <TableCell>
                    <ColorPicker
                        fullWidth
                        value={item.color}
                        disabled={!item.changes}
                        onChange={color => {
                            const items = JSON.parse(JSON.stringify(this.state.items));
                            items[index].color = color;
                            this.updateItems(items);
                        }}
                    />
                </TableCell>
                <TableCell>
                    <IconButton
                        size="small"
                        onClick={() => {
                            const items = JSON.parse(JSON.stringify(this.state.items));
                            items.splice(index, 1);
                            this.updateItems(items);
                        }}
                    >
                        <Delete />
                    </IconButton>
                </TableCell>
            </TableRow>}
        </Draggable>;
    }

    renderTable() {
        return <Table stickyHeader size="small">
            <TableHead>
                <TableRow>
                    <TableCell style={{ width: 40 }}>
                        <Fab
                            size="small"
                            onClick={event => this.setState({ anchorEl: event.currentTarget })}
                            variant="outlined"
                        >
                            <Add />
                        </Fab>
                    </TableCell>
                    <TableCell style={{ width: 50 }}>{Generic.t('Enabled')}</TableCell>
                    <TableCell style={{ width: 100 }}>{Generic.t('Name')}</TableCell>
                    <TableCell style={{ width: 200 }}>{Generic.t('OID')}</TableCell>
                    <TableCell style={{ width: 50 }}>{Generic.t('Unit')}</TableCell>
                    <TableCell style={{ width: 25, paddingLeft: 25 }} title={Generic.t('Indicate changes with color')}><TrackChanges /></TableCell>
                    <TableCell style={{ width: 25, paddingLeft: 25 }} title={Generic.t('Show plus by positive numbers')}>+</TableCell>
                    <TableCell style={{ width: 50 }}>{Generic.t('Before comma')}</TableCell>
                    <TableCell style={{ width: 50 }}>{Generic.t('After comma')}</TableCell>
                    <TableCell style={{ width: 100 }}>{Generic.t('Color')}</TableCell>
                    <TableCell style={{ width: 40 }} />
                </TableRow>
            </TableHead>
            <DragDropContext
                onDragEnd={data => {
                    if (data.destination && data.source) {
                        const items = JSON.parse(JSON.stringify(this.state.items));
                        const [removed] = items.splice(data.source.index, 1);
                        items.splice(data.destination.index, 0, removed);
                        this.updateItems(items);
                    }
                }}
            >
                <Droppable droppableId="items">
                    {(dropProvided /* dropSnapshot */) => <TableBody
                        ref={dropProvided.innerRef}
                        {...dropProvided.droppableProps}
                    >
                        {this.state.items.map((item, index) => this.renderTableRow(item, index))}
                    </TableBody>}
                </Droppable>
            </DragDropContext>
        </Table>;
    }

    render() {
        return <Dialog
            fullWidth
            maxWidth="xl"
            open={!0}
            onClose={() => this.props.onClose()}
        >
            <DialogTitle>{Generic.t('Edit items')}</DialogTitle>
            <DialogContent style={{ minHeight: 'calc(90vh - 164px)' }}>
                {this.renderSelectIdDialog()}
                {this.renderInstanceSelector()}
                {this.renderItemSelector()}
                {this.renderTable()}
            </DialogContent>
            <DialogActions>
                <Button
                    disabled={this.originalItems === this.state.applyItems}
                    variant="contained"
                    onClick={() => this.props.onClose(JSON.parse(this.state.applyItems))}
                    color="primary"
                    startIcon={<Check />}
                >
                    {Generic.t('Apply')}
                </Button>
                <Button
                    variant="contained"
                    color="grey"
                    onClick={() => this.props.onClose()}
                    startIcon={<Close />}
                >
                    {Generic.t('Cancel')}
                </Button>
            </DialogActions>
        </Dialog>;
    }
}

ItemsEditorDialog.propTypes = {
    context: PropTypes.object,
    data: PropTypes.object,
    onClose: PropTypes.func,
    wid: PropTypes.string,
};

export default withStyles(styles)(ItemsEditorDialog);
