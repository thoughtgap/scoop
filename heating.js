var logging = require('./logging.js');
var shelly = require('./shelly.js');
var moment = require('moment');
var events = require('./events.js');
var suncalcHelper = require('./suncalc.js');
var klappenModul = require('./klappe.js');
var bme280 = require('./temperature-bme280.js');

var config = {
    "conditions": [
/*
    "door": "closed",           // closed, open, any
    "heatBelowC": 5,            // int or null
    "minimumHeatingMins": 30,   // int or null
    "from": "sunrise-20",
    "to":   "dusk+30",
    "enabled": true             // true or false
    "minimumHeatingMins": 30,   // int or null
*/
    ]
};

var status = {
    heating: null,

    inTimeFrame: null,
    enableHeating: null,
    tooCold: null,
    
    minimumHeatingMins: null,
    heatedLongEnough: null,
    heatUntil: null,

    lastCheck: null,
    lastChange: null,
    turnedOn: null,
    turnedOff: null,
}

configure = (lightConfigObj) => {
    //config.minimumHeatingMins = lightConfigObj.minimumHeatingMins; // int or null
    status.enableHeating = lightConfigObj.enabled; // true or false

    lightConfigObj.conditions.forEach(lightConfig => {
        if(lightConfig.enabled) {

            // Type checking
            if(!lightConfig.door.match(/^open|closed|any$/)) {
                logging.add("Invalid value for 'door' in light configuration. Set to closed|open|any.","warn");
                return;
            }

            // Time checking
            const fromTime = suncalcHelper.suncalcStringToTime(lightConfig.from);
            const toTime   = suncalcHelper.suncalcStringToTime(lightConfig.to);

            if(!fromTime || !toTime) {
                logging.add("Invalid Time for Light Configuration.","warn");
                return;
            }

            config.conditions.push({
                door:               lightConfig.door,               // closed/open/any
                heatBelowC:         lightConfig.heatBelowC,         // int or null
                fromSuncalc:        lightConfig.from,
                from:               fromTime,
                toSuncalc:          lightConfig.to,
                to:                 toTime,
                enabled:            lightConfig.enabled,            // true or false
                minimumHeatingMins: lightConfig.minimumHeatingMins
            });
        }
    });

    logging.add("Heating Configure New");
};

const checkTimeFrame = (from,to) => {
    const minutesNow  = parseInt(moment().format('H'))*60 + parseInt(moment().format('m'));
    const minutesFrom = parseInt(from.h)*60 + parseInt(from.m);
    const minutesTo   = parseInt(to.h)*60 + parseInt(to.m);

    return (minutesFrom <= minutesNow  && minutesTo >= minutesNow );
}

const needToHeatLonger = () => {
    if(status.turnedOn !== null && status.minimumHeatingMins !== null) {        
        status.heatUntil = status.turnedOn.add(status.minimumHeatingMins,'minutes');
    }
    
    return (
        status.heating === true
        && status.turnedOn !== null
        && status.heatUntil >= moment()
    );
}

const setEnableHeating = (boolYesNo) => {
    // For GUI Usage

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

const getTemperature = () => {
    return bme280.status.temperature;
}

const checkLight = (newTemperature = null) => {
    status.lastCheck = moment();

    let lightNeeded =  false;

    config.conditions.forEach(lightConfig => {

        // Check Timeframe
        const timeFrameOK = checkTimeFrame(lightConfig.from,lightConfig.to);

        // Check Door
        const doorOK = (
               (lightConfig.door == "closed" && klappenModul.klappe.position == "unten")
            || (lightConfig.door == "open"   && klappenModul.klappe.position == "oben")
            || (lightConfig.door == "any")
        );

        

        // Check if it's too cold
        const temperatureOK = (
            lightConfig.heatBelowC === null
            || (newTemperature === null ? getTemperature() : newTemperature) <= lightConfig.heatBelowC 
        );

        
        if(timeFrameOK && doorOK && temperatureOK) {
            lightNeeded = true;
        }
        
        lightConfig.lightNeeded = lightNeeded;
        lightConfig.timeFrameOK = timeFrameOK;
        lightConfig.doorOK = doorOK;
        lightConfig.temperatureOK = temperatureOK;
        status.minimumHeatingMins = lightConfig.minimumHeatingMins;
    });

    if(lightNeeded) {
        // Heated long enough?
        logging.add("Light Check. Parameters met. Lights on.")
    }
    else if(needToHeatLonger()) {
        lightNeeded = true;
        logging.add("Light Check. Not on long enough ("+config.minimumHeatingMins+"min) - Lights on.")
    }
    else {
        logging.add("Light Check. Parameters not met. Lights off.")
    }

    setHeating(lightNeeded);
}

const sendEventStatus = () => {
    events.send('heating',status);
}

exports.setEnableHeating = setEnableHeating;
exports.configure = configure;

exports.status = {
    config: config,
    status: status
};

exports.checkLight = checkLight;