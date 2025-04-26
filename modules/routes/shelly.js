const express = require('express');
const router = express.Router();
const logging = require('../utilities/logging.js');

// This module will be initialized with the shelly module
let shelly = null;

function initialize(shellyModule) {
    shelly = shellyModule;
}

// Inform endpoint
router.get('/inform/:onoff', (req, res) => {
    if (!shelly) {
        res.status(503).send({ error: 'Shelly module not initialized' });
        return;
    }
    const result = shelly.inform(req.params.onoff);
    res.send(result);
});

// Turn endpoint
router.get('/turn/:onoff', (req, res) => {
    if (!shelly) {
        res.status(503).send({ error: 'Shelly module not initialized' });
        return;
    }
    const result = shelly.turn(req.params.onoff);
    res.send(result);
});

// Update endpoint
router.get('/update', (req, res) => {
    if (!shelly) {
        res.status(503).send({ error: 'Shelly module not initialized' });
        return;
    }
    const result = shelly.getShellyStatus();
    res.send(result);
});

module.exports = router;
module.exports.initialize = initialize; 