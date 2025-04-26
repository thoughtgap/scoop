# Sequential Module Loading Implementation

## Overview
This document details the implementation of sequential module loading for the scoop application. The goal is to ensure modules are loaded in a specific order to guarantee system stability and correct initialization.

## Loading Sequence
The required loading sequence is:

1. GPIO module initialization
2. Hatch module initialization 
3. Remaining modules in parallel
4. Start serving the application

## Implementation Steps

### Step 1: GPIO Module with Promise-based Initialization
We've added a Promise-based initialization function to the GPIO module while keeping the original init function for backward compatibility:

1. Added `initPromise()` method to gpio-relais.js that returns a Promise
2. Kept original behavior for backward compatibility
3. Added proper error handling

```javascript
// In gpio-relais.js
initPromise = () => {
    return new Promise((resolve, reject) => {
        // Initialization logic
        // ...
        resolve(); // when successful
        // or
        reject(new Error('Error message')); // on failure
    });
};

exports.initPromise = initPromise;
```

### Step 2: Sequential Loading in stall.js
Modified stall.js to use the Promise-based initialization:

```javascript
// In stall.js
// Configure GPIO
gpioRelais.configure(...);

// Initialize GPIO first, then the rest of the application
gpioRelais.initPromise()
  .then(() => {
    // All the remaining initialization code goes here
    // ...

    // Start the server at the end
    app.listen(3000, function () {
      logging.add('listening on port 3000!', 'info', 'stall');
    });
  })
  .catch(error => {
    logging.add(`GPIO initialization failed: ${error.message}`, 'error', 'stall');
    process.exit(1);
  });
```

### Next Steps
For the next phase, we'll implement the same pattern for the Hatch module:

1. Add a Promise-based initialization function to the Hatch module
2. Update stall.js to initialize Hatch after GPIO init completes
3. Keep the code structure simple and maintain backward compatibility

## Implementation Notes
- Minimal changes focused on the sequential loading requirement
- Maintained all existing function signatures and interfaces
- Preserved original code structure as much as possible
- Used Promise chaining for a clean control flow 