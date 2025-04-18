const { exec } = require('child_process');
const { promisify } = require('util');
const logging = require('../utilities/logging.js');

const execAsync = promisify(exec);

// Wrapper class to maintain compatibility with onoff's Gpio interface
class GpioWrapper {
    constructor(pin, direction) {
        this.pin = pin;
        this.direction = direction;
    }

    writeSync(value) {
        gpioControl.setPin(this.pin, value === 1 ? 'high' : 'low').catch(err => {
            logging.add(`Error writing to pin ${this.pin}: ${err.message}`, 'error');
        });
    }

    readSync() {
        return gpioControl.getPin(this.pin).then(state => {
            return state === 'high' ? 1 : 0;
        }).catch(err => {
            logging.add(`Error reading pin ${this.pin}: ${err.message}`, 'error');
            return 0;
        });
    }
}

class GpioControl {
    constructor() {
        this.initialized = false;
        this.skipGpio = false;
        this.pins = new Map(); // Stores pin configurations: { mode: 'in'|'out', state: 'high'|'low' }
    }

    async configure(skipGpio = false) {
        this.skipGpio = skipGpio;
        if (skipGpio) {
            logging.add("Skipping real GPIO init due to skipGpio");
            return;
        }

        try {
            // Test if pinctrl is available
            await execAsync('which pinctrl');
            this.initialized = true;
            logging.add("GPIO control initialized successfully");
        } catch (error) {
            logging.add("Error initializing GPIO control: " + error.message, 'error');
            throw error;
        }
    }

    async ensurePinMode(pin, mode) {
        const currentConfig = this.pins.get(pin);
        if (currentConfig && currentConfig.mode === mode) {
            return; // Pin is already in the correct mode
        }

        try {
            // Configure pin as input or output
            const command = `sudo pinctrl set ${pin} ${mode === 'in' ? 'ip' : 'op'}`;
            await execAsync(command);
            
            // Update pin cache
            this.pins.set(pin, { mode, state: null });
            logging.add(`GPIO ${pin} configured as ${mode}`);
        } catch (error) {
            logging.add(`Error configuring GPIO pin ${pin}: ${error.message}`, 'error');
            throw error;
        }
    }

    async setPin(pin, state) {
        if (this.skipGpio) {
            logging.add(`Skipping GPIO operation: pin ${pin} would be set to ${state}`);
            return;
        }

        if (!this.initialized) {
            throw new Error("GPIO control not initialized");
        }

        try {
            // Ensure pin is configured as output
            await this.ensurePinMode(pin, 'out');

            // 'dh' = set high (3.3V), 'dl' = set low (0V)
            const value = state === 'high' ? 'dh' : 'dl';
            const command = `sudo pinctrl set ${pin} op ${value}`;
            await execAsync(command);
            
            // Update pin cache
            const pinConfig = this.pins.get(pin);
            pinConfig.state = state;
            logging.add(`GPIO ${pin} set to ${state}`);
        } catch (error) {
            logging.add(`Error setting GPIO pin ${pin}: ${error.message}`, 'error');
            throw error;
        }
    }

    async getPin(pin) {
        if (this.skipGpio) {
            logging.add(`Skipping GPIO operation: would read pin ${pin}`);
            return 'unknown';
        }

        if (!this.initialized) {
            throw new Error("GPIO control not initialized");
        }

        try {
            const { stdout } = await execAsync(`sudo pinctrl get ${pin}`);
            // Parse the output to determine state
            // Example output: "25: op -- -- | hi"
            const state = stdout.includes('hi') ? 'high' : 'low';
            const mode = stdout.includes('ip') ? 'in' : 'out';
            
            // Update pin cache
            this.pins.set(pin, { mode, state });
            logging.add(`GPIO ${pin} is ${state}`);
            return state;
        } catch (error) {
            logging.add(`Error reading GPIO pin ${pin}: ${error.message}`, 'error');
            throw error;
        }
    }

    // Helper method to get current pin configuration
    getPinConfig(pin) {
        return this.pins.get(pin);
    }

    // Factory method to create a GpioWrapper instance
    createGpioWrapper(pin, direction) {
        return new GpioWrapper(pin, direction);
    }
}

// Create and export a singleton instance
const gpioControl = new GpioControl();
module.exports = gpioControl; 