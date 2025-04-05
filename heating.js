var logging = require('./logging.js');
var shelly = require('./shelly.js');
var moment = require('moment');
var events = require('./events.js');
var suncalcHelper = require('./suncalc.js');
var klappenModul = require('./klappe.js');
var bme280 = require('./temperature-bme280.js');

var config = {
    conditions: [],
    skipModule: false
};

var status = {
    enabled: false,
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
    turnedOff: null
};

configure = (lightConfigObj) => {
    // Check if module should be skipped
    if (global.skipModules && global.skipModules.heating) {
        config.skipModule = true;
        status.enabled = false;
        logging.add("Heating module disabled in config");
        return;
    }

    // Initialize module
    try {
        status.enabled = true;
        status.enableHeating = lightConfigObj.enabled;
        status.enableLight = lightConfigObj.enabled;

        config.conditions = []; // Reset conditions array
        lightConfigObj.conditions.forEach(lightConfig => {
            if(lightConfig.enabled) {
                // Type checking
                if(!lightConfig.door.match(/^open|closed|any$/)) {
                    logging.add("Invalid value for 'door' in light configuration. Set to closed|open|any.", "warn");
                    return;
                }

                // Time checking
                const fromTime = suncalcHelper.suncalcStringToTime(lightConfig.from);
                const toTime = suncalcHelper.suncalcStringToTime(lightConfig.to);

                if(!fromTime || !toTime) {
                    logging.add("Invalid Time for Light Configuration.", "warn");
                    return;
                }

                config.conditions.push({
                    door: lightConfig.door,               // closed/open/any
                    heatBelowC: lightConfig.heatBelowC,  // int or null
                    fromSuncalc: lightConfig.from,
                    from: fromTime,
                    toSuncalc: lightConfig.to,
                    to: toTime,
                    enabled: lightConfig.enabled,         // true or false
                    minimumLightMins: lightConfig.minimumLightMins
                });
            }
        });

        logging.add("Heating module initialized successfully");
    } catch (e) {
        config.skipModule = true;
        status.enabled = false;
        logging.add("Heating module initialization failed: " + e, "warn");
    }
};

const checkTimeFrame = (from, to) => {
    const minutesNow = parseInt(moment().format('H'))*60 + parseInt(moment().format('m'));
    const minutesFrom = parseInt(from.h)*60 + parseInt(from.m);
    const minutesTo = parseInt(to.h)*60 + parseInt(to.m);
    return (minutesFrom <= minutesNow && minutesTo >= minutesNow);
}

const needToHeatLonger = () => {
    if(status.turnedOn !== null && status.minimumLightMins !== null) {
        status.heatUntil = status.turnedOn.clone();
        status.heatUntil = status.heatUntil.add(status.minimumLightMins, 'minutes');
    }
    
    return (
        status.heating === true
        && status.turnedOn !== null
        && status.heatUntil >= moment()
    );
}

const setEnableHeating = (boolYesNo) => {
    if (config.skipModule || !status.enabled) {
        logging.add("Heating control disabled - ignoring heating request", "debug");
        return;
    }

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
    if (config.skipModule || !status.enabled) {
        logging.add("Heating control disabled - ignoring light request", "debug");
        return;
    }

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
    if (config.skipModule || !status.enabled) {
        logging.add("Heating control disabled - ignoring heating state change", "debug");
        return;
    }

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
    return bme280.status.values.temperature;
}

const checkLight = (newTemperature = null) => {
    if (config.skipModule || !status.enabled) {
        logging.add("Heating control disabled - skipping light check", "debug");
        return;
    }

    status.lastCheck = moment();
    let lightNeeded = false;

    for (let lightConfig of config.conditions) {
        // Check Timeframe
        const timeFrameOK = checkTimeFrame(lightConfig.from, lightConfig.to);

        // Check Door
        const doorOK = (
            (lightConfig.door == "closed" && (klappenModul.klappe.position == "unten" && klappenModul.klappe.position !== null))
            || (lightConfig.door == "open" && klappenModul.klappe.position == "oben")
            || (lightConfig.door == "any")
        );

        // Check if it's too cold
        const temperatureOK = (
            (lightConfig.heatBelowC === null && status.enableLight)
            ||
            ((newTemperature === null ? getTemperature() : newTemperature) <= lightConfig.heatBelowC && status.enableHeating)
        );

        // Determine whether light or heating is needed
        lightNeeded = (timeFrameOK && doorOK && temperatureOK);
        lightConfig.lightNeeded = lightNeeded;
        lightConfig.timeFrameOK = timeFrameOK;
        lightConfig.doorOK = doorOK;
        lightConfig.temperatureOK = temperatureOK;

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
            break; // No need to check consecutive light configurations
        }
    }

    if(lightNeeded) {
        logging.add("Light Check. Parameters met. Lights on.", "debug");
    }
    else if(needToHeatLonger()) {
        lightNeeded = true;
        logging.add("Light Check. Not on long enough - Lights on.", "debug");
    }
    else {
        logging.add("Light Check. Parameters not met. Lights off.", "debug");
        status.lightOn = false;
        status.heatingOn = false;
    }

    setHeating(lightNeeded);
    needToHeatLonger(); // Write timestamp how long light needs to remain on
}

const sendEventStatus = () => {
    events.send('heating', status);
}

exports.setEnableHeating = setEnableHeating;
exports.setEnableLight = setEnableLight;
exports.configure = configure;
exports.status = {
    config: config,
    status: status
};
exports.checkLight = checkLight;