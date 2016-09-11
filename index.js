const bunyan = require('bunyan');

const bot = require('./bot');
const configureDb = require('./models');


require('dotenv').config();

const app = (function() {
    const name = process.env.APP_NAME || 'imap-notification-bot';
    const log = bunyan.createLogger({ name });

    return { name, log };
}());

const models = app.models = configureDb(app);

bot(app);
