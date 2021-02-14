var logging = require('./logging.js');
var moment = require('moment');
var gpioRelais = require('./gpio-relais.js');

var camera = {
    image: null,
    time: null,
    intervalSec: 30,
    maxAgeSec: 10,
    timeNextImage: null,
    busy: false,
    lastRequest: null,
    ir: {
      on: null,
      time: null,
      image: null
    }
};

var cameraConfig = {
    raspistill: {
        rotation: 180,
        noFileSave: true,
        encoding: 'jpg',
        width: 1296,
        height: 972,
        quality: 50
    }
}

const Raspistill = require('node-raspistill').Raspistill;
const cam = new Raspistill(cameraConfig.raspistill);

configure = (intervalSec, maxAgeSec) => {
    camera.intervalSec = intervalSec;
    camera.maxAgeSec = maxAgeSec;
    
    logging.add("Camera Configure: "+
        "  intervalSec " + camera.intervalSec + 
        "  maxAgeSec " + camera.maxAgeSec
    );

    gpioRelais.setNightVision(false);
    getIRStatus();
};

takePhoto = (force = false, nightVision = false) => {
    let now = new Date();
    let max = camera.timeNextImage;

    if(now <= max && !nightVision) {
        logging.add("Not taking picture. Picture still good.");
        return "picture still good";
    }
    else if(camera.busy) {
        logging.add("Not taking picture. Camera busy.");
        return "camera busy";
    }
    else {
      if(nightVision && !gpioRelais.setNightVision(true)) {
        logging.add(`Could not turn on Night Vision`, 'warn');
      }

      camera.busy = true;
      logging.add("Taking a "+ (nightVision ? "night vision" : "") +" picture");

      cam.takePhoto().then((photo) => {

        camera.image = photo;  
        camera.time = new Date();

        if(nightVision) {
          camera.ir.image = photo;  
          camera.ir.time = new Date();
        }
        else {
          camera.timeNextImage = new Date();
          camera.timeNextImage.setSeconds(camera.timeNextImage.getSeconds() + camera.maxAgeSec);
        }
        camera.busy = false;
        
        logging.add(`Took a ${nightVision ? "night vision " : ""}picture`);

        if(nightVision && !gpioRelais.setNightVision(false)) {
          logging.add("Error when turning night vision off","warn");
        }

        // Schedule taking the next picture (only non-night vision)
        if(camera.lastRequest && !nightVision) {
          let diff = new moment().diff(camera.lastRequest);
          logging.add(`Last picture is ${diff / 1000}s old`);
    
          if(diff < 5 * 60 * 1000) {
            logging.add(`Taking another picture in ${camera.intervalSec}s until ${camera.lastRequest.format()}  +5min`);
            setTimeout(function nextPicPls() {
              takePhoto();
            }, camera.intervalSec * 1000);
          }
        }
      });
      return true;
    }
}
takePhoto();

getSvg = (which = "normal") => {
    /* An SVG Container with image timestamp.
        Will not trigger picture-taking on its own, as it's wrapping
        the camera.image picture from the /cam endpoint
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


    var html = `<?xml version="1.0" encoding="UTF-8"?>
    <!DOCTYPE html>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <head>
        <meta charset="UTF-8"/>
        <title> </title>
        <style type="text/css">
          html, body {
            height: 100%;
            width: 100%;
            margin: 0;
            padding: 0;
          }
        </style>
      </head>
      <body>
        <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" x="0px" y="0px"
                preserveAspectRatio="xMidYMid meet"
                width="100%"
                height="100%"
                viewBox="0 0 1296 972">
          <g id="page">`
      if(cameraObj.image) {
        html += '<image overflow="visible" width="1296" height="972" xlink:href="'+ picUrl +'"/>';
        html += '<text font-family="Arial, Helvetica, sans-serif" x="10" y="40" fill="white" font-size="30px">🐔 '+ moment(cameraObj.time).format("HH:mm:ss") + ' (' + moment(cameraObj.time).fromNow() /*+' - '+ new moment().diff(cameraObj.time)/1000 */ + ') ' + Math.round(getTemperature() * 10) /10 + '°C   ' + Math.round(getHumidity()) + '%</text>';
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
        </svg>
      </body>
    </html>`;
    return html;
}

getJpg = () => {
    camera.lastRequest = new moment();
    takePhoto();
    return camera.image;
}

getIRJpg = () => {
  camera.ir.lastRequest = new moment();
  return camera.ir.image;
}

getIRStatus = () => {
  camera.ir.on = gpioRelais.IRIsOn();
  //camera.ir.time = new moment();
}

exports.data = camera;
exports.cameraConfig = cameraConfig;
exports.configure = configure;
exports.takePhoto = takePhoto;
exports.getSvg = getSvg;
exports.getJpg = getJpg;
exports.getIRJpg = getIRJpg;
