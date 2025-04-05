var logging = require('./logging.js');
var moment = require('moment');
var events = require('./events.js');

let status = {
    enabled: false,
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
    skipModule: false
}

const configure = (url, intervalSec) => {
    // Check if module should be skipped
    if (global.skipModules && global.skipModules.shelly) {
        config.skipModule = true;
        status.enabled = false;
        logging.add("Shelly module disabled in config");
        return;
    }

    logging.add(`Shelly configure ${url}`);
    config.url = url;
    status.intervalSec = intervalSec;

    // Try to initialize the request module
    try {
        const request = require('request');
        status.enabled = true;
        logging.add("Shelly module initialized successfully");
    } catch (e) {
        config.skipModule = true;
        status.enabled = false;
        logging.add("Shelly module not available - request module missing", "warn");
    }
}

getShellyStatus = (noRepeat = false) => {
    if (config.skipModule || !status.enabled) {
        // When disabled, simulate a response
        status.time = moment();
        status.relay.ison = false; // Default to off in mock mode
        events.send('shellyRelayIsOn', false);
        
        // Schedule next check if interval is set
        if(status.intervalSec && !noRepeat) {
            setTimeout(function erneutLesen() {
                getShellyStatus();
            }, status.intervalSec * 1000);
        }
        return;
    }

    if (!status.busy && config.url !== null) {
        logging.add("Shelly getShellyStatus() getting relay data");
        status.busy = true;

        try {
            const request = require('request');
            request(config.url+'/rpc/Switch.GetStatus?id=0', {json: true}, (error, res, body) => {
                status.busy = false;
            
                if (!error && res.statusCode == 200) {
                    setShellyRelayStatus(body.output, 'getShellyStatus()');
                };

                if(status.intervalSec && !noRepeat) {
                    logging.add("Shelly next value in "+status.intervalSec, 'debug');
                    setTimeout(function erneutLesen() {
                        getShellyStatus();
                    }, status.intervalSec * 1000);
                }

                if (error) {
                    logging.add(error, 'warn');
                    return false;
                };
            });
        } catch (e) {
            logging.add("Error requiring request module: " + e, 'warn');
            status.busy = false;
            config.skipModule = true;
            status.enabled = false;
        }
    }
    else {
        logging.add("Shelly getShellyStatus() - busy or not enabled (skip)");
    }
}

const shellyRequestOptions = {
    json: true,
    maxAttempts: 5,  // (default) try 5 times 
    retryDelay: 5000, // (default) wait for 5s before trying again
}

const turnShellyRelay = (onOff, retryCount = null) => {
    if (config.skipModule || !status.enabled) {
        // When disabled, just update the mock status
        const newState = onOff === 'on';
        setShellyRelayStatus(newState, 'turnShellyRelay(mock)');
        logging.add(`Shelly mock relay turned ${onOff}`, "debug");
        return true;
    }

    if(retryCount > 900) { 
        // Try max 30mins 
        logging.add("Shelly turnShellyRelay() - retried too often, not trying anymore");
        return false;
    }
    else if (config.url !== null && (onOff == 'on' || onOff == 'off')) {
        try {
            const request = require('request');
            const rpcCommand = onOff === 'on' ? 'true' : 'false';
            request(config.url+'/rpc/Switch.Set?id=0&on='+rpcCommand, shellyRequestOptions, (error, res, body) => {
            
                if (!error && res.statusCode == 200) {
                    setShellyRelayStatus(body.was_on, 'turnShellyRelay()');
                };

                if (error) {
                    logging.add(error, 'warn');

                    // Try again if failed
                    if(retryCount === null) {
                        retryCount = 0;
                    }
                    logging.add("Shelly turnShellyRelay() - failed - try again in 2s");
                    setTimeout(() => {
                        turnShellyRelay(onOff, (retryCount + 1));
                    }, 2000);
                    
                    return false;
                };
            });
        } catch (e) {
            logging.add("Error requiring request module: " + e, 'warn');
            config.skipModule = true;
            status.enabled = false;
            return false;
        }
    }
    else {
        logging.add("Shelly turnShellyRelay() - invalid config or command (skip)");
        return false;
    }
}

// Shelly IO URL Actions will push the Relay State (on/off) to the coop, no need to poll regularly
setShellyRelayStatusOnOff = (onOff) => {
    if(onOff == 'on' || onOff == 'off') {
        logging.add(`Shelly receiving setShellyRelayStatusOnOff(${onOff})`);
        setShellyRelayStatus(onOffToBool(onOff), 'setShellyRelayStatusOnOff');
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

const setShellyRelayStatus = (onOffBool, source) => {
    status.time = moment();
    status.relay.ison = onOffBool;
    status.source = source;
    events.send('shellyRelayIsOn', onOffBool);
}

exports.configure = configure;
exports.getShellyStatus = getShellyStatus;
exports.turnShellyRelay = turnShellyRelay;
exports.setShellyRelayStatusOnOff = setShellyRelayStatusOnOff;
exports.status = status;