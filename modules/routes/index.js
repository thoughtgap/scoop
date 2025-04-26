const express = require('express');
const router = express.Router();
const logging = require('../utilities/logging.js');

// Import route modules
const hatchRoutes = require('./hatch.js');
const cameraRoutes = require('./camera.js');
const shellyRoutes = require('./shelly.js');
const lightRoutes = require('./light.js');

// Initialize route modules
function initialize(modules) {
    // Initialize each route module with its corresponding module
    hatchRoutes.initialize(modules.hatch);
    cameraRoutes.initialize(modules.camera);
    shellyRoutes.initialize(modules.shelly);
    lightRoutes.initialize(modules.heating);

    // Mount routes
    router.use('/klappe', hatchRoutes);
    router.use('/cam', cameraRoutes);
    router.use('/shelly', shellyRoutes);
    router.use('/light', lightRoutes);

    // Root redirect
    router.get('/', (req, res) => {
        res.redirect('/status');
    });

    // System status endpoint
    router.get('/status', (req, res) => {
        const status = {
            hatch: modules.hatch ? modules.hatch.getStatus() : 'not initialized',
            camera: modules.camera ? modules.camera.getStatus() : 'not initialized',
            shelly: modules.shelly ? modules.shelly.getStatus() : 'not initialized',
            heating: modules.heating ? modules.heating.getStatus() : 'not initialized'
        };
        res.json(status);
    });

    // System logs endpoint
    router.get('/log', (req, res) => {
        const logs = logging.getLogs();
        res.json(logs);
    });

    // System reset endpoint
    router.get('/reset', (req, res) => {
        // TODO: Implement system reset functionality
        res.json({ message: 'System reset not implemented yet' });
    });

    // Error handling middleware
    router.use((err, req, res, next) => {
        logging.add(`Error in route ${req.path}: ${err.message}`, 'error');
        res.status(500).json({ error: err.message });
    });
}

module.exports = router;
module.exports.initialize = initialize; 