import React from 'react';

import { Box, Checkbox, TextField } from '@mui/material';

import WidgetDemoApp from '@iobroker/vis-2-widgets-react-dev/widgetDemoApp';
import { I18n } from '@iobroker/adapter-react-v5';

import Nmea from './Nmea';
import translations from './translations';

const styles = {
    app: theme => ({
        backgroundColor: theme?.palette?.background.default,
        color: theme?.palette?.text.primary,
        height: '100%',
        width: '100%',
        overflow: 'auto',
        display: 'flex',
    }),
};

const fields = ['name', 'withoutTitle'];

class App extends WidgetDemoApp {
    constructor(props) {
        super(props);

        this.state.disabled = JSON.parse(window.localStorage.getItem('disabled')) || {};

        this.state.values = {};
        fields.forEach(field => this.state.values[field] = window.localStorage.getItem(field) || '');

        // init translations
        I18n.extendTranslations(translations);

        this.socket.registerConnectionHandler(this.onConnectionChanged);
    }

    onConnectionChanged = isConnected => {
        if (isConnected) {
            this.socket.getSystemConfig()
                .then(systemConfig => this.setState({ systemConfig }));
        }
    };

    renderWidget() {
        const widgets = {
            nmea: <Nmea
                key="Actual"
                context={{
                    socket: this.socket,
                    systemConfig: this.state.systemConfig,
                }}
                themeType={this.state.themeType}
                style={{
                    width: 800,
                    height: 600,
                }}
                data={{
                    name: 'Actual temperature',
                    ...this.state.values,
                    oid_tws: 'nmea.0.windData.trueWindSpeed',
                    oid_aws: 'nmea.0.windData.windSpeed',
                    oid_twd: 'nmea.0.windData.trueWindDirection',
                    oid_awa: 'nmea.0.windData.windAngle',
                    oid_awd: 'nmea.0.windData.apparentWindDirection',
                    oid_cog: 'nmea.0.directionData.cogTrue',
                    oid_sog: 'nmea.0.directionData.sog',
                    oid_rudder: 'nmea.0.rudder.position',
                    oid_depth: 'nmea.0.waterDepth.depth',
                    oid_heading: 'nmea.0.vesselHeading.headingTrue',
                    oid_autopilot_mode: 'nmea.0.autoPilot.state',
                    oid_autopilot_plus_1: 'nmea.0.autoPilot.headingPlus1',
                    oid_autopilot_plus_10: 'nmea.0.autoPilot.headingPlus10',
                    oid_autopilot_minus_1: 'nmea.0.autoPilot.headingMinus1',
                    oid_autopilot_minus_10: 'nmea.0.autoPilot.headingMinus10',

                    // dialog: true,
                }}
                fake
            />,
        };

        return <Box component="div" sx={styles.app}>
            <div>
                {Object.keys(widgets).map(key => <div key={key} style={{ display: 'flex', alignItems: 'center' }}>
                    <Checkbox
                        checked={!this.state.disabled[key]}
                        onChange={e => {
                            const disabled = JSON.parse(JSON.stringify(this.state.disabled));
                            disabled[key] = !e.target.checked;
                            window.localStorage.setItem('disabled', JSON.stringify(disabled));
                            this.setState({ disabled });
                        }}
                    />
                    {key}
                </div>)}
                {fields.map(key => <TextField
                    key={key}
                    label={key}
                    value={this.state.values[key]}
                    onChange={e => {
                        this.setState({ values: { ...this.state.values, [key]: e.target.value } });
                        window.localStorage.setItem(key, e.target.value);
                    }}
                />)}
            </div>
            {Object.keys(widgets).map(key => (this.state.disabled[key] ? null : widgets[key]))}
        </Box>;
    }
}

export default App;
