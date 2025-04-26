// !TODO kalib oben, dann kann man 2x hintereinander runter machen.

var express = require('express');
var app = express();
const fs = require('fs');
const { PerformanceObserver, performance } = require('perf_hooks');
var moment = require('moment');
const compression = require('compression');

var logging = require('./modules/utilities/logging.js');

var events = require('./modules/utilities/events.js');

// Load Config
let config = require('./config.json');

const bootTimestamp = moment();
logging.thingspeakSetAPIKey(config.thingspeakAPI);
logging.setLogLevel(config.logLevel);

const ganzeFahrtSek = config.ganzeFahrtSek;

const skipGpio = {
  motor: config.skipGpio.motor,
  sensoren: config.skipGpio.sensoren,
  bme280: config.skipGpio.bme280,
  ir: config.skipGpio.ir,
  shelly: config.skipGpio.shelly
}

// GPIO Init
var gpioRelais = require('./modules/gpio/gpio-relais.js');
gpioRelais.configure( config.gpioPorts.out.hoch,
                config.gpioPorts.out.runter,
                config.gpioPorts.out.ir,
                config.motorAus,
                config.motorEin,
                skipGpio.motor,
                skipGpio.ir);

// Hatch Init
var klappenModul = require('./modules/hatch/klappe.js');
klappenModul.configure(
  config.sensorObenMontiert,
  config.sensorUntenMontiert,
  config.ganzeFahrtSek,
  config.maxSekundenEinWeg,
  config.korrekturSekunden,
  skipGpio
);
klappenModul.init();

// BME280 Init
if(!skipGpio.bme280) {
  logging.add("Initializing BME280 Temperature Sensor", 'info', 'stall');
  var bme280 = require('./modules/temperature/bme280.js');
  bme280.configure(config.gpioPorts.in.bme280, config.intervals.bme280);
  logging.add(`CONFIG BME Port ${config.gpioPorts.out.bme280}, Intervall ${config.intervals.bme280}`, 'info', 'stall');
  bme280.readBME280();
}
else {
  logging.add("Skipping BME280 Temperature Sensor", 'info', 'stall');
}

// Telegram Init
var telegram = require('./modules/integrations/telegram.js');
telegram.configure(config.telegram.sendMessages,
                  config.telegram.token,
                  config.telegram.chatId);

// CPU Temperature Init
if(!skipGpio.cpuTemp) {
  logging.add("Initializing CPU Temperature Sensor", 'info', 'stall');
  var cpuTemp = require('./modules/temperature/cpu.js');
  cpuTemp.configure(config.intervals.cpu);
  cpuTemp.readSensor();
}
else {
  logging.add("Skipping CPU Temperature Sensor", 'info', 'stall');
}

var camera = require('./modules/camera/camera.js');
camera.configure(config.camera.intervalSec, config.camera.maxAgeSec, config.camera.autoTakeMin);

var suncalcHelper = require('./modules/utilities/suncalc.js');
suncalcHelper.configure(config.location.lat,config.location.lon);

var heating = require('./modules/climate/heating.js');
heating.configure(config.light);

var cronTasks = require('./modules/scheduling/cron-tasks.js');
cronTasks.configure(  config.location
                    , config.hatchAutomation
                    , config.light);

var shelly = require('./modules/integrations/shelly.js');
shelly.configure(config.shelly.url, config.shelly.intervalSec);
shelly.getShellyStatus();

app.use(compression());

// Handle http requests
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  // Add security headers for HTTPS
  res.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.header("Content-Security-Policy", "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com https://ajax.googleapis.com; img-src 'self' data: blob:;");
  
  logging.add(`req ${req.method} ${req.originalUrl} from ${( req.headers['x-forwarded-for'] || req.connection.remoteAddress )}`, 'debug', 'stall');
  next();
});


app.get('/', function (req, res) {
  //res.send('Hello 🐔!');
  res.redirect('/frontend/index.html');
});

// Deliver frontend with proper caching headers
app.use('/frontend', express.static(__dirname + '/frontend', {
  maxAge: '1d',
  setHeaders: function(res, path) {
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

app.get('/status', function (req, res) {
  res.send({
    klappe: klappenModul.klappe,
    initialisiert: klappenModul.initialisiert,
    initialPosition: klappenModul.initialPosition,
    initialPositionManuell: klappenModul.initialPositionManuell,
    sensorObenMontiert: klappenModul.config.sensorObenMontiert,
    sensorUntenMontiert: klappenModul.config.sensorUntenMontiert,
    maxSekundenEinWeg: klappenModul.config.maxSekundenEinWeg,
    korrekturSekunden: klappenModul.config.korrekturSekunden,
    skipGpio: skipGpio,
    bme280: bme280.status,
    bewegungSumme: klappenModul.bewegungSumme(),
    cpuTemp: cpuTemp.status,
    //sensoren: sensoren,
    camera: {
      image: 'http://192.168.31.21/cam',
      time: camera.data.time,
      intervalSec: camera.data.intervalSec,
      maxAgeSec: camera.data.maxAgeSec,
      timeNextImage: camera.data.timeNextImage,
      busy: camera.data.busy,
      ir: {
        time: camera.data.ir.time,
        lastRequest: camera.data.ir.lastRequest
      },
      statistics: camera.data.statistics
    },
    shelly: shelly.status,
    cron: cronTasks.status,
    booted: bootTimestamp,
    heating: heating.status
  });
});
app.get('/log', function (req, res) {
  res.send({
    log: {}
  });
});
app.get('/korrigiere/hoch', function (req, res) {
  action = klappenModul.korrigiereHoch();
  res.send(action);
});
app.get('/korrigiere/runter', function (req, res) {
  action = klappenModul.korrigiereRunter();
  res.send(action);
});
app.get('/kalibriere/:obenUnten', function (req, res) {
  action = klappenModul.kalibriere(req.params.obenUnten);
  res.send(action);
});
app.get('/hoch', function (req, res) {
  // TODO: GanzeFahrtSek in Klappenmodul ausgliedern
  action = klappenModul.klappeFahren("hoch",ganzeFahrtSek);
  if(action.success != true) {
    res.status(403);
  }
  res.send(action);
});
app.get('/runter', function (req, res) {
  // TODO: GanzeFahrtSek in Klappenmodul ausgliedern
  action = klappenModul.klappeFahren("runter",ganzeFahrtSek);
  if(action.success != true) {
    res.status(403);
  }
  res.send(action);
});
app.get('/hoch/:wielange', function (req, res) {
  action = klappenModul.klappeFahren("hoch",parseFloat(req.params.wielange));
  if(action.success != true) {
    res.status(403);
  }
  res.send(action);
});
app.get('/runter/:wielange', function (req, res) {
  action = klappenModul.klappeFahren("runter",parseFloat(req.params.wielange));
  if(action.success != true) {
    res.status(403);
  }
  res.send(action);
});
app.get('/reset', function (req, res) {
    /* Dirty hack for triggering nodemon */
    var data = fs.readFileSync('test.json', 'utf-8');
    var newValue = new Date();
    fs.writeFileSync('test.json', newValue, 'utf-8');
    res.send("modified test.json");
});
app.get('/cam/new', function (req, res) {
  let takeIt = camera.queue();
  if(takeIt == true) {
    res.send({success:true,message:"foto in auftrag gegeben. abholen unter /cam"});
  }
  else {
    res.send({success:false,message:"foto nicht in auftrag gegeben - " + takeIt});
  }
});
app.get('/cam/:timestamp?', function (req, res) {
  if(camera.getJpg()) {
    res.contentType('image/jpeg');
    res.send(camera.getJpg());
  }
  else {
    res.send({message:"geht nicht"});
  }
});
app.get('/nightvision/new', function (req, res) {
  let takeIt = camera.queueNightvision();
  if(takeIt == true) {
    res.send({success:true,message:"nacht-foto kommt sofort. abholen unter /nightvision"});
  }
  else {
    res.send({success:false,message:"nacht-foto wird als nächstes aufgenommen - " + takeIt});
  }
});
app.get('/nightvision/:timestamp?', function (req, res) {
  if(camera.getIRJpg()) {
    res.contentType('image/jpeg');
    res.send(camera.getIRJpg());
  }
  else {
    res.send({message:"Kein IR Foto. Bitte per /nightvision/new eins aufnehmen."});
  }
});
app.get('/nightvisionsvg/:timestamp?', function (req, res) {
  res.contentType('image/svg+xml');
  res.send(camera.getSvg("nightvision"));
});
app.get('/camsvg/:timestamp?', function (req, res) {
    res.contentType('image/svg+xml');
    res.send(camera.getSvg());
});
app.get('/cam.svg', function (req, res) {
    res.contentType('image/svg+xml');
    res.send(camera.getSvg());
});
app.get('/cam.jpg', function (req, res) {
  if(camera.getJpg()) {
    res.contentType('image/jpeg');
    res.send(camera.getJpg());
  }
  else {
    res.send({message:"geht nicht"});
  }
});
app.get('/shelly/inform/:onoff', function (req, res) {
  shelly.setShellyRelayStatusOnOff(req.params.onoff);
  res.send({'message':'Thanks for sending Shelly Status'});
});
app.get('/shelly/turn/:onoff', function (req, res) {
  shelly.turnShellyRelay(req.params.onoff);
  res.send({'message':'Turning Shelly on/off'});
});
app.get('/shelly/update', function (req, res) {
  shelly.getShellyStatus(true);
  res.send({'message':'Updating Shelly Status'});
});
app.get('/heating/enable', function (req, res) {
  heating.setEnableHeating(true);
  res.send({'message':'Turning Heating on'});
});
app.get('/heating/disable', function (req, res) {
  heating.setEnableHeating(false);
  res.send({'message':'Turning Heating off'});
});
app.get('/light/enable', function (req, res) {
  heating.setEnableLight(true);
  res.send({'message':'Turning Light on'});
});
app.get('/light/disable', function (req, res) {
  heating.setEnableLight(false);
  res.send({'message':'Turning Light off'});
});

app.get('/events', events.sse.init);

app.listen(3000, function () {
  logging.add('listening on port 3000!', 'info', 'stall');
});
