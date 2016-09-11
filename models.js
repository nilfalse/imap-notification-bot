const mongoose = require('mongoose');


const Account = mongoose.model('Account', new mongoose.Schema({
    _id: String,
    user: String,
    password: String,
    host: String,
    port: { type: Number, default: 993 },
    tls: { type: Boolean, default: true },
    box: { type: String, default: 'Inbox' }
}));

const Confirmation = mongoose.model('Confirmation', new mongoose.Schema({
    _id: Number,
    email: { type: String, required: true },
    possiblePassword: { type: String, required: true },
    server: String,
    port: { type: Number, default: 993 },
    tls: { type: Boolean, default: true },
    box: { type: String, default: 'Inbox' },
    created_at: { type: Date, default: Date.now }
}));

module.exports = function configureDb(app) {
    const log = app.log;
    const mongoUrl = process.env.MONGO_URL;

    mongoose.Promise = global.Promise;
    mongoose.connect(mongoUrl);
    mongoose.connection.on('error', err => log.error({ err }, 'MongoDB error: ' + err.message));
    mongoose.connection.once('open', () => log.trace('MongoDB connected, ' + mongoUrl));

    return {
        Confirmation,
        Account
    };
};
