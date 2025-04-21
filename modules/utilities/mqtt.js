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
        // Process any queued messages
        processMessageQueue();
    });

    client.on('error', (error) => {
        logging.add(`MQTT error: ${error}`, 'error');
    });

    client.on('close', () => {
        logging.add('MQTT connection closed', 'warn');
    });
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