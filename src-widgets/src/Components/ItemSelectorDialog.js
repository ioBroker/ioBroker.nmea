import React, { Component } from 'react';
import PropTypes from 'prop-types';

import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
    Button, Checkbox,
    Dialog, DialogActions,
    DialogContent, DialogTitle, IconButton, InputAdornment,
    LinearProgress, ListItemIcon, ListItemText, MenuItem, MenuList, TextField, Tooltip,
} from '@mui/material';
import {
    Add, Clear,
    Close, ExpandLess,
    ExpandMore, Search,
} from '@mui/icons-material';

import Generic from '../Generic';

const styles = {
    itemsCount: {
        marginLeft: 10,
        opacity: 0.5,
        fontSize: 'smaller',
    },
    value: {
        maxWidth: 250,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
    },
    tooltip: {
        pointerEvents: 'none',
    },
    used: theme => ({
        color: theme.palette.primary.main,
    }),
};

class ItemsSelectorDialog extends Component {
    constructor(props) {
        super(props);
        let openedChannels = window.localStorage.getItem(`vis.nmea.openedChannels.${props.wid || this.props.instance}`) || '[]';
        try {
            openedChannels = JSON.parse(openedChannels);
        } catch (e) {
            openedChannels = [];
        }

        this.state = {
            states: null,
            values: {},
            channels: null,
            openedChannels,
            selectedStates: [],
            filter: window.localStorage.getItem(`vis.nmea.filter.${props.wid || this.props.instance}`) || '',
        };

        this.subscribes = [];
        this.cachedValues = {};
    }

    async componentDidMount() {
        const states = await this.props.context.socket.getObjectViewSystem('state', `${this.props.instance}.`, `${this.props.instance}.\u9999`);
        const channels = await this.props.context.socket.getObjectViewSystem('channel', `${this.props.instance}.`, `${this.props.instance}.\u9999`);
        const stateIds = Object.keys(states);
        Object.keys(channels).forEach(channelId => {
            if (channelId.endsWith('.test') || !stateIds.find(id => id.startsWith(channelId))) {
                // if no state for this channel
                delete channels[channelId];
            } else {
                delete channels[channelId].native;
                // Calculate the count of states
                channels[channelId].count = stateIds.filter(id => id.startsWith(channelId)).length;
                const _channelId = `${channelId}.`;
                channels[channelId].states = Object.keys(states).filter(id => id.startsWith(_channelId));
                // Translate names
                channels[channelId].name = Generic.getText(channels[channelId].common.name);
                channels[channelId].lowerName = channels[channelId].name.toLowerCase();
            }
        });
        Object.keys(states).forEach(stateId => {
            delete states[stateId].native;
            states[stateId].name = Generic.getText(states[stateId].common.name);
            states[stateId].lowerName = states[stateId].name.toLowerCase();
        });

        this.setState({ channels, states }, async () => {
            for (let c = 0; c < this.state.openedChannels.length; c++) {
                await this.subscribeChannel(this.state.openedChannels[c]);
            }
        });
    }

    onStateChanged = (id, state) => {
        if (state && state.val !== null && state.val !== undefined) {
            this.cachedValues = this.cachedValues || JSON.parse(JSON.stringify(this.state.values));
            this.cachedValues[id] = state.val;
            this.cachedStatesTimeout = this.cachedStatesTimeout || setTimeout(() => {
                this.cachedStatesTimeout = null;
                this.setState({ values: this.cachedValues });
                this.cachedValues = null;
            }, 200);
        }
    };

    componentWillUnmount() {
        this.subscribes.forEach(sub => this.props.context.socket.unsubscribeState(sub, this.onStateChanged));
    }

    renderState(id, opacity) {
        let val = this.state.values[id];
        if (val === null || val === undefined) {
            val = 'null';
        } else {
            val = val.toString();
        }
        let title;
        if (val.length + (this.state.states[id].common.unit?.length || 0) > 25) {
            title = val + (this.state.states[id].common.unit || '');
        }

        return <MenuItem
            sx={this.props.usedIds.includes(id) ? styles.used : undefined}
            style={{
                opacity: opacity ? 1 : 0.3,
                padding: '0 8px 0 2px',
            }}
            key={id}
            onDoubleClick={() => this.props.onClose([this.state.states[id]])}
            onClick={() => {
                const selectedStates = [...this.state.selectedStates];
                const pos = selectedStates.indexOf(id);
                if (pos === -1) {
                    selectedStates.push(id);
                } else {
                    selectedStates.splice(pos, 1);
                }
                this.setState({ selectedStates });
            }}
        >
            <ListItemIcon>
                <Checkbox checked={this.state.selectedStates.includes(id)} />
            </ListItemIcon>
            <ListItemText>{this.state.states[id].name}</ListItemText>
            {title ? <Tooltip title={title} size="small" componentsProps={{ popper: { sx: styles.tooltip } }}>
                <div style={styles.value}>
                    {val}
                    {this.state.states[id].common.unit ?
                        <span style={styles.unit}>{this.state.states[id].common.unit}</span> : null}
                </div>
            </Tooltip> : <div style={styles.value}>
                {val}
                {this.state.states[id].common.unit ?
                    <span style={styles.unit}>{this.state.states[id].common.unit}</span> : null}
            </div>}
        </MenuItem>;
    }

    async subscribeChannel(channelId) {
        if (channelId) {
            const states = this.state.channels[channelId].states;
            for (let s = 0; s < states.length; s++) {
                if (!this.subscribes.includes(states[s])) {
                    this.subscribes.push(states[s]);
                    await this.props.context.socket.subscribeState(states[s], this.onStateChanged);
                }
            }
        } else {
            // Subscribe all
            const channelIDs = Object.keys(this.state.channels);
            for (let c = 0; c < channelIDs.length; c++) {
                const states = this.state.channels[channelIDs[c]].states;
                for (let s = 0; s < states.length; s++) {
                    if (!this.subscribes.includes(states[s])) {
                        this.subscribes.push(states[s]);
                        await this.props.context.socket.subscribeState(states[s], this.onStateChanged);
                    }
                }
            }
        }
    }

    async unsubscribeChannel(channelId) {
        if (channelId) {
            const states = this.state.channels[channelId].states;
            for (let s = 0; s < states.length; s++) {
                const pos = this.subscribes.indexOf(states[s]);
                if (pos !== -1) {
                    this.subscribes.splice(pos, 1);
                    await this.props.context.socket.unsubscribeState(states[s], this.onStateChanged);
                }
            }
        } else {
            // unsubscribe all
            for (let s = 0; s < this.subscribes.length; s++) {
                await this.props.context.socket.unsubscribeState(this.subscribes[s], this.onStateChanged);
            }
            this.subscribes = [];
        }
    }

    renderChannels() {
        if (!this.state.channels) {
            return <LinearProgress />;
        }
        let keys = Object.keys(this.state.channels);
        if (!keys.length) {
            return <div>{Generic.t('No channels found')}</div>;
        }
        const states = {};
        if (this.state.filter) {
            const filter = this.state.filter.toLowerCase();
            keys = keys.filter(channelId => {
                const find = this.state.channels[channelId].lowerName.includes(filter);
                this.state.channels[channelId].states.forEach(id => {
                    if (this.state.states[id].lowerName.includes(filter)) {
                        states[channelId] = states[channelId] || {};
                        states[channelId][id] = true;
                    }
                });
                if (find && !states[channelId]) {
                    states[channelId] = {};
                    this.state.channels[channelId].states.forEach(id => states[channelId][id] = false);
                    return true;
                }
                return find || states[channelId];
            });
        } else {
            keys.forEach(channelId => {
                states[channelId] = {};
                this.state.channels[channelId].states.forEach(id => states[channelId][id] = true);
            });
        }
        keys.sort((a, b) => (this.state.channels[a].lowerName > this.state.channels[b].lowerName ? 1 : -1));

        return keys.map(channelId => <Accordion
            key={channelId}
            expanded={this.state.openedChannels.includes(channelId)}
            onChange={() => {
                const openedChannels = [...this.state.openedChannels];
                const pos = openedChannels.indexOf(channelId);
                if (pos !== -1) {
                    openedChannels.splice(pos, 1);
                    this.unsubscribeChannel(channelId)
                        .catch(e => console.error(`Cannot subscribe ${channelId}: ${e}`));
                } else {
                    openedChannels.push(channelId);
                    this.subscribeChannel(channelId)
                        .catch(e => console.error(`Cannot subscribe ${channelId}: ${e}`));
                }
                this.setState({ openedChannels });
                window.localStorage.setItem(`vis.nmea.openedChannels.${this.props.wid || this.props.instance}`, JSON.stringify(openedChannels));
            }}
        >
            <AccordionSummary
                expandIcon={<ExpandMore />}
                style={{ padding: '0 10px', minHeight: 32 }}
                sx={{
                    backgroundColor: 'secondary.main',
                }}
            >
                {this.state.channels[channelId].name}
                <span style={styles.itemsCount}>
                    [
                    {this.state.channels[channelId].count}
                    ]
                </span>
            </AccordionSummary>
            {this.state.openedChannels.includes(channelId) ? <AccordionDetails>
                <MenuList>
                    {Object.keys(states[channelId])
                        .sort((a, b) => (this.state.states[a].lowerName > this.state.states[b].lowerName ? 1 : -1))
                        .map(id => this.renderState(id, states[channelId][id]))}
                </MenuList>
            </AccordionDetails> : null}
        </Accordion>);
    }

    render() {
        return <Dialog
            open={!0}
            fullWidth
            maxWidth="md"
        >
            <DialogTitle style={{ display: 'flex', alignItems: 'baseline' }}>
                {Generic.t('Select items')}
                <TextField
                    margin="dense"
                    label={Generic.t('Filter')}
                    variant="standard"
                    style={{ marginLeft: 10, width: 300 }}
                    onChange={e => {
                        this.setState({ filter: e.target.value });
                        if (!e.target.value) {
                            window.localStorage.removeItem(`vis.nmea.filter.${this.props.wid || this.props.instance}`);
                        } else {
                            window.localStorage.setItem(`vis.nmea.filter.${this.props.wid || this.props.instance}`, e.target.value);
                        }
                    }}
                    value={this.state.filter || ''}
                    InputProps={{
                        endAdornment: this.state.filter ? <IconButton
                            size="small"
                            onClick={() => {
                                this.setState({ filter: '' });
                                window.localStorage.removeItem(`vis.nmea.filter.${this.props.wid || this.props.instance}`);
                            }}
                        >
                            <Clear />
                        </IconButton> : null,
                        startAdornment: <InputAdornment position="start">
                            <Search />
                        </InputAdornment>,
                    }}
                />
                <div style={{ flexGrow: 1 }} />
                <IconButton
                    title={Generic.t('Expand all')}
                    disabled={!this.state.channels || Object.keys(this.state.channels).length === this.state.openedChannels.length}
                    onClick={() => {
                        const openedChannels = Object.keys(this.state.channels);
                        this.subscribeChannel()
                            .catch(e => console.error(`Cannot subscribe: ${e}`));
                        this.setState({ openedChannels });
                        window.localStorage.setItem(`vis.nmea.openedChannels.${this.props.wid || this.props.instance}`, JSON.stringify(openedChannels));
                    }}
                >
                    <ExpandMore />
                </IconButton>
                <IconButton
                    disabled={!this.state.openedChannels.length}
                    title={Generic.t('Close all')}
                    onClick={() => {
                        this.unsubscribeChannel()
                            .catch(e => console.error(`Cannot subscribe: ${e}`));
                        this.setState({ openedChannels: [] });
                        window.localStorage.setItem(`vis.nmea.openedChannels.${this.props.wid || this.props.instance}`, '[]');
                    }}
                >
                    <ExpandLess />
                </IconButton>
            </DialogTitle>
            <DialogContent>
                {this.renderChannels()}
            </DialogContent>
            <DialogActions>
                <Button
                    variant="contained"
                    color="primary"
                    disabled={!this.state.selectedStates.length}
                    startIcon={<Add />}
                    onClick={() => this.props.onClose(this.state.selectedStates.map(id => this.state.states[id]))}
                >
                    {Generic.t('Add')}
                </Button>
                <Button
                    variant="contained"
                    color="grey"
                    startIcon={<Close />}
                    onClick={() => this.props.onClose()}
                >
                    {Generic.t('Close')}
                </Button>
            </DialogActions>
        </Dialog>;
    }
}

ItemsSelectorDialog.propTypes = {
    instance: PropTypes.string,
    context: PropTypes.object,
    onClose: PropTypes.func,
    wid: PropTypes.string,
    usedIds: PropTypes.array,
};

export default ItemsSelectorDialog;
