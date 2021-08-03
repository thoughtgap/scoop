var logging = require('./logging.js');
const { isDuration } = require('moment');
const performance = require('perf_hooks').performance;

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
        ", pinHoch " + motorConfig.pinHoch +
        ", pinRunter " + motorConfig.pinRunter +
        ", pinIR " + motorConfig.pinIR +
        ", motorAus " + motorConfig.motorAus +
        ", motorEin " + motorConfig.motorEin +
        ", skipGpio " + motorConfig.skipGpio + 
        ", skipGpioIR " + motorConfig.skipGpioIR
    );

    init();
};

init = () => {    
    if(!motorConfig.skipGpio || !motorConfig.skipGpioIR) {
        global.Gpio = require('onoff').Gpio;
    }

    if (motorConfig.skipGpio) {
        logging.add("Skipping real gpioMotor init due to skipGpio");
    }
    else {
        global.klappeHoch = new Gpio(motorConfig.pinHoch, 'high');
        global.klappeRunter = new Gpio(motorConfig.pinRunter, 'high');
        motorConfig.gpioInit = true;
        logging.add("motorGpio initialized");
    }

    if (motorConfig.skipGpioIR) {
        global.gpioIR = null;
        logging.add("Skipping real gpioIR init due to skipGpio");
    }
    else {
        global.gpioIR = new Gpio(motorConfig.pinIR, 'high');
        motorConfig.gpioIRInit = true;
        logging.add("gpioIR initialized");
    }
};

stoppeMotor = () => {
    logging.add("Stoppe Motor");
    if (motorConfig.skipGpio) {
        logging.add("Skipping real gpioMotor init due to skipGpio");
    }
    else if (!motorConfig.gpioInit) {
        logging.add("Cannot stop motor, Gpio not initialized");
    }
    else {
        klappeHoch.writeSync(motorConfig.motorAus);
        klappeRunter.writeSync(motorConfig.motorAus);
    }
}

fahreHoch = () => {
    logging.add("Fahre hoch");
    if (motorConfig.skipGpio === true) {
        logging.add("Skipping real gpioMotor init due to skipGpio");
    }
    else if (motorConfig.gpioInit === false) {
        logging.add("Cannot go up, Gpio not initialized");
    }
    else {
        setNightVision(false);
        klappeHoch.writeSync(motorConfig.motorEin);
        klappeRunter.writeSync(motorConfig.motorAus);
    }
}

fahreRunter = () => {
    logging.add("Fahre runter");
    logging.add(`skipGpio: ${motorConfig.skipGpio}  gpioInit: ${motorConfig.gpioInit}`);
    if (motorConfig.skipGpio === true) {
        logging.add("Skipping real gpioMotor init due to skipGpio");
    }
    else if (motorConfig.gpioInit === false) {
        logging.add("Cannot go down, Gpio not initialized");
    }
    else {
        setNightVision(false);
        klappeHoch.writeSync(motorConfig.motorAus);
        klappeRunter.writeSync(motorConfig.motorEin);
    }
}

setNightVision = (onoff) => {
    if(onoff == true && motorIsOn()) {
        logging.add("gpio-relais.setNightVision(true) Motor is running, cannot turn on IR!","debug");
        return false;
    }
    else if (onoff == true || onoff == false) {

        let newStatus = (onoff == true ? motorConfig.motorEin : motorConfig.motorAus);
        logging.add("gpio-relais.setNightVision(true) Turning Night Vision "+(onoff ? "on" : "off"),"debug");
        if (gpioIR) gpioIR.writeSync(newStatus);
        IRlogChange(onoff);
        return true;
    }
    else {
        logging.add("gpio-relais.setNightVision(onoff) invalid argument true/false",'warn'); 
        return false;
    }
}

motorIsOn = () => {
    // Returns if the motor is moving
    return klappeHoch.readSync() == motorConfig.motorEin || klappeRunter.readSync() == motorConfig.motorEin;
}

IRIsOn = () => {
    if (!gpioIR) return false;
    
    let status = gpioIR.readSync() == motorConfig.motorEin;
    logging.add(`IR on:  ${status}`); 
    return status;
}

IRlogChange = (newStatus) => {
    let now = performance.now();
    if(nightVisionStatus.value !== null) {
        logging.add('Night vision changed from '+ nightVisionStatus.value +' to '+ newStatus +' after '+ Math.floor((now - nightVisionStatus.time) / 1000) + 's');
    }
    nightVisionStatus.time = now;
    nightVisionStatus.value = newStatus;
}

exports.configure = configure;
exports.stoppeMotor = stoppeMotor;
exports.fahreHoch = fahreHoch;
exports.fahreRunter = fahreRunter;
exports.setNightVision = setNightVision;
exports.IRIsOn = IRIsOn;
