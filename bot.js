const TelegramBot = require('node-telegram-bot-api');
const Imap = require('imap');
const imapWatch = require('./imap-watch');


module.exports = function(app) {
    const { log, models } = app;
    const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
    const parseCredentials = require('./credentials-parser');

    // TODO: populate from db on start
    app.mailCheckers = [];

    bot.getMe().then(function(botInfo) {
        log.info({ bot: botInfo }, '@' + botInfo.username + ' started');
    });

    bot.onText(/\/echo (.+)/, function (msg, match) {
        bot.sendChatAction(msg.chat.id, 'typing');
        setTimeout(() => {
            // bot.sendPhoto(msg.chat.id, 'cat.jpg', {caption: 'Lovely kittens'});
            bot.sendMessage(msg.chat.id, match[1]);
        }, 1000);
    });

    bot.onText(/\/confirm/, function (msg) {
        Promise.resolve()
            .then(() => bot.sendChatAction(msg.chat.id, 'typing'))
            .then(() => models.Confirmation.findOne({ _id: msg.chat.id }).exec())
            .then(c => {
                if (!c) {
                    log.warn({ chat_id: msg.chat.id }, 'confirmation was not found');
                    return bot.sendMessage(msg.chat.id, 'begin by sending /start');
                }
                const acc = {
                    _id: msg.chat.id + '@' + c.email,
                    user: c.email,
                    password: c.possiblePassword,
                    host: c.server,
                    port: c.port,
                    tls: c.tls,
                    box: c.box
                }
                log.info({ c }, 'confirmation found');
                return models.Account.update({ _id: acc._id }, acc, { upsert: true, setDefaultsOnInsert: true }).exec()
                .then(() => createMailListener(acc))
                .then(
                    listener => {
                        listener.on('mail', mail => {
                            bot.sendMessage(msg.chat.id, notificationMessageTemplate(mail));
                        });
                        // TODO last connected
                        app.mailCheckers.push(listener);
                        return models.Confirmation.remove({ _id: msg.chat.id })
                            .then(() => c.email + ' confirmed');
                    },
                    err => {
                        log.error({ chat_id: msg.chat.id, stack: err.stack }, err.message);
                        return 'could not verify account credentials';
                    }
                )
                .then(reply => bot.sendMessage(msg.chat.id, reply));
            })
            .then(
                () => {},
                (err) => {
                    log.error({ stack: err.stack }, err.message);
                    bot.sendMessage(msg.chat.id, 'Sorry, something went wrong.')
                }
            );
    });

    bot.onText(/\/cancel/, function (msg) {
        // TODO
        credentials.delete(msg.chat.id);
        bot.sendMessage(msg.from.id, 'canceled');
    });

    bot.onText(/\/start/, function (msg) {
        let reply = 'Hey, ' + msg.from.first_name + '!\n\n';
        const promises = [
            bot.sendChatAction(msg.chat.id, 'typing')
        ];

        try {
            const creds = parseCredentials(msg);
            const server = creds.server || 'imap.' + creds.email.substring(creds.email.indexOf('@') + 1);

            log.info({ msg, creds }, 'got new credentials');
            promises.push(
                promises[0].then(() => {
                    return models.Confirmation.findByIdAndUpdate(msg.chat.id, {
                        $set: {
                            email: creds.email,
                            possiblePassword: creds.possiblePassword,
                            server
                        }
                    }, { upsert: true, new: true })
                        .then(c => log.info({ c }, 'created confirmation'))
                })
            );

            reply += 'We are almost set up.\n';
            reply += 'e-Mail: ' + creds.email + '\n';
            reply += 'Server: ' + server + '\n';
            reply += 'Password: ' + creds.possiblePassword + '\n\n';
            reply += 'Just /confirm to start using these credentials for notifications.\n';
            reply += 'Send /cancel in order to clear these settings.\n';
        } catch(err) {
            if (!Array.isArray(err)) {
                reply += 'Something went really wrong while processing your message.\n\n';
                reply += 'Please, try again later.';
                log.error({ stack: err.stack }, err.message);
                return;
            }

            log.warn({ msg, err: err.map(e => e.message) }, 'could not process command');
            reply += 'I could not understand your needs.\n';
            reply += 'Following problems occured while reading your message:\n';
            reply += err.map(e => ' - ' + e.message).join('\n') + '\n\n';
            reply += 'Please, provide me with some better structured credentials like:\n';
            reply += '/start me@example.org passw0rd\n';
            reply += ' OR\n';
            reply += '/start me@example.org imap.example.com pa%%w0rd';
        } finally {
            Promise.all(promises).then(
                () => bot.sendMessage(msg.chat.id, reply),
                (err) => {
                    log.error({ err }, 'promise failed!');
                    bot.sendMessage(msg.chat.id, 'Sorry, something went wrong.')
                }
            );
        }
    });
};

function createMailListener(opts) {
    const params = {
        user: opts.user,
        host: opts.host,
        port: opts.port,
        tls: opts.tls,
        autotls: 'always',
        keepalive: {
            interval: 10000,
            idleInterval: 300000,  // 5 mins
            forceNoop: true
        }
    };
    if (!opts.password) {
        params.xoauth2 = opts.xoauth2;
    } else {
        params.password = opts.password;
    }
    const imap = new Imap(params);

    return new Promise(function(resolve, reject) {
        const notifier = imapWatch(imap, opts.box);
        notifier.on('error', err => reject(err));
        notifier.on('success', () => resolve(notifier));
    });
}

function notificationMessageTemplate(mail) {
    const sender = mail.from.map(f => (f.name + ' ' + f.address).trim()).join(', ');
    const to = mail.to.map(f => (f.name + ' ' + f.address).trim()).join(', ');
    return 'To: ' + to + '\n' +
        'From ' + sender + ':\n' +
        mail.subject + '\n\n' +
        (mail.text || mail.html);
}
