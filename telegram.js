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

    var buf = Buffer.from(photo, 'base64');
    fs.writeFile('image.jpg', buf, () => {

        const formData = {
            photo: fs.createReadStream(__dirname + '/image.jpg')
        };

        request.post({
            url: url,
            formData: formData
        }, function optionalCallback(err, httpResponse, body) {
            if (err) {
                logging.add("Telegram Upload failed");
            }
            logging.add('Telegram Upload successful!', 'debug');
        });
    });
}

exports.configure = configure;
exports.sendMessages = sendMessages;
exports.sendPhoto = sendPhoto;
