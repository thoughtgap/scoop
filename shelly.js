var logging = require('./logging.js');
var moment = require('moment');
const request = require('request');

var status = {
    busy: false,
    time: null,
    relay: {
        ison: null,
        has_timer: null,
        timer_started: null,
        timer_duration: null,
        timer_remaining: null,
        source: null
    },
    intervalSec: null
}

var config = {
    url: null,
}

configure = (url, intervalSec) => {
    logging.add(`Shelly configure ${url}`);
    config.url = url;
    status.intervalSec = intervalSec;
}

config.url = 'http://192.168.31.77';

getShellyStatus = (noRepeat = false) => {
    if (!status.busy && config.url !== null) {
        logging.add("Shelly getShellyStatus() getting relay data");
        status.busy = true;

        request(config.url+'/status', {json: true}, (error, res, body) => {
            status.busy = false;
        
            if (!error && res.statusCode == 200) {

                status.time = moment();
                status.relay = body.relays[0];

                // do something with JSON, using the 'body' variable
            };

            if(status.intervalSec && !noRepeat) {
                logging.add("Shelly next value in "+status.intervalSec,'debug');
                setTimeout(function erneutLesen() {
                    getShellyStatus();
                }, status.intervalSec * 1000);
            }

            if (error) {
                logging.add(error,'warn');
                return false;
            };
        });
    }
    else {
        logging.add("Shelly getShellyStatus() - busy (skip)");
    }
}

shellyRequestOptions = {
    json: true,
    maxAttempts: 5,  // (default) try 5 times 
    retryDelay: 5000, // (default) wait for 5s before trying again
    //retryStrategy: request.RetryStrategies.HTTPOrNetworkError // (default) retry on 5xx or network errors
}

turnShellyRelay = (onOff) => {
    if (config.url !== null && (onOff == 'on' || onOff == 'off')) {
        logging.add(`Shelly turnShellyRelay(${onOff})`);

        request(config.url+'/relay/0?turn='+onOff, shellyRequestOptions, (error, res, body) => {
        
            if (!error && res.statusCode == 200) {

                status.time = moment();
                status.relay.ison = (onOff == 'on');
                status.relay.source = 'turnShellyRelay';

            };

            if (error) {
                logging.add(error,'warn');
                return false;
            };
        });
    }
    else {
        logging.add("Shelly turnShellyRelay() - invalid config or command (skip)");
    }
}

// Shelly IO URL Actions will push the Relay State to the coop, no need to poll regularly
setShellyRelayStatus = (onOff) => {
    logging.add(`Shelly receiving setShellyRelayStatus(${onOff})`);
    if(onOff == 'on' || onOff == 'off') {
        logging.add(`Shelly receiving setShellyRelayStatus(${onOff})`);
        status.time = moment();
        status.relay.ison = (onOff == 'on');
        status.relay.source = 'ioURLActions';
    }
}

exports.configure = configure;
exports.getShellyStatus = getShellyStatus;
exports.turnShellyRelay = turnShellyRelay;
exports.setShellyRelayStatus = setShellyRelayStatus;
exports.status = status;
