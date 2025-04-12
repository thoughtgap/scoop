var moment = require('moment');
const request = require('request');
const winston = require('winston');
require('winston-daily-rotate-file');

// Configure logging to files
const fileTransport = new winston.transports.DailyRotateFile({
    filename: './logs/log-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '14d',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => {
            return `${timestamp} ${level.toUpperCase()} ${message}`;
        })
    )
});

// Configure console logging
const consoleTransport = new winston.transports.Console({
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => {
            return `${timestamp} ${level.toUpperCase()} ${message}`;
        })
    )
});

// Create the logger
const logger = winston.createLogger({
    level: 'info',
    transports: [fileTransport, consoleTransport]
});

const validLogLevels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];

add = (message, type = "info") => {
    type = validLogLevel(type, 'info');
    logger.log(type, message);
}

const setLogLevel = (logLevel) => {
    logLevel = validLogLevel(logLevel);
    logger.level = logLevel;
}

const validLogLevel = (logLevel, fallback) => {
    if(!validLogLevels.includes(logLevel)) {
        logger.warn(`Invalid Log Level ${logLevel} changed to ${fallback}`);
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
    thingSpeakConfig.enable = false;
    thingSpeakConfig.baseUrl = "https://api.thingspeak.com/update?api_key="+ apikey + "&";
}

thingspeakLog = (urlStr) => {
    if (thingSpeakConfig.enable) {
        add("Thingspeak Log " + urlStr, 'debug');
        request(thingSpeakConfig.baseUrl + urlStr, { json: true }, (err, res, body) => {
            if (err) {
                add(err, 'warn');
            }
        });
    }
}

exports.add = add;
exports.setLogLevel = setLogLevel;
exports.thingspeakLog = thingspeakLog;
exports.thingspeakSetAPIKey = thingspeakSetAPIKey;
