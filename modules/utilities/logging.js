var moment = require('moment');
const axios = require('axios');
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

function validLogLevel(level, defaultLevel = 'info') {
    return validLogLevels.includes(level) ? level : defaultLevel;
}

add = (message, type = "info", module = "unknown") => {
    type = validLogLevel(type, 'info');
    const formattedMessage = `[${module}] ${message}`;
    logger.log(type, formattedMessage);
}

const setLogLevel = (logLevel) => {
    logLevel = validLogLevel(logLevel);
    logger.level = logLevel;
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
        
        // Execute asynchronously but don't require await
        const promise = (async () => {
            try {
                await axios.get(thingSpeakConfig.baseUrl + urlStr);
                return true;
            } catch (err) {
                add(err.message, 'warn');
                return false;
            }
        })();
        
        // Handle errors silently to maintain backward compatibility
        promise.catch(err => {
            add(`Error in thingspeakLog: ${err.message}`, 'warn');
        });
        
        return promise;
    }
    
    return Promise.resolve(false);
}

exports.add = add;
exports.setLogLevel = setLogLevel;
exports.thingspeakLog = thingspeakLog;
exports.thingspeakSetAPIKey = thingspeakSetAPIKey;
