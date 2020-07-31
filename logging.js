var moment = require('moment');
var log = [];

// const SimpleNodeLogger = require('simple-node-logger'),
//     opts = {
//         logFilePath:'mylogfile.log',
//         timestampFormat:'YYYY-MM-DD HH:mm:ss.SSS'
//     },
// //fileLog = SimpleNodeLogger.createSimpleLogger( opts );

const SimpleNodeLogger = require('simple-node-logger');
const opts2 = {
    logDirectory:'./',
    errorEventName:'error',
    fileNamePattern:'log-<DATE>.log',
    dateFormat:'YYYY-MM-DD'
};
// //logDirectory:'', // NOTE: folder must exist and be writable...

fileLog = SimpleNodeLogger.createRollingFileLogger( opts2 );
consoleLog = SimpleNodeLogger.createSimpleLogger();

add = (message, type="info") => {
    let timestamp = moment();

    //console.log(timestamp.format('YYYY-MM-D H:mm:ss') + " * "+message);
    if(type=="error") {
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

exports.add = add;
exports.log = log;
