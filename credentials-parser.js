module.exports = function parseCredentials(msg) {
    const errors = [];

    const email = msg.entities.reduce((email, entity) => {
        if ('email' !== entity.type) {
            return email;
        }
        if (email) {
            errors.push(new Error('more than one e-mail specified in a start message'))
            return email;
        }
        return msg.text.slice(entity.offset, entity.offset + entity.length);
    }, null);
    if (!email) {
        errors.push(new Error('no e-mail specified in a start message'));
    }

    const server = msg.entities.reduce((server, entity) => {
        if ('url' !== entity.type) {
            return server;
        }
        if (server) {
            errors.push(new Error("you've specified more than one server address"));
            return server;
        }
        return msg.text.slice(entity.offset, entity.offset + entity.length);
    }, null);

    const possiblePassword = msg.entities.reduce((rv, entity) => {
        const offset = entity.offset - rv.offset;
        return {
            offset: rv.offset + entity.length,
            text: rv.text.substring(0, offset) + rv.text.substring(offset + entity.length)
        };
    }, { offset: 0, text: msg.text }).text.trim();
    if (0 === possiblePassword.length) {
        errors.push(new Error('could not parse password out of your message'));
    }

    if (errors.length > 0) {
        throw errors;
    }

    return {
        email,
        server,
        possiblePassword
    };
};
