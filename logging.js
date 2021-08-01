var moment = require('moment');
const request = require('request');
const SimpleNodeLogger = require('simple-node-logger');
const fs = require('fs');

// Logging to files
const fileLogConfig = {
    logDirectory: './logs/',
    errorEventName: 'error',
    fileNamePattern: 'log-<DATE>.log',
    dateFormat: 'YYYY-MM-DD'
};

if (!fs.existsSync(fileLogConfig.logDirectory)) {
    fs.mkdirSync(fileLogConfig.logDirectory);
}

fileLog = SimpleNodeLogger.createRollingFileLogger(fileLogConfig);
consoleLog = SimpleNodeLogger.createSimpleLogger();

const validLogLevels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];

add = (message, type = "info") => {
    type = validLogLevel(type,'info');
    fileLog.log(type, message);
    consoleLog.log(type, message);
}

const setLogLevel = (logLevel) => {
    logLevel = validLogLevel(logLevel);

    fileLog.setLevel(logLevel);
    consoleLog.setLevel(logLevel);
}

const validLogLevel = (logLevel, fallback) => {
    if(!validLogLevels.includes(logLevel)) {
        fileLog.log('warn','Invalid Log Level '+type+ ' changed to '+fallback);
        consoleLog.log('warn','Invalid Log Level '+type+ ' changed to '+fallback);

        return fallback;
    }
    return logLevel;
}


// Logging to Thingspeak
let thingSpeakConfig = {
    apiKey: null,
    enable: null,
    baseUrl: null
}

thingspeakSetAPIKey = (apikey) => {
    thingSpeakConfig.apiKey = apikey;
    thingSpeakConfig.enable = true;
    thingSpeakConfig.baseUrl = "https://api.thingspeak.com/update?api_key="+ apikey + "&";
}

thingspeakLog = (urlStr) => {
    if (thingSpeakConfig.enable) {
        this.add("Thingspeak Log " + urlStr,'debug');
        request(thingSpeakConfig.baseUrl + urlStr, { json: true }, (err, res, body) => {
            if (err) {
                this.add(err,'warn');
            }
        });
    }
}

exports.add = add;
exports.setLogLevel = setLogLevel;
exports.thingspeakLog = thingspeakLog;
exports.thingspeakSetAPIKey = thingspeakSetAPIKey;
