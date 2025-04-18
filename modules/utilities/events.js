var logging = require('./logging.js');
var moment = require('moment');
var SSE = require('express-sse');
var mqtt = require('./mqtt.js');

// Sending server side events (SSE) about things happening in the coop
var sse = new SSE();

send = (eventType, message) => {
    sse.send(message,eventType);
    logging.add(`Event ${eventType}: ${JSON.stringify(message)}`,'debug');

    // Publish relevant events to MQTT
    switch(eventType) {
        case 'temperature':
            mqtt.publish('scoop/temperature', JSON.stringify({
                value: parseFloat(message),
                timestamp: moment().toISOString()
            }));
            break;
        case 'humidity':
            mqtt.publish('scoop/humidity', JSON.stringify({
                value: parseFloat(message),
                timestamp: moment().toISOString()
            }));
            break;
        case 'cpu_temperature':
            mqtt.publish('scoop/cpu_temperature', JSON.stringify({
                value: parseFloat(message),
                timestamp: moment().toISOString()
            }));
            break;
    }
};

exports.send = send;
exports.sse = sse;
