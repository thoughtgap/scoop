var logging = require('../utilities/logging.js');
const { isDuration } = require('moment');
const performance = require('perf_hooks').performance;
const gpioControl = require('./gpio-control.js');

var motorConfig = {
    configured: false,
    gpioInit: false,
    gpioInitIR: false,
    pinHoch: null,
    pinRunter: null,
    pinIR: null,
    motorAus: null,
    motorEin: null,
    skipGpio: false
}

var nightVisionStatus = {
    value: null,
    time: null
}

configure = (pinHoch, pinRunter, pinIR, motorAus, motorEin, skipGpio, skipGpioIR) => {
    motorConfig.configured = true;
    motorConfig.pinHoch = pinHoch;
    motorConfig.pinHoch = pinHoch;
    motorConfig.pinRunter = pinRunter;
    motorConfig.pinIR = pinIR;
    motorConfig.motorAus = motorAus;
    motorConfig.motorEin = motorEin;
    motorConfig.skipGpio = skipGpio;
    motorConfig.skipGpioIR = skipGpioIR;

    logging.add("Motor Configure: " +
        "  configured " + motorConfig.configured +
        ", pinHoch " + pinHoch +
        ", pinRunter " + pinRunter +
        ", pinIR " + pinIR +
        ", motorAus " + motorAus +
        ", motorEin " + motorEin +
        ", skipGpio " + skipGpio +
        ", skipGpioIR " + skipGpioIR, 'info', 'gpio-relais');

    // Keep the original behavior, but don't auto-initialize
    // when initPromise is called instead
};

// Original init function (for backward compatibility)
init = () => {    
    if(!motorConfig.skipGpio || !motorConfig.skipGpioIR) {
        gpioControl.configure(motorConfig.skipGpio).catch(err => {
            logging.add(`Error initializing GPIO control: ${err.message}`, 'error', 'gpio-relais');
        });
    }

    if (motorConfig.skipGpio) {
        logging.add("Skipping real gpioMotor init due to skipGpio", 'info', 'gpio-relais');
    }
    else {
        global.klappeHoch = gpioControl.createGpioWrapper(motorConfig.pinHoch, 'high');
        global.klappeRunter = gpioControl.createGpioWrapper(motorConfig.pinRunter, 'high');
        motorConfig.gpioInit = true;
        logging.add("motorGpio initialized", 'info', 'gpio-relais');
    }

    if (motorConfig.skipGpioIR) {
        logging.add("Skipping real gpioIR init due to skipGpio", 'info', 'gpio-relais');
    }
    else {
        global.gpioIR = gpioControl.createGpioWrapper(motorConfig.pinIR, 'high');
        motorConfig.gpioIRInit = true;
        logging.add("gpioIR initialized", 'info', 'gpio-relais');
    }
};

// New Promise-based initialization function
initPromise = () => {
    return new Promise((resolve, reject) => {
        logging.add("Initializing GPIO module...", 'info', 'gpio-relais');
        
        try {
            if(!motorConfig.skipGpio || !motorConfig.skipGpioIR) {
                gpioControl.configure(motorConfig.skipGpio)
                    .then(() => {
                        // Initialize GPIO components
                        if (motorConfig.skipGpio) {
                            logging.add("Skipping real gpioMotor init due to skipGpio", 'info', 'gpio-relais');
                        }
                        else {
                            global.klappeHoch = gpioControl.createGpioWrapper(motorConfig.pinHoch, 'high');
                            global.klappeRunter = gpioControl.createGpioWrapper(motorConfig.pinRunter, 'high');
                            motorConfig.gpioInit = true;
                            logging.add("motorGpio initialized", 'info', 'gpio-relais');
                        }

                        if (motorConfig.skipGpioIR) {
                            logging.add("Skipping real gpioIR init due to skipGpio", 'info', 'gpio-relais');
                        }
                        else {
                            global.gpioIR = gpioControl.createGpioWrapper(motorConfig.pinIR, 'high');
                            motorConfig.gpioIRInit = true;
                            logging.add("gpioIR initialized", 'info', 'gpio-relais');
                        }
                        
                        // Add artificial 10-second delay for testing sequential loading
                        logging.add("GPIO initialized - adding artificial 10-second delay for testing", 'info', 'gpio-relais');
                        setTimeout(() => {
                            logging.add("Artificial delay complete, continuing initialization", 'info', 'gpio-relais');
                            resolve();
                        }, 10000);
                    })
                    .catch(err => {
                        logging.add(`Error initializing GPIO control: ${err.message}`, 'error', 'gpio-relais');
                        reject(new Error(`GPIO initialization failed: ${err.message}`));
                    });
            } else {
                // If skipping GPIO, just initialize the components and resolve
                if (motorConfig.skipGpio) {
                    logging.add("Skipping real gpioMotor init due to skipGpio", 'info', 'gpio-relais');
                }
                if (motorConfig.skipGpioIR) {
                    logging.add("Skipping real gpioIR init due to skipGpio", 'info', 'gpio-relais');
                }
                
                // Add artificial 10-second delay for testing sequential loading (even when skipping)
                logging.add("GPIO skipped - adding artificial 10-second delay for testing", 'info', 'gpio-relais');
                setTimeout(() => {
                    logging.add("Artificial delay complete, continuing initialization", 'info', 'gpio-relais');
                    resolve();
                }, 10000);
            }
        } catch (error) {
            logging.add(`Unexpected error in GPIO initialization: ${error.message}`, 'error', 'gpio-relais');
            reject(error);
        }
    });
};

stoppeMotor = () => {
    logging.add("Stoppe Motor", 'info', 'gpio-relais');
    if (motorConfig.skipGpio) {
        logging.add("Skipping real gpioMotor init due to skipGpio", 'info', 'gpio-relais');
    }
    else if (!motorConfig.gpioInit) {
        logging.add("Cannot stop motor, Gpio not initialized", 'warn', 'gpio-relais');
    }
    else {
        global.klappeHoch.writeSync(motorConfig.motorAus);
        global.klappeRunter.writeSync(motorConfig.motorAus);
    }
}

fahreHoch = () => {
    logging.add("Fahre hoch", 'info', 'gpio-relais');
    if (motorConfig.skipGpio === true) {
        logging.add("Skipping real gpioMotor init due to skipGpio", 'info', 'gpio-relais');
    }
    else if (motorConfig.gpioInit === false) {
        logging.add("Cannot go up, Gpio not initialized", 'warn', 'gpio-relais');
    }
    else {
        setNightVision(false);
        global.klappeHoch.writeSync(motorConfig.motorEin);
        global.klappeRunter.writeSync(motorConfig.motorAus);
    }
}

fahreRunter = () => {
    logging.add("Fahre runter", 'info', 'gpio-relais');
    logging.add(`skipGpio: ${motorConfig.skipGpio}  gpioInit: ${motorConfig.gpioInit}`, 'info', 'gpio-relais');
    if (motorConfig.skipGpio === true) {
        logging.add("Skipping real gpioMotor init due to skipGpio", 'info', 'gpio-relais');
    }
    else if (motorConfig.gpioInit === false) {
        logging.add("Cannot go down, Gpio not initialized", 'warn', 'gpio-relais');
    }
    else {
        setNightVision(false);
        global.klappeHoch.writeSync(motorConfig.motorAus);
        global.klappeRunter.writeSync(motorConfig.motorEin);
    }
}

setNightVision = (onoff) => {
    if(onoff == true && motorIsOn()) {
        logging.add("gpio-relais.setNightVision(true) Motor is running, cannot turn on IR!", "debug", 'gpio-relais');
        return false;
    }
    else if (onoff == true || onoff == false) {
        let newStatus = (onoff == true ? motorConfig.motorEin : motorConfig.motorAus);
        logging.add("gpio-relais.setNightVision(true) Turning Night Vision "+(onoff ? "on" : "off"), "debug", 'gpio-relais');
        global.gpioIR.writeSync(newStatus);
        IRlogChange(onoff);
        return true;
    }
    else {
        logging.add("gpio-relais.setNightVision(onoff) invalid argument true/false", 'warn', 'gpio-relais'); 
        return false;
    }
}

motorIsOn = () => {
    // Returns if the motor is moving
    return global.klappeHoch.readSync() == motorConfig.motorEin || global.klappeRunter.readSync() == motorConfig.motorEin;
}

IRIsOn = () => {
    let status = global.gpioIR.readSync() == motorConfig.motorEin;
    logging.add(`IR on: ${status}`, 'info', 'gpio-relais'); 
    return status;
}

IRlogChange = (newStatus) => {
    let now = performance.now();
    if(nightVisionStatus.value !== null) {
        logging.add('Night vision changed from '+ nightVisionStatus.value +' to '+ newStatus +' after '+ Math.floor((now - nightVisionStatus.time) / 1000) + 's', 'info', 'gpio-relais');
    }
    nightVisionStatus.time = now;
    nightVisionStatus.value = newStatus;
}

exports.configure = configure;
exports.init = init;
exports.initPromise = initPromise;
exports.stoppeMotor = stoppeMotor;
exports.fahreHoch = fahreHoch;
exports.fahreRunter = fahreRunter;
exports.setNightVision = setNightVision;
exports.IRIsOn = IRIsOn;
