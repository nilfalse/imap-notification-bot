const moment = require('moment');
const _ = require('lodash');
const util = require('util');
const MailParser = require('mailparser').MailParser;
const EventEmitter = require('events').EventEmitter;

function ImapWatch(imap, box) {
    this.imap = imap;

    this.imap.connect();

    this.connected = false;

    this.imap.on('error', err => this.emit('error', err));

    this.imap.on('ready', () => {
        this.connected = true;
        this.imap.openBox(box, false, (err) => {
            if (err) {
                this.emit('error', err);
            } else {
                this.emit('success');
            }
        });
    });

    this.imap.on('mail', fetchNewMsgs.bind(this));

    this.imap.on('end', () => {
        this.connected = false;
        this.emit('end');
    });

    this.imap.on('close', err => {
        this.connected = false;
        if (err) {
            this.emit('error', err);
        }

        this.emit('close');
    });
}

function fetchNewMsgs(msgCount) {
    const yesterday = moment().subtract(2, 'days').toDate();

    this.imap.search(['UNSEEN', ['SINCE', yesterday]], (err, uids) => {
        if (err) {
            this.emit('error', err);
            return this;
        }

        const length = uids.length;
        const uidsToFetch = _.chain(uids).sortBy().slice((length - msgCount), length).value();

        if (uidsToFetch && uidsToFetch.length > 0) {
            fetch.call(this, uidsToFetch);
        }
    });
}

function fetch(uids) {
    const opts = {
        markSeen: false,
        bodies: ''
    };

    const fetcher = this.imap.fetch(uids, opts);

    fetcher.on('message', msg => {
        const parser = new MailParser();
        let attributes;

        msg.once('attributes', attrs => attributes = attrs);
        msg.on('body', messageBody);
        msg.on('end', messageEnd);

        parser.on('end', parserEnd.bind(this));

        function messageBody(stream) {
            let buffer = '';
            stream.on('data', chunk => buffer += chunk);
            stream.once('end', () => parser.write(buffer));
        }

        function parserEnd(mailObj) {
            mailObj.attributes = attributes;
            this.emit('mail', mailObj);
        }

        function messageEnd() {
            parser.end();
        }
    });

    fetcher.once('error', err => this.emit('error', err));
}

util.inherits(ImapWatch, EventEmitter);

module.exports = function(imap, box) {
    return new ImapWatch(imap, box);
};

