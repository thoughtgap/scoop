var logging = require('./logging.js');
var gpioMotor = require('./gpio-relais.js');

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
    logging.add('Initializing 🐔 pok', 'info');

    // Die manuelle Initialposition ist immer wichtiger als die automatische
    if (initialPositionManuell !== null) {
        initialPosition = initialPositionManuell;
        logging.add(`Initialposition: ${initialPosition} - aus manueller Angabe übernommen.`);
        logging.add("Erfolgreich initalisiert.");
        return true;
    }

    // Ableitung der Initialposition aus den aktuellen Sensorständen
    let posWahrscheinlich = [];
    if (config.sensorObenMontiert && sensorObenWert() == "gedrückt") {
        // Die Position ist wahrscheinlich oben
        posWahrscheinlich.push("oben");
    }
    if (config.sensorUntenMontiert && sensorUntenWert() == "gedrückt") {
        // Die Position ist wahrscheinlich unten
        posWahrscheinlich.push("unten");
    }

    if (posWahrscheinlich.length == 1) {
        // Es gibt nur eine Möglichkeit, die Initialposition ist hiermit klar.
        initialPosition = posWahrscheinlich[0];

        logging.add(`Initialposition: ${initialPosition}`);

        setKlappenStatus("angehalten", null);
        logging.add("Initialisierung erfolgreich");
        return true;
    }
    else {
        // Kann keine mögliche Position ableiten, braucht manuellen Input.
        logging.add("Konnte keine Initialposition ermitteln. Brauche manuellen Input.");
        return false;
    }
};

const setKlappenStatus = (status, fahrDauer) => {
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
    //klappe.perf = performance.now();

    klappe.duration = klappe.perf - klappe.previous.perf;
    logging.add("Klappenstatus " + status + " nach " + (klappe.duration / 1000) + "s - Fahrdauer " + klappe.previous.fahrDauer + " - jetzt " + fahrDauer + "s");
};

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

const klappeFahren = (richtung, sekunden, korrektur = false) => {
    let response = {
        success: false,
        message: ""
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
                    gpioMotor.fahreHoch();
                }
            }
            else if (richtung == "runter") {
                if (!config.skipGpio.motor) {
                    gpioMotor.fahreRunter();
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
        logging.add(response.message,'warn');
        response.success = false;
    }

    return response;
};

stoppeKlappe = () => {
    gpioMotor.stoppeMotor();
    setKlappenStatus("angehalten",null);
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
    klappe.position = obenUnten;
    klappe.positionNum = (obenUnten == "oben" ? 1 : 0) * config.ganzeFahrtSek;
    klappe.hochSek = 0;
    klappe.runterSek = 0;
    setKlappenStatus("angehalten", null);
    initialisiert = true;
    let message = `Position ${klappe.position} kalibriert.`;
    logging.add(message);
    return { success: true, message: message };
}

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
