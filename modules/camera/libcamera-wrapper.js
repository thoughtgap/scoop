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
        this.maxRetries = 3;
        this.retryDelay = 1000; // 1 second
    }

    async cleanup() {
        try {
            if (fs.existsSync(this.tempFile)) {
                fs.unlinkSync(this.tempFile);
            }
        } catch (error) {
            console.error('Failed to cleanup temp file:', error);
        }
    }

    async takePhoto() {
        let retries = 0;
        let lastError = null;

        while (retries < this.maxRetries) {
            try {
                // Cleanup any existing temp file before taking a new photo
                await this.cleanup();

                // Take the photo and save to fixed temp file
                await libcamera.jpeg({
                    config: {
                        width: this.config.width,
                        height: this.config.height,
                        quality: this.config.quality,
                        nopreview: this.config.nopreview,
                        output: this.tempFile,
                        rotation: this.config.rotation
                    }
                });
                
                // Verify the file was created and has content
                if (!fs.existsSync(this.tempFile)) {
                    throw new Error('Photo file was not created');
                }

                const fileSize = fs.statSync(this.tempFile).size;
                if (fileSize === 0) {
                    throw new Error('Photo file is empty');
                }
                
                // Read the file into a buffer and return it
                return fs.readFileSync(this.tempFile);
            } catch (error) {
                lastError = error;
                retries++;
                
                if (retries < this.maxRetries) {
                    console.warn(`Photo capture attempt ${retries} failed: ${error.message}. Retrying in ${this.retryDelay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                }
            }
        }

        // Cleanup on final failure
        await this.cleanup();
        throw new Error(`Failed to take photo after ${this.maxRetries} attempts. Last error: ${lastError.message}`);
    }
}

module.exports = LibCameraWrapper; 