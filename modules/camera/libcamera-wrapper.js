const { libcamera } = require('libcamera');
const fs = require('fs');
const path = require('path');

// Ensure tmp directory exists in the camera module directory
const tmpDir = path.join(__dirname, 'tmp');
if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir);
}

class LibCameraWrapper {
    constructor(config = {}) {
        this.config = {
            width: 1296,
            height: 972,
            quality: 20,
            nopreview: true,
            rotation: 180,
            ...config
        };
        // Fixed temp file path
        this.tempFile = path.join(tmpDir, 'camera.jpg');
    }

    async takePhoto() {
        try {
            // Take the photo and save to fixed temp file
            await libcamera.jpeg({
                config: {
                    width: this.config.width,
                    height: this.config.height,
                    quality: this.config.quality,
                    nopreview: this.config.nopreview,
                    output: this.tempFile,
                    rotation: 180
                }
            });
            
            // Read the file into a buffer and return it
            return fs.readFileSync(this.tempFile);
        } catch (error) {
            throw new Error(`Failed to take photo: ${error.message}`);
        }
    }
}

module.exports = LibCameraWrapper; 