var logging = require('./logging.js');
const request = require('request');
const fs = require('fs');

var telegramConfig = {
    botId: null,
    token: null,
    chatId: null
}

configure = (sendMessages, botId, token, chatId) => {
    telegramConfig.sendMessages = sendMessages;
    telegramConfig.botId = botId;
    telegramConfig.token = token;
    telegramConfig.chatId = chatId;
    logging.add(`Telegram Configured - ${telegramConfig.sendMessages ? 'enabled' : 'disabled'}`);
};

/**
 * Send a photo via Telegram
 * @param {string} message Message to be sent
 */
const sendMessages = (message) => {
    if (!telegramConfig.sendMessages) { return false; }
    request("https://api.telegram.org/" + telegramConfig.botId + ":" + telegramConfig.token + "/sendMessages?chat_id=" + telegramConfig.chatId + "&text=" + encodeURIComponent(message), {}, (err, res, body) => { });
}

/**
 * Send a photo via Telegram
 * @param {string} photo base64 encoded image file
 */
const sendPhoto = (photo) => {
    if (!telegramConfig.sendMessages) { return false; }

    logging.add("Telegram SendPhoto");
    const url = `https://api.telegram.org/${telegramConfig.botId}:${telegramConfig.token}/sendPhoto?chat_id=${telegramConfig.chatId}`;

    const post = request.post({url}, (err, httpResponse, body) => !err
        ? logging.add('Telegram Upload successful!','debug')
        : logging.add("Telegram Upload failed")
    );

    const form = post.form();
    form.append(
        'photo',
        Buffer.from(photo, 'base64'),
        {filename: 'image.jpg'}
    );
}

exports.configure = configure;
exports.sendMessages = sendMessages;
exports.sendPhoto = sendPhoto;
