# Sequential Loading Implementation Plan

## Overview
This document outlines the plan for implementing sequential loading in the chicken coop system and cleaning up the `stall.js` file.

## Current Issues
1. `stall.js` is monolithic and handles too many responsibilities
2. Module initialization is not properly sequenced
3. Route handlers are mixed with initialization code
4. Error handling during initialization is inconsistent

## Implementation Order

### Phase 1: Cleanup stall.js
The goal is to simplify `stall.js` by removing route handlers and organizing the code better.

#### Step 1: Create Route Module Structure
- [x] Create `modules/routes/index.js`
  - [x] Move HTTP middleware setup
  - [x] Move static file serving configuration
  - [x] Move all route handlers
  - [x] Implement proper error handling
  - [x] Add request logging

#### Step 2: Migrate Routes from stall.js
- [ ] Create migration plan for each route group:
  - [x] Core Routes (`/`, `/status`, `/log`, `/reset`)
  - [x] Hatch Routes (`/klappe/*`)
  - [x] Camera Routes (`/cam/*`)
  - [x] Shelly Routes (`/shelly/*`)
  - [x] Light Routes (`/light/*`)
- [ ] Update `stall.js` to use new route modules:
  ```javascript
  // In stall.js
  const routes = require('./modules/routes');
  
  // Replace all route definitions with:
  app.use('/', routes);
  ```
- [ ] Test each route group after migration
- [ ] Remove old route handlers from `stall.js`

#### Step 3: Organize Module Imports
- [ ] Group imports by category:
  - [ ] Core dependencies (express, fs, etc.)
  - [ ] Utility modules (logging, events)
  - [ ] Hardware modules (GPIO, sensors)
  - [ ] Integration modules (telegram, shelly)
  - [ ] Route modules

#### Step 4: Clean Configuration
- [ ] Move configuration loading to a separate function
- [ ] Add validation for required config values
- [ ] Add error handling for missing config

#### Step 5: Simplify Main Application
- [ ] Remove all route handlers (moved to routes module)
- [ ] Keep only essential setup:
  - [ ] Configuration loading
  - [ ] Logging setup
  - [ ] Module initialization
  - [ ] Server startup

### Phase 2: Implement Sequential Loading
After `stall.js` is cleaned up, implement proper sequential initialization.

#### Step 1: Create Initialization Module
- [ ] Create `modules/initialization/index.js`
- [ ] Define initialization sequence:
  ```javascript
  const initSequence = [
    {
      name: 'gpio',
      init: () => gpioRelais.configure(...)
    },
    {
      name: 'hatch',
      init: () => klappenModul.configure(...)
    },
    {
      name: 'parallel',
      init: () => Promise.all([
        bme280.configure(...),
        cpuTemp.configure(...),
        // ... other parallel init
      ])
    }
  ];
  ```

#### Step 2: Implement Sequential Initialization
- [ ] Create initialization function:
  ```javascript
  async function initialize() {
    for (const step of initSequence) {
      try {
        await step.init();
        logging.add(`Initialized ${step.name}`, 'info');
      } catch (error) {
        logging.add(`Failed to initialize ${step.name}: ${error}`, 'error');
        throw error;
      }
    }
  }
  ```

#### Step 3: Add Error Handling
- [ ] Implement proper error handling for each module
- [ ] Add logging for initialization failures
- [ ] Add graceful shutdown on critical errors

#### Step 4: Update Module Dependencies
- [ ] Modify each module to support Promise-based initialization
- [ ] Add proper error handling in each module
- [ ] Update module exports to include initialization status

## Testing Plan
For each phase, test:
- [ ] Module initialization
- [ ] Error handling
- [ ] Route functionality
- [ ] System startup
- [ ] Graceful shutdown

## Rollback Plan
1. Keep backup of original `stall.js`
2. Document all changes
3. Test each phase before proceeding
4. Have ability to revert changes if issues arise

## Success Criteria
- [ ] `stall.js` is simplified and focused
- [ ] All modules initialize in correct order
- [ ] No initialization race conditions
- [ ] Proper error handling and logging
- [ ] All routes work as before
- [ ] Cleaner, more maintainable code structure 