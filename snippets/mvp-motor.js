var Gpio = require('onoff').Gpio;
const motorAus = 1;
const motorEin = 0;

const gpioPorts = {
    out: {
        hoch: 23,
        runter: 24
    }
};

klappeHoch = new Gpio(gpioPorts.out.hoch, 'high');
klappeRunter = new Gpio(gpioPorts.out.runter, 'high');
stoppeMotor();

console.log("Starte Motor");
klappeHoch.writeSync(motorEin);

function stoppeMotor() {
    klappeHoch.writeSync(motorAus);
    klappeRunter.writeSync(motorAus);
}

const sekunden = 1;
setTimeout(function motorSpaeterAnhalten() {
    console.log("Stoppe Motor");
    stoppeMotor();
}, sekunden * 1000);