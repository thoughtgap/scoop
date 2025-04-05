var logging = require('./logging.js');
var moment = require('moment');

var status = {
    enabled: false,
    busy: false,
    values: {
        temperature: null,
    },
    error: null,
    time: null,
    intervalSec: null
}

var config = {
    skipModule: false
}

configure = (intervalSec) => {
    status.intervalSec = intervalSec;

    // Check if module should be skipped
    if (global.skipModules && global.skipModules.cputemp) {
        config.skipModule = true;
        status.enabled = false;
        logging.add("CPU temperature module disabled in config");
        return;
    }

    // Try to initialize the CPU temperature sensor
    try {
        const cpuTemp = require("pi-temperature");
        status.enabled = true;
        logging.add("CPU temperature module initialized successfully");
    } catch (e) {
        config.skipModule = true;
        status.enabled = false;
        logging.add("CPU temperature module not available - using mock sensor", "warn");
    }
}

readCPUTemp = () => {
    if (config.skipModule) {
        // When disabled, return mock values that slowly change over time
        const now = moment();
        status.time = now;
        
        // Generate mock values that vary slightly over time
        const baseTemp = 45; // Base CPU temperature in Celsius
        
        // Add some variation based on time of day (24h cycle)
        const hourOfDay = now.hours() + now.minutes() / 60;
        const dayProgress = (hourOfDay / 24) * 2 * Math.PI;
        
        // CPU temp varies between 40-50°C in a daily cycle
        status.values.temperature = baseTemp + 5 * Math.sin(dayProgress);
        status.error = null;

        logging.add(`CPU mock temperature ${status.values.temperature.toFixed(2)}°C`, "debug");
        logging.thingspeakLog("field4="+status.values.temperature);
        
        // Schedule next reading if interval is set
        if (status.intervalSec) {
            setTimeout(function temperaturErneutLesen() {
                readCPUTemp();
            }, status.intervalSec * 1000);
        }
        return;
    }

    if (!status.busy && status.enabled) {
        logging.add("CPU-Temp readSensor() getting sensor data", 'debug');

        status.busy = true;
        try {
            const cpuTemp = require("pi-temperature");
            cpuTemp.measure(function(err, temp) {
                status.busy = false;
                if (err) {
                    logging.add("CPU Temperature Error "+err, 'warn');
                    status.error = err;
                }
                else {
                    status.error = null;
                    status.values.temperature = temp;
                    status.time = new moment();
                    logging.add(`CPU ${temp}°C`, "debug");
                    logging.thingspeakLog("field4="+status.values.temperature);
                }
                if(status.intervalSec) {
                    setTimeout(function temperaturErneutLesen() {
                        readCPUTemp();
                    }, status.intervalSec * 1000);
                }
            });
        } catch (e) {
            logging.add("Error requiring pi-temperature module: " + e, 'warn');
            status.busy = false;
            config.skipModule = true;
            status.enabled = false;
            
            // Retry after interval
            if(status.intervalSec) {
                setTimeout(function temperaturErneutLesen() {
                    readCPUTemp();
                }, status.intervalSec * 1000);
            }
        }
    }
    else {
        logging.add("CPU Temp readSensor() - busy or not enabled (skip)");
    }
}

exports.configure = configure;
exports.readSensor = readCPUTemp;
exports.status = status;