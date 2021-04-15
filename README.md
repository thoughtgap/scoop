# schicke-chicks 🐔
This is our smart chicken coop server. It is providing a web-based backend and (somewhat limited and hacky) frontend to control the coop's hatch and view its webcam and sensor data.

- [schicke-chicks 🐔](#schicke-chicks-)
  - [Hardware](#hardware)
  - [Configuration File](#configuration-file)
    - [Hatch Automation](#hatch-automation)
    - [Heating via light bulb (via shelly)](#heating-via-light-bulb-via-shelly)
  - [Web Endpoints](#web-endpoints)
    - [General](#general)
    - [Hatch](#hatch)
      - [Corrections](#corrections)
    - [Webcam](#webcam)
    - [Administrative](#administrative)
    - [Coop Event Stream](#coop-event-stream)
    - [Shelly Integration](#shelly-integration)
    - [Heating](#heating)

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
* Shelly v1 230V relay for a light bulb

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

### Heating via light bulb (via shelly)
The heating module lights up the (preferrably non-LED) light bulb to warm up the coop if the temperatures are low. The light bulb is operated by a Shelly relay, see below.

The coop will only be heated if the current temperature falls below the treshold temperature set in `heatBelowC`.
To prevent disco feeling, the light stays on for a minimum duration of `minimumHeatingMins` minutes (if it does not run out of time frame within this time).

To prevent that the light turns on in the middle of a cold night, the time frame in which the bulb should be used for heating is to be specified in the same notation as the hatch automation times.

The config parameters for the heating are:

```json
"heating": {
    "enabled": true,
    "heatBelowC": 5,
    "minimumHeatingMins": 30,
    "timeFrame": {
      "from": "sunrise+0",
      "to": "dusk-60"
    }
  }
```


## Web Endpoints

### General
* `/frontend/index.html` A hacky frontend (AngularJS)
* `/status` Status as JSON-Object
* `/log` Latest log messages

### Hatch
Moves the hatch up or down for a specified duration (`config.maxSekundenEinWeg`).
* `/hoch` Move hatch up ()
* `/runter` Move hatch down

Move the hatch for a specified duration (in seconds) - be careful!
* `/hoch/:wielange`
* `/runter/:wielange`

#### Corrections
If the hatch is not entirely open/closed, small correction movements can be fired which won't affect the up/down position.
* `/korrigiere/hoch` Correct in 0.5s intervals (`config.korrekturSekunden`)
* `/korrigiere/runter`

To tell the hatch if it is up or down
* `/kalibriere/oben` Tell the coop that the hatch is up
* `/kalibriere/unten` Tell the coop that the hatch is down

### Webcam
* `/cam/new` Take a new picture
* `/cam/:timestamp?` Retrieve the webcam picture. Can optionally provide a timestamp (which isn't even used in backend) if the url needs to change to load the new licture
* `/camsvg/:timestamp?` Provides an svg version, with timestamp/current temps rendered into the picture
* `/nightvision/new` Take a new night vision (IR) picture
* `/nightvision/:timestamp?` Same as `/cam/:timestamp?`
* `/nightvisionsvg/:timestamp?`


### Administrative
* `/heapdump` will send a heapdump
* `/reset` will restart the application if it's run via nodemon (will modify a test.js file). Don't judge, please!


### Coop Event Stream
* `/events` A [server-sent events](https://www.npmjs.com/package/express-sse) (SSE) stream informing about things happening in the coop:
  * newWebcamPic
  * newWebcamPicIR
  * klappenStatus
  * klappenPosition
  * shellyRelayIsOn


### Shelly Integration
A Shelly v1 230V relay is used to control the light bulb inside the coop.
It can be controlled from the coop:

* `/shelly/turn/on` turns the relay/bulb on.
* `/shelly/turn/off` turns it off.
* `/shelly/update` can be used to poll the current Shelly state from its web endpoint.

In case the Shelly app/web interface is used, shelly also informs the coop if it was triggered by using *I/O URL actions*:

* OUTPUT SWITCHED ON URL: `http://<coop>/shelly/inform/on`
* OUTPUT SWITCHED OFF URL: `http://<coop>/shelly/inform/off`

### Heating
* `/heating/enable` turns the heating logic on. beware, light goes on only if all preconditions (time-frame, cold temps) are met!
* `/heating/disable` turns it off.