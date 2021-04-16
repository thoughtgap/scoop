var SunCalc = require('suncalc');
var CronJob = require('cron').CronJob;
var moment = require('moment');
var logging = require('./logging.js');
var klappenModul = require('./klappe.js');
var heating = require('./heating.js');

const cronConfig = {
    "location": {
        "lat": null,
        "lon": null
    },
    "hatchAutomation": {
        "openTimes": [],
        "closeTimes": []
    },
    "heatingTimeFrame": {
        "from": null,
        "to": null
    }
};

let cronStatus = {
    setup: null,
    jobs: []
}

configure = (location, hatchAutomation, heatingTimeFrame) => {
    cronConfig.location.lat = parseFloat(location.lat);
    cronConfig.location.lon = parseFloat(location.lon);
    cronConfig.hatchAutomation.openTimes = hatchAutomation.openTimes;
    cronConfig.hatchAutomation.closeTimes = hatchAutomation.closeTimes;
    cronConfig.heatingTimeFrame = heatingTimeFrame;

    logging.add("Cronjob Configure Location " + cronConfig.location.lat + "," + cronConfig.location.lon);
    logging.add("Cronjob Configure Hatch openTimes " + cronConfig.hatchAutomation.openTimes.toString());
    logging.add("Cronjob Configure Hatch closeTimes " + cronConfig.hatchAutomation.closeTimes.toString());
    logging.add("Cronjob Configure Heat between     " + cronConfig.heatingTimeFrame.from + " and " + cronConfig.heatingTimeFrame.to);

    setupCronjobs();
};

// All the scheduled Cronjobs go in here
coopCronjobs = [];

var schedulerCronjob = new CronJob('0 1 0 * * *', function() {
    // This Job will run at 00:01 every night and reschedule all cronjobs.
    // This is necessary to keep sunrise/-set based cronjobs up to date.
    logging.add("Cronjobs: Nightly rescheduling");
    setupCronjobs();
 },null);
 schedulerCronjob.start();


const setupCronjobs = () => {

    cronStatus.setup = moment();
    cronStatus.jobs = [];
    
    // Properly unregister/stop the previous cronjobs
    if(coopCronjobs.length > 0) {
        logging.add(`Cronjobs: Unregistering ${coopCronjobs.length} old Cronjobs`);
        coopCronjobs.forEach(cronjob => {
            cronjob.stop();
            cronjob = null;
        });
        coopCronjobs = [];
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

    if(cronConfig.heatingTimeFrame.from !== null && cronConfig.heatingTimeFrame.to !== null) {
        cronjobsToConfigure.push({
            action: "allowHeating",
            time: cronConfig.heatingTimeFrame.from
        });

        cronjobsToConfigure.push({
            action: "forbidHeating",
            time: cronConfig.heatingTimeFrame.to
        });
    };

    cronjobsToConfigure.forEach(newJob => {
    
        const realTime = configStringToTime(newJob.time);

        // Send the heating timeFrame times to the heating module
        if(newJob.action == 'allowHeating') {
            heating.setTimeFrameFrom(realTime);
        }
        else if(newJob.action == 'forbidHeating') {
            heating.setTimeFrameTo(realTime);
        }

        if(realTime.h !== null && realTime.m !== null) {
            var cronPattern = `0 ${realTime.m} ${realTime.h} * * *`;
             /*                ┬ ┬    ┬    ┬ ┬ ┬
                               │ │    │    │ │ └── Day of Week: 0-6 (Sun-Sat)
                               │ │    │    │ └──── Months: 0-11 (Jan-Dec)
                               │ │    │    └────── Day of Month: 1-31
                               │ │    └─────────── Hours: 0-23
                               │ └──────────────── Minutes: 0-59
                               └────────────────── Seconds: 0-59 */
            logging.add("Cronjob Scheduling " + cronPattern.padEnd(15) + newJob.action.padEnd(6) + " up for " + (realTime.h<10 ? '0' : '') +realTime.h + ":" + (realTime.m<10 ? '0' : '') + realTime.m + " - " + newJob.time);
            
            cronStatus.jobs.push({
                //cronPattern: cronPattern,
                time: (realTime.h<10 ? '0' : '')+realTime.h+':'+(realTime.m<10 ? '0' : '')+realTime.m,
                command: newJob.time,
                action: newJob.action
            });

            // Sort by execution time
            cronStatus.jobs.sort((a, b) => a.time.localeCompare(b.time));


            coopCronjobs.push(new CronJob(cronPattern, function () {
                // TODO: Actually do something instead of sending stupid ding dong messages
                logging.add("Cronjob Run - Ding dong Cronjob Fired!! - " + newJob.action + " @ " + newJob.time);

                if(newJob.action === "open") {
                    action = klappenModul.klappeFahren("hoch",null,false);
                    if(action.success != true) {
                        logging.add("Cronjob Run "+newJob.action+" - Unsuccessful.", "warn");
                    }
                }
                else if(newJob.action === "close") {
                    action = klappenModul.klappeFahren("runter",null,false);
                    if(action.success != true) {
                        logging.add("Cronjob Run "+newJob.action+" - Unsuccessful.", "warn");
                    }
                }
                else if(newJob.action === "allowHeating" || newJob.action === "forbidHeating") {
                    heating.checkHeating();
                }

            }, null, true));
        }
        else {
            logging.add("Cronjob Setup failed: " + newJob.action + " " + newJob.time + " INVALID CRON PATTERN","warn");
        }
    });

};

const configStringToTime = (configString) => {

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

                return {h: h,m: m};
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
        logging.add("Cronjob Setup failed. Invalid time "+configString,"warn")
    }
    return false;
};


exports.configure = configure;
exports.status = cronStatus;
