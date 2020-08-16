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

readBME280 = () => {
    if (!status.busy && config.port !== null) {
        logging.add("BME280 readSensor() getting sensor data");
        status.busy = true;
        bme280.open({ i2cAddress: 0x76 }).then(async sensor => {
            status.values = await sensor.read();
            await sensor.close();
            status.busy = false;
            status.time = new moment();
            logging.add(`BME280 temperature ${status.values.temperature} pressure ${status.values.pressure} humidity ${status.values.humidity}`);
            logging.thingspeakLog("field1="+status.values.temperature+"&field2="+status.values.pressure+"&field3="+status.values.humidity);

            if(status.intervalSec) {
                setTimeout(function erneutLesen() {
                    readBME280();
                }, status.intervalSec * 1000);
            }

        }).catch((e) => {
            logging.add(error,'warn');

            logging.add("BME280 next value in "+status.intervalSec,'debug');
            if(status.intervalSec) {
                setTimeout(function erneutLesen() {
                    readBME280();
                }, status.intervalSec * 1000);
            }
        });
    }
    else {
        logging.add("BME280 readSensor() - busy (skip)");
    }
}

exports.configure = configure;
exports.readSensor = readBME280;
exports.status = status;
