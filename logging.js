var moment = require('moment');
var log = [];

add = (message) => {
    let timestamp = moment();

    console.log(timestamp.format('YYYY-MM-D H:mm:ss') + " * "+message);
    log.push({
    "time": timestamp,
    "log": message
    });
}

exports.add = add;
exports.log = log;
