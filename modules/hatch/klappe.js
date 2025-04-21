var logging = require('../utilities/logging.js');
var moment = require('moment');
var gpioRelais = require('../gpio/gpio-relais.js');
var events = require('../utilities/events.js');
var suncalc = require('../utilities/suncalc.js');
var camera = require('../camera/camera.js');
var heating = require('../climate/heating.js');
const fs = require('fs');

var klappe = {
    status: "not initialized",
    fahrDauer: null, // für wieviele Sekunden fährt die Klappe gerade
    hochSek: null,   // wieviele Sekunden ist die Klappe hoch gefahren
    runterSek: null, // wieviele Sekunden ist die Klappe runter gefahren
    position: null,
    positionNum: null,
    zeit: null,
}

var initialisiert = false;
var initialPosition = null;
var initialPositionManuell = null;

var config = {
    sensorObenMontiert: null,
    sensorUntenMontiert: null,
    ganzeFahrtSek: null,
    maxSekundenEinWeg: null,
    korrekturSekunden: null
}

const configure = (
    sensorObenMontiert,
    sensorUntenMontiert,
    ganzeFahrtSek,
    maxSekundenEinWeg,
    korrekturSekunden,
    skipGpio
) => {
    config.sensorObenMontiert = sensorObenMontiert;
    config.sensorUntenMontiert = sensorUntenMontiert;
    config.ganzeFahrtSek = ganzeFahrtSek;
    config.maxSekundenEinWeg = maxSekundenEinWeg;
    config.korrekturSekunden = korrekturSekunden;
    config.skipGpio = skipGpio
};

const init = () => {
    logging.add('Initializing hatch 🐔 pok', 'info');

    fs.readFile('klappenPosition.json', (err, data) => {
        if (err) {
            logging.add("Could not read klappenPosition.json "+err,"warn");
            // Set position to null to indicate unknown state
            setKlappenPosition(null);
            setKlappenStatus("angehalten", null);
            return false;
        }

        try {
            const position = JSON.parse(data);
            if (position !== "oben" && position !== "unten") {
                logging.add("Invalid position in klappenPosition.json: " + position, "warn");
                // Set position to null to indicate unknown state
                setKlappenPosition(null);
                setKlappenStatus("angehalten", null);
                return false;
            }
            this.kalibriere(position);
            logging.add("Read klappenPosition.json --> "+data);
            
            // Send initial position and status events
            setKlappenPosition(position);
            setKlappenStatus("angehalten", null);
        } catch(e) {
            logging.add("Error parsing klappenPosition.json: " + e, "warn");
            // Set position to null to indicate unknown state
            setKlappenPosition(null);
            setKlappenStatus("angehalten", null);
            return false;
        }
    });

    return true;
};

const setKlappenStatus = (status, fahrDauer) => {
    // Merke alte Werte
    klappe.previous = {
        status: klappe.status,
        zeit: klappe.zeit,
        fahrDauer: klappe.fahrDauer,
        //perf: klappe.perf,
    }

    klappe.status = status;
    klappe.zeit = new Date();
    klappe.fahrDauer = fahrDauer;
    //klappe.perf = performance.now();
    //klappe.duration = klappe.perf - klappe.previous.perf;
    klappe.duration = 0;

    logging.add("Klappenstatus " + status + " nach " + (klappe.duration / 1000) + "s - Fahrdauer " + klappe.previous.fahrDauer + " - jetzt " + fahrDauer + "s");
    events.send('klappenStatus',status);
};

const setKlappenPosition = (obenUnten) => {
    if (obenUnten != "oben" && obenUnten != "unten") {
        logging.add("setKlappenPosition() wrong parameter","e");
        return false;
    }
    klappe.position = obenUnten;
    events.send('klappenPosition',obenUnten);

    // Write to file
    fs.writeFile("klappenPosition.json", JSON.stringify(klappe.position), 'utf8', function (err) {
        if (err) {
            logging.add("Could not write klappenPosition.json "+err,"warn");
            return false;
        }
        logging.add("Wrote klappenPosition.json");
    });


    heating.checkLight();
}

const manuelleInitialPosition = (pos) => {
    if (pos == "oben" || pos == "runter") {
        initialPositionManuell = pos;
        return true;
    }
    logging.add("Fehler: Keine gültige manuelle Initialposition (oben/unten)")
    return false;
};

const korrigiereHoch = () => {
    logging.add("Korrigiere hoch");
    return klappeFahren("hoch", config.korrekturSekunden, true);
};
const korrigiereRunter = () => {
    logging.add("Korrigiere runter");
    return klappeFahren("runter", config.korrekturSekunden, true);
};

const klappeFahren = (richtung, sekunden = null, korrektur = false) => {
    let response = {
        success: false,
        message: ""
    }

    if(sekunden === null) {
        sekunden = config.ganzeFahrtSek;
    }

    if(richtung != "hoch" && richtung != "runter") {
        logging.add("klappe.klappeFahren() - Invalid parameter (hoch/runter)",'warn');
        return false;
    }

    fahrtWert = 0;
    if(korrektur != true) {
        if (richtung == "hoch") {
            fahrtWert = 1;
        }
        else if (richtung == "runter") {
            fahrtWert = -1;
        }
        fahrtWert = fahrtWert * sekunden
    }
    neuePosition = klappe.positionNum + fahrtWert;


    if (klappe.status != "angehalten") {
        response.success = false;
        response.message = `klappe: Die ist gar nicht angehalten`;
        logging.add(response.message);
    }
    else if (richtung != "hoch" && richtung != "runter") {
        response.success = false;
        response.message = `klappe: Keine gültige Richtung angebeben (hoch/runter)`;
        logging.add(response.message);
    }
    else if (!initialisiert && sekunden > config.korrekturSekunden) {
        response.success = false;
        response.message = `klappe ${richtung}: ${sekunden}s geht nicht. Noch nicht kalibriert`;
        logging.add(response.message);
    }
    else if (sekunden > config.maxSekundenEinWeg) {
        response.success = false;
        response.message = `klappe ${richtung}: ${sekunden}s ist zu lang, maximal ${config.maxSekundenEinWeg}s erlaubt`;
        logging.add(response.message);
    }
    else if ((!initialisiert && sekunden <= config.korrekturSekunden) || initialisiert) {

        // Überprüfe ob die Fahrt zulässig ist (nicht zu weit hoch/runter)
        if (Math.abs(neuePosition) > config.ganzeFahrtSek || neuePosition < 0 || neuePosition > config.ganzeFahrtSek) {
            response.message = `HALLO FALSCH DA REISST DER FADEN! klappe.position: ${klappe.position}, fahrtWert: ${fahrtWert}, hochSek: ${klappe.hochSek}, runterSek: ${klappe.runterSek}, neuePosition: ${neuePosition}`;
            logging.add(response.message);
            response.success = false;
        } else {
            logging.add(`klappe.position: ${klappe.position}, fahrtWert: ${fahrtWert}, hochSek: ${klappe.hochSek}, runterSek: ${klappe.runterSek}, neuePosition: ${neuePosition}`);

            // Klappe für x Sekunden
            response.success = true;
            response.message = `klappe ${richtung}: für ${sekunden}s ${korrektur ? `(korrektur nach hochSek: ${klappe.hochSek}, runterSek: ${klappe.runterSek})` : ''}`;
            logging.add(response.message);

            // Starte den Motor jetzt.
            if (richtung == "hoch") {
                if (!config.skipGpio.motor) {
                    gpioRelais.fahreHoch();
                }
            }
            else if (richtung == "runter") {
                if (!config.skipGpio.motor) {
                    gpioRelais.fahreRunter();
                }
            }

            setKlappenStatus("fahre" + richtung, sekunden);

            // Motor später wieder abschalten
            setTimeout(function motorSpaeterAnhalten() {
                stoppeKlappe();
                
                // Merke wieviel hoch/runter gefahren
                if (richtung == "hoch") {
                    klappe.hochSek += sekunden;
                }
                else if (richtung == "runter") {
                    klappe.runterSek += sekunden;
                }

                if(!korrektur) {
                    klappe.positionNum += fahrtWert;
                }

                logging.add(`sekunden: ${sekunden}, ganzeFahrtSek: ${config.ganzeFahrtSek}, positionNum: ${klappe.positionNum}, richtung: ${richtung}, bool: ${(sekunden >= config.ganzeFahrtSek || klappe.positionNum == 0 || klappe.positionNum == config.ganzeFahrtSek)}`);

                if (sekunden >= config.ganzeFahrtSek || klappe.positionNum == 0 || klappe.positionNum == config.ganzeFahrtSek) {
                    if (richtung == "hoch") {
                        setKlappenPosition('oben');
                    }
                    else {
                        setKlappenPosition('unten');
                    }
                }

            }, sekunden * 1000);
        }
    }
    else {
        response.message = `klappe ${richtung}: ${sekunden} geht nicht. Grund nicht erkennbar.`;
        logging.add(response.message,'warn');
        response.success = false;
    }

    return response;
};

stoppeKlappe = () => {
    gpioRelais.stoppeMotor();
    setKlappenStatus("angehalten",null);

    // Take a picture and send via Telegram
    camera.queueTelegram();
    camera.getIRJpg();
}

bewegungSumme = () => {
    return klappe.hochSek - klappe.runterSek;
};

kalibriere = (obenUnten) => {
    /* Wenn die Klappe entweder ganz oben oder ganz unten ist,
       wird diese Funktion aufgerufen, um diese Klappenposition
       zu merken.
    */

    if (obenUnten != "oben" && obenUnten != "unten") {
        return { success: false, message: "Bitte Position (oben/unten) korrekt angeben" };
    }
    setKlappenPosition(obenUnten);
    klappe.positionNum = (obenUnten == "oben" ? 1 : 0) * config.ganzeFahrtSek;
    klappe.hochSek = 0;
    klappe.runterSek = 0;
    setKlappenStatus("angehalten", null);
    initialisiert = true;
    let message = `Position ${klappe.position} kalibriert.`;
    logging.add(message);
    return { success: true, message: message };
}

const getDoorState = (position) => {
    // Translate position into Home Assistant door state
    // "oben" (up) = door is closed
    // "unten" (down) = door is open
    // null/undefined = unknown state
    if (position === "oben") {
        return "ON";  // Door is closed
    } else if (position === "unten") {
        return "OFF"; // Door is open
    }
    return "unknown";
};

const getMovementState = (status) => {
    // Translate status into Home Assistant movement state
    // "fahrehoch" or "fahrerunter" = moving
    // "angehalten" = not moving
    // null/undefined = unknown state
    if (status === "fahrehoch" || status === "fahrerunter") {
        return "ON";  // Moving
    } else if (status === "angehalten") {
        return "OFF"; // Not moving
    }
    return "unknown";
};

exports.configure = configure;
exports.init = init;
exports.klappe = klappe;
exports.config = config;
exports.setKlappenStatus = setKlappenStatus;
exports.initialisiert = initialisiert;
exports.initialPosition = initialPosition;
exports.initialPositionManuell = initialPositionManuell;
exports.bewegungSumme = bewegungSumme;
exports.kalibriere = kalibriere;
exports.klappeFahren = klappeFahren;
exports.korrigiereRunter = korrigiereRunter;
exports.korrigiereHoch = korrigiereHoch;
exports.stoppeKlappe = stoppeKlappe;
exports.getDoorState = getDoorState;
exports.getMovementState = getMovementState;

