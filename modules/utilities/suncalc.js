var SunCalc = require('suncalc');
var moment = require('moment');
var logging = require('./logging.js');

const suncalcConfig = {
    "lat": null,
    "lon": null
};

configure = (latitude, longitude) => {
    suncalcConfig.lat = parseFloat(latitude);
    suncalcConfig.lon = parseFloat(longitude);
    logging.add("Suncalc Location Configured "+suncalcConfig.lat+" "+suncalcConfig.lon,"info","suncalc");
};

const getSunTimes = () => {
    const times = SunCalc.getTimes(new Date(), suncalcConfig.lat, suncalcConfig.lon);
    return {
        sunrise: moment(times.sunrise),
        sunset: moment(times.sunset)
    };
}

const suncalcStringToTime = (configString) => {

    newJob = {
        time: configString
    };

    // Try to convert the string to an actual time to plan the cronjob for
    const regexTime = /^([0-9]|0[0-9]|1[0-9]|2[0-3]):([0-5][0-9])$/;
    const regexSun = /^(sunrise|sunriseEnd|goldenHourEnd|solarNoon|goldenHour|sunsetStart|sunset|dusk|nauticalDusk|night|nadir|nightEnd|nauticalDawn|dawn)([+-]\d+)$/i;

    var h = null;
    var m = null;

    // Is it a simple time? 00-23:00:59
    if (found = configString.match(regexTime)) {
        h = parseInt(found[1]);
        m = parseInt(found[2]);

        return {h: h,m: m};
    }
    // Is it a suncalc offset?
    else if (found = configString.match(regexSun)) {

        let suncalcObj = found[1];          // Which Suncalc Object is required (e.g. sunset, sunrise)
        let offsetMin = parseInt(found[2]); // The minute offset

        if(!isNaN(suncalcConfig.lat) && !isNaN(suncalcConfig.lon)) {
            // Get the Date for the required Suncalc Parameter
            suncalcObjDate = SunCalc.getTimes(new Date(), suncalcConfig.lat, suncalcConfig.lon)[suncalcObj];

            // Add the offset, convert it to local time
            actionDate = moment(suncalcObjDate).add(offsetMin, 'minutes').local();

            // Only process if the actionDate actually makes sense
            if (actionDate.isValid()) {
                // Get Hours and Minutes
                h = actionDate.format('H');
                m = actionDate.format('m');

                return {h: h,m: m};
            }
            else {
                // TODO: Add Error logging, that suncalcObj could not be determined (wrong location?)
                logging.add("Suncalc Determination failed. Invalid Location?","warn","suncalc")
            }
        }
        else {
            logging.add("Suncalc determination failed. Please specificy location.lat and .lon in the config to use sun related timings","warn","suncalc")
        }
    }
    else {
        logging.add("Suncalc determination failed. Invalid time "+configString,"warn","suncalc")
    }
    return false;
};

// Determines if it's currently dark outside based on sun position
const isDark = () => {
    // Check if location is configured properly
    if (isNaN(suncalcConfig.lat) || isNaN(suncalcConfig.lon)) {
        logging.add("isDark check failed: Location not properly configured", "warn","suncalc");
        // Fall back to a simple time-based check if location isn't set
        return (moment().hour() >= 18 || moment().hour() < 8);
    }
    
    try {
        // Get current time and sun times
        const now = moment();
        const times = SunCalc.getTimes(new Date(), suncalcConfig.lat, suncalcConfig.lon);
        
        // Check if current time is before dawn or after dusk
        // Using dawn and dusk for better twilight handling
        const dawn = moment(times.dawn);
        const dusk = moment(times.dusk);
        
        // It's dark if current time is after dusk or before dawn
        const dark = now.isAfter(dusk) || now.isBefore(dawn);
        
        logging.add(`Darkness check: ${dark ? 'It is dark' : 'It is light'} (dawn: ${dawn.format('HH:mm')}, dusk: ${dusk.format('HH:mm')})`, "debug","suncalc");
        
        return dark;
    } catch (err) {
        logging.add(`Error in isDark function: ${err.message}`, "error");
        // Fall back to simple time-based check if calculation fails
        return (moment().hour() >= 18 || moment().hour() < 8);
    }
};

exports.configure = configure;
exports.suncalcStringToTime = suncalcStringToTime;
exports.getSunTimes = getSunTimes;
exports.isDark = isDark;
