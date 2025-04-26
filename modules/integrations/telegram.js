var logging = require('../utilities/logging.js');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

var telegramConfig = {
    token: null,
    chatId: null
}

configure = (sendMessages, token, chatId) => {
    telegramConfig.sendMessages = sendMessages;
    telegramConfig.token = token;
    telegramConfig.chatId = chatId;
    logging.add(`Telegram Configured - ${telegramConfig.sendMessages ? 'enabled' : 'disabled'}`, 'info', 'telegram');
};

/**
 * Send a message via Telegram
 * @param {string} message Message to be sent
 */
const sendMessages = (message) => {
    if (!telegramConfig.sendMessages) { return false; }
    
    // Execute asynchronously but don't require await
    const promise = (async () => {
        try {
            await axios.get(`https://api.telegram.org/${telegramConfig.token}/sendMessage?chat_id=${telegramConfig.chatId}&text=${encodeURIComponent(message)}`);
            return true;
        } catch (err) {
            logging.add(`Error sending Telegram message: ${err.message}`, 'warn', 'telegram');
            return false;
        }
    })();
    
    // Handle errors silently to maintain backward compatibility
    promise.catch(err => {
        logging.add(`Error in sendMessages: ${err.message}`, 'error', 'telegram');
    });
    
    return promise;
}

/**
 * Send a photo via Telegram
 * @param {string} photo base64 encoded image file
 */
const sendPhoto = (photo) => {
    if (!telegramConfig.sendMessages) { return false; }

    logging.add("Telegram SendPhoto", 'debug', 'telegram');
    const url = `https://api.telegram.org/${telegramConfig.token}/sendPhoto`;
    
    // Execute asynchronously but don't require await
    const promise = (async () => {
        try {
            const form = new FormData();
            form.append(
                'chat_id',
                telegramConfig.chatId
            );
            form.append(
                'photo',
                Buffer.from(photo, 'base64'),
                {filename: 'image.jpg'}
            );
            
            const response = await axios.post(url, form, {
                headers: form.getHeaders()
            });
            
            logging.add('Telegram Upload successful!', 'debug', 'telegram');
            return true;
        } catch (err) {
            logging.add(`Telegram Upload failed: ${err.message}`, 'warn', 'telegram');
            return false;
        }
    })();
    
    // Handle errors silently to maintain backward compatibility
    promise.catch(err => {
        logging.add(`Error in sendPhoto: ${err.message}`, 'error', 'telegram');
    });
    
    return promise;
}

exports.configure = configure;
exports.sendMessages = sendMessages;
exports.sendPhoto = sendPhoto;
