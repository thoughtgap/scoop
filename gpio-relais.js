var logging = require('./logging.js');
const { isDuration } = require('moment');
const performance = require('perf_hooks').performance;
const gpioControl = require('./modules/gpio-control.js');

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

configure = async (pinHoch, pinRunter, pinIR, motorAus, motorEin, skipGpio, skipGpioIR) => {
    motorConfig.configured = true;
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

    await init();
};

init = async () => {    
    if (motorConfig.skipGpio && motorConfig.skipGpioIR) {
        logging.add("Skipping all GPIO init due to skipGpio and skipGpioIR");
        return;
    }

    try {
        await gpioControl.configure(motorConfig.skipGpio && motorConfig.skipGpioIR);
        
        if (!motorConfig.skipGpio) {
            // Configure motor pins as outputs
            await gpioControl.setPin(motorConfig.pinHoch, motorConfig.motorAus ? 'high' : 'low');
            await gpioControl.setPin(motorConfig.pinRunter, motorConfig.motorAus ? 'high' : 'low');
            motorConfig.gpioInit = true;
            logging.add("motorGpio initialized");
        }

        if (!motorConfig.skipGpioIR) {
            // Configure IR pin as output
            await gpioControl.setPin(motorConfig.pinIR, motorConfig.motorAus ? 'high' : 'low');
            motorConfig.gpioIRInit = true;
            logging.add("gpioIR initialized");
        }
    } catch (error) {
        logging.add("Error initializing GPIO: " + error.message, 'error');
        throw error;
    }
};

stoppeMotor = async () => {
    logging.add("Stoppe Motor");
    if (motorConfig.skipGpio) {
        logging.add("Skipping real gpioMotor init due to skipGpio");
    }
    else if (!motorConfig.gpioInit) {
        logging.add("Cannot stop motor, Gpio not initialized");
    }
    else {
        await gpioControl.setPin(motorConfig.pinHoch, motorConfig.motorAus ? 'high' : 'low');
        await gpioControl.setPin(motorConfig.pinRunter, motorConfig.motorAus ? 'high' : 'low');
    }
}

fahreHoch = async () => {
    logging.add("Fahre hoch");
    if (motorConfig.skipGpio === true) {
        logging.add("Skipping real gpioMotor init due to skipGpio");
    }
    else if (motorConfig.gpioInit === false) {
        logging.add("Cannot go up, Gpio not initialized");
    }
    else {
        await setNightVision(false);
        await gpioControl.setPin(motorConfig.pinHoch, motorConfig.motorEin ? 'high' : 'low');
        await gpioControl.setPin(motorConfig.pinRunter, motorConfig.motorAus ? 'high' : 'low');
    }
}

fahreRunter = async () => {
    logging.add("Fahre runter");
    logging.add(`skipGpio: ${motorConfig.skipGpio}  gpioInit: ${motorConfig.gpioInit}`);
    if (motorConfig.skipGpio === true) {
        logging.add("Skipping real gpioMotor init due to skipGpio");
    }
    else if (motorConfig.gpioInit === false) {
        logging.add("Cannot go down, Gpio not initialized");
    }
    else {
        await setNightVision(false);
        await gpioControl.setPin(motorConfig.pinHoch, motorConfig.motorAus ? 'high' : 'low');
        await gpioControl.setPin(motorConfig.pinRunter, motorConfig.motorEin ? 'high' : 'low');
    }
}

setNightVision = async (onoff) => {
    if (motorConfig.skipGpio || motorConfig.skipGpioIR) {
        logging.add("Skipping night vision control due to skipGpio/skipGpioIR", "debug");
        return true;
    }
    
    if(onoff == true && await motorIsOn()) {
        logging.add("gpio-relais.setNightVision(true) Motor is running, cannot turn on IR!","debug");
        return false;
    }
    else if (onoff == true || onoff == false) {
        let newStatus = (onoff == true ? motorConfig.motorEin : motorConfig.motorAus);
        logging.add("gpio-relais.setNightVision(true) Turning Night Vision "+(onoff ? "on" : "off"),"debug");
        await gpioControl.setPin(motorConfig.pinIR, newStatus ? 'high' : 'low');
        IRlogChange(onoff);
        return true;
    }
    else {
        logging.add("gpio-relais.setNightVision(onoff) invalid argument true/false",'warn'); 
        return false;
    }
}

motorIsOn = async () => {
    // Returns if the motor is moving
    if (motorConfig.skipGpio) {
        return false;
    }
    const hochState = await gpioControl.getPin(motorConfig.pinHoch);
    const runterState = await gpioControl.getPin(motorConfig.pinRunter);
    return (hochState === (motorConfig.motorEin ? 'high' : 'low')) || 
           (runterState === (motorConfig.motorEin ? 'high' : 'low'));
}

IRIsOn = async () => {
    if (motorConfig.skipGpioIR) {
        return false;
    }
    const status = await gpioControl.getPin(motorConfig.pinIR) === (motorConfig.motorEin ? 'high' : 'low');
    logging.add(`IR on: ${status}`); 
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
