var logging = require('./logging.js');
const bme280 = require('bme280');
var moment = require('moment');

var status = {
    busy: false,
    values: {
        temperature: null,
        pressure: null,
        humidity: null
    },
    time: null,
    intervalSec: null
}

var config = {
    port: null
}
// Todo aus zentraler Configdatei holen.

configure = (port, intervalSec) => {
    status.intervalSec = intervalSec;
    config.port = port;
}

readSensor = () => {
    if (!status.busy && config.port !== null) {
        logging.add("BME280 readSensor() getting sensor data");
        status.busy = true;
        bme280.open({ i2cAddress: 0x76 }).then(async sensor => {
            status.values = await sensor.read();
            await sensor.close();
            status.busy = false;
            status.time = new moment();
            logging.add("Read bme280.");
            logging.add(status);

            logging.thingspeakLog("field1="+status.values.temperature+"&field2="+status.values.pressure+"&field3="+status.values.humidity);

        }).catch(console.log);
    }
    else {
        logging.add("BME280 readSensor() - busy (skip)");
    }
    if(status.intervalSec) {
        //logging.add("BME280 next value in "+config.intervalSec);
        setTimeout(function erneutLesen() {
            readSensor();
        }, status.intervalSec * 1000);
    }
}

exports.configure = configure;
exports.readSensor = readSensor;
exports.status = status;