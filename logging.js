var moment = require('moment');
const request = require('request');
const SimpleNodeLogger = require('simple-node-logger');

// Logging to files
const fileLogConfig = {
    logDirectory: './logs/',
    errorEventName: 'error',
    fileNamePattern: 'log-<DATE>.log',
    dateFormat: 'YYYY-MM-DD'
};

fileLog = SimpleNodeLogger.createRollingFileLogger(fileLogConfig);
consoleLog = SimpleNodeLogger.createSimpleLogger();

const validLogLevels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];

add = (message, type = "info") => {

    if(!validLogLevels.includes(type)) {
        fileLog.log('warn','Invalid Log Level '+type+ ' changed to warn');
        consoleLog.log('warn','Invalid Log Level '+type+ ' changed to warn');
        type = 'warn';
    }

    let timestamp = moment();
    fileLog.log(type, message);
    consoleLog.log(type, message);
}


// Logging to Thingspeak
thingspeakAPIKey = null;

thingspeakSetAPIKey = (apikey) => {
    thingspeakAPIKey = apikey;
}

thingspeakLog = (urlStr) => {
    if(!thingspeakAPIKey) {
        logging.add("No Thingspeak API Key found");
    }
    else {
        this.add("Thingspeak Log " + urlStr);
    
        const baseUrl = "https://api.thingspeak.com/update?api_key="+ thingspeakAPIKey + "&"
        
        request(baseUrl + urlStr, { json: true }, (err, res, body) => {
            if (err) {
                this.add(err,'warn');
            }
        });
    }
}

exports.add = add;
exports.thingspeakLog = thingspeakLog;
exports.thingspeakSetAPIKey = thingspeakSetAPIKey;
