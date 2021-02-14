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
    daily: {
        day: moment(),
        min: {
            temperature: null,
            pressure: null,
            humidity: null,
            temperatureTime: null,
            pressureTime: null,
            humidityTime: null
        },
        max: {
            temperature: null,
            pressure: null,
            humidity: null,
            temperatureTime: null,
            pressureTime: null,
            humidityTime: null
        }
    },
    time: null,
    intervalSec: null
}

var config = {
    port: null
}

configure = (port, intervalSec) => {
    logging.add(`BME280 configure Port ${port} Interval ${intervalSec}`);
    status.intervalSec = intervalSec;
    config.port = Number(port);
}

readBME280 = () => {
    if (!status.busy && config.port !== null) {
        logging.add("BME280 readSensor() getting sensor data");
        status.busy = true;
        bme280.open({ i2cAddress: config.port }).then(async sensor => {
            status.values = await sensor.read();
            await sensor.close();
            status.busy = false;
            status.time = new moment();
            logging.add(`BME280 temperature ${status.values.temperature.toFixed(2)} pressure ${status.values.pressure.toFixed(2)} humidity ${status.values.humidity.toFixed(2)}`);
            logging.thingspeakLog("field1="+status.values.temperature.toFixed(2)+"&field2="+status.values.pressure.toFixed(2)+"&field3="+status.values.humidity.toFixed(2));

            // Daily min/max values
            if(!moment().isSame(status.daily.day, 'day')) {
                status.daily.day = moment();
                status.daily.min = status.values;
                status.daily.max = status.values;
            }   
            //logging.add(`BME280 temperature isSame`);
            // Min
            if(!status.daily.min.temperature || status.daily.min.temperature >= status.values.temperature) {
                status.daily.min.temperature = status.values.temperature;
                status.daily.min.temperatureTime = moment();
            }
            if(!status.daily.min.pressure || status.daily.min.pressure >= status.values.pressure) {
                status.daily.min.pressure = status.values.pressure;
                status.daily.min.pressureTime = moment();
            }
            if(!status.daily.min.humidity || status.daily.min.humidity >= status.values.humidity) {
                status.daily.min.humidity = status.values.humidity;
                status.daily.min.humidityTime = moment();
            }

            // Max
            if(!status.daily.max.temperature || status.daily.max.temperature <= status.values.temperature) {
                status.daily.max.temperature = status.values.temperature;
                status.daily.max.temperatureTime = moment();
            }
            if(!status.daily.max.pressure || status.daily.max.pressure <= status.values.pressure) {
                status.daily.max.pressure = status.values.pressure;
                status.daily.max.pressureTime = moment();
            }
            if(!status.daily.max.humidity || status.daily.max.humidity <= status.values.humidity) {
                status.daily.max.humidity = status.values.humidity;
                status.daily.max.humidityTime = moment();
            }

            if(status.intervalSec) {
                setTimeout(function erneutLesen() {
                    readBME280();
                }, status.intervalSec * 1000);
            }

        }).catch((e) => {
            logging.add(e,'warn');

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
