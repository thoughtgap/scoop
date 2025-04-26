var logging = require('../utilities/logging.js');
var shelly = require('../integrations/shelly.js');
var moment = require('moment');
var events = require('../utilities/events.js');
var suncalc = require('../utilities/suncalc.js');
var klappenModul = require('../hatch/klappe.js');
var bme280 = require('../temperature/bme280.js');

var config = {
    "conditions": [
/*
    "door": "closed",           // closed, open, any
    "heatBelowC": 5,            // int or null
    "minimumLightMins": 30,   // int or null
    "from": "sunrise-20",
    "to":   "dusk+30",
    "enabled": true             // true or false
    "minimumLightMins": 30,   // int or null
*/
    ]
};

var status = {
    heating: null,

    heatingOn: null,
    lightOn: null,

    inTimeFrame: null,
    enableHeating: null,
    enableLight: null,
    tooCold: null,
    
    minimumLightMins: null,
    heatedLongEnough: null,
    heatUntil: null,

    lastCheck: null,
    lastChange: null,
    turnedOn: null,
    turnedOff: null,
}

configure = (lightConfigObj) => {
    //logging.add('Received config:'+ JSON.stringify(lightConfigObj, null, 2));

    //config.minimumLightMins = lightConfigObj.minimumLightMins; // int or null
    status.enableHeating = lightConfigObj.enabled; // true or false
    status.enableLight   = lightConfigObj.enabled;

    lightConfigObj.conditions.forEach(lightConfig => {
        if(lightConfig.enabled) {

            // Type checking
            if(!lightConfig.door.match(/^open|closed|any$/)) {
                logging.add("Invalid value for 'door' in light configuration. Set to closed|open|any.","warn","heating");
                return;
            }

            // Time checking
            const fromTime = suncalc.suncalcStringToTime(lightConfig.from);
            const toTime   = suncalc.suncalcStringToTime(lightConfig.to);

            if(!fromTime || !toTime) {
                logging.add("Invalid Time for Light Configuration.","warn","heating");
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
                minimumLightMins: lightConfig.minimumLightMins
            });
        }
    });

    logging.add("Heating Configure", 'info', 'heating');
};

const checkTimeFrame = (from,to) => {
    const minutesNow  = parseInt(moment().format('H'))*60 + parseInt(moment().format('m'));
    const minutesFrom = parseInt(from.h)*60 + parseInt(from.m);
    const minutesTo   = parseInt(to.h)*60 + parseInt(to.m);

    return (minutesFrom <= minutesNow  && minutesTo >= minutesNow );
}

const needToHeatLonger = () => {
    //logging.add("needToHeatLonger() turnedOn:("+ ( status.turnedOn ? status.turnedOn.toString() : "null" ) +") status.minimumLightMins:("+status.minimumLightMins+")");
    if(status.turnedOn !== null && status.minimumLightMins !== null) {
        status.heatUntil = status.turnedOn.clone();
        status.heatUntil = status.heatUntil.add(status.minimumLightMins,'minutes');
        //logging.add("needToHeatLonger() Heating minimum "+status.minimumLightMins+" mins, until"+status.heatUntil.toString());
    }
    
    return (
        status.heating === true
        && status.turnedOn !== null
        && status.heatUntil >= moment()
    );
}

const setEnableHeating = (boolYesNo) => {
    // Add debug logging
    logging.add(`setEnableHeating called with value: ${boolYesNo}`    , 'info', 'heating');
    logging.add(`Previous status: ${JSON.stringify(status, null, 2)}` , 'info', 'heating');

    // For GUI Usage
    if(boolYesNo === true) {
        status.enableHeating = true;
    }
    else if(boolYesNo === false) {
        status.enableHeating = false;
    }
    checkLight();
    sendEventStatus();
}

const setEnableLight = (boolYesNo) => {
    // Add debug logging
    //logging.add(`setEnableLight called with value: ${boolYesNo}`);
    //logging.add(`Previous status: ${JSON.stringify(status, null, 2)}`);

    // For GUI Usage
    if(boolYesNo === true) {
        status.enableLight = true;
    }
    else if(boolYesNo === false) {
        status.enableLight = false;
    }
    checkLight();
    sendEventStatus();
}

const setHeating = (boolOnOff) => {
    //logging.add("setHeating() "+boolOnOff)
    
    // Only do something if status is differing
    //logging.add("setHeating() boolOnOff:("+boolOnOff+") status.heating:("+status.heating+") status.turnedOn:("+ ( status.turnedOn ? status.turnedOn.toString() : "null" )+")");
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
    logging.add("checkLight()", 'info', 'heating');
    status.lastCheck = moment();

    let lightNeeded =  false;

    //config.conditions.forEach(lightConfig => {
    for (let lightConfig of config.conditions) {

        // Check Timeframe
        const timeFrameOK = checkTimeFrame(lightConfig.from,lightConfig.to);

        // Check Door
        const doorOK = (
               (lightConfig.door == "closed" && (klappenModul.klappe.position == "unten" && klappenModul.klappe.position !== null))
            || (lightConfig.door == "open"   && klappenModul.klappe.position == "oben")
            || (lightConfig.door == "any")
        );

        // Check if it's too cold
        // logging.add("------");
        // logging.add("Heatbelow " + lightConfig.heatBelowC + " EnableLight " + status.enableLight + " NewTemp " + newTemperature + " EnableHeating " + status.enableHeating);
        const temperatureOK = (
            (lightConfig.heatBelowC === null && status.enableLight)
            ||
            ((newTemperature === null ? getTemperature() : newTemperature) <= lightConfig.heatBelowC && status.enableHeating)
        );

        // Determine whether light or heating
        //if(lightConfig.heatBelowC === null && status.enableLight)
        lightNeeded = (timeFrameOK && doorOK && temperatureOK);
        lightConfig.lightNeeded = lightNeeded;
        lightConfig.timeFrameOK = timeFrameOK;
        lightConfig.doorOK = doorOK;
        lightConfig.temperatureOK = temperatureOK;

        logging.add("Heating/Light Params: Timeframe "+timeFrameOK + " // Door "+doorOK + " // Temp "+temperatureOK + " ===> " + lightNeeded, 'info', 'heating');
        // logging.add("------");

        // Reason for light being on
        if(temperatureOK && lightConfig.heatBelowC === null) {
            status.lightOn = true;
            status.heatingOn = false;
        }
        if(temperatureOK && lightConfig.heatBelowC !== null) {
            status.heatingOn = true;
        }

        if(lightNeeded) {
            status.minimumLightMins = lightConfig.minimumLightMins;
            //logging.add("Light on. Skipping further light checks.","debug");
            break; // No need to check consecutive light configurations
        }
    //});
    }

    if(lightNeeded) {
        // Heated long enough?
        logging.add("Light Check. Parameters met. Lights on.","debug","heating")
    }
    else if(needToHeatLonger()) {
        lightNeeded = true;
        logging.add("Light Check. Not on long enough ("+config.minimumLightMins+"min) - Lights on.","debug","heating")
    }
    else {
        logging.add("Light Check. Parameters not met. Lights off.","debug","heating")
        status.lightOn = false;
        status.heatingOn = false;
    }

    setHeating(lightNeeded);
    needToHeatLonger(); // Write timestamp how long light needs to remain on
}

const sendEventStatus = () => {
    events.send('heating',status);
}

exports.setEnableHeating = setEnableHeating;
exports.setEnableLight = setEnableLight;
exports.configure = configure;

exports.status = {
    config: config,
    status: status
};

exports.checkLight = checkLight;
