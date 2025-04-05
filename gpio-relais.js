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
    skipModules: {
        motor: false,
        ir: false
    }
}

var nightVisionStatus = {
    value: null,
    time: null
}

configure = (pinHoch, pinRunter, pinIR, motorAus, motorEin, skipModules) => {
    motorConfig.configured = true;
    motorConfig.pinHoch = pinHoch;
    motorConfig.pinHoch = pinHoch;
    motorConfig.pinRunter = pinRunter;
    motorConfig.pinIR = pinIR;
    motorConfig.motorAus = motorAus;
    motorConfig.motorEin = motorEin;
    motorConfig.skipModules = {
        motor: skipModules.motor || false,
        ir: skipModules.ir || false
    };

    logging.add("Motor Configure: " +
        "  configured " + motorConfig.configured +
        ", pinHoch " + motorConfig.pinHoch +
        ", pinRunter " + motorConfig.pinRunter +
        ", pinIR " + motorConfig.pinIR +
        ", motorAus " + motorConfig.motorAus +
        ", motorEin " + motorConfig.motorEin +
        ", skipMotor " + motorConfig.skipModules.motor + 
        ", skipIR " + motorConfig.skipModules.ir
    );

    init();
};

init = () => {    
    if(!motorConfig.skipModules.motor || !motorConfig.skipModules.ir) {
        global.Gpio = require('onoff').Gpio;
    }

    if (motorConfig.skipModules.motor) {
        logging.add("Skipping real gpioMotor init due to skipModules.motor");
    }
    else {
        global.klappeHoch = new Gpio(motorConfig.pinHoch, 'high');
        global.klappeRunter = new Gpio(motorConfig.pinRunter, 'high');
        motorConfig.gpioInit = true;
        logging.add("motorGpio initialized");
    }

    if (motorConfig.skipModules.ir) {
        logging.add("Skipping real gpioIR init due to skipModules.ir");
    }
    else {
        global.gpioIR = new Gpio(motorConfig.pinIR, 'high');
        motorConfig.gpioIRInit = true;
        logging.add("gpioIR initialized");
    }
};

stoppeMotor = () => {
    logging.add("Stoppe Motor");
    if (motorConfig.skipModules.motor) {
        logging.add("Skipping real gpioMotor init due to skipModules.motor");
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
    if (motorConfig.skipModules.motor === true) {
        logging.add("Skipping real gpioMotor init due to skipModules.motor");
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
    logging.add(`skipMotor: ${motorConfig.skipModules.motor}  gpioInit: ${motorConfig.gpioInit}`);
    if (motorConfig.skipModules.motor === true) {
        logging.add("Skipping real gpioMotor init due to skipModules.motor");
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
    else if (onoff == true || onoff == false) {
        let newStatus = (onoff == true ? motorConfig.motorEin : motorConfig.motorAus);
        logging.add("gpio-relais.setNightVision(true) Turning Night Vision "+(onoff ? "on" : "off"),"debug");
        gpioIR.writeSync(newStatus);
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