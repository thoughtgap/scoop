var logging = require('./logging.js');

var status = {
    enabled: false,
    lastMessage: null,
    lastPhoto: null,
    lastError: null
};

var config = {
    token: null,
    chatId: null,
    skipModule: false
};

configure = (sendMessages, token, chatId) => {
    // Check if module should be skipped
    if (global.skipModules && global.skipModules.telegram) {
        config.skipModule = true;
        status.enabled = false;
        logging.add("Telegram module disabled in config");
        return;
    }

    // Check if telegram is enabled in local config
    if (!sendMessages) {
        config.skipModule = true;
        status.enabled = false;
        logging.add("Telegram module disabled in local config");
        return;
    }

    config.token = token;
    config.chatId = chatId;

    // Validate configuration
    if (!token || !chatId) {
        config.skipModule = true;
        status.enabled = false;
        logging.add("Telegram module disabled - missing token or chatId");
        return;
    }

    // Try to initialize the request module
    try {
        const request = require('request');
        status.enabled = true;
        logging.add("Telegram module initialized successfully");
    } catch (e) {
        config.skipModule = true;
        status.enabled = false;
        logging.add("Telegram module not available - request module missing", "warn");
    }
};

/**
 * Send a message via Telegram
 * @param {string} message Message to be sent
 */
const sendMessage = (message) => {
    if (config.skipModule || !status.enabled) {
        logging.add(`Telegram message not sent (disabled): ${message}`, "debug");
        status.lastMessage = message;
        return false;
    }

    try {
        const request = require('request');
        const url = `https://api.telegram.org/bot${config.token}/sendMessage?chat_id=${config.chatId}&text=${encodeURIComponent(message)}`;
        
        request(url, {}, (err, res, body) => {
            if (err) {
                logging.add(`Telegram message failed: ${err}`, "warn");
                status.lastError = err;
            } else {
                logging.add(`Telegram message sent: ${message}`, "debug");
                status.lastMessage = message;
                status.lastError = null;
            }
        });
        return true;
    } catch (e) {
        logging.add(`Telegram message error: ${e}`, "warn");
        status.lastError = e;
        return false;
    }
};

/**
 * Send a photo via Telegram
 * @param {string} photo base64 encoded image file
 */
const sendPhoto = (photo) => {
    if (config.skipModule || !status.enabled) {
        logging.add("Telegram photo not sent (disabled)", "debug");
        status.lastPhoto = "skipped";
        return false;
    }

    try {
        const request = require('request');
        logging.add("Telegram sending photo", 'debug');
        const url = `https://api.telegram.org/bot${config.token}/sendPhoto?chat_id=${config.chatId}`;

        const post = request.post({url}, (err, httpResponse, body) => {
            if (err) {
                logging.add(`Telegram photo failed: ${err}`, "warn");
                status.lastError = err;
            } else {
                logging.add('Telegram photo sent successfully', 'debug');
                status.lastPhoto = new Date().toISOString();
                status.lastError = null;
            }
        });

        const form = post.form();
        form.append(
            'photo',
            Buffer.from(photo, 'base64'),
            {filename: 'image.jpg'}
        );
        return true;
    } catch (e) {
        logging.add(`Telegram photo error: ${e}`, "warn");
        status.lastError = e;
        return false;
    }
};

exports.configure = configure;
exports.sendMessage = sendMessage;
exports.sendMessages = sendMessage; // Keep old name for compatibility
exports.sendPhoto = sendPhoto;
exports.status = status;