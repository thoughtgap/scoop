var logging = require('../utilities/logging.js');
var moment = require('moment');
var gpioRelais = require('../gpio/gpio-relais.js');
var events = require('../utilities/events.js');
var telegram = require('../integrations/telegram.js');
var suncalcHelper = require('../utilities/suncalc.js');

var camera = {
    image: null,
    time: null,
    intervalSec: 30,
    earliestTimeNextPhoto: null,
    takeUntil: null,
    busy: false,
    lastRequest: null,
    queue: false,
    telegramQueue: false,
    ir: {
      on: null,
      time: null,
      image: null,
      queued: false,
      lastRequest: null,
      newQueued: false,
    },
    statistics: {
      avg: null,
      min: null,
      max: null,
      pics: null
    }
};

var cameraConfig = {
    raspistill: {
        rotation: 180,
        noFileSave: true,
        encoding: 'jpg',
        width: 1296,
        height: 972,
        quality: 20
    }
}

// Statistics Objects
var cameraTimeStats = [];
const cameraTimeStatsSince = moment();

// Camera Objects
const LibCameraWrapper = require('./libcamera-wrapper.js');
const cam = new LibCameraWrapper(cameraConfig.raspistill);

configure = (intervalSec, maxAgeSec, autoTakeMin) => {
    camera.intervalSec = intervalSec;
    camera.autoTakeMin = autoTakeMin
    
    logging.add("Camera Configure: "+
        "  intervalSec " + camera.intervalSec + 
        "  autoTakeMin " + camera.autoTakeMin
    );

    gpioRelais.setNightVision(false);
    getIRStatus();
};

queue = () => {
  camera.queued = true;
}

queueNightvision = () => {
  camera.ir.queued = true;
}

// TODO Implement check if it's dark
queueTelegram = () => {
  camera.telegramQueue = true;
  var isDark = (moment().hour() >= 18 || moment().hour() < 8);

  if(isDark) {
    logging.add("Telegram photo with IR","info");
    camera.ir.queued = true;
  }
  else {
    logging.add("Telegram photo without IR","info");
		//camera.ir.queued = true;
  }
  
  /*
  // Get the sunset and sunrise times using your suncalcStringToTime function
  const sunsetTime = suncalcHelper.suncalcStringToTime('sunset-60');
  const sunriseTime = suncalcHelper.suncalcStringToTime('sunrise+60');

  // If either failed, we can't determine darkness and should return
  if (!sunsetTime || !sunriseTime) {
    camera.ir.queued = true;
    return;
  }

  // Convert these times into today's moment objects
  const sunsetMoment = moment().hour(sunsetTime.h).minute(sunsetTime.m);
  const sunriseMoment = moment().hour(sunriseTime.h).minute(sunriseTime.m);

  // Now, get the current moment
  const currentMoment = moment();

  // Check if it's dark based on sunset and sunrise times
  if (currentMoment.isAfter(sunsetMoment) || currentMoment.isBefore(sunriseMoment)) {
    camera.ir.queued = true;
    logging.add("Telegram photo - it is dark, use IR","debug");  
  }
  else {
    logging.add("Telegram photo - it is NOT dark, no IR","debug");
  }*/
}

photoIntervalSec = () => {
  return (camera.statistics.avg ? camera.statistics.avg : camera.intervalSec) + 0.1;
}

checkCamera = () => {

  // Check for recent requests for photos
  if(camera.lastRequest > camera.time || moment() < camera.takeUntil) {
    camera.queued = true;
  }
  
  logging.add("Queues Photo "+ (camera.queued ? 'Y' : 'N') + "   Nightvision "+ (camera.ir.queued ? 'Y' : 'N') + "  Telegram    "+ (camera.telegramQueue ? 'Y' : 'N'),"debug");

  if(camera.queued || camera.ir.queued || camera.telegramQueue) {
    photoStatus = this.takePhoto();
    if(photoStatus) {
      camera.queued = false;
      camera.ir.queued = false;
    }
  }
  setTimeout(function checkQueueNextTime() {
    checkCamera();
  }, 1 * 1000);
}
checkCamera();


takePhoto = (nightVision = false) => {

    let now = new Date();

    // Check if nightvision pic is queued
    if(camera.ir.queued) {
      nightVision = true;
    }

    // Is it really necessary to take another picture?
    if(now <= camera.earliestTimeNextPhoto /* && !nightVision*/) {
      logging.add("Not taking picture. Picture still good.","debug");
      return false;
      // TODO return "picture still good";
    }
    else if(camera.busy) {
      logging.add("Not taking picture. Camera busy.","debug");
      return false;
      // TODO return "camera busy";
    }
    else {
      logging.add("Taking picture","debug");

      if(nightVision && !gpioRelais.setNightVision(true)) {
        logging.add(`Could not turn on Night Vision`, 'warn');
      }

      camera.busy = true;
      logging.add("Taking a"+ (nightVision ? " night vision" : "") +" picture","debug");
      let takingPicture = moment();

      cam.takePhoto().then((photo) => {
        // Photo was successfully taken

        let newPicTime = moment();
        
        camera.busy = false;

        // Save new picture and timestamp
        camera.image = photo;
        camera.time = newPicTime;
        camera.queued = false;
        if(nightVision) {
          camera.ir.image = photo;
          camera.ir.time = newPicTime;
          camera.ir.queued = false;
        }
        
        // Turn off Infrared LEDs again
        if(nightVision && !gpioRelais.setNightVision(false)) {
          logging.add("Error when turning night vision off","warn");
        }

        // Send picture via Telegram
        if(camera.telegramQueue) {
          telegram.sendPhoto(photo);
          camera.telegramQueue = false;
        }
        
        // Push new Webcam pictures via sse
        events.send('newWebcamPic',newPicTime);
        if(nightVision) {
          events.send('newWebcamPicIR',newPicTime);
        }

        // Earliest next image
        camera.earliestTimeNextPhoto = new Date();
        camera.earliestTimeNextPhoto.setSeconds(camera.earliestTimeNextPhoto.getSeconds() + photoIntervalSec());

        // Statistics about camera duration
        let tookPicture = moment();
        let duration = tookPicture.diff(takingPicture);
        cameraTimeStats.push(duration);
        logging.add(`Took a ${nightVision ? "night vision " : ""}picture - ${duration} ms`);

        // Calculate statistics of the recordings
        camera.statistics.avg = Math.round(cameraTimeStats.reduce((a,b) => (a+b)) / cameraTimeStats.length / 100) / 10;
        camera.statistics.min = Math.round(Math.min.apply(null, cameraTimeStats) / 100) / 10;
        camera.statistics.max = Math.round(Math.max.apply(null, cameraTimeStats) / 100) / 10;
        camera.statistics.pics = cameraTimeStats.length;
        // Only periodically log the camera statistics
        if(camera.statistics.pics == 1 || camera.statistics.pics%100 == 0) {
          logging.add(`Camera Statistics: ${camera.statistics.pics} pics, Avg ${camera.statistics.avg}s, Min ${camera.statistics.min}s, Max ${camera.statistics.max}s`);
        }

        // Purge Camera Statistics if the record gets too large
        cameraStatisticsTreshold = 5000;
        if(cameraTimeStats.length > cameraStatisticsTreshold) {
          logging.add(`Camera Statistics: Purging (${cameraStatisticsTreshold} elements treshold reached after ${moment().diff(cameraTimeStatsSince,'days')} days)`);
          cameraTimeStats = [];
        }

        // Plan pictures to be taken until x mins after the last manual request        
        if(camera.lastRequest && !nightVision) {
          camera.takeUntil = camera.lastRequest.clone();
          camera.takeUntil.add(camera.autoTakeMin,'minutes');
        }
      });
      return true;
    }
}

getSvg = (which = "normal") => {
    /* An SVG Container with image timestamp.
        Will not trigger picture-taking on its own, as it's wrapping
        the camera.image picture from the /cam endpoint

        which can be nightvision.
    */
    let cameraObj = null;
    let picUrl = null;
    if(which == "nightvision") {
      cameraObj = camera.ir;
      picUrl = '/nightvision/'+ moment(cameraObj.time).format() +'.jpg';
    }
    else {
      cameraObj = camera;
      picUrl = '/cam/'+ moment(cameraObj.time).format() +'.jpg';
    }

    // var html = `
    // <?xml version="1.0" encoding="UTF-8"?>
    // <!DOCTYPE html>
    // <html xmlns="http://www.w3.org/1999/xhtml">
    //   <head>
    //     <meta charset="UTF-8"/>
    //     <title> </title>
    //     <style type="text/css">
    //       html, body {
    //         height: 100%;
    //         width: 100%;
    //         margin: 0;
    //         padding: 0;
    //       }
    //     </style>
    //   </head>
    //   <body>
    var html = `
        <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" x="0px" y="0px"
                preserveAspectRatio="xMidYMid meet"
                width="100%"
                height="100%"
                viewBox="0 0 1296 972">
          <g id="page">`
      if(cameraObj.image) {
        html += '<image overflow="visible" width="1296" height="972" xlink:href="'+ picUrl +'"/>';
        html += '<text font-family="Arial, Helvetica, sans-serif" x="10" y="40" fill="white" font-size="30px">';
        html +=   '🐔 '+ moment(cameraObj.time).format("HH:mm:ss") + ' (' + moment(cameraObj.time).fromNow() /*+' - '+ new moment().diff(cameraObj.time)/1000 */ + ') '
        html +=   Math.round(getTemperature() * 10) /10 + '°C   ';
        html +=   Math.round(getHumidity()) + '%'
        html += '</text>';
      }
      else {
        html += '<text x="10" y="500" fill="black" font-size="500px">🐔</text>';
        html += '<text x="10" y="200" fill="black" font-size="100px">Ich habe leider</text>';
        html += '<text x="50" y="300" fill="black" font-size="100px">kein '+ (which == 'nightvision' ? 'Nachtf' : 'F') +'oto</text>';
        html += '<text x="90" y="400" fill="black" font-size="100px">für dich</text>';
        if(getTemperature()) {
          html += '<text x="90" y="430" fill="black" font-size="20px">aber im Stall sind es '+ Math.round(getTemperature() * 10) /10 +' °C</text>'; 
        }
      }
            
    html += `
          </g>
        </svg>`;
    //  </body>
    //</html>`;
    return html;
}

getJpg = () => {
  camera.lastRequest = new moment();
  //takePhoto();
  return camera.image;
}

getIRJpg = () => {
  camera.ir.lastRequest = new moment();
  return camera.ir.image;
}

getIRStatus = () => {
  camera.ir.on = gpioRelais.IRIsOn();
}

exports.data = camera;
exports.cameraConfig = cameraConfig;
exports.configure = configure;
exports.takePhoto = takePhoto;
exports.getSvg = getSvg;
exports.getJpg = getJpg;
exports.getIRJpg = getIRJpg;
exports.queueNightvision = queueNightvision;
exports.queueTelegram = queueTelegram;
//exports.sse = sse;

