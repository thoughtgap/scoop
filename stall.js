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

// 2. Initialize GPIO Relais (motor control)
var gpioRelais = require('./gpio-relais.js');
gpioRelais.configure(
  config.gpioPorts.out.hoch,
  config.gpioPorts.out.runter,
  config.gpioPorts.out.ir,
  config.motorAus,
  config.motorEin,
  global.skipModules
);

// 3. Initialize Temperature Sensors
// 3.1 BME280
var bme280 = require('./temperature-bme280.js');
bme280.configure(config.gpioPorts.in.bme280, config.intervals.bme280);
if (bme280.status.enabled) {
  bme280.readSensor();
}

// Helper functions for temperature and humidity
getTemperature = () => bme280.status.values.temperature;
getHumidity = () => bme280.status.values.humidity;

// 3.2 DHT22
var dht22 = require('./temperature-dht22.js');
dht22.configure(config.gpioPorts.out.dht22, config.intervals.dht22);
if (dht22.status.enabled) {
  dht22.readSensor();
}

// 3.3 CPU Temperature
var cpuTemp = require('./temperature-cpu.js');
cpuTemp.configure(config.intervals.cpu);
if (cpuTemp.status.enabled) {
  cpuTemp.readSensor();
}

// 4. Initialize Telegram notifications
var telegram = require('./telegram.js');
telegram.configure(
  config.telegram.sendMessages,
  config.telegram.token,
  config.telegram.chatId
);

// 5. Initialize Camera module
var camera = require('./camera.js');
camera.configure(
  config.camera.intervalSec,
  config.camera.maxAgeSec,
  config.camera.autoTakeMin
);

// 6. Initialize Shelly smart plug control
var shelly = require('./shelly.js');
shelly.configure(
  config.shelly.url,
  config.shelly.intervalSec
);

// 7. Initialize Heating control
var heating = require('./heating.js');
heating.configure(config.light);

// 8. Initialize Klappe (hatch) module
var klappenModul = require('./klappe.js');
klappenModul.configure(
  config.sensorObenMontiert,
  config.sensorUntenMontiert,
  config.ganzeFahrtSek,
  config.maxSekundenEinWeg,
  config.korrekturSekunden,
  global.skipModules
);

if (klappenModul.status && klappenModul.status.enabled) {
  klappenModul.stoppeKlappe();
  logging.add("Hatch motor initialized");
} else {
  logging.add("Hatch motor disabled");
}

// 9. Initialize position sensors
var sensorStatus = {
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
        sensorStatus.sensorOben.error = err;
        return;
      }
      sensorPressed("oben", value);
    });
    
    sensorUnten.watch((err, value) => {
      if (err) {
        logging.add("Error in sensorUnten watch: " + err, "error");
        sensorStatus.sensorUnten.error = err;
        return;
      }
      sensorPressed("unten", value);
    });

    logging.add("Position sensors initialized successfully");
  } catch (e) {
    logging.add("Error initializing position sensors: " + e, "error");
    sensorStatus.enabled = false;
    global.skipModules.sensoren = true;
  }
}

if (!sensorStatus.enabled) {
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
  logging.add("Position sensors disabled - using mock sensors");
}

function sensorPressed(position, value) {
  if (!sensorStatus.enabled) {
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
  if (!sensorStatus.enabled) {
    return; // Don't process sensor values when disabled
  }

  if (err) {
    sensorStatus.sensorOben.value = null;
    sensorStatus.sensorOben.text = "error";
    sensorStatus.sensorOben.error = err;
  } else {
    sensorStatus.sensorOben.value = value;
    sensorStatus.sensorOben.text = (value == 1 ? "nicht " : "") + "betätigt";
    sensorStatus.sensorOben.error = null;

    // If the motor is moving up and the sensor is activated, stop the motor
    if (value == 0 && klappenModul.status && klappenModul.status.enabled) {
      klappenModul.stoppeKlappe();
    }
  }
  sensorStatus.sensorOben.time = new Date();
  logging.add("leseSensoren Oben " + value, "debug");
}

function sensorUntenWert(value, err) {
  if (!sensorStatus.enabled) {
    return; // Don't process sensor values when disabled
  }

  if (err) {
    sensorStatus.sensorUnten.value = null;
    sensorStatus.sensorUnten.text = "error";
    sensorStatus.sensorUnten.error = err;
  } else {
    sensorStatus.sensorUnten.value = value;
    sensorStatus.sensorUnten.text = (value == 1 ? "nicht " : "") + "betätigt";
    sensorStatus.sensorUnten.error = null;

    // If the motor is moving down and the sensor is activated, stop the motor
    if (value == 0 && klappenModul.status && klappenModul.status.enabled) {
      klappenModul.stoppeKlappe();
    }
  }
  sensorStatus.sensorUnten.time = new Date();
  logging.add("leseSensoren Unten " + value, "debug");
}

function leseSensoren() {
  if (sensorStatus.enabled) {
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
    sensorStatus.sensorUnten.value = 0;  // Activated
    sensorStatus.sensorUnten.text = "betätigt";
    sensorStatus.sensorUnten.time = now;
    sensorStatus.sensorUnten.error = null;

    sensorStatus.sensorOben.value = 1;   // Not activated
    sensorStatus.sensorOben.text = "nicht betätigt";
    sensorStatus.sensorOben.time = now;
    sensorStatus.sensorOben.error = null;

    logging.add("Using mock sensor values", "debug");
  }

  // Schedule next reading if interval is set
  if (sensorStatus.intervalSec) {
    setTimeout(function erneutLesen() {
      leseSensoren();
    }, sensorStatus.intervalSec * 1000);
  }
}

// Start sensor reading loop
leseSensoren();

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
    klappe: klappenModul.klappe,
    initialisiert: klappenModul.initialisiert,
    initialPosition: klappenModul.initialPosition,
    initialPositionManuell: klappenModul.initialPositionManuell,
    sensorObenMontiert: klappenModul.config.sensorObenMontiert,
    sensorUntenMontiert: klappenModul.config.sensorUntenMontiert,
    maxSekundenEinWeg: klappenModul.config.maxSekundenEinWeg,
    korrekturSekunden: klappenModul.config.korrekturSekunden,
    skipModules: global.skipModules,
    bme280: bme280.status,
    bewegungSumme: klappenModul.bewegungSumme(),
    cpuTemp: cpuTemp.status,
    sensoren: sensorStatus,
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
  action = klappenModul.klappeFahren("hoch", ganzeFahrtSek);
  if(action.success != true) {
    res.status(403);
  }
  res.send(action);
});

app.get('/runter', function (req, res) {
  action = klappenModul.klappeFahren("runter", ganzeFahrtSek);
  if(action.success != true) {
    res.status(403);
  }
  res.send(action);
});

app.get('/hoch/:wielange', function (req, res) {
  action = klappenModul.klappeFahren("hoch", parseFloat(req.params.wielange));
  if(action.success != true) {
    res.status(403);
  }
  res.send(action);
});

app.get('/runter/:wielange', function (req, res) {
  action = klappenModul.klappeFahren("runter", parseFloat(req.params.wielange));
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

// Initialize cron tasks
var cronTasks = require('./cron-tasks.js');
cronTasks.configure(
  config.location,
  config.hatchAutomation,
  config.light
);

// Start the web server
app.listen(port, '0.0.0.0', () => {
  logging.add(`Web server listening at http://0.0.0.0:${port}`);
});