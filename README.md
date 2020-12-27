# schicke-chicks 🐔
This is our smart chicken coop server. It is providing a web-based backend and (somewhat limited and hacky) frontend to control the coop's hatch and view its webcam and sensor data.

## Hardware
The control unit consists of:

* Raspberry Pi as control unit
* 12V DC power supply
* 12V motor (an old Ford window lifter) to wind the nylon thread that is lifting the hatch
* Relay to control motor and LED
* Webcam (Wide-Angle Raspberry Pi webcam)
* Infrared LED lamp for night vision (powered separately via 12V DC)
* BME280 Sensor (Temperature, Humidity, Pressure)
* Tactile Sensors to determine the hatch's final positions

## Configuration File
Parameters are configured in `config.json`.

### Hatch Automation
You can maintain fixed times and times relative to `sunset`, `sunrise`, or any other [suncalc](https://github.com/mourner/suncalc) object like `dusk` or `dawn`. For relative times to work, location needs to be maintained in `config.json`. You always have to specify an offset.

```json
"location": {
    "lat": 52.00, 
    "lon": 8.00
},
"hatchAutomation": {
    "openTimes": ["06:30", "08:00", "sunrise+30","sunrise+60","sunrise+120","sunrise+180","sunrise+240","sunrise+300","sunrise+360","sunrise+420"],
    "closeTimes": ["22:00","sunset-30"]
}
```

