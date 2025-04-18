const mqtt = require('mqtt');
const config = require('../../config.json');
const logging = require('./logging.js');

let client = null;

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
    });

    client.on('error', (error) => {
        logging.add(`MQTT error: ${error}`, 'error');
    });

    client.on('close', () => {
        logging.add('MQTT connection closed', 'warn');
    });
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
        name: 'Scoop Temperature',
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
    client.publish(`${discoveryPrefix}/sensor/scoop_temperature/config`, JSON.stringify(tempConfig), { retain: true });

    // Humidity sensor
    const humidityConfig = {
        name: 'Scoop Humidity',
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
    client.publish(`${discoveryPrefix}/sensor/scoop_humidity/config`, JSON.stringify(humidityConfig), { retain: true });

    // CPU Temperature sensor
    const cpuTempConfig = {
        name: 'Scoop CPU Temperature',
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
    client.publish(`${discoveryPrefix}/sensor/scoop_cpu_temperature/config`, JSON.stringify(cpuTempConfig), { retain: true });

    // Publish initial availability
    client.publish('scoop/status', 'online', { retain: true });
};

const publish = (topic, message) => {
    if (!client || !client.connected) {
        logging.add('MQTT client not connected', 'warn');
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