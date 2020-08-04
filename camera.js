var logging = require('./logging.js');
var moment = require('moment');

var camera = {
    image: null,
    time: null,
    intervalSec: 30,
    maxAgeSec: 20,
    timeNextImage: null,
    busy: false
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
};

takePhoto = (force = false) => {
    let now = new Date();
    let max = camera.timeNextImage;
    console.log(now, max);
    if(now <= max) {
        logging.add("Not taking picture. Picture still good.");
    }
    else if(camera.busy) {
        logging.add("Not taking picture. Camera busy.");
    }
    else {
        camera.busy = true;
        logging.add("Taking a picture");
        cam.takePhoto().then((photo) => {
        camera.image = photo;
        camera.time = new Date();
        camera.timeNextImage = new Date();
        camera.timeNextImage.setSeconds(camera.timeNextImage.getSeconds() + camera.maxAgeSec);
        camera.busy = false;
        logging.add("Took a picture");
        });
    }
}
takePhoto();

getSvg = () => {
    /* An SVG Container with image timestamp.
        Will not trigger picture-taking on its own, as it's wrapping
        the camera.image picture from the /cam endpoint
    */
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
      if(camera.image) {
        html += '<image overflow="visible" width="1296" height="972" xlink:href="/cam/'+ moment(camera.time).format() +'.jpg"/>';
        html += '<text font-family="Arial, Helvetica, sans-serif" x="10" y="40" fill="white" font-size="30px">🐔 '+ moment(camera.time).format("HH:mm:ss") + ' (' + moment(camera.time).fromNow() +')</text>';
      }
      else {
        html += '<text x="10" y="500" fill="black" font-size="500px">🐔</text>';
        html += '<text x="10" y="200" fill="black" font-size="100px">Ich habe leider</text>';
        html += '<text x="50" y="300" fill="black" font-size="100px">kein Foto</text>';
        html += '<text x="90" y="400" fill="black" font-size="100px">für dich</text>';
      }
            
    html += `
          </g>
        </svg>
      </body>
    </html>`;
    return html;
}

getJpg = () => {
    takePhoto();
    return camera.image;
}




exports.data = camera;
exports.cameraConfig = cameraConfig;
exports.takePhoto = takePhoto;
exports.getSvg = getSvg;
exports.getJpg = getJpg;

