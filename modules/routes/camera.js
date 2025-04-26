const express = require('express');
const router = express.Router();
const logging = require('../utilities/logging.js');

// This module will be initialized with the camera module
let camera = null;

function initialize(cameraModule) {
    camera = cameraModule;
}

// Take new photo
router.get('/new', (req, res) => {
    if (!camera) {
        res.status(503).send({ error: 'Camera module not initialized' });
        return;
    }
    let takeIt = camera.queue();
    if (takeIt == true) {
        res.send({ success: true, message: "foto in auftrag gegeben. abholen unter /cam" });
    } else {
        res.send({ success: false, message: "foto nicht in auftrag gegeben - " + takeIt });
    }
});

// Get photo
router.get('/:timestamp?', (req, res) => {
    if (!camera) {
        res.status(503).send({ error: 'Camera module not initialized' });
        return;
    }
    if (camera.getJpg()) {
        res.contentType('image/jpeg');
        res.send(camera.getJpg());
    } else {
        res.send({ message: "geht nicht" });
    }
});

// Take night vision photo
router.get('/nightvision/new', (req, res) => {
    if (!camera) {
        res.status(503).send({ error: 'Camera module not initialized' });
        return;
    }
    let takeIt = camera.queueNightvision();
    if (takeIt == true) {
        res.send({ success: true, message: "nacht-foto kommt sofort. abholen unter /nightvision" });
    } else {
        res.send({ success: false, message: "nacht-foto wird als nächstes aufgenommen - " + takeIt });
    }
});

// Get night vision photo
router.get('/nightvision/:timestamp?', (req, res) => {
    if (!camera) {
        res.status(503).send({ error: 'Camera module not initialized' });
        return;
    }
    if (camera.getIRJpg()) {
        res.contentType('image/jpeg');
        res.send(camera.getIRJpg());
    } else {
        res.send({ message: "geht nicht" });
    }
});

// SVG endpoints
router.get('/nightvisionsvg/:timestamp?', (req, res) => {
    if (!camera) {
        res.status(503).send({ error: 'Camera module not initialized' });
        return;
    }
    // TODO: Implement SVG endpoints
    res.send({ message: "not implemented" });
});

router.get('/camsvg/:timestamp?', (req, res) => {
    if (!camera) {
        res.status(503).send({ error: 'Camera module not initialized' });
        return;
    }
    // TODO: Implement SVG endpoints
    res.send({ message: "not implemented" });
});

router.get('/cam.svg', (req, res) => {
    if (!camera) {
        res.status(503).send({ error: 'Camera module not initialized' });
        return;
    }
    // TODO: Implement SVG endpoints
    res.send({ message: "not implemented" });
});

router.get('/cam.jpg', (req, res) => {
    if (!camera) {
        res.status(503).send({ error: 'Camera module not initialized' });
        return;
    }
    if (camera.getJpg()) {
        res.contentType('image/jpeg');
        res.send(camera.getJpg());
    } else {
        res.send({ message: "geht nicht" });
    }
});

module.exports = router;
module.exports.initialize = initialize; 