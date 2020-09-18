var SunCalc = require('suncalc');
var CronJob = require('cron').CronJob;
var moment = require('moment'); // require
var logging = require('./logging.js');

const cronConfig = {
    "location": {
        "lat": null,
        "lon": null
    },
    "hatchAutomation": {
        "openTimes": [],
        "closeTimes": []
    }
};

configure = (location, hatchAutomation) => {
    cronConfig.location.lat = parseFloat(location.lat);
    cronConfig.location.lon = parseFloat(location.lon);
    cronConfig.hatchAutomation.openTimes = hatchAutomation.openTimes;
    cronConfig.hatchAutomation.closeTimes = hatchAutomation.closeTimes;

    logging.add("Cronjob Configure: "+
        "  Location " + cronConfig.location.lat + "," + cronConfig.location.lon + 
        "  Hatch openTimes " + cronConfig.hatchAutomation.openTimes.toString() +
        "  Hatch closeTimes " + cronConfig.hatchAutomation.closeTimes.toString()
    );

    setupHatchCronjobs();
};

// All the scheduled Cronjobs go in here
hatchCronjobs = [];

var schedulerCronjob = new CronJob('0 1 0 * * *', function() {
    // This Job will run at 00:01 every night and reschedule all cronjobs.
    // This is necessary to keep sunrise/-set based cronjobs up to date.
    logging.add("Cronjobs: Nightly rescheduling");
    setupHatchCronjobs();
 },null);
 schedulerCronjob.start();


const setupHatchCronjobs = () => {
    
    // Properly unregister/stop the previous cronjobs
    if(hatchCronjobs.length > 0) {
        logging.add(`Cronjobs: Unregistering ${hatchCronjobs.length} old Cronjobs`);
        hatchCronjobs.forEach(cronjob => {
            cronjob.stop();
            cronjob = null;
        });
        hatchCronjobs = [];
    }


    logging.add("Cronjobs: Set up Setup Hatch Cronjobs");
    let cronjobsToConfigure = [];

    cronConfig.hatchAutomation.openTimes.forEach(openingTime => {
        cronjobsToConfigure.push({
            action: "open",
            time: openingTime
        });
    });

    cronConfig.hatchAutomation.closeTimes.forEach(closingTime => {
        cronjobsToConfigure.push({
            action: "close",
            time: closingTime
        });
    });

    cronjobsToConfigure.forEach(newJob => {
        // Try to convert the string to an actual time to plan the cronjob for

        const regexTime = /^([0-9]|0[0-9]|1[0-9]|2[0-3]):([0-5][0-9])$/;
        const regexSun = /^(sunrise|sunriseEnd|goldenHourEnd|solarNoon|goldenHour|sunsetStart|sunset|dusk|nauticalDusk|night|nadir|nightEnd|nauticalDawn|dawn)([+-]\d+)$/i;

        var h = null;
        var m = null;

        // Is it a simple time? 00-23:00:59
        if (found = newJob.time.match(regexTime)) {
            h = parseInt(found[1]);
            m = parseInt(found[2]);
        }
        // Is it a suncalc offset?
        else if (found = newJob.time.match(regexSun)) {

            let suncalcObj = found[1];          // Which Suncalc Object is required (e.g. sunset, sunrise)
            let offsetMin = parseInt(found[2]); // The minute offset

            console.log(cronConfig.location.lat + isNaN(cronConfig.location.lat));
            console.log(cronConfig.location.lat + isNaN(cronConfig.location.lon));

            if(!isNaN(cronConfig.location.lat) && !isNaN(cronConfig.location.lon)) {
                // Get the Date for the required Suncalc Parameter
                suncalcObjDate = SunCalc.getTimes(new Date(), cronConfig.location.lat, cronConfig.location.lon)[suncalcObj];

                // Add the offset, convert it to local time
                actionDate = moment(suncalcObjDate).add(offsetMin, 'minutes').local();

                // Only process if the actionDate actually makes sense
                if (actionDate.isValid()) {
                    // Get Hours and Minutes
                    h = actionDate.format('H');
                    m = actionDate.format('m');
                }
                else {
                    // TODO: Add Error logging, that suncalcObj could not be determined (wrong location?)
                    logging.add("Cronjob Setup failed. Could not determine Suncalc-Date. Invalid Location?","warn")

                }
            }
            else {
                logging.add("Cronjob Setup failed. Please specificy location.lat and .lon in the config to use sun related timings","warn")
            }

            
        }
        else {
            logging.add("Cronjob Setup failed. Invalid time "+newJob.time,"warn")
        }

        if(h !== null && m !== null) {
            var cronPattern = `0 ${m} ${h} * * *`;
             /*                ┬ ┬    ┬    ┬ ┬ ┬
                               │ │    │    │ │ └── Day of Week: 0-6 (Sun-Sat)
                               │ │    │    │ └──── Months: 0-11 (Jan-Dec)
                               │ │    │    └────── Day of Month: 1-31
                               │ │    └─────────── Hours: 0-23
                               │ └──────────────── Minutes: 0-59
                               └────────────────── Seconds: 0-59 */
            logging.add("Cronjob Scheduling " + cronPattern.padEnd(15) + newJob.action.padEnd(6) + " up for " + (h<10 ? '0' : '') +h + ":" + (m<10 ? '0' : '') + m + " - " + newJob.time);

            hatchCronjobs.push(new CronJob(cronPattern, function () {
                // TODO: Actually do something instead of sending stupid ding dong messages
                logging.add("Cronjob Run - Ding dong Cronjob Fired!! - " + newJob.action + " @ " + newJob.time);
            }, null, true));
        }
        else {
            logging.add("Cronjob Setup failed: " + newJob.action + " " + newJob.time + " INVALID CRON PATTERN","warn");
        }
    });
};

exports.configure = configure;
