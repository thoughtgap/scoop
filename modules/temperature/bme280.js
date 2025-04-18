var logging = require('../utilities/logging.js');
const bme280 = require('bme280');
var moment = require('moment');
var heating = require('../climate/heating.js');
var events = require('../utilities/events.js');

var status = {
    busy: false,
    values: {
        temperature: null,
        pressure: null,
        humidity: null
    },
    time: null,
    intervalSec: null,
    hourAgo: {
        temperature: null,
        pressure: null,
        humidity: null,
        time: null,
        development: {
            temperature: null,
            pressure: null,
            humidity: null
        }
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
}

var history = [];

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
        logging.add("BME280 readSensor() getting sensor data","debug");
        status.busy = true;
        bme280.open({ i2cAddress: config.port }).then(async sensor => {
            status.values = await sensor.read();
            await sensor.close();
            status.busy = false;
            let now = moment();
            status.time = now;
            logging.add(`BME280 temperature ${status.values.temperature.toFixed(2)} pressure ${status.values.pressure.toFixed(2)} humidity ${status.values.humidity.toFixed(2)}`,"debug");
            logging.thingspeakLog("field1="+status.values.temperature.toFixed(2)+"&field2="+status.values.pressure.toFixed(2)+"&field3="+status.values.humidity.toFixed(2));

            // Send temperature and humidity events
            events.send('temperature', status.values.temperature.toFixed(1));
            events.send('humidity', status.values.humidity.toFixed(0));

            // Minutely history, preserved for one hour
            const keepEverySec = 60; // How often to preserve a value
            const keepForMin = 60;   // How long to preserve all values

            // Add value every x seconds
            //logging.add(`BME280 hourly history ${history.length} entries`);
            
            if(history.length == 0 || now.diff(history[history.length - 1].time) >= keepEverySec * 1000) {
                
                history.push({
                    time: now,
                    temperature: status.values.temperature,
                    pressure: status.values.pressure,
                    humidity: status.values.humidity
                });
                //logging.add(`BME280 hourly history adding      --> ${history.length} entries`);

                // Discard values older than x minutes
                history = history.filter(item => {
                    let keep = now.diff(item.time) <= (keepForMin * 60 * 1000);
                    //logging.add(`BME280 hourly history filtering   --> keep=${keep}     ${now.diff(item.time)} <= ${(keepForMin * 60 * 1000)}`);
                    return keep;
                });
                //logging.add(`BME280 hourly history removed old --> ${history.length} entries`);

            
                // Add development of values
                let development = {
                    temperature: null,
                    pressure: null,
                    humidity: null
                };
                let tempAct = Math.round(status.values.temperature * 10) / 10;
                let tempComp = Math.round(history[0].temperature * 10) / 10;
                if(tempAct > tempComp) {
                    development.temperature = "up";
                }
                else if(tempAct < tempComp) {
                    development.temperature = "down";
                }
                else if(tempAct == tempComp) {
                    development.temperature = "same";
                }

                if(Math.round(status.values.pressure) > Math.round(history[0].pressure)) {
                    development.pressure = "up";
                }
                else if(Math.round(status.values.pressure) < Math.round(history[0].pressure)) {
                    development.pressure = "down";
                }
                else if(Math.round(status.values.pressure) == Math.round(history[0].pressure)) {
                    development.pressure = "same";
                }

                if(Math.round(status.values.humidity) > Math.round(history[0].humidity)) {
                    development.humidity = "up";
                }
                else if(Math.round(status.values.humidity) < Math.round(history[0].humidity)) {
                    development.humidity = "down";
                }
                else if(Math.round(status.values.humidity) == Math.round(history[0].humidity)) {
                    development.humidity = "same";
                }

                // Only expose the oldest element (max 1h old) to the status object to keep minimal data 
                status.hourAgo = history[0];
                status.hourAgo.development = development;

            }
            // else {
            //     logging.add(`BME280 hourly history not adding (${history[history.length - 1].time}ms)`); 
            // }

            // Daily min/max values
            if(!now.isSame(status.daily.day, 'day')) {
                status.daily.day = now;
                status.daily.min = {
                    temperature: null,
                    pressure: null,
                    humidity: null,
                    temperatureTime: null,
                    pressureTime: null,
                    humidityTime: null
                };
                status.daily.max = {
                    temperature: null,
                    pressure: null,
                    humidity: null,
                    temperatureTime: null,
                    pressureTime: null,
                    humidityTime: null
                };
            }   
            
            // Min
            if(!status.daily.min.temperature || status.daily.min.temperature >= status.values.temperature) {
                status.daily.min.temperature = status.values.temperature;
                status.daily.min.temperatureTime = now;
            }
            if(!status.daily.min.pressure || status.daily.min.pressure >= status.values.pressure) {
                status.daily.min.pressure = status.values.pressure;
                status.daily.min.pressureTime = now;
            }
            if(!status.daily.min.humidity || status.daily.min.humidity >= status.values.humidity) {
                status.daily.min.humidity = status.values.humidity;
                status.daily.min.humidityTime = now;
            }

            // Max
            if(!status.daily.max.temperature || status.daily.max.temperature <= status.values.temperature) {
                status.daily.max.temperature = status.values.temperature;
                status.daily.max.temperatureTime = now;
            }
            if(!status.daily.max.pressure || status.daily.max.pressure <= status.values.pressure) {
                status.daily.max.pressure = status.values.pressure;
                status.daily.max.pressureTime = now;
            }
            if(!status.daily.max.humidity || status.daily.max.humidity <= status.values.humidity) {
                status.daily.max.humidity = status.values.humidity;
                status.daily.max.humidityTime = now;
            }

            // Send values to heating.js
            //heating.checkHeating(status.values.temperature,status.hourAgo.temperature);
            heating.checkLight(status.values.temperature);

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

