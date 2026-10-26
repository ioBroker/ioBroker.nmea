/* jshint -W097 */
/* jshint strict: false */
/* jslint node: true */
const expect = require('chai').expect;
const setup = require('@iobroker/legacy-testing');

let objects = null;
let states = null;
let onStateChanged = null;

const adapterShortName = setup.adapterName.substring(setup.adapterName.indexOf('.') + 1);
const runningMode = require('../io-package.json').common.mode;

// AIS data of a vessel whose object an older version deleted, and of a vessel with object
const ORPHAN_ID = `${adapterShortName}.0.aisClassAPositionReport.211000001`;
const VESSEL_ID = `${adapterShortName}.0.aisClassAPositionReport.211000002`;

function checkConnectionOfAdapter(cb, counter) {
    counter = counter || 0;
    console.log(`Try check #${counter}`);
    if (counter > 30) {
        cb && cb('Cannot check connection');
        return;
    }

    states.getState(`system.adapter.${adapterShortName}.0.alive`, (err, state) => {
        err && console.error(err);
        if (state && state.val) {
            cb && cb();
        } else {
            setTimeout(() => checkConnectionOfAdapter(cb, counter + 1), 1000);
        }
    });
}

describe(`Test ${adapterShortName} adapter`, function () {
    before(`Test ${adapterShortName} adapter: Start js-controller`, function (_done) {
        this.timeout(600000); // because of the first installation from npm

        setup.setupController(async () => {
            const config = await setup.getAdapterConfig();
            // enable adapter
            config.common.enabled = true;
            config.common.loglevel = 'debug';

            //config.native.dbtype   = 'sqlite';

            await setup.setAdapterConfig(config.common, config.native);

            setup.startController(
                false,
                (id, obj) => {},
                (id, state) => onStateChanged && onStateChanged(id, state),
                (_objects, _states) => {
                    objects = _objects;
                    states = _states;
                    const vessel = {
                        type: 'state',
                        common: { name: 'Vessel', type: 'object', role: 'value', read: true, write: false },
                        native: {},
                    };
                    objects.setObject(VESSEL_ID, vessel, () =>
                        states.setState(VESSEL_ID, { val: '{}', ack: true }, () =>
                            states.setState(ORPHAN_ID, { val: '{}', ack: true }, () =>
                                setup.startAdapter(objects, states, () => _done()),
                            ),
                        ),
                    );
                },
            );
        });
    });

    it(`Test ${adapterShortName} instance object: it must exists`, function (done) {
        objects.getObject(`system.adapter.${adapterShortName}.0`, (err, obj) => {
            expect(err).to.be.null;
            expect(obj).to.be.an('object');
            expect(obj).not.to.be.null;
            done();
        });
    });

    it(`Test ${adapterShortName} adapter: Check if adapter started`, function (done) {
        this.timeout(60000);
        checkConnectionOfAdapter(res => {
            if (res) console.log(res);
            if (runningMode === 'daemon') {
                expect(res).not.to.be.equal('Cannot check connection');
            } else {
                //??
            }
            done();
        });
    });
    /**/

    it(`Test ${adapterShortName} adapter: Deletes the states without object`, async function () {
        this.timeout(30000);
        const getState = id =>
            new Promise((resolve, reject) => states.getState(id, (err, state) => (err ? reject(err) : resolve(state))));
        // onReady() runs after the adapter is alive
        for (let i = 0; i < 40 && (await getState(ORPHAN_ID)); i++) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        expect(await getState(ORPHAN_ID)).to.be.null;
        expect(await getState(VESSEL_ID)).to.be.an('object');
    });

    /*
    PUT YOUR OWN TESTS HERE USING
    it('Testname', function ( done) {
        ...
    });

    You can also use "sendTo" method to send messages to the started adapter
*/

    after(`Test ${adapterShortName} adapter: Stop js-controller`, function (done) {
        this.timeout(10000);

        setup.stopController(normalTerminated => {
            console.log(`Adapter normal terminated: ${normalTerminated}`);
            done();
        });
    });
});
