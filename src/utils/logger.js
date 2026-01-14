const winston = require('winston');
const config = require('../config');

const consoleTransport = new winston.transports.Console({
    format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
    ),
    handleExceptions: false,
    handleRejections: false
});

consoleTransport.on('error', (err) => {
    if (err.code === 'EPIPE' || err.code === 'ERR_STREAM_DESTROYED') {
        return;
    }
});

const logger = winston.createLogger({
    level: config.server.env === 'production' ? 'info' : 'debug',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
            return `${timestamp} [${level.toUpperCase()}]: ${message} ${metaStr}`;
        })
    ),
    transports: [
        consoleTransport,
        new winston.transports.File({
            filename: 'logs/error.log',
            level: 'error'
        }),
        new winston.transports.File({
            filename: 'logs/combined.log'
        })
    ],
    exitOnError: false
});

process.stdout.on('error', (err) => {
    if (err.code === 'EPIPE') {
        return;
    }
});

process.stderr.on('error', (err) => {
    if (err.code === 'EPIPE') {
        return;
    }
});

module.exports = logger;
