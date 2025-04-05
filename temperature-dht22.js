var logging = require('./logging.js');
var moment = require('moment');

var status = {
    enabled: false,
    busy: false,
    values: {
        temperature: null,
        humidity: null
    },
    error: null,
    time: null,
    intervalSec: null
}

// Check if module is disabled in config
let dhtSensor = null;
try {
    if (!global.skipModules || !global.skipModules.dht22) {
        dhtSensor = require("node-dht-sensor");
        status.enabled = true;
        logging.add("DHT22 module enabled");
    } else {
        logging.add("DHT22 module disabled in config");
        status.enabled = false;
    }
} catch (e) {
    logging.add("Could not load DHT22 sensor module: " + e.message, "warn");
    status.enabled = false;
}

var config = {
    port: null
}

configure = (port, intervalSec) => {
    status.intervalSec = intervalSec;
    config.port = port;
}

readSensor = () => {
    if (!dhtSensor) {
        // Module is disabled or not available
        status.values.temperature = null;
        status.values.humidity = null;
        status.error = "Module disabled";
        status.time = new moment();
        logging.add("DHT22 readSensor() - module disabled", 'debug');
        return;
    }

    if (!status.busy && config.port !== null) {
        logging.add("DHT22 readSensor() getting sensor data");
        status.busy = true;

        // DHT22 Temperature
        dhtSensor.read(22, config.port, function(err, temperature, humidity) {
            status.busy = false;
            status.time = new moment();

            if (!err) {
                status.values.temperature = temperature;
                status.values.humidity = humidity;
                status.error = null;
                logging.add(`Read DHT22. temperature ${status.values.temperature} humidity ${status.values.humidity}`);
            }
            else {
                logging.add(`DHT22 Error ${err}`, 'warn');
                status.values.temperature = null;
                status.values.humidity = null;
                status.error = ""+err;
            }
        });
    }
    else {
        logging.add("DHT22 readSensor() - busy (skip)");
    }

    if(status.intervalSec) {
        //logging.add("DHT22 next value in "+config.intervalSec);
        setTimeout(function erneutLesen() {
            readSensor();
        }, status.intervalSec * 1000);
    }
}

exports.configure = configure;
exports.readSensor = readSensor;
exports.status = status;
