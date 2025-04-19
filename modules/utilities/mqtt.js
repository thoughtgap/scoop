const mqtt = require('mqtt');
const config = require('../../config.json');
const logging = require('./logging.js');
const klappe = require('../hatch/klappe.js');

let client = null;
let messageQueue = [];

const connect = () => {
    if (!config.mqtt || !config.mqtt.broker) {
        logging.add('MQTT broker not configured', 'warn');
        return;
    }

    const options = {
        clientId: 'scoop-' + Math.random().toString(16).substr(2, 8),
        clean: true,
        connectTimeout: 4000,
        username: config.mqtt.username,
        password: config.mqtt.password,
        reconnectPeriod: 1000,
    };

    client = mqtt.connect(config.mqtt.broker, options);

    client.on('connect', () => {
        logging.add('Connected to MQTT broker', 'info');
        setupHomeAssistantDiscovery();
        setupCommandSubscriptions();
        // Process any queued messages
        processMessageQueue();
    });

    client.on('message', (topic, message) => {
        handleCommand(topic, message);
    });

    client.on('error', (error) => {
        logging.add(`MQTT error: ${error}`, 'error');
    });

    client.on('close', () => {
        logging.add('MQTT connection closed', 'warn');
    });
};

const setupCommandSubscriptions = () => {
    if (!client || !client.connected) return;
    
    // Subscribe to hatch command topics
    client.subscribe('scoop/hatch/command');
    logging.add('Subscribed to hatch command topics', 'info');
};

const handleCommand = (topic, message) => {
    try {
        const payload = JSON.parse(message.toString());
        
        switch(topic) {
            case 'scoop/hatch/command':
                handleHatchCommand(payload);
                break;
        }
    } catch (error) {
        logging.add(`Error handling MQTT command: ${error}`, 'error');
    }
};

const handleHatchCommand = (payload) => {
    if (!payload.action) {
        logging.add('Hatch command missing action', 'warn');
        return;
    }

    switch(payload.action) {
        case 'open':
            klappe.klappeFahren('runter');
            break;
        case 'close':
            klappe.klappeFahren('hoch');
            break;
        case 'stop':
            klappe.stoppeKlappe();
            break;
        default:
            logging.add(`Unknown hatch command action: ${payload.action}`, 'warn');
    }
};

const processMessageQueue = () => {
    if (!client || !client.connected) return;
    
    const queueLength = messageQueue.length;
    if (queueLength > 0) {
        logging.add(`Processing MQTT message queue (${queueLength} messages)`, 'info');
    }
    
    while (messageQueue.length > 0) {
        const { topic, message } = messageQueue.shift();
        client.publish(topic, message.toString(), { retain: true }, (err) => {
            if (err) {
                logging.add(`MQTT publish error: ${err}`, 'error');
            }
        });
    }
};

const setupHomeAssistantDiscovery = () => {
    if (!config.mqtt.discovery) return;

    const discoveryPrefix = config.mqtt.discoveryPrefix || 'homeassistant';
    const device = {
        identifiers: ['scoop'],
        name: 'Scoop',
        manufacturer: 'Scoop',
        model: 'Smart Chicken Coop',
        sw_version: '1.0.0'
    };

    // Temperature sensor
    const tempConfig = {
        name: 'Temperature',
        unique_id: 'scoop_temperature',
        device_class: 'temperature',
        state_topic: 'scoop/temperature',
        value_template: '{{ value_json.value }}',
        unit_of_measurement: '°C',
        device: device,
        json_attributes_topic: 'scoop/temperature',
        json_attributes_template: '{{ value_json | tojson }}',
        availability_topic: 'scoop/status',
        payload_available: 'online',
        payload_not_available: 'offline'
    };
    publish(`${discoveryPrefix}/sensor/scoop/temperature/config`, JSON.stringify(tempConfig));

    // Humidity sensor
    const humidityConfig = {
        name: 'Humidity',
        unique_id: 'scoop_humidity',
        device_class: 'humidity',
        state_topic: 'scoop/humidity',
        value_template: '{{ value_json.value }}',
        unit_of_measurement: '%',
        device: device,
        json_attributes_topic: 'scoop/humidity',
        json_attributes_template: '{{ value_json | tojson }}',
        availability_topic: 'scoop/status',
        payload_available: 'online',
        payload_not_available: 'offline'
    };
    publish(`${discoveryPrefix}/sensor/scoop/humidity/config`, JSON.stringify(humidityConfig));

    // CPU Temperature sensor
    const cpuTempConfig = {
        name: 'CPU Temperature',
        unique_id: 'scoop_cpu_temperature',
        device_class: 'temperature',
        icon: 'mdi:raspberry-pi',
        state_topic: 'scoop/cpu_temperature',
        value_template: '{{ value_json.value }}',
        unit_of_measurement: '°C',
        device: device,
        json_attributes_topic: 'scoop/cpu_temperature',
        json_attributes_template: '{{ value_json | tojson }}',
        availability_topic: 'scoop/status',
        payload_available: 'online',
        payload_not_available: 'offline'
    };
    publish(`${discoveryPrefix}/sensor/scoop/cpu_temperature/config`, JSON.stringify(cpuTempConfig));

    // Hatch Door sensor
    const hatchDoorConfig = {
        name: 'Hatch',
        unique_id: 'scoop_hatch_door',
        device_class: 'door',
        icon: 'mdi:door',
        state_topic: 'scoop/hatch/door',
        value_template: '{{ value_json.state }}',
        device: device,
        json_attributes_topic: 'scoop/hatch/door',
        json_attributes_template: '{{ value_json | tojson }}',
        availability_topic: 'scoop/status',
        payload_available: 'online',
        payload_not_available: 'offline'
    };
    publish(`${discoveryPrefix}/binary_sensor/scoop_hatch_door/config`, JSON.stringify(hatchDoorConfig));

    // Hatch Movement sensor
    const hatchMovementConfig = {
        name: 'Hatch Movement',
        unique_id: 'scoop_hatch_movement',
        device_class: 'moving',
        icon: 'mdi:arrow-up-down',
        state_topic: 'scoop/hatch/movement',
        value_template: '{{ value_json.state }}',
        device: device,
        json_attributes_topic: 'scoop/hatch/movement',
        json_attributes_template: '{{ value_json | tojson }}',
        availability_topic: 'scoop/status',
        payload_available: 'online',
        payload_not_available: 'offline'
    };
    publish(`${discoveryPrefix}/binary_sensor/scoop_hatch_movement/config`, JSON.stringify(hatchMovementConfig));

    // Hatch Cover
    const hatchCoverConfig = {
        name: 'Hatch',
        unique_id: 'scoop_hatch_cover',
        device_class: 'garage',
        icon: 'mdi:garage',
        command_topic: 'scoop/hatch/command',
        state_topic: 'scoop/hatch/door',
        value_template: '{{ value_json.state }}',
        device: device,
        json_attributes_topic: 'scoop/hatch/door',
        json_attributes_template: '{{ value_json | tojson }}',
        availability_topic: 'scoop/status',
        payload_available: 'online',
        payload_not_available: 'offline',
        payload_open: '{"action": "close"}',
        payload_close: '{"action": "open"}',
        state_open: 'ON',
        state_closed: 'OFF',
        optimistic: false,
        retain: true
    };
    publish(`${discoveryPrefix}/cover/scoop_hatch_cover/config`, JSON.stringify(hatchCoverConfig));

    // Publish initial availability
    publish('scoop/status', 'online');
};

const publish = (topic, message) => {
    if (!client || !client.connected) {
        // Queue the message if MQTT is not ready
        messageQueue.push({ topic, message });
        logging.add(`MQTT message queued (queue length: ${messageQueue.length})`, 'debug');
        return;
    }

    client.publish(topic, message.toString(), { retain: true }, (err) => {
        if (err) {
            logging.add(`MQTT publish error: ${err}`, 'error');
        }
    });
};

// Initialize connection
connect();

exports.publish = publish;