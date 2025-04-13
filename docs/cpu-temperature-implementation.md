# CPU Temperature Module Implementation

## Current Implementation

The CPU temperature module (`temperature-cpu.js`) uses the `pi-temperature` npm package to read the CPU temperature of a Raspberry Pi. Here's how it works:

### Key Components

1. **Status Object**
   ```javascript
   var status = {
       enabled: false,      // Module enabled state
       busy: false,         // Reading in progress flag
       values: {
           temperature: null,  // Current temperature value
       },
       error: null,         // Last error message
       time: null,          // Last reading timestamp
       intervalSec: null    // Reading interval in seconds
   }
   ```

2. **Configuration**
   - Module can be disabled via `global.skipModules.cputemp`
   - Reading interval is configurable
   - Falls back to mock values when disabled or on error

3. **Temperature Reading**
   - Uses `pi-temperature` package's `measure()` function
   - Asynchronous reading with callback
   - Implements error handling and retry logic
   - Logs readings to both console and ThingSpeak

### Mock Mode
When disabled or on error, the module generates realistic mock values:
- Base temperature of 45°C
- Daily cycle variation (40-50°C)
- Uses sine wave for smooth temperature changes

## Required Updates for New Debian

The `pi-temperature` package has been updated to support the new Debian version's temperature reading method. The changes needed are:

1. **Update Package Version**
   ```bash
   npm install pi-temperature@latest
   ```

2. **Verify New Command**
   The package now uses the correct command for reading CPU temperature on newer Debian versions:
   ```bash
   cat /sys/class/thermal/thermal_zone0/temp
   ```

3. **Implementation Changes**
   - No code changes required in `temperature-cpu.js`
   - The package handles the command differences internally
   - Same API (`measure()` function) is maintained

## Testing Steps

1. Install updated package
2. Verify module initialization:
   ```javascript
   const cpuTemp = require("pi-temperature");
   ```
3. Test temperature reading:
   ```javascript
   cpuTemp.measure((err, temp) => {
       console.log(`Temperature: ${temp}°C`);
   });
   ```
4. Monitor logs for successful readings
5. Verify ThingSpeak integration

## Error Handling

The module already includes robust error handling:
- Catches initialization errors
- Handles reading failures
- Provides mock values as fallback
- Logs all errors and warnings

## Integration Points

1. **Configuration**
   - Called from `stall.js` during initialization
   - Uses global configuration for interval and module state

2. **Data Flow**
   - Readings sent to ThingSpeak (field4)
   - Logged to console with debug level
   - Available via status object for other modules

3. **Dependencies**
   - `pi-temperature` for actual readings
   - `moment` for timestamps
   - `logging` for output 