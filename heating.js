var logging = require('./logging.js');
var shelly = require('./shelly.js');
var moment = require('moment');
var events = require('./events.js');

var config = {
    enabled: null,
    heatBelowC: null,
    minimumHeatingMins: null,
    timeFrame: {
        from: {h: 7, m: 0},
        to: {h: 20, m: 0}
    }
}

var status = {
    heating: null,

    inTimeFrame: null,
    enableHeating: null,
    tooCold: null,
    
    heatedLongEnough: null,
    heatUntil: null,

    lastCheck: null,
    lastChange: null,
    turnedOn: null,
    turnedOff: null,


}

configure = (heatBelowC, minimumHeatingMins, enabled) => {
    config.heatBelowC = heatBelowC;
    config.minimumHeatingMins = minimumHeatingMins;
    config.enabled = enabled;
    status.enableHeating = enabled; // Initial value.
    
    // timeFrame is coming from cron-tasks

    logging.add("Heating Configure: heatBelowC:"+heatBelowC+" minimumHeatingMins:"+minimumHeatingMins+" enabled:"+enabled);
};

const getAllowHeating = () => {
    return config.enabled && status.enableHeating;
}

const setTimeFrameFrom = (from) => {
    // expects object with {h: hours, m: mins}
    config.timeFrame.from = from;
}
const setTimeFrameTo = (to) => {
    // expects object with {h: hours, m: mins}
    config.timeFrame.to = to;
}

const inHeatingTimeFrame = () => {
    const minutesOfToday = parseInt(moment().format('H'))*60 + parseInt(moment().format('m'));
    const minutesFrom = parseInt(config.timeFrame.from.h)*60 + parseInt(config.timeFrame.from.m);
    const minutesTo = parseInt(config.timeFrame.to.h)*60 + parseInt(config.timeFrame.to.m);

    return (minutesFrom <= minutesOfToday
        && minutesTo >= minutesOfToday);
}

const heatedLongEnough = () => {
    return status.heating === true && status.turnedOn.add(status.minimumHeatingMins,'minutes') <= status.turnedOn;
}

const setEnableHeating = (boolYesNo) => {
    if(boolYesNo === true) {
        status.enableHeating = true;
    }
    else if(boolYesNo === false) {
        status.enableHeating = false;
    }
    events.send('heating',status);
}

const setHeating = (boolOnOff) => {
    
    // Only do something if status is differing
    if(status.heating != boolOnOff) {
        status.heating = boolOnOff;
        status.lastChange = moment();

        if(boolOnOff === true) {
            if(!shelly.status.relay.ison) {
                shelly.turnShellyRelay('on');
            }
            status.turnedOn = moment();
            status.heatUntil = moment(status.turnedOn).add(config.minimumHeatingMins,'minutes');
        }
        else if(boolOnOff === false) {
            if(shelly.status.relay.ison) {
                shelly.turnShellyRelay('off');
            }
            status.turnedOff = moment();
            status.heatUntil = null;
            
        }
        sendEventStatus();
    }
}

const checkHeating = (currentTemp=null,historicTemp=null) => {
    
    
    status.lastCheck = moment();
    status.inTimeFrame = inHeatingTimeFrame();
    status.tooCold = currentTemp <= config.heatBelowC;
    status.heatedLongEnough = heatedLongEnough();
    status.allowHeating = getAllowHeating();

    let heatNow = false;

    if( status.inTimeFrame
        && status.allowHeating
        && currentTemp !== null
        && historicTemp !== null
      ) {
          
          if(status.heating && !status.heatedLongEnough) {
              logging.add("Heating Check. In Time Frame. Haven't heated long enough ("+config.minimumHeatingMins+"min) - keep heating.")
              heatNow = true;
            }
            else if (status.tooCold) {
                logging.add("Heating Check. In Time Frame. It's cold! Let's heat.");
                heatNow = true;
            }
            else {    
                logging.add("Heating Check. In Time Frame. Not cold enough.","debug");
            }
    }
    if(status.heating && !heatNow) {
        logging.add("Heating Check. Turning heating off.");
    }

    setHeating(heatNow);
};

const sendEventStatus = () => {
    events.send('heating',status);
}

exports.setEnableHeating = setEnableHeating;
exports.setTimeFrameFrom = setTimeFrameFrom;
exports.setTimeFrameTo = setTimeFrameTo;
exports.configure = configure;

exports.status = {
    config: config,
    status: status
};

exports.checkHeating = checkHeating;