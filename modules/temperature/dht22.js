var logging = require('../utilities/logging.js');
var dhtSensor = require("node-dht-sensor");
var moment = require('moment');

var status = {
    busy: false,
    values: {
        temperature: null,
        humidity: null
    },
    error: null,
    time: null,
    intervalSec: null
}

var config = {
    port: null
}

configure = (port, intervalSec) => {
    status.intervalSec = intervalSec;
    config.port = port;
}

readSensor = () => {
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
