import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { withStyles } from '@mui/styles';

import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
    Button, Checkbox,
    Dialog, DialogActions,
    DialogContent, DialogTitle,
    LinearProgress, ListItemIcon, ListItemText, MenuItem, MenuList,
} from '@mui/material';
import {
    Add,
    Close,
    ExpandMore,
} from '@mui/icons-material';

import Generic from '../Generic';

const styles = () => ({
    itemsCount: {
        marginLeft: 10,
        opacity: 0.5,
        fontSize: 'smaller',
    },
});

class ItemsSelectorDialog extends Component {
    constructor(props) {
        super(props);
        let openedChannels = window.localStorage.getItem(`vis.nmea.openedChannels.${props.instance}`) || '[]';
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
            }
        });
        Object.keys(states).forEach(stateId => {
            delete states[stateId].native;
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

    renderState(id) {
        return <MenuItem
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
            <ListItemText>{Generic.getText(this.state.states[id].common.name)}</ListItemText>
            <div className={this.props.classes.value}>
                {this.state.values[id]}
                {this.state.states[id].common.unit ? <span className={this.props.classes.unit}>{this.state.states[id].common.unit}</span> : null}
            </div>
        </MenuItem>;
    }

    async subscribeChannel(channelId) {
        const states = this.state.channels[channelId].states;
        for (let s = 0; s < states.length; s++) {
            if (!this.subscribes.includes(states[s])) {
                this.subscribes.push(states[s]);
                await this.props.context.socket.subscribeState(states[s], this.onStateChanged);
            }
        }
    }

    async unsubscribeChannel(channelId) {
        const states = this.state.channels[channelId].states;
        for (let s = 0; s < states.length; s++) {
            const pos = this.subscribes.indexOf(states[s]);
            if (pos !== -1) {
                this.subscribes.splice(pos, 1);
                await this.props.context.socket.unsubscribeState(states[s], this.onStateChanged);
            }
        }
    }

    renderChannels() {
        if (!this.state.channels) {
            return <LinearProgress  />;
        }
        const keys = Object.keys(this.state.channels);
        if (!keys.length) {
            return <div>{Generic.t('No channels found')}</div>;
        }
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
                window.localStorage.setItem(`vis.nmea.openedChannels.${this.props.instance}`, JSON.stringify(openedChannels));
            }}
        >
            <AccordionSummary expandIcon={<ExpandMore />}>
                {Generic.getText(this.state.channels[channelId].common.name)}
                <span className={this.props.classes.itemsCount}>
                    [
                    {this.state.channels[channelId].count}
                    ]
                </span>
            </AccordionSummary>
            {this.state.openedChannels.includes(channelId) ? <AccordionDetails>
                <MenuList>
                    {this.state.channels[channelId].states.map(id => this.renderState(id))}
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
            <DialogTitle>
                {Generic.t('Select items')}
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
};

export default withStyles(styles)(ItemsSelectorDialog);
