var logging = require('./logging.js');
var moment = require('moment');
var SSE = require('express-sse');

// Sending server side events (SSE) about things happening in the coop
var sse = new SSE();

send = (eventType, message) => {
    sse.send(message,eventType);
    logging.add(`Event ${eventType}: ${JSON.stringify(message)}`);
};

exports.send = send;
exports.sse = sse;
