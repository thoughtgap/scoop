var logging = require('./logging.js');
var moment = require('moment');
const request = require('request');
var events = require('./events.js');

let status = {
    busy: false,
    time: null,
    relay: {
        ison: null,
    },
    intervalSec: null,
    source: null
}

var config = {
    url: null,
}

const configure = (url, intervalSec) => {
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
                setShellyRelayStatus(body.relays[0].ison,'getShellyStatus()');
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

const shellyRequestOptions = {
    json: true,
    maxAttempts: 5,  // (default) try 5 times 
    retryDelay: 5000, // (default) wait for 5s before trying again
}

const turnShellyRelay = (onOff) => {
    if (config.url !== null && (onOff == 'on' || onOff == 'off')) {
        logging.add(`Shelly turnShellyRelay(${onOff})`);

        request(config.url+'/relay/0?turn='+onOff, shellyRequestOptions, (error, res, body) => {
        
            if (!error && res.statusCode == 200) {
                setShellyRelayStatus(onOffToBool(onOff),'turnShellyRelay()');
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

// Shelly IO URL Actions will push the Relay State (on/off) to the coop, no need to poll regularly
setShellyRelayStatusOnOff = (onOff) => {
    if(onOff == 'on' || onOff == 'off') {
        logging.add(`Shelly receiving setShellyRelayStatusOnOff(${onOff})`);
        setShellyRelayStatus(onOffToBool(onOff),'setShellyRelayStatusOnOff');
    }
    else {
        logging.add(`Shelly receiving invalid setShellyRelayStatusOnOff(on,off)`);
    }
}

const onOffToBool = (onOff) => {
    if(onOff === 'on') {
        return true;
    }
    else if(onOff === 'off') {
        return false;
    }
}

const boolToOnOff = (bool) => {
    if(bool === true) {
        return 'on';
    }
    else if(bool === false) {
        return 'off';
    }
}

const setShellyRelayStatus = (onOffBool,source) => {
    status.time = moment();
    status.relay.ison = onOffBool;
    status.source = source;
    events.send('shellyRelayIsOn',onOffBool);
}

exports.configure = configure;
exports.getShellyStatus = getShellyStatus;
exports.turnShellyRelay = turnShellyRelay;
exports.setShellyRelayStatusOnOff = setShellyRelayStatusOnOff;
exports.status = status;
