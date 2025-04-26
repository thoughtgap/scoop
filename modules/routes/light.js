const express = require('express');
const router = express.Router();
const logging = require('../utilities/logging.js');

// This module will be initialized with the heating module
let heating = null;

function initialize(heatingModule) {
    heating = heatingModule;
}

// Light control endpoints
router.get('/enable', (req, res) => {
    if (!heating) {
        res.status(503).send({ error: 'Heating module not initialized' });
        return;
    }
    const result = heating.enableLight();
    res.send(result);
});

router.get('/disable', (req, res) => {
    if (!heating) {
        res.status(503).send({ error: 'Heating module not initialized' });
        return;
    }
    const result = heating.disableLight();
    res.send(result);
});

// Heating control endpoints
router.get('/heating/enable', (req, res) => {
    if (!heating) {
        res.status(503).send({ error: 'Heating module not initialized' });
        return;
    }
    const result = heating.enableHeating();
    res.send(result);
});

router.get('/heating/disable', (req, res) => {
    if (!heating) {
        res.status(503).send({ error: 'Heating module not initialized' });
        return;
    }
    const result = heating.disableHeating();
    res.send(result);
});

module.exports = router;
module.exports.initialize = initialize; 