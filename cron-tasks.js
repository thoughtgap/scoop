var CronJob = require('cron').CronJob;
var moment = require('moment');
var logging = require('./logging.js');
var suncalcHelper = require('./suncalc.js');
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

configure = (location, hatchAutomation, lightConfigObj) => {
    cronConfig.location.lat = parseFloat(location.lat);
    cronConfig.location.lon = parseFloat(location.lon);
    cronConfig.hatchAutomation.openTimes = hatchAutomation.openTimes;
    cronConfig.hatchAutomation.closeTimes = hatchAutomation.closeTimes;


    if(lightConfigObj.enabled) {
        cronConfig.lightConditions = lightConfigObj.conditions;
        
        cronConfig.lightConditions.forEach(light => {
            logging.add("Cronjob Configure Light between    " + light.from + " and " + light.to);
        });
    }
    else {
        cronConfig.lightConfigObj = [];
    }

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
    // Read the configuration items and write them to a central cronjobsToConfigure
    // Object that includes an action and a time (still allowing sunrise stuff)
    // Then derive the times and plan the cronjobs.

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

    logging.add("Cronjobs: Set up Setup Cronjobs");
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

    cronConfig.lightConditions.forEach(light => {
        cronjobsToConfigure.push({
            action: "checkLight",
            time: light.from
        });

        cronjobsToConfigure.push({
            action: "checkLight",
            time: light.to
        });
    });

    // Remove duplicates
    cronjobsToConfigure = cronjobsToConfigure.filter((value, index) => {
        const _value = JSON.stringify(value);
        return index === cronjobsToConfigure.findIndex(obj => {
            return JSON.stringify(obj) === _value;
        });
    });

    // Now actually schedule the cronjobs
    cronjobsToConfigure.forEach(newJob => {
    
        const realTime = suncalcHelper.suncalcStringToTime(newJob.time);
        if(!realTime) {
            return;
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
            logging.add("Cronjob Scheduling " + cronPattern.padEnd(15) + newJob.action.padEnd(13) + " " + (realTime.h<10 ? '0' : '') +realTime.h + ":" + (realTime.m<10 ? '0' : '') + realTime.m + " " + newJob.time);
            
            cronStatus.jobs.push({
                //cronPattern: cronPattern,
                time: (realTime.h<10 ? '0' : '')+realTime.h+':'+(realTime.m<10 ? '0' : '')+realTime.m,
                command: newJob.time,
                action:  newJob.action
            });

            // Sort by execution time
            cronStatus.jobs.sort((a, b) => a.time.localeCompare(b.time));

            // Push the Actual Cronjob and include the coding to be executed
            coopCronjobs.push(new CronJob(cronPattern, function () {
                
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
                else if(newJob.action === "checkLight") {
                    heating.checkLight();
                }

            }, null, true));
        }
        else {
            logging.add("Cronjob Setup failed: " + newJob.action + " " + newJob.time + " INVALID CRON PATTERN","warn");
        }
    });

};

exports.configure = configure;
exports.status = cronStatus;
