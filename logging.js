var moment = require('moment');
const request = require('request');
var log = [];

const SimpleNodeLogger = require('simple-node-logger');
const opts2 = {
    logDirectory: './logs/',
    errorEventName: 'error',
    fileNamePattern: 'log-<DATE>.log',
    dateFormat: 'YYYY-MM-DD'
};

fileLog = SimpleNodeLogger.createRollingFileLogger(opts2);
consoleLog = SimpleNodeLogger.createSimpleLogger();

add = (message, type = "info") => {
    let timestamp = moment();

    //console.log(timestamp.format('YYYY-MM-D H:mm:ss') + " * "+message);
    if (type == "error") {
        fileLog.warn(message);
        consoleLog.warn(message);
    }
    else {
        fileLog.info(message);
        consoleLog.info(message);
    }


    log.push({
        "time": timestamp,
        "log": message
    });
}

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
                return console.log(err);
            }
        });
    }
}

exports.add = add;
exports.log = log;
exports.thingspeakLog = thingspeakLog;
exports.thingspeakSetAPIKey = thingspeakSetAPIKey;