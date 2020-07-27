// !TODO kalib oben, dann kann man 2x hintereinander runter machen.

var express = require('express');
var app = express();
const fs = require('fs');

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

const motorAus = config.motorAus;
const motorEin = config.motorEin;

const skipGpio = {
  "motor": config.skipGpio.motor,
  "dht22": config.skipGpio.dht22,
  "sensoren": config.skipGpio.sensoren
}

const gpioPorts = config.gpioPorts;

klappe = {
  status: "not initialized",
  fahrDauer: null, // für wieviele Sekunden fährt die Klappe gerade
  hochSek: null,   // wieviele Sekunden ist die Klappe hoch gefahren
  runterSek: null, // wieviele Sekunden ist die Klappe runter gefahren
  position: null,
  positionNum: null,
  zeit: null
}

function setKlappenStatus(status, fahrDauer) {
  klappe.status = status;
  klappe.zeit = new Date();
  klappe.fahrDauer = fahrDauer;
}


// Initialisiere den Motor und die GPIO-Ports
if(!skipGpio.motor) {
  var Gpio = require('onoff').Gpio;
  klappeHoch = new Gpio(gpioPorts.out.hoch, 'high');
  klappeRunter = new Gpio(gpioPorts.out.runter, 'high');
}
stoppeMotor();
addLog("Motor initialisiert");

if(!skipGpio.dht22) {
  var sensorLib = require("node-dht-sensor");
  var cpuTemp = require("pi-temperature");
}

dht22 = {
  temperature: null,
  humidity: null,
  time: null,
  intervalSec: 30
}

cpu = {
  temperature: null,
  error: null,
  time: null,
  intervalSec: 30
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
  intervalSec: 30
}

// Initialisiere die Sensoren
if(!skipGpio.sensoren) {
  sensorOben = new Gpio(gpioPorts.in.oben, 'in');
  sensorUnten = new Gpio(gpioPorts.in.unten, 'in');
}

function leseSensoren() {
  if(!skipGpio.sensoren) {
    sensorOben.read((err, value) => { // Asynchronous read
      if (err) {
        sensoren.sensorOben.value = null;
        sensoren.sensorOben.text = "error";
        
      }
      else {
        sensoren.sensorOben.value = value;
        sensoren.sensorOben.text = (value == 1 ? "nicht": "") + " betätigt";
      }
      sensoren.sensorOben.time = new Date();
      addLog("leseSensoren Oben "+value);
    });

    sensorUnten.read((err, value) => { // Asynchronous read
      if (err) {
        sensoren.sensorUnten.value = null;
        sensoren.sensorUnten.text = "error";
        
      }
      else {
        sensoren.sensorUnten.value = value;
        sensoren.sensorUnten.text = (value == 1 ? "nicht": "") + " betätigt";
      }
      sensoren.sensorUnten.time = new Date();
      addLog("leseSensoren Unten "+value);
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
  setTimeout(function erneutLesen() {
    leseSensoren();
  }, 5 * 1000);
}

leseSensoren();

function stoppeMotor() {
  if(!skipGpio.motor) {
    klappeHoch.writeSync(motorAus);
    klappeRunter.writeSync(motorAus);
  }
  addLog("Motor gestoppt");
  
  setKlappenStatus("angehalten",null)
}

function sensorObenWert() {
  return "nicht gedrückt";
}
function sensorUntenWert() {
  return "nicht gedrückt";
}
function setSensorMontiert(pos,boo) {
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
  addLog(message);
  return {success: success, message: message};
}

function addLog(message) {
  console.log("Log: "+message);
  // !TODO wieso funktioniert dies console.log nicht?
  log.push({
    "time": new Date(),
    "log": message
  });
}

console.log("pok 🐔");
//manuelleInitialPosition("oben");
//korrigiereHoch();
//korrigiereRunter();
init();



function init() {
  addLog("Versuche zu initialisieren");

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
    addLog("Initialisierung erfolgreich");
    return true;
  }
  else {
    // Kann keine mögliche Position ableiten, braucht manuellen Input.
    addLog("Konnte keine Initialposition ermitteln. Brauche manuellen Input.");
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
  addLog("Korrigiere hoch");
  return klappeFahren("hoch",korrekturSekunden,true);
}
function korrigiereRunter() {
  addLog("Korrigiere runter");
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
    addLog(response.message);
  }
  else if(richtung != "hoch" && richtung != "runter") {
    response.success = false;
    response.message = `klappe: Keine gültige Richtung angebeben (hoch/runter)`;
    addLog(response.message);
  }
  else if (!initialisiert && sekunden > korrekturSekunden) {
    response.success = false;
    response.message = `klappe ${richtung}: ${sekunden}s geht nicht. Noch nicht kalibriert`;
    addLog(response.message);
  }
  else if (sekunden > maxSekundenEinWeg) {
    response.success = false;
    response.message = `klappe ${richtung}: ${sekunden}s ist zu lang, maximal ${maxSekundenEinWeg}s erlaubt`;
    addLog(response.message);
  }
  else if ((!initialisiert && sekunden <= korrekturSekunden) || initialisiert) {


    // Überprüfe ob die Fahrt zulässig ist (nicht zu weit hoch/runter)
    // klappe.hochSek
    // klappe.runterSek
    
    if(Math.abs(neuePosition) > ganzeFahrtSek) {
      response.message = `HALLO FALSCH DA REISST DER FADEN! klappe.position: ${klappe.position}, fahrtWert: ${fahrtWert}, hochSek: ${klappe.hochSek}, runterSek: ${klappe.runterSek}, neuePosition: ${neuePosition}`;
      addLog(response.message);
      response.success = false;
    } else {
      addLog(`klappe.position: ${klappe.position}, fahrtWert: ${fahrtWert}, hochSek: ${klappe.hochSek}, runterSek: ${klappe.runterSek}, neuePosition: ${neuePosition}`);

      // Klappe für x Sekunden
      response.success = true;
      response.message = `klappe ${richtung}: für ${sekunden}s ${korrektur ? '(korrektur)' : ''}`;
      addLog(response.message);

      // Starte den Motor jetzt.
      if(richtung == "hoch") {
        if(!skipGpio.motor) {
          klappeHoch.writeSync(motorEin);
        }
      }
      else if (richtung == "runter") {
        if(!skipGpio.motor) {
          klappeRunter.writeSync(motorEin);
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

      }, sekunden * 1000);
    }
  }
  else {
    response.message = `klappe ${richtung}: ${sekunden} geht nicht. Grund nicht erkennbar.`;
    addLog(response.message);
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
  addLog("getTemp()");
  if(!skipGpio.dht22) {
    // DHT22 Temperature
    sensorLib.read(22, 14, function(err, temperature, humidity) {
      dht22.time = new Date();
      if (!err) {
        dht22.temperature = temperature;
        dht22.humidity = humidity;
        dht22.error = null;
        addLog(`temp: ${temperature}°C, humidity: ${humidity}%`);
      }
      else {
        addLog("DHT22 Error "+err);
        dht22.temperature = null;
        dht22.humidity = null;
        dht22.error = ""+err;
        console.log(err);
      }

    });

    // CPU Temperature
    cpuTemp.measure(function(err, temp) {
      if (err) {
        addLog("CPU Temperatur Error "+err);
        cpu.error = err;
      }
      else {
        cpu.error = null;
        cpu.temperature = temp;
        cpu.time = new Date();
        addLog(`cpu: ${temp}°C`);
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
  setTimeout(function temperaturErneutLesen() {
    getTemp();
  }, dht22.intervalSec * 1000);
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
  klappe.positionNum = (obenUnten == "oben" ? 1 : -1) * ganzeFahrtSek;
  klappe.hochSek = 0;
  klappe.runterSek = 0;
  setKlappenStatus("angehalten", null);
  initialisiert = true;
  let message = `Position ${klappe.position} kalibriert.`;
  addLog(message);
  return {success: true, message: message};
}

// Hier kommt nun der ganze Server-Kram
app.get('/', function (req, res) {
  res.send('Hello 🐔!');
  console.log("Serving /");
});
app.get('/status', function (req, res) {
  console.log("Serving /status");
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
    log: log,
    bewegungSumme: bewegungSumme(),
    dht22: dht22,
    cpu: cpu,
    sensoren: sensoren
  });
});
app.get('/korrigiere/hoch', function (req, res) {
  console.log("Serving /korrigiere/hoch");
  action = korrigiereHoch();
  res.send(action);
});
app.get('/korrigiere/runter', function (req, res) {
  console.log("Serving /korrigiere/runter");
  action = korrigiereRunter();
  res.send(action);
});
app.get('/kalibriere/:obenUnten', function (req, res) {
  console.log("Serving /kalibriere/"+req.params.obenUnten);
  action = kalibriere(req.params.obenUnten);
  res.send(action);
});
app.get('/hoch', function (req, res) {
  console.log("Serving /hoch");
  action = klappeFahren("hoch",ganzeFahrtSek);
  if(action.success != true) {
    res.status(403);
  }
  res.send(action);
});
app.get('/runter', function (req, res) {
  console.log("Serving /runter");
  action = klappeFahren("runter",ganzeFahrtSek);
  if(action.success != true) {
    res.status(403);
  }
  res.send(action);
});
app.get('/hoch/:wielange', function (req, res) {
  console.log("Serving /hoch/"+req.params.wielange);
  action = klappeFahren("hoch",parseFloat(req.params.wielange));
  if(action.success != true) {
    res.status(403);
  }
  res.send(action);
});
app.get('/runter/:wielange', function (req, res) {
  console.log("Serving /runter/"+req.params.wielange);
  action = klappeFahren("runter",parseFloat(req.params.wielange));
  if(action.success != true) {
    res.status(403);
  }
  res.send(action);
});
app.get('/reset', function (req, res) {
  console.log("Serving /reset/");
  
    var data = fs.readFileSync('test.json', 'utf-8');
    var newValue = new Date();
    fs.writeFileSync('test.json', newValue, 'utf-8');
    console.log('readFileSync complete');
  res.send(action);
});
app.listen(3000, function () {
  console.log('listening on port 3000!');
});