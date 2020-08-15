// !TODO kalib oben, dann kann man 2x hintereinander runter machen.

var express = require('express');
var app = express();
const fs = require('fs');
const { PerformanceObserver, performance } = require('perf_hooks');
var moment = require('moment');

var logging = require('./logging.js');

var t0 = performance.now();

var initialisiert = false;

var initialPosition = null;
var initialPositionManuell = null;

var log = [];

let config = require('./config.json');
console.log(config);

const sensorObenMontiert = config.sensorObenMontiert;
const sensorUntenMontiert = config.sensorUntenMontiert;
const ganzeFahrtSek = config.ganzeFahrtSek;
const maxSekundenEinWeg = config.maxSekundenEinWeg;
const korrekturSekunden = config.korrekturSekunden;
logging.thingspeakSetAPIKey(config.thingspeakAPI);

const motorAus = config.motorAus;
const motorEin = config.motorEin;

const skipGpio = {
  "motor": config.skipGpio.motor,
  "dht22": config.skipGpio.dht22,
  "sensoren": config.skipGpio.sensoren,
  "bme280": config.skipGpio.bme280
}

const gpioPorts = config.gpioPorts;

var gpioMotor = require('./gpio-motor.js');
gpioMotor.configure( config.gpioPorts.out.hoch,
                config.gpioPorts.out.runter,
                config.motorAus,
                config.motorEin,
                skipGpio.motor);

if(!skipGpio.bme280) {
  logging.add("Initializing BME280 Temperature Sensor");
  var bme280 = require('./bme280.js');
  const intervalreadSec = 30;
  bme280.configure(config.gpioPorts.out.bme280, config.intervals.bme280);
  logging.add("CONFIG BME");
  bme280.readSensor();
}
else {
  logging.add("Skipping BME280 Temperature Sensor");
}




klappe = {
  status: "not initialized",
  fahrDauer: null, // für wieviele Sekunden fährt die Klappe gerade
  hochSek: null,   // wieviele Sekunden ist die Klappe hoch gefahren
  runterSek: null, // wieviele Sekunden ist die Klappe runter gefahren
  position: null,
  positionNum: null,
  zeit: null,
  perf: performance.now()
}

function setKlappenStatus(status, fahrDauer) {
  // Merke alte Werte
  klappe.previous = {
    status: klappe.status,
    zeit: klappe.zeit,
    fahrDauer: klappe.fahrDauer,
    perf: klappe.perf,
  }

  klappe.status = status;
  klappe.zeit = new Date();
  klappe.fahrDauer = fahrDauer;
  klappe.perf = performance.now();

  klappe.duration = klappe.perf - klappe.previous.perf;
  logging.add("Klappenstatus "+ status + " nach "+ (klappe.duration / 1000) + "s - Fahrdauer "+ klappe.previous.fahrDauer + " - jetzt "+fahrDauer+"s");
}


// Initialisiere den Motor und die GPIO-Ports
// if(!skipGpio.motor) {
//   var Gpio = require('onoff').Gpio;
// }
stoppeMotor();
logging.add("Motor initialisiert");

if(!skipGpio.dht22) {
  var sensorLib = require("node-dht-sensor");
}
if(!skipGpio.cpuTemp) {
  var cpuTemp = require("pi-temperature");
}

dht22 = {
  temperature: null,
  humidity: null,
  time: null,
  intervalSec: config.intervals.dht22
}

cpu = {
  temperature: null,
  error: null,
  time: null,
  intervalSec: config.intervals.cpu
}

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

// Free up gpio ports
// process.on('SIGINT', _ => {
//   if(!skipGpio.sensoren) {
//     console.log("Sensoren freigegeben");
//     sensorOben.unexport();
//     sensorUnten.unexport();
//   }
//   if(!skipGpio.motor) {
//     console.log("Motor freigegeben");
//     klappeHoch.unexport();
//     klappeRunter.unexport();
//   }
// });

// Initialisiere die Sensoren
if(!skipGpio.sensoren) {
  sensorOben = new Gpio(gpioPorts.in.oben, 'in', 'both', {debounceTimeout: 10});
  sensorUnten = new Gpio(gpioPorts.in.unten, 'in', 'both', {debounceTimeout: 10});

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
      stoppeMotor();
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
      stoppeMotor();
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

function stoppeMotor() {
  gpioMotor.stoppeMotor();
  setKlappenStatus("angehalten",null)
}

function setSensorMontiert(pos,boo) {
  // !TODO
  // Hiermit kann man setzen, ob die einzelnen Sensoren montiert sind oder nicht.
  // Falls ein Sensor kaputt geht kann man die Sensoren-Sicherheitsnetze so umgehen.
  if((pos == "oben" || pos == "unten") && (boo == true || boo == false)) {
    if(pos == "oben") {
      sensorObenMontiert = boo;
    }
    else {
      sensorUntenMontiert = boo;
    }
    message = `Sensor ${pos} montiert: ${boo}`;
    success = true;
    
  }
  else {
    message = `Bitte gültige Sensorposition (oben/unten) und gültigen Montage-Wert (true/false) angeben.`;
    success = false;  
  }
  logging.add(message);
  return {success: success, message: message};
}

init();

function init() {
  logging.add('Initializing 🐔 pok', 'info');
  getCpuTemp();
  getTemp();


  // Die manuelle Initialposition ist immer wichtiger als die automatische
  if (initialPositionManuell !== null) {
    initialPosition = initialPositionManuell;
    console.log(`Initialposition: ${initialPosition} - aus manueller Angabe übernommen.`);
    console.log("Erfolgreich initalisiert.");
    return true;
  }

  // Ableitung der Initialposition aus den aktuellen Sensorständen
  let posWahrscheinlich = [];
  if (sensorObenMontiert && sensorObenWert() == "gedrückt") {
    // Die Position ist wahrscheinlich oben
    posWahrscheinlich.push("oben");
  }
  if (sensorUntenMontiert && sensorUntenWert() == "gedrückt") {
    // Die Position ist wahrscheinlich unten
    posWahrscheinlich.push("unten");
  }

  if (posWahrscheinlich.length == 1) {
    // Es gibt nur eine Möglichkeit, die Initialposition ist hiermit klar.
    initialPosition = posWahrscheinlich[0];

    console.log(`Initialposition: ${initialPosition}`);

    setKlappenStatus("angehalten",null);
    logging.add("Initialisierung erfolgreich");
    return true;
  }
  else {
    // Kann keine mögliche Position ableiten, braucht manuellen Input.
    logging.add("Konnte keine Initialposition ermitteln. Brauche manuellen Input.");
    return false;
  }
}

function manuelleInitialPosition(pos) {
  if (pos == "oben" || pos == "runter") {
    initialPositionManuell = pos;
    return true;
  }
  console.log("Fehler: Keine gültige manuelle Initialposition (oben/unten)")
  return false;
}

function korrigiereHoch() {
  logging.add("Korrigiere hoch");
  // TODO Akzeptiert er nicht mehr, weil die neue Position out of bounds wäre.
  return klappeFahren("hoch",korrekturSekunden,true);
}
function korrigiereRunter() {
  logging.add("Korrigiere runter");
  // TODO Akzeptiert er nicht mehr, weil die neue Position out of bounds wäre.
  return klappeFahren("runter",korrekturSekunden,true);
}

function klappeFahren(richtung,sekunden,korrektur=false) {
  let response = {
    success: false,
    message: ""
  }

  fahrtWert = null;
  if(richtung == "hoch") {
    fahrtWert = 1;
  }
  else if (richtung == "runter") {
    fahrtWert = -1;
  }
  fahrtWert = fahrtWert * sekunden
  neuePosition = klappe.positionNum + fahrtWert;
  

  if(klappe.status != "angehalten") {
    response.success = false;
    response.message = `klappe: Die ist gar nicht angehalten`;
    logging.add(response.message);
  }
  else if(richtung != "hoch" && richtung != "runter") {
    response.success = false;
    response.message = `klappe: Keine gültige Richtung angebeben (hoch/runter)`;
    logging.add(response.message);
  }
  else if (!initialisiert && sekunden > korrekturSekunden) {
    response.success = false;
    response.message = `klappe ${richtung}: ${sekunden}s geht nicht. Noch nicht kalibriert`;
    logging.add(response.message);
  }
  else if (sekunden > maxSekundenEinWeg) {
    response.success = false;
    response.message = `klappe ${richtung}: ${sekunden}s ist zu lang, maximal ${maxSekundenEinWeg}s erlaubt`;
    logging.add(response.message);
  }
  else if ((!initialisiert && sekunden <= korrekturSekunden) || initialisiert) {


    // Überprüfe ob die Fahrt zulässig ist (nicht zu weit hoch/runter)
    // klappe.hochSek
    // klappe.runterSek
    
    if(Math.abs(neuePosition) > ganzeFahrtSek || neuePosition < 0 || neuePosition > ganzeFahrtSek) {
      response.message = `HALLO FALSCH DA REISST DER FADEN! klappe.position: ${klappe.position}, fahrtWert: ${fahrtWert}, hochSek: ${klappe.hochSek}, runterSek: ${klappe.runterSek}, neuePosition: ${neuePosition}`;
      logging.add(response.message);
      response.success = false;
    } else {
      logging.add(`klappe.position: ${klappe.position}, fahrtWert: ${fahrtWert}, hochSek: ${klappe.hochSek}, runterSek: ${klappe.runterSek}, neuePosition: ${neuePosition}`);

      // Klappe für x Sekunden
      response.success = true;
      response.message = `klappe ${richtung}: für ${sekunden}s ${korrektur ? '(korrektur)' : ''}`;
      logging.add(response.message);

      // Starte den Motor jetzt.
      if(richtung == "hoch") {
        if(!skipGpio.motor) {
          gpioMotor.fahreHoch();
        }
      }
      else if (richtung == "runter") {
        if(!skipGpio.motor) {
          gpioMotor.fahreRunter();
        }
      }
      setKlappenStatus("fahre"+richtung, sekunden);

      // Motor später wieder abschalten
      setTimeout(function motorSpaeterAnhalten() {
        stoppeMotor();

        // Merke wieviel hoch/runter gefahren
        if(richtung == "hoch") {
          klappe.hochSek += sekunden;
        }
        else if(richtung == "runter") {
          klappe.runterSek += sekunden;
        }
        klappe.positionNum += fahrtWert;

        console.log({
          sekunden: sekunden,
          ganzeFahrtSek: ganzeFahrtSek,
          positionNum: klappe.positionNum,
          richtung: richtung,
          bool: (sekunden >= ganzeFahrtSek || klappe.positionNum == 0 || klappe.positionNum == ganzeFahrtSek)
        });
        if(sekunden >= ganzeFahrtSek || klappe.positionNum == 0 || klappe.positionNum == ganzeFahrtSek) {
          if(richtung == "hoch") {
            klappe.position = "oben";
          }
          else {
            klappe.position = "unten";
          }
        }

      }, sekunden * 1000);
    }
  }
  else {
    response.message = `klappe ${richtung}: ${sekunden} geht nicht. Grund nicht erkennbar.`;
    logging.add(response.message);
    response.success = false;
  }

  return response;
}

function bewegungSumme() {
  return klappe.hochSek - klappe.runterSek;
}

function getTemp() {
  /* Diese Funktion wird von init() das erste mal aufgerufen
     und plant sich danach alle x Sekunden selbst ein. Sie fragt
     die Sensorwerte vom dht22-Sensor ab und legt sie zentral ab.
     So wird vermieden dass der Sensorwert zu oft abgefragt werden muss.
  */
  logging.add("getTemp()");
  if(!skipGpio.dht22) {
    // DHT22 Temperature
    sensorLib.read(22, 14, function(err, temperature, humidity) {
      dht22.time = new Date();
      if (!err) {
        dht22.temperature = temperature;
        dht22.humidity = humidity;
        dht22.error = null;
        logging.add(`temp: ${temperature}°C, humidity: ${humidity}%`);
      }
      else {
        logging.add("DHT22 Error "+err,"error");
        dht22.temperature = null;
        dht22.humidity = null;
        dht22.error = ""+err;
      }

    });
  }
  else {
    dht22.time = new Date();
    dht22.error = "Optional wird ein Fehler angezeigt";
    dht22.temperature = 22;
    dht22.humidity = 5;
    console.log(`${dht22.time} temp: ${dht22.temperature}°C, humidity: ${dht22.humidity}%`);
  }
  if(dht22.intervalSec) {
    setTimeout(function temperaturErneutLesen() {
      getTemp();
    }, dht22.intervalSec * 1000);
  }
}

function getCpuTemp() {
  // CPU Temperature
  cpuTemp.measure(function(err, temp) {
    if (err) {
      logging.add("CPU Temperatur Error "+err);
      cpu.error = err;
    }
    else {
      cpu.error = null;
      cpu.temperature = temp;
      cpu.time = new Date();
      logging.add(`cpu: ${temp}°C`);
      logging.thingspeakLog("field4="+cpu.temperature);
    }
    if(cpu.intervalSec) {
      setTimeout(function temperaturErneutLesen() {
        getCpuTemp();
      }, cpu.intervalSec * 1000);
    }
  });
}

function kalibriere(obenUnten) {
  /* Wenn die Klappe entweder ganz oben oder ganz unten ist,
     wird diese Funktion aufgerufen, um diese Klappenposition
     zu merken.
  */

  if(obenUnten != "oben" && obenUnten != "unten") {
    return {success: false, message: "Bitte Position (oben/unten) korrekt angeben"};
  }
  klappe.position = obenUnten;
  klappe.positionNum = (obenUnten == "oben" ? 1 : 0) * ganzeFahrtSek;
  klappe.hochSek = 0;
  klappe.runterSek = 0;
  setKlappenStatus("angehalten", null);
  initialisiert = true;
  let message = `Position ${klappe.position} kalibriert.`;
  logging.add(message);
  return {success: true, message: message};
}

var camera = require('./camera.js');


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
    klappe: klappe,
    initialisiert: initialisiert,
    initialPosition: initialPosition,
    initialPositionManuell: initialPositionManuell,
    sensorObenMontiert: sensorObenMontiert,
    sensorUntenMontiert: sensorUntenMontiert,
    maxSekundenEinWeg: maxSekundenEinWeg,
    korrekturSekunden: korrekturSekunden,
    skipGpio: skipGpio,
    bme280: bme280.status,
    bewegungSumme: bewegungSumme(),
    dht22: dht22,
    cpu: cpu,
    sensoren: sensoren,
    camera: {
      image: 'http://192.168.31.21/cam',
      time: camera.data.time,
      intervalSec: camera.data.intervalSec,
      maxAgeSec: camera.data.maxAgeSec,
      timeNextImage: camera.data.timeNextImage,
      busy: camera.data.busy
    }
  });
});
app.get('/log', function (req, res) {
  res.send({
    log: log
  });
});
app.get('/korrigiere/hoch', function (req, res) {
  action = korrigiereHoch();
  res.send(action);
});
app.get('/korrigiere/runter', function (req, res) {
  action = korrigiereRunter();
  res.send(action);
});
app.get('/kalibriere/:obenUnten', function (req, res) {
  action = kalibriere(req.params.obenUnten);
  res.send(action);
});
app.get('/hoch', function (req, res) {
  action = klappeFahren("hoch",ganzeFahrtSek);
  if(action.success != true) {
    res.status(403);
  }
  res.send(action);
});
app.get('/runter', function (req, res) {
  action = klappeFahren("runter",ganzeFahrtSek);
  if(action.success != true) {
    res.status(403);
  }
  res.send(action);
});
app.get('/hoch/:wielange', function (req, res) {
  action = klappeFahren("hoch",parseFloat(req.params.wielange));
  if(action.success != true) {
    res.status(403);
  }
  res.send(action);
});
app.get('/runter/:wielange', function (req, res) {
  action = klappeFahren("runter",parseFloat(req.params.wielange));
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
    console.log('readFileSync complete');
  res.send(action);
});
app.get('/cam/new', function (req, res) {
  camera.takePhoto(true);
  res.send({message:"foto in auftrag gegeben. abholen unter /cam"});
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
