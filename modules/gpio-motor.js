var logging = require('./logging.js');

var motorConfig = {
    configured: false,
    gpioInit: false,
    pinHoch: null,
    pinRunter: null,
    motorAus: null,
    motorEin: null,
    skipGpio: false
}

configure = (pinHoch, pinRunter, motorAus, motorEin, skipGpio) => {
    motorConfig.configured = true;
    motorConfig.pinHoch = pinHoch;
    motorConfig.pinHoch = pinHoch;
    motorConfig.pinRunter = pinRunter;
    motorConfig.motorAus = motorAus;
    motorConfig.motorEin = motorEin;
    motorConfig.skipGpio = skipGpio;

    logging.add("Motor Configure: "+
        "  configured " + motorConfig.configured + 
        ", pinHoch " + motorConfig.pinHoch + 
        ", pinRunter " + motorConfig.pinRunter + 
        ", motorAus " + motorConfig.motorAus + 
        ", motorEin " + motorConfig.motorEin + 
        ", skipGpio " + motorConfig.skipGpio
    );
    
    init();
};

init = () => {
    if(motorConfig.skipGpio) {
        logging.add("Skipping real gpioMotor init due to skipGpio");
    }
    else {
        global.Gpio = require('onoff').Gpio;
        global.klappeHoch = new Gpio(motorConfig.pinHoch, 'high');
        global.klappeRunter = new Gpio(motorConfig.pinRunter, 'high');
        motorConfig.gpioInit = true;
        logging.add("motorGpio initialized");
    }
};

stoppeMotor = () => {
    logging.add("Stoppe Motor");
    if(motorConfig.skipGpio) {
        logging.add("Skipping real gpioMotor init due to skipGpio");
    }
    else if(!motorConfig.gpioInit) {
        logging.add("Cannot stop motor, Gpio not initialized");
    }
    else {
        klappeHoch.writeSync(motorConfig.motorAus);
        klappeRunter.writeSync(motorConfig.motorAus);
    }
}

fahreHoch = () => {
    logging.add("Fahre hoch");
    if(motorConfig.skipGpio) {
        logging.add("Skipping real gpioMotor init due to skipGpio");
    }
    else if(!motorConfig.gpioInit) {
        logging.add("Cannot go up, Gpio not initialized");
    }
    else {
        klappeHoch.writeSync(motorConfig.motorEin);
        klappeRunter.writeSync(motorConfig.motorAus);
    }
}

fahreRunter = () => {
    logging.add("Fahre runter");
    if(motorConfig.skipGpio) {
        logging.add("Skipping real gpioMotor init due to skipGpio");
    }
    else if(!motorConfig.gpioInit) {
        logging.add("Cannot go down, Gpio not initialized");
    }
    else {
        klappeHoch.writeSync(motorConfig.motorAus);
        klappeRunter.writeSync(motorConfig.motorEin);
    }
}

exports.configure = configure;
exports.stoppeMotor = stoppeMotor;
exports.fahreHoch = fahreHoch;
exports.fahreRunter = fahreRunter;
