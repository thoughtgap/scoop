# scoop 🐔
This is our **smart chicken coop** server. It is providing a web-based backend and (somewhat limited and hacky) frontend to control the coop's hatch and view its webcam and sensor data.

- [scoop 🐔](#scoop-)
  - [Screenshot](#screenshot)
  - [Hardware](#hardware)
  - [Configuration File](#configuration-file)
  - [Times relative to sun movement](#times-relative-to-sun-movement)
    - [Hatch Automation](#hatch-automation)
    - [Lighting and heating via light bulb (using Shelly)](#lighting-and-heating-via-light-bulb-using-shelly)
    - [Telegram Messages](#telegram-messages)
  - [Install & Run](#install--run)
  - [Web Endpoints](#web-endpoints)
    - [General](#general)
    - [Hatch](#hatch)
      - [Corrections](#corrections)
    - [Webcam](#webcam)
    - [Administrative](#administrative)
    - [Coop Event Stream](#coop-event-stream)
    - [Shelly Integration](#shelly-integration)
    - [Heating / Light](#heating--light)

## Screenshot
![Screenshot of Frontend](https://github.com/thoughtgap/scoop/blob/master/frontend/scoop-screenshot.png?raw=true)

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
* Shelly v1 230V relay for a light bulb.
* Light bulb. I use a 60W traditional bulb, it does a good job heating the coop up in the winter and keeping temperatures above 0°C.

## Configuration File
Parameters are configured in `config.json`.

## Times relative to sun movement
For both hatch automation and lighting schedule, you can  maintain fixed times or times relative to `sunset`, `sunrise`, or any other [suncalc](https://github.com/mourner/suncalc) object like `dusk` or `dawn`. For relative times to work, location needs to be maintained in `config.json`. You always have to specify an offset (if you want something to happen at exactly sunset, use `sunset+0`).

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

### Hatch Automation
You can maintain fixed times or times relative to sun movement (see below) to schedule the hatch to open or close.

```json
"hatchAutomation": {
    "openTimes": ["06:30", "08:00", "sunrise+30","sunrise+60","sunrise+120","sunrise+180","sunrise+240","sunrise+300","sunrise+360","sunrise+420"],
    "closeTimes": ["22:00","sunset-30"]
}
```

### Lighting and heating via light bulb (using Shelly)
You can install a light bulb in the coop for illumination and heating (in this case non-LED is preferred) purposes.
The light bulb is operated by a Shelly relay, see below.

In the config, you can define conditions for the light to turn on, based on the combination of the following factors:
* time frame (`from` - `to`, mandatory!) - can be set relative to sun movement
* current temperature falls below the defined minimum temperature (`heatBelowC`, optional, set to `null` if you don't want to use this) 
* door state (`door`, accepts open/closed/any) - e.g. only turn light on if door is closed
* To prevent disco feeling for the chicks, the light stays on for a minimum duration of `minimumLightMins` minutes (if it does not run out of time frame within this time).

I can reliably heat my 1x1m coop with a 60W bulb to keep it above freezing temperatures.

To prevent that the light turns on in the middle of a cold night, the time frame in which the bulb should be used for heating is to be specified in the same notation as the hatch automation times.

The config parameters for the light are:

```json
  "light": {
    "enabled": true,
    "conditions": [
      {
        "door": "closed",
        "heatBelowC": null,
        "from": "sunrise+20",
        "to":   "dusk+30",
        "enabled": true,
        "minimumLightMins": 10
      },
      {
        "door": "any",
        "heatBelowC": 5,
        "from": "sunrise-20",
        "to":   "dusk+30",
        "enabled": true,
        "minimumLightMins": 10
      },
    ]
  },
```

### Telegram Messages
For monitoring if hatch operated fine (my relais is a bit worn out), scoop can send webcam pictures via Telegram after stopping the hatch. This is implemented with a Telegram bot, which sends messages to a specific chat (the owner's phone).
This feature is *not* implemented as a bi-directional bot (e.g. request pictures or operate hatch via message to the bot), it's a one-way street, to keep  it simple.
For the bot configuration, you'll need a token and chat ID, see [Telegram Bot API](https://core.telegram.org/bots/api).

![Screenshot of Telegram Message](https://github.com/thoughtgap/scoop/blob/master/docs/telegram-bot.png?raw=true)

## Install & Run
Install with `npm install`.

Run with `node stall.js`. I host the service with [pm2](https://pm2.keymetrics.io/).


## Web Endpoints

### General
* `/frontend/index.html` A hacky frontend (AngularJS)
* `/status` Status as JSON-Object
* ~~`/log` Latest log messages~~ (not implemented)

### Hatch
Moves the hatch up or down for a specified duration (`config.maxSekundenEinWeg`).
* `/hoch` Move hatch up
* `/runter` Move hatch down

Move the hatch for a specified duration (in seconds) - be careful!
* `/hoch/:duration`
* `/runter/:duration`

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
  * heating


### Shelly Integration
A Shelly v1 230V relay is used to control the light bulb inside the coop.
It can be controlled from the coop:

* `/shelly/turn/on` turns the relay/bulb on.
* `/shelly/turn/off` turns it off.
* `/shelly/update` can be used to poll the current Shelly state from its web endpoint.

In case the Shelly app/web interface is used, shelly also informs the coop if it was triggered by using *I/O URL actions*:

* OUTPUT SWITCHED ON URL: `http://<coop>/shelly/inform/on`
* OUTPUT SWITCHED OFF URL: `http://<coop>/shelly/inform/off`

### Heating / Light
* `/heating/enable` turns the lighting logic on. beware, light turns on only if all defined preconditions (time-frame, door state, cold temps) are met.
* `/heating/disable` turns it off.
