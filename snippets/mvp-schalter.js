var Gpio = require('onoff').Gpio;
const button = new Gpio(20, 'in', 'both');
const button1 = new Gpio(21, 'in', 'both');

console.log(button.readSync());
console.log(button1.readSync());

button.watch((err, value) => {
    console.log("button" + button.readSync());
});

button1.watch((err, value) => {
    console.log("button pressed")
});