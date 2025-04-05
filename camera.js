var logging = require('./logging.js');
var moment = require('moment');
var gpioRelais = require('./gpio-relais.js');
var events = require('./events.js');
var telegram = require('./telegram.js');

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
let Raspistill, cam;

// Check if camera module is disabled in config
if (global.skipModules && global.skipModules.camera) {
  logging.add("Camera module disabled in config - using mock camera");
  Raspistill = class MockRaspiStill {
    constructor() {}
    takePhoto() { 
      // Return a 1x1 black pixel JPEG
      return Promise.resolve(Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 
        0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 
        0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09, 
        0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12, 
        0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 
        0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 
        0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32, 
        0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 
        0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x14, 0x00, 0x01, 
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
        0x00, 0x00, 0x00, 0x09, 0xff, 0xc4, 0x00, 0x14, 0x10, 0x01, 0x00, 0x00, 
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
        0x00, 0x00, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 
        0x7f, 0x00, 0xff, 0xd9
      ])); 
    }
  };
  cam = new Raspistill();
} else {
  try {
    Raspistill = require('node-raspistill').Raspistill;
    cam = new Raspistill(cameraConfig.raspistill);
  } catch (e) {
    // Mock RaspiStill when module is not available
    logging.add("Camera hardware not available - using mock camera");
    Raspistill = class MockRaspiStill {
      constructor() {}
      takePhoto() { 
        // Return a 1x1 black pixel JPEG
        return Promise.resolve(Buffer.from([
          0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 
          0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 
          0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09, 
          0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12, 
          0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 
          0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 
          0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32, 
          0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 
          0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x14, 0x00, 0x01, 
          0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
          0x00, 0x00, 0x00, 0x09, 0xff, 0xc4, 0x00, 0x14, 0x10, 0x01, 0x00, 0x00, 
          0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
          0x00, 0x00, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 
          0x7f, 0x00, 0xff, 0xd9
        ])); 
      }
    };
    cam = new Raspistill();
  }
}

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
        html +=   (typeof getTemperature === 'function' && getTemperature() !== null ? Math.round(getTemperature() * 10) /10 + '°C' : 'n/a') + '   ';
        html +=   (typeof getHumidity === 'function' && getHumidity() !== null ? Math.round(getHumidity()) + '%' : 'n/a')
        html += '</text>';
      }
      else {
        html += '<text x="10" y="500" fill="black" font-size="500px">🐔</text>';
        html += '<text x="10" y="200" fill="black" font-size="100px">Ich habe leider</text>';
        html += '<text x="50" y="300" fill="black" font-size="100px">kein '+ (which == 'nightvision' ? 'Nachtf' : 'F') +'oto</text>';
        html += '<text x="90" y="400" fill="black" font-size="100px">für dich</text>';
        if (typeof getTemperature === 'function' && getTemperature() !== null) {
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

