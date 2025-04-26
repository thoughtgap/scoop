var CronJob = require('cron').CronJob;
var moment = require('moment');
var logging = require('../utilities/logging.js');
var suncalcHelper = require('../utilities/suncalc.js');
var klappenModul = require('../hatch/klappe.js');
var heating = require('../climate/heating.js');
var camera = require('../camera/camera.js');

//const cronTelegrams = ["0 */30 7-8 * * *", "0 */30 17-19 * * *", "0 0-40 20 * * *"];
//const cronTelegram = "0 */30 6-9 * * *";

// Create Cron Patterns to send Telegram Pictures around Sunrise and Sunset
const sunTimes = suncalcHelper.getSunTimes();
const openTime = sunTimes.sunrise;
const closeTime = sunTimes.sunset;

//const cronTelegrams = ["0 */30 7-8 * * *", "0 */30 17-19 * * *", "0 0-40 20 * * *"];
let cronTelegrams = [];

// Morning: take pictures every 15min from 1h before sunrise to 2h after sunrise
let sunriseHour = sunTimes.sunrise.clone().hour();
let startHour = sunriseHour;
let endHour = sunriseHour + 2;
cronTelegrams.push(`0 */15 ${startHour}-${endHour} * * *`);

// Evening: take pictures every 15 minutes from 1h before sunset til sunset hour
let sunsetHour = sunTimes.sunset.clone().hour();
startHour = sunsetHour - 1;
endHour = sunsetHour;
cronTelegrams.push(`0 */15 ${startHour}-${endHour} * * *`);

// Evening: take pictures every minute between 30min before and 45min after sunset
eveningStartTime = sunTimes.sunset.clone().subtract(30, 'minutes');
eveningEndTime = sunTimes.sunset.clone().add(20, 'minutes');
while (eveningStartTime.isBefore(eveningEndTime)) {
    cronTelegrams.push(`${eveningStartTime.minutes()} ${eveningStartTime.hours()} * * *`);
    eveningStartTime.add(5, 'minutes');
}

// TOOD Remove duplicate values of cronTelegrams
cronTelegrams = cronTelegrams.filter((value, index) => {
    return cronTelegrams.indexOf(value) === index;
});

logging.add("Scheduled Crons for Telegram Pictures: " + cronTelegrams.toString(), 'info', 'cron-tasks');


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
            logging.add("Cronjob Configure Light between    " + light.from + " and " + light.to, 'info', 'cron-tasks');
        });
    }
    else {
        cronConfig.lightConfigObj = [];
    }

    logging.add("Cronjob Configure Location " + cronConfig.location.lat + "," + cronConfig.location.lon, 'info', 'cron-tasks');
    logging.add("Cronjob Configure Hatch openTimes " + cronConfig.hatchAutomation.openTimes.toString(), 'info', 'cron-tasks');
    logging.add("Cronjob Configure Hatch closeTimes " + cronConfig.hatchAutomation.closeTimes.toString(), 'info', 'cron-tasks');
    logging.add("Cronjob Configure Heat between     " + cronConfig.heatingTimeFrame.from + " and " + cronConfig.heatingTimeFrame.to, 'info', 'cron-tasks');

    setupCronjobs();
};

// All the scheduled Cronjobs go in here
coopCronjobs = [];

var schedulerCronjob = new CronJob('0 1 0 * * *', function() {
    // This Job will run at 00:01 every night and reschedule all cronjobs.
    // This is necessary to keep sunrise/-set based cronjobs up to date.
    logging.add("Cronjobs: Nightly rescheduling", 'info', 'cron-tasks');
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
        logging.add(`Cronjobs: Unregistering ${coopCronjobs.length} old Cronjobs`, 'info', 'cron-tasks');
        coopCronjobs.forEach(cronjob => {
            cronjob.stop();
            cronjob = null;
        });
        coopCronjobs = [];
    }

    logging.add("Cronjobs: Set up Setup Cronjobs", 'info', 'cron-tasks');
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
            logging.add("Cronjob Scheduling " + cronPattern.padEnd(15) + newJob.action.padEnd(13) + " " + (realTime.h<10 ? '0' : '') +realTime.h + ":" + (realTime.m<10 ? '0' : '') + realTime.m + " " + newJob.time, 'info', 'cron-tasks');
            
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
                
                logging.add("Cronjob Run - Ding dong Cronjob Fired!! - " + newJob.action + " @ " + newJob.time, 'info', 'cron-tasks');

                if(newJob.action === "open") {
                    logging.add("Cronjob Run - Ding dong Cronjob Fired!! - " + newJob.action + " @ " + newJob.time, 'info', 'cron-tasks');
                    
                    action = klappenModul.klappeFahren("hoch",null,false);
                    if(action.success != true) {
                        logging.add("Cronjob Run "+newJob.action+" - Unsuccessful.", "warn", 'cron-tasks');
                    }
                }
                else if(newJob.action === "close") {
                    action = klappenModul.klappeFahren("runter",null,false);
                    if(action.success != true) {
                        logging.add("Cronjob Run "+newJob.action+" - Unsuccessful.", "warn", 'cron-tasks');
                    }
                }
                else if(newJob.action === "checkLight") {
                    heating.checkLight();
                }

            }, null, true));
        }
        else {
            logging.add("Cronjob Setup failed: " + newJob.action + " " + newJob.time + " INVALID CRON PATTERN","warn", 'cron-tasks');
        }
    });

    // Create custom cronjob which sends a telegram picture every hour
    cronTelegrams.forEach(cronTelegram => {
        coopCronjobs.push(new CronJob(cronTelegram, function () {
            logging.add("Cronjob Run - Ding dong Custom Telegram Cronjob fired!","info", 'cron-tasks');
            camera.queueTelegram();
        }, null, true));
    })

};

exports.configure = configure;
exports.status = cronStatus;
