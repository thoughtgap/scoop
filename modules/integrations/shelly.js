var logging = require('../utilities/logging.js');
var moment = require('moment');
const axios = require('axios');
var events = require('../utilities/events.js');

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

getShellyStatus = (noRepeat = false) => {
    // Make the function return a promise but don't require callers to use await
    const promise = (async () => {
        if (!status.busy && config.url !== null) {
            logging.add("Shelly getShellyStatus() getting relay data");
            status.busy = true;

            try {
                const response = await axios.get(`${config.url}/rpc/Switch.GetStatus?id=0`, {
                    timeout: 5000 // 5 second timeout
                });
                status.busy = false;
                
                if (response.status === 200) {
                    setShellyRelayStatus(response.data.output, 'getShellyStatus()');
                }
                
                if(status.intervalSec && !noRepeat) {
                    logging.add("Shelly next value in "+status.intervalSec, 'debug');
                    setTimeout(function erneutLesen() {
                        getShellyStatus();
                    }, status.intervalSec * 1000);
                }
                return true;
            } catch (error) {
                status.busy = false;
                logging.add(error.message, 'warn');
                
                if(status.intervalSec && !noRepeat) {
                    logging.add("Shelly next value in "+status.intervalSec, 'debug');
                    setTimeout(function erneutLesen() {
                        getShellyStatus();
                    }, status.intervalSec * 1000);
                }
                return false;
            }
        }
        else {
            logging.add("Shelly getShellyStatus() - busy (skip)");
            return false;
        }
    })();
    
    // Handle errors silently to maintain backward compatibility
    promise.catch(err => {
        logging.add(`Error in getShellyStatus: ${err.message}`, 'error');
    });
    
    return promise;
}

const turnShellyRelay = (onOff, retryCount = null) => {
    // Make the function return a promise but don't require callers to use await
    const promise = (async () => {
        if(retryCount > 900) { 
            // Try max 30mins 
            logging.add("Shelly turnShellyRelay() - retried too often, not trying anymore");
            return false;
        }
        else if (config.url !== null && (onOff == 'on' || onOff == 'off')) {
            //logging.add(`Shelly turnShellyRelay(${onOff})`);

            const rpcCommand = onOff === 'on' ? 'true' : 'false';
            
            try {
                const response = await axios.get(`${config.url}/rpc/Switch.Set?id=0&on=${rpcCommand}`, {
                    timeout: 5000, // 5 second timeout
                    maxAttempts: 5,  // try 5 times
                    retryDelay: 5000 // wait for 5s before trying again
                });
                
                if (response.status === 200) {
                    setShellyRelayStatus(response.data.was_on, 'turnShellyRelay()');
                    return true;
                }
                return false;
            } catch (error) {
                logging.add(error.message, 'warn');

                // Try again if failed
                if(retryCount === null) {
                    retryCount = 0;
                }
                logging.add("Shelly turnShellyRelay() - failed - try again in 2s");
                setTimeout(() => {
                    turnShellyRelay(onOff, (retryCount + 1));
                }, 2000);
                
                return false;
            }
        }
        else {
            logging.add("Shelly turnShellyRelay() - invalid config or command (skip)");
            return false;
        }
    })();
    
    // Handle errors silently to maintain backward compatibility
    promise.catch(err => {
        logging.add(`Error in turnShellyRelay: ${err.message}`, 'error');
    });
    
    return promise;
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
