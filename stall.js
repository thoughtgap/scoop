// !TODO kalib oben, dann kann man 2x hintereinander runter machen.

var express = require('express');
var app = express();
const fs = require('fs');
const { PerformanceObserver, performance } = require('perf_hooks');
var moment = require('moment');

var logging = require('./logging.js');

let config = require('./config.json');
logging.thingspeakSetAPIKey(config.thingspeakAPI);

const ganzeFahrtSek = config.ganzeFahrtSek;

const skipGpio = {
  "motor": config.skipGpio.motor,
  "dht22": config.skipGpio.dht22,
  "sensoren": config.skipGpio.sensoren,
  "bme280": config.skipGpio.bme280,
  "ir": config.skipGpio.ir
}

var gpioRelais = require('./gpio-relais.js');
gpioRelais.configure( config.gpioPorts.out.hoch,
                config.gpioPorts.out.runter,
                config.gpioPorts.out.ir,
                config.motorAus,
                config.motorEin,
                skipGpio.motor,
                skipGpio.ir);

if(!skipGpio.bme280) {
  logging.add("Initializing BME280 Temperature Sensor");
  var bme280 = require('./temperature-bme280.js');
  bme280.configure(config.gpioPorts.in.bme280, config.intervals.bme280);
  logging.add(`CONFIG BME Port ${config.gpioPorts.out.bme280}, Intervall ${config.intervals.bme280}`);
  bme280.readSensor();
}
else {
  logging.add("Skipping BME280 Temperature Sensor");
}
getTemperature = () => {
  if(!skipGpio.bme280) {
    return bme280.status.values.temperature;
  }
  return null;
}
getHumidity = () => {
  if(!skipGpio.bme280) {
    return bme280.status.values.humidity;
  }
  return null;
}

if(!skipGpio.dht22) {
  logging.add("Initializing DHT22 Temperature Sensor");
  var dht22 = require('./temperature-dht22.js');
  dht22.configure(config.gpioPorts.out.dht22, config.intervals.dht22);
  dht22.readSensor();
}
else {
  logging.add("Skipping DHT22 Temperature Sensor");
}

if(!skipGpio.cpuTemp) {
  logging.add("Initializing CPU Temperature Sensor");
  var cpuTemp = require('./temperature-cpu.js');
  cpuTemp.configure(config.intervals.cpu);
  cpuTemp.readSensor();
}
else {
  logging.add("Skipping CPU Temperature Sensor");
}

var klappenModul = require('./klappe.js');
klappenModul.configure(
  config.sensorObenMontiert,
  config.sensorUntenMontiert,
  config.ganzeFahrtSek,
  config.maxSekundenEinWeg,
  config.korrekturSekunden,
  skipGpio
);

klappenModul.stoppeKlappe();
logging.add("Motor initialisiert");

sensoren = {
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
}

// Initialisiere die Sensoren
if(!skipGpio.sensoren) {
  sensorOben = new Gpio(config.gpioPorts.in.oben, 'in', 'both', {debounceTimeout: 10});
  sensorUnten = new Gpio(config.gpioPorts.in.unten, 'in', 'both', {debounceTimeout: 10});

  sensorOben.watch((err, value) => {
    sensorPressed("oben",value);
    //logging.add("sensorOben: " + value + sensorOben.readSync());
  });
  
  sensorUnten.watch((err, value) => {
    sensorPressed("unten",value);
    //logging.add("sensorUnen: "+value + sensorUnten.readSync());
  });
}

function sensorPressed(position,value) {
  logging.add("sensorPressed: "+position+ " " + (value == 1 ? "losgelassen" : "gedrückt") + "(" + value + ")");

  if(position == "oben") {
    sensorObenWert(value,null);
  }
  else {
    sensorUntenWert(value,null);
  }
}

function sensorObenWert(value,err) {
  if (err) {
    sensoren.sensorOben.value = null;
    sensoren.sensorOben.text = "error";
    
  }
  else {
    sensoren.sensorOben.value = value;
    sensoren.sensorOben.text = (value == 1 ? "nicht": "") + " betätigt";

    
    // Wenn der Motor gerade hoch fährt,
    // und der Sensor betätigt wird, halte den Motor an.
    if(value == 0) {
      klappenModul.stoppeKlappe();
    }
  }
  sensoren.sensorOben.time = new Date();
  logging.add("leseSensoren Oben "+value);
}
function sensorUntenWert(value,err) {
  if (err) {
    sensoren.sensorUnten.value = null;
    sensoren.sensorUnten.text = "error";
    
  }
  else {
    sensoren.sensorUnten.value = value;
    sensoren.sensorUnten.text = (value == 1 ? "nicht": "") + " betätigt";

    // Wenn der Motor gerade runter fährt,
    // und der Sensor betätigt wird, halte den Motor an.
    if(value == 0) {
      klappenModul.stoppeKlappe();
    }
  }
  sensoren.sensorUnten.time = new Date();
  logging.add("leseSensoren Unten "+value);
}

function leseSensoren() {
  if(!skipGpio.sensoren) {
    sensorOben.read((err, value) => { // Asynchronous read
      sensorObenWert(value, err);
    });

    sensorUnten.read((err, value) => { // Asynchronous read
      sensorUntenWert(value, err);
    });
  }
  else {
    // Mockup-Werte
    sensoren.sensorUnten.value = 1;
    sensoren.sensorUnten.text = "nicht betätigt";
    sensoren.sensorUnten.time = new Date();
    sensoren.sensorUnten.error = "Optionaler Fehlertext";

    sensoren.sensorOben.value = 0;
    sensoren.sensorOben.text = "betätigt";
    sensoren.sensorOben.time = new Date();
    sensoren.sensorOben.error = "Optionaler Fehlertext";
  }
  if(sensoren.intervalSec) {
    setTimeout(function erneutLesen() {
      leseSensoren();
    }, sensoren.intervalSec * 1000);
  }
}
leseSensoren();

// function stoppeMotor() {
//   if(klappenModul.klappe.status !== "angehalten") {
//     gpioRelais.stoppeMotor();
//     klappenModul.setKlappenStatus("angehalten",null);
//   }
//   else {
//     logging.add("Skip stoppeMotor, klappe.status == angehalten.");
//   }  
// }

// function setSensorMontiert(pos,boo) {
//   // !TODO
//   // Hiermit kann man setzen, ob die einzelnen Sensoren montiert sind oder nicht.
//   // Falls ein Sensor kaputt geht kann man die Sensoren-Sicherheitsnetze so umgehen.
//   if((pos == "oben" || pos == "unten") && (boo == true || boo == false)) {
//     if(pos == "oben") {
//       sensorObenMontiert = boo;
//     }
//     else {
//       sensorUntenMontiert = boo;
//     }
//     message = `Sensor ${pos} montiert: ${boo}`;
//     success = true;
//   }
//   else {
//     message = `Bitte gültige Sensorposition (oben/unten) und gültigen Montage-Wert (true/false) angeben.`;
//     success = false;  
//   }
//   logging.add(message);
//   return {success: success, message: message};
// }

klappenModul.init();

var camera = require('./camera.js');
camera.configure(config.camera.intervalSec, config.camera.maxAgeSec);

var cronTasks = require('./cron-tasks.js');
cronTasks.configure(config.location, config.hatchAutomation);

// Hier kommt nun der ganze Server-Kram
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");

  logging.add(`req ${req.method} ${req.originalUrl} from ${( req.headers['x-forwarded-for'] || req.connection.remoteAddress )}`, 'info');
  next();
});


app.get('/', function (req, res) {
  res.send('Hello 🐔!');
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
    //dht22: dht22.status,
    cpuTemp: cpuTemp.status,
    sensoren: sensoren,
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
      }
    }
  });
});
app.get('/log', function (req, res) {
  res.send({
    log: log
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
  let takeIt = camera.takePhoto(true,false);
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
  let takeIt = camera.takePhoto(true,true);
  if(takeIt == true) {
    res.send({success:true,message:"nacht-foto in auftrag gegeben. abholen unter /nightvision"});
  }
  else {
    res.send({success:false,message:"nacht-foto nicht in auftrag gegeben - " + takeIt});
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
app.get('/heapdump', function (req, res) {
  // For debugging memory leaks
  logging.add(`Extracting Heap dump`);
  const heapdump = require("heapdump");
  heapdump.writeSnapshot((err, filename) => {
    logging.add(`Heap dump written to ${filename}`);
    res.send(`Heap dump written to ${filename}`);
  });
});
app.listen(3000, function () {
  logging.add('listening on port 3000!');
});
