var sensor = require("node-dht-sensor");
 
const gpioPort = 13;
sensor.read(22, 14, function(err, temperature, humidity) {
  if (!err) {
    console.log(`temp: ${temperature}°C, humidity: ${humidity}%`);
  }
  else {
      console.log("error");
      console.log(err);
  }
});
