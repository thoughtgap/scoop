var logging = require('./logging.js');
var moment = require('moment');
var cpuTemp = require("pi-temperature");

var status = {
    busy: false,
    values: {
        temperature: null,
    },
    error: null,
    time: null,
    intervalSec: null
}

configure = (intervalSec) => {
    status.intervalSec = intervalSec;
}

readCPUTemp = () => {
    if (!status.busy) {
        logging.add("CPU-Temp readSensor() getting sensor data", 'debug');

        status.busy = true;
        cpuTemp.measure(function(err, temp) {
            status.busy = false;
            if (err) {
              logging.add("CPU Temperatur Error "+err, 'warn');
              status.error = err;
            }
            else {
              status.error = null;
              status.values.temperature = temp;
              status.time = new moment();
              logging.add(`CPU ${temp}°C`,"debug");
              logging.thingspeakLog("field4="+status.values.temperature);
            }
            if(status.intervalSec) {
              setTimeout(function temperaturErneutLesen() {
                readCPUTemp();
              }, status.intervalSec * 1000);
            }
          });
    }
    else {
        logging.add("CPU Temp readSensor() - busy (skip)");
    }
}

exports.configure = configure;
exports.readSensor = readCPUTemp;
exports.status = status;

