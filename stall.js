var express = require('express');
var app = express();
const port = 54032;  // Use the assigned port
const fs = require('fs');
const { PerformanceObserver, performance } = require('perf_hooks');
var moment = require('moment');

var logging = require('./logging.js');
var events = require('./events.js');

let config = require('./config.json');
const bootTimestamp = moment();
logging.thingspeakSetAPIKey(config.thingspeakAPI);
logging.setLogLevel(config.logLevel);

const ganzeFahrtSek = config.ganzeFahrtSek;

// Initialize skipModules with defaults if not provided in config
const defaultSkipModules = {
  motor: false,
  dht22: false,
  sensoren: false,
  bme280: false,
  ir: false,
  camera: false,
  shelly: false,
  telegram: false,
  heating: false,
  cputemp: false,
  suncalc: false
};

// Make skipModules globally available
global.skipModules = config.skipModules || defaultSkipModules;

// Log which modules are disabled
const disabledModules = Object.entries(global.skipModules)
  .filter(([_, disabled]) => disabled)
  .map(([name, _]) => name);

if (disabledModules.length > 0) {
  logging.add("Disabled modules: " + disabledModules.join(", "));
} else {
  logging.add("All modules enabled");
}

// Initialize all modules in the correct order
// Each module now handles its own disabled state internally

// 1. Initialize SunCalc helper first as it's needed by other modules
var suncalcHelper = require('./suncalc.js');
suncalcHelper.configure(config.location.lat, config.location.lon);

// Make klappenModul globally available
global.klappenModul = null;
global.bme280 = null;
global.cpuTemp = null;
global.camera = null;
global.shelly = null;
global.cronTasks = null;
global.heating = null;
global.sensorStatus = {
  enabled: false,
  sensorOben: {
    value: null,
    text: null,
    time: null,
    error: null
  },
  sensorUnten: {
    value: null,
    text: null,
    time: null,
    error: null
  },
  intervalSec: null
};

async function initialize() {
  // 1. Initialize GPIO first as other modules depend on it
  var gpioRelais = require('./gpio-relais.js');
  await gpioRelais.configure( config.gpioPorts.out.hoch,
                  config.gpioPorts.out.runter,
                  config.gpioPorts.out.ir,
                  config.motorAus,
                  config.motorEin,
                  global.skipModules.motor,
                  global.skipModules.ir);

  // 2. Initialize Camera module (depends on GPIO for night vision)
  global.camera = require('./camera.js');
  global.camera.configure(
    config.camera.intervalSec,
    config.camera.maxAgeSec,
    config.camera.autoTakeMin
  );

  // 3. Initialize Temperature Sensors
  if(!global.skipModules.bme280) {
    logging.add("Initializing BME280 Temperature Sensor");
    global.bme280 = require('./temperature-bme280.js');
    global.bme280.configure(config.gpioPorts.in.bme280, config.intervals.bme280);
    logging.add(`CONFIG BME Port ${config.gpioPorts.out.bme280}, Intervall ${config.intervals.bme280}`);
    global.bme280.readSensor();
  }
  else {
    logging.add("Skipping BME280 Temperature Sensor");
  }

  // Helper functions for temperature and humidity
  getTemperature = () => global.bme280 ? global.bme280.status.values.temperature : null;
  getHumidity = () => global.bme280 ? global.bme280.status.values.humidity : null;

  // Initialize DHT22
  var dht22 = require('./temperature-dht22.js');
  dht22.configure(config.gpioPorts.out.dht22, config.intervals.dht22);
  if (dht22.status.enabled) {
    dht22.readSensor();
  }

  // Initialize CPU Temperature
  global.cpuTemp = require('./temperature-cpu.js');
  global.cpuTemp.configure(config.intervals.cpu);
  if (global.cpuTemp.status.enabled) {
    global.cpuTemp.readSensor();
  }

  // Initialize Telegram notifications
  var telegram = require('./telegram.js');
  telegram.configure(
    config.telegram.sendMessages,
    config.telegram.token,
    config.telegram.chatId
  );

  // Initialize Shelly smart plug control
  global.shelly = require('./shelly.js');
  global.shelly.configure(
    config.shelly.url,
    config.shelly.intervalSec
  );

  // Initialize Heating control
  global.heating = require('./heating.js');
  global.heating.configure(config.light);

  // Initialize Klappe (hatch) module
  global.klappenModul = require('./klappe.js');
  global.klappenModul.configure(
    config.sensorObenMontiert,
    config.sensorUntenMontiert,
    config.ganzeFahrtSek,
    config.maxSekundenEinWeg,
    config.korrekturSekunden,
    global.skipModules
  );
  global.klappenModul.init();

  if (global.klappenModul.status && global.klappenModul.status.enabled) {
    global.klappenModul.stoppeKlappe();
    logging.add("Hatch motor initialized");
  } else {
    logging.add("Hatch motor disabled");
  }

  // 9. Initialize position sensors
  global.sensorStatus = {
    enabled: !global.skipModules.sensoren,
    sensorOben: {
      value: null,
      text: null,
      time: null,
      error: null
    },
    sensorUnten: {
      value: null,
      text: null,
      time: null,
      error: null
    },
    intervalSec: config.intervals.sensoren
  };

  var sensorOben, sensorUnten;

  if (!global.skipModules.sensoren) {
    try {
      const { Gpio } = require('onoff');  // Import Gpio only if needed
      sensorOben = new Gpio(config.gpioPorts.in.oben, 'in', 'both', {debounceTimeout: 10});
      sensorUnten = new Gpio(config.gpioPorts.in.unten, 'in', 'both', {debounceTimeout: 10});

      sensorOben.watch((err, value) => {
        if (err) {
          logging.add("Error in sensorOben watch: " + err, "error");
          global.sensorStatus.sensorOben.error = err;
          return;
        }
        sensorPressed("oben", value);
      });
      
      sensorUnten.watch((err, value) => {
        if (err) {
          logging.add("Error in sensorUnten watch: " + err, "error");
          global.sensorStatus.sensorUnten.error = err;
          return;
        }
        sensorPressed("unten", value);
      });

      logging.add("Position sensors initialized successfully");
    } catch (e) {
      logging.add("Error initializing position sensors: " + e, "error");
      global.sensorStatus.enabled = false;
      global.skipModules.sensoren = true;
    }
  }

  if (!global.sensorStatus.enabled) {
    // Mock sensor objects when disabled
    sensorOben = {
      read: (callback) => callback(null, 1),  // Not pressed
      readSync: () => 1,
      watch: () => {}
    };
    sensorUnten = {
      read: (callback) => callback(null, 1),  // Not pressed
      readSync: () => 1,
      watch: () => {}
    };
    logging.add("Module disabled: position sensors", "debug");
  }

  function sensorPressed(position, value) {
    if (!global.sensorStatus.enabled) {
      return; // Don't process sensor events when disabled
    }

    logging.add("sensorPressed: " + position + " " + (value == 1 ? "released" : "pressed") + " (" + value + ")");

    if (position == "oben") {
      sensorObenWert(value, null);
    } else {
      sensorUntenWert(value, null);
    }
  }

  function sensorObenWert(value, err) {
    if (!global.sensorStatus.enabled) {
      return; // Don't process sensor values when disabled
    }

    if (err) {
      global.sensorStatus.sensorOben.value = null;
      global.sensorStatus.sensorOben.text = "error";
      global.sensorStatus.sensorOben.error = err;
    } else {
      global.sensorStatus.sensorOben.value = value;
      global.sensorStatus.sensorOben.text = (value == 1 ? "nicht " : "") + "betätigt";
      global.sensorStatus.sensorOben.error = null;

      // If the motor is moving up and the sensor is activated, stop the motor
      if (value == 0 && global.klappenModul.status && global.klappenModul.status.enabled) {
        global.klappenModul.stoppeKlappe();
      }
    }
    global.sensorStatus.sensorOben.time = new Date();
    logging.add("leseSensoren Oben " + value, "debug");
  }

  function sensorUntenWert(value, err) {
    if (!global.sensorStatus.enabled) {
      return; // Don't process sensor values when disabled
    }

    if (err) {
      global.sensorStatus.sensorUnten.value = null;
      global.sensorStatus.sensorUnten.text = "error";
      global.sensorStatus.sensorUnten.error = err;
    } else {
      global.sensorStatus.sensorUnten.value = value;
      global.sensorStatus.sensorUnten.text = (value == 1 ? "nicht " : "") + "betätigt";
      global.sensorStatus.sensorUnten.error = null;

      // If the motor is moving down and the sensor is activated, stop the motor
      if (value == 0 && global.klappenModul.status && global.klappenModul.status.enabled) {
        global.klappenModul.stoppeKlappe();
      }
    }
    global.sensorStatus.sensorUnten.time = new Date();
    logging.add("leseSensoren Unten " + value, "debug");
  }

  function leseSensoren() {
    if (global.sensorStatus.enabled) {
      // Read real sensors
      sensorOben.read((err, value) => {
        sensorObenWert(value, err);
      });

      sensorUnten.read((err, value) => {
        sensorUntenWert(value, err);
      });
    } else {
      // Update mock values
      const now = new Date();
      
      // Mock values - top sensor not activated, bottom sensor activated
      global.sensorStatus.sensorUnten.value = 0;  // Activated
      global.sensorStatus.sensorUnten.text = "betätigt";
      global.sensorStatus.sensorUnten.time = now;
      global.sensorStatus.sensorUnten.error = null;

      global.sensorStatus.sensorOben.value = 1;   // Not activated
      global.sensorStatus.sensorOben.text = "nicht betätigt";
      global.sensorStatus.sensorOben.time = now;
      global.sensorStatus.sensorOben.error = null;

      logging.add("Module disabled: position sensors leseSensoren()", "debug");
    }

    // Schedule next reading if interval is set
    if (global.sensorStatus.intervalSec) {
      setTimeout(function erneutLesen() {
        leseSensoren();
      }, global.sensorStatus.intervalSec * 1000);
    }
  }

  // Start sensor reading loop
  //leseSensoren();
  // TODO Get this into a separate module
}

// Start the initialization
initialize().catch(err => {
  logging.add("Error during initialization: " + err.message, 'error');
  process.exit(1);
});

// Handle http requests
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");

  logging.add(`req ${req.method} ${req.originalUrl} from ${( req.headers['x-forwarded-for'] || req.connection.remoteAddress )}`, 'debug');
  next();
});

app.get('/', function (req, res) {
  res.redirect('/frontend/index.html');
});

// Hacky frontend delivery
app.get('/frontend/index.html', function (req, res) {
  res.sendFile(__dirname + '/frontend/index.html');
});
app.get('/frontend/coop.js', function (req, res) {
  res.sendFile(__dirname + '/frontend/coop.js');
});
app.get('/frontend/chick.svg', function (req, res) {
  res.sendFile(__dirname + '/frontend/chick.svg');
});
app.get('/frontend/angular.min.js', function (req, res) {
  res.sendFile(__dirname + '/frontend/angular.min.js');
});
app.get('/frontend/moment.min.js', function (req, res) {
  res.sendFile(__dirname + '/frontend/moment.min.js');
});
app.get('/frontend/angular-moment.min.js', function (req, res) {
  res.sendFile(__dirname + '/frontend/angular-moment.min.js');
});
app.get('/frontend/de.min.js', function (req, res) {
  res.sendFile(__dirname + '/frontend/de.min.js');
});

app.get('/status', function (req, res) {
  res.send({
    klappe: global.klappenModul ? global.klappenModul.klappe : null,
    initialisiert: global.klappenModul ? global.klappenModul.initialisiert : false,
    initialPosition: global.klappenModul ? global.klappenModul.initialPosition : null,
    initialPositionManuell: global.klappenModul ? global.klappenModul.initialPositionManuell : null,
    sensorObenMontiert: global.klappenModul ? global.klappenModul.config.sensorObenMontiert : false,
    sensorUntenMontiert: global.klappenModul ? global.klappenModul.config.sensorUntenMontiert : false,
    maxSekundenEinWeg: global.klappenModul ? global.klappenModul.config.maxSekundenEinWeg : null,
    korrekturSekunden: global.klappenModul ? global.klappenModul.config.korrekturSekunden : null,
    skipModules: global.skipModules,
    bme280: global.bme280 ? global.bme280.status : null,
    bewegungSumme: global.klappenModul ? global.klappenModul.bewegungSumme() : null,
    cpuTemp: global.cpuTemp ? global.cpuTemp.status : null,
    sensoren: global.sensorStatus,
    camera: {
      image: 'http://192.168.31.21/cam',
      time: global.camera ? global.camera.data.time : null,
      intervalSec: global.camera ? global.camera.data.intervalSec : null,
      maxAgeSec: global.camera ? global.camera.data.maxAgeSec : null,
      timeNextImage: global.camera ? global.camera.data.timeNextImage : null,
      busy: global.camera ? global.camera.data.busy : null,
      ir: {
        time: global.camera ? global.camera.data.ir.time : null,
        lastRequest: global.camera ? global.camera.data.ir.lastRequest : null
      },
      statistics: global.camera ? global.camera.data.statistics : null
    },
    shelly: global.shelly ? global.shelly.status : null,
    cron: global.cronTasks ? global.cronTasks.status : null,
    booted: bootTimestamp,
    heating: global.heating ? global.heating.status : null
  });
});

app.get('/log', function (req, res) {
  res.send({
    log: {}
  });
});

app.get('/korrigiere/hoch', function (req, res) {
  action = global.klappenModul ? global.klappenModul.korrigiereHoch() : { success: false, message: "Module not initialized" };
  res.send(action);
});

app.get('/korrigiere/runter', function (req, res) {
  action = global.klappenModul ? global.klappenModul.korrigiereRunter() : { success: false, message: "Module not initialized" };
  res.send(action);
});

app.get('/kalibriere/:obenUnten', function (req, res) {
  action = global.klappenModul ? global.klappenModul.kalibriere(req.params.obenUnten) : { success: false, message: "Module not initialized" };
  res.send(action);
});

app.get('/hoch', function (req, res) {
  action = global.klappenModul ? global.klappenModul.klappeFahren("hoch", ganzeFahrtSek) : { success: false, message: "Module not initialized" };
  if(action.success != true) {
    res.status(403);
  }
  res.send(action);
});

app.get('/runter', function (req, res) {
  action = global.klappenModul ? global.klappenModul.klappeFahren("runter", ganzeFahrtSek) : { success: false, message: "Module not initialized" };
  if(action.success != true) {
    res.status(403);
  }
  res.send(action);
});

app.get('/hoch/:wielange', function (req, res) {
  action = global.klappenModul ? global.klappenModul.klappeFahren("hoch", parseFloat(req.params.wielange)) : { success: false, message: "Module not initialized" };
  if(action.success != true) {
    res.status(403);
  }
  res.send(action);
});

app.get('/runter/:wielange', function (req, res) {
  action = global.klappenModul ? global.klappenModul.klappeFahren("runter", parseFloat(req.params.wielange)) : { success: false, message: "Module not initialized" };
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
  let takeIt = global.camera.queue();
  if(takeIt == true) {
    res.send({success:true,message:"foto in auftrag gegeben. abholen unter /cam"});
  }
  else {
    res.send({success:false,message:"foto nicht in auftrag gegeben - " + takeIt});
  }
});

app.get('/cam/:timestamp?', function (req, res) {
  if(global.camera.getJpg()) {
    res.contentType('image/jpeg');
    res.send(global.camera.getJpg());
  }
  else {
    res.send({message:"geht nicht"});
  }
});

app.get('/nightvision/new', function (req, res) {
  let takeIt = global.camera.queueNightvision();
  if(takeIt == true) {
    res.send({success:true,message:"nacht-foto kommt sofort. abholen unter /nightvision"});
  }
  else {
    res.send({success:false,message:"nacht-foto wird als nächstes aufgenommen - " + takeIt});
  }
});

app.get('/nightvision/:timestamp?', function (req, res) {
  if(global.camera.getIRJpg()) {
    res.contentType('image/jpeg');
    res.send(global.camera.getIRJpg());
  }
  else {
    res.send({message:"Kein IR Foto. Bitte per /nightvision/new eins aufnehmen."});
  }
});

app.get('/nightvisionsvg/:timestamp?', function (req, res) {
  res.contentType('image/svg+xml');
  res.send(global.camera.getSvg("nightvision"));
});

app.get('/camsvg/:timestamp?', function (req, res) {
  res.contentType('image/svg+xml');
  res.send(global.camera.getSvg());
});

app.get('/cam.svg', function (req, res) {
  res.contentType('image/svg+xml');
  res.send(global.camera.getSvg());
});

app.get('/cam.jpg', function (req, res) {
  if(global.camera.getJpg()) {
    res.contentType('image/jpeg');
    res.send(global.camera.getJpg());
  }
  else {
    res.send({message:"geht nicht"});
  }
});

app.get('/heapdump', function (req, res) {
  // For debugging memory leaks
  logging.add(`Extracting Heap dump`);
  const heapdump = require("heapdump");
  heapdump.writeSnapshot((err, filename) => {
    logging.add(`Heap dump written to ${filename}`);
    res.send(`Heap dump written to ${filename}`);
  });
});

app.get('/shelly/inform/:onoff', function (req, res) {
  global.shelly.setShellyRelayStatusOnOff(req.params.onoff);
  res.send({'message':'Thanks for sending Shelly Status'});
});

app.get('/shelly/turn/:onoff', function (req, res) {
  global.shelly.turnShellyRelay(req.params.onoff);
  res.send({'message':'Turning Shelly on/off'});
});

app.get('/shelly/update', function (req, res) {
  global.shelly.getShellyStatus(true);
  res.send({'message':'Updating Shelly Status'});
});

app.get('/heating/enable', function (req, res) {
  global.heating.setEnableHeating(true);
  res.send({'message':'Turning Heating on'});
});

app.get('/heating/disable', function (req, res) {
  global.heating.setEnableHeating(false);
  res.send({'message':'Turning Heating off'});
});

app.get('/light/enable', function (req, res) {
  global.heating.setEnableLight(true);
  res.send({'message':'Turning Light on'});
});

app.get('/light/disable', function (req, res) {
  global.heating.setEnableLight(false);
  res.send({'message':'Turning Light off'});
});

// Initialize cron tasks
global.cronTasks = require('./cron-tasks.js');
global.cronTasks.configure(
  config.location,
  config.hatchAutomation,
  config.light
);

// Start the web server
app.listen(port, '0.0.0.0', () => {
  logging.add(`Web server listening at http://0.0.0.0:${port}`);
});