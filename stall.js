var express = require('express');
var app = express();

var initialisiert = false;

var initialPosition = null;
var initialPositionManuell = null;

var hochSek = 0;
var runterSek = 0;

var log = [];

const sensorObenMontiert = false;
const sensorUntenMontiert = false;
const maxSekundenEinWeg = 6.2;
const korrekturSekunden = 0.5;

const skipGpio = {
  "motor": true,
  "dht22": true
}

if(!skipGpio.motor) {
  var Gpio = require('onoff').Gpio;
}
if(!skipGpio.dht22) {
  var sensorLib = require("node-dht-sensor");
}

const gpioPorts = {
  in: {
    dht22: 14,
    oben: 21,
    unten: 20
  },
  out: {
    hoch: 26,
    runter: 13
  }
};

klappe = {
  status: "not initialized",
  dauer: null,
  position: null
}

dht22 = {
  temperature: null,
  humidity: null,
  time: null
}

function sensorObenWert() {
  return "nicht gedrückt";
}
function sensorUntenWert() {
  return "nicht gedrückt";
}

function addLog(message) {
  console.log(message);
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
bewegungsStatus();


function init() {
  addLog("Versuche zu initialisieren");


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

    klappe.status = "initialized";
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
  

  if(richtung != "hoch" && richtung != "runter") {
    response.success = false;
    response.message = `klappe: Keine gültige Richtung angebeben (hoch/runter)`;
    addLog(response.message);
  }
  else if (sekunden > maxSekundenEinWeg) {
    response.success = false;
    response.message = `klappe ${richtung}: ${sekunden}s ist zu lang, maximal ${maxSekundenEinWeg}s erlaubt`;
    addLog(response.message);
  }
  else if (!initialisiert && sekunden > korrekturSekunden) {
    response.success = false;
    response.message = `klappe ${richtung}: ${sekunden}s geht nicht. Noch nicht initialisiert`;
    addLog(response.message);
  }
  else if ((!initialisiert && sekunden <= korrekturSekunden) || initialisiert) {
    // Klappe für x Sekunden
    response.success = true;
    response.message = `klappe ${richtung}: für ${sekunden}s ${korrektur ? '(korrektur)' : ''}`;
    addLog(response.message);

    const motorAus = 1;
    const motorEin = 0;

    if(richtung == "hoch") {
      if(!skipGpio.motor) {
        klappe = new Gpio(gpioPorts.out.hoch, 'high');
      }
    }
    else if (richtung == "runter") {
      if(!skipGpio.motor) {
        klappe = new Gpio(gpioPorts.out.runter, 'high');
      }
    }

    // Starte den Motor jetzt.
    if(!skipGpio.motor) {
      klappe.writeSync(motorEin);
    }
    klappe.status = "fahre"+richtung;
    klappe.dauer = sekunden;

    // Motor später wieder abschalten
    setTimeout(function motorSpaeterAnhalten() {
      
      if(!skipGpio.motor) {
        klappe.writeSync(motorAus);
      }
      addLog("Halte Motor wieder an.");
      klappe.status = "angehalten";
      klappe.dauer = null;

      // Merke wieviel hoch/runter gefahren
      if(richtung == "hoch") {
        hochSek += sekunden;
      }
      else if(richtung == "runter") {
        runterSek += sekunden;
      }

    }, sekunden * 1000);

  }
  else {
    response.message = `klappe ${richtung}: ${sekunden} geht nicht. Grund nicht erkennbar.`;
    addLog(response.message);
    response.success = false;
  }

  return response;
}

function bewegungsStatus() {
  let status = {
    hochSek: hochSek,
    runterSek: runterSek,
    summe: hochSek - runterSek
  }
  return status;
}

function getTemp() {
  if(!skipGpio.dht22) {
    return sensor.readSync(22, 14);
  }
  dht22.temperature = 22;
  dht22.humidity = 5;
  dht22.time = new Date();
  return true;

  /*
  sensorLib.read(22, 14, function(err, temperature, humidity) {
    if (!err) {
      console.log(`temp: ${temperature}°C, humidity: ${humidity}%`);


      status = {
        "klappe": {
          "position": 10,
          "oben": false,
          "unten": true
        },
        "sensoren": {
          "oben": sensorOben,
          "unten": sensorUnten
        },
        "temperatur": temperature,
        "luftfeuchtigkeit": humidity
      };
    
    
    
      res.send(status);


    }
    else {
      console.log("Fehler");
    }
  });*/


}

// Hier kommt nun der ganze Server-Kram
app.get('/', function (req, res) {
  res.send('Hello 🐔!');
});
app.get('/status', function (req, res) {
  getTemp();
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
    bewegungsStatus: bewegungsStatus(),
    dht22: dht22
  });
});
app.get('/hoch', function (req, res) {
  action = klappeFahren("hoch",10);
  if(action.success != true) {
    res.status(403);
  }
  res.send(action);
});
app.get('/korrigiere/hoch', function (req, res) {
  action = korrigiereHoch();
  res.send(action);
});
app.get('/korrigiere/runter', function (req, res) {
  action = korrigiereRunter();
  res.send(action);
});
app.get('/kalibriere/oben', function (req, res) {
  // !TODO
  //res.send('🐔 fahre jetzt hoch!');
  //korrigiereHoch();
});
app.get('/hoch/:wielange', function (req, res) {
  let dauer = parseFloat(req.params.wielange);
  res.send(`🐔 fahre jetzt ${dauer} hoch!`);
  klappeFahren("hoch",dauer);
});
app.listen(3000, function () {
  console.log('listening on port 3000!');
});