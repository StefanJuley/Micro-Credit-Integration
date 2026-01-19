const winston = require('winston');
require('winston-daily-rotate-file');
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

const fileRotateTransport = new winston.transports.DailyRotateFile({
    filename: 'logs/app-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '30d',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
            return `${timestamp} [${level.toUpperCase()}]: ${message} ${metaStr}`;
        })
    )
});

const errorRotateTransport = new winston.transports.DailyRotateFile({
    filename: 'logs/error-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '30d',
    level: 'error',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
            return `${timestamp} [${level.toUpperCase()}]: ${message} ${metaStr}`;
        })
    )
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
        fileRotateTransport,
        errorRotateTransport
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
