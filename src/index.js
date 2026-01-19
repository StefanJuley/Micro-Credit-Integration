require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
const config = require('./config');
const logger = require('./utils/logger');
const creditService = require('./services/creditService');
const moduleRoutes = require('./module/routes');

const app = express();

app.set('trust proxy', 1);

app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
    frameguard: false
}));

const allowedOrigins = [
    'https://pandashop.simla.com',
    'https://app.simla.com',
    'https://credit.pandashop.md',
    /\.simla\.com$/,
    /\.pandashop\.md$/
];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        const isAllowed = allowedOrigins.some(allowed =>
            allowed instanceof RegExp ? allowed.test(origin) : allowed === origin
        );
        callback(null, isAllowed);
    },
    credentials: true
}));

const limiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 100,
    message: { error: 'Too many requests, please try again later' }
});
app.use('/api/', limiter);

app.use(express.json());
app.use('/module', moduleRoutes);
app.use('/widget', moduleRoutes);

app.use('/static', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
}, express.static(path.join(__dirname, '../static')));

const simlaClient = require('./clients/simla');

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/api/order-credit-info', async (req, res) => {
    const { orderId } = req.body;

    if (!orderId) {
        return res.status(400).json({ success: false, error: 'orderId is required' });
    }

    try {
        const order = await simlaClient.getOrder(orderId);

        if (!order) {
            return res.status(404).json({ success: false, error: 'Order not found' });
        }

        const orderData = simlaClient.extractOrderData(order);

        res.json({
            success: true,
            creditCompany: orderData.creditCompany,
            applicationId: orderData.loanApplicationId,
            details: orderData.loanApplicationId ? {
                applicationId: orderData.loanApplicationId,
                bankStatus: null,
                crmStatus: orderData.payment?.status || null
            } : null
        });
    } catch (error) {
        logger.error('Failed to get order credit info', { orderId, error: error.message });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/send-application', async (req, res) => {
    const { orderId } = req.body;

    if (!orderId) {
        return res.status(400).json({ success: false, error: 'orderId is required' });
    }

    try {
        const result = await creditService.submitApplication(orderId);
        res.json(result);
    } catch (error) {
        logger.error('Failed to submit application', { orderId, error: error.message });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/check-status', async (req, res) => {
    const { orderId } = req.body;

    if (!orderId) {
        return res.status(400).json({ success: false, error: 'orderId is required' });
    }

    try {
        const result = await creditService.checkAndUpdateStatus(orderId);
        res.json({ success: true, result });
    } catch (error) {
        logger.error('Failed to check status', { orderId, error: error.message });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/check-all', async (req, res) => {
    try {
        const results = await creditService.checkAllPendingApplications();
        res.json({ success: true, results });
    } catch (error) {
        logger.error('Failed to check all applications', { error: error.message });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/send-files', async (req, res) => {
    const { orderId } = req.body;

    if (!orderId) {
        return res.status(400).json({ success: false, error: 'orderId is required' });
    }

    try {
        const result = await creditService.sendFilesToBank(orderId);
        res.json(result);
    } catch (error) {
        logger.error('Failed to send files', { orderId, error: error.message });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/get-contracts', async (req, res) => {
    const { orderId } = req.body;

    if (!orderId) {
        return res.status(400).json({ success: false, error: 'orderId is required' });
    }

    try {
        const result = await creditService.getContractsAndAttach(orderId);
        res.json(result);
    } catch (error) {
        logger.error('Failed to get contracts', { orderId, error: error.message });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/download-contracts', async (req, res) => {
    const { orderId } = req.body;

    if (!orderId) {
        return res.status(400).json({ success: false, error: 'orderId is required' });
    }

    try {
        const result = await creditService.getContractsForDownload(orderId);
        res.json(result);
    } catch (error) {
        logger.error('Failed to download contracts', { orderId, error: error.message });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/contract-file/:orderId/:fileIndex', async (req, res) => {
    const { orderId, fileIndex } = req.params;

    try {
        const result = await creditService.getContractsForDownload(orderId);
        const index = parseInt(fileIndex, 10);

        if (!result.files || index >= result.files.length) {
            return res.status(404).json({ success: false, error: 'File not found' });
        }

        const file = result.files[index];
        const buffer = Buffer.from(file.data, 'base64');

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);
        res.setHeader('Content-Length', buffer.length);
        res.send(buffer);
    } catch (error) {
        logger.error('Failed to get contract file', { orderId, fileIndex, error: error.message });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/refuse-application', async (req, res) => {
    const { orderId, reason } = req.body;

    if (!orderId) {
        return res.status(400).json({ success: false, error: 'orderId is required' });
    }

    try {
        const result = await creditService.refuseApplication(orderId, reason || 'Client refused');
        res.json(result);
    } catch (error) {
        logger.error('Failed to refuse application', { orderId, error: error.message });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/get-messages', async (req, res) => {
    const { orderId, newOnly } = req.body;

    if (!orderId) {
        return res.status(400).json({ success: false, error: 'orderId is required' });
    }

    try {
        const result = await creditService.getMessages(orderId, newOnly !== false);
        res.json(result);
    } catch (error) {
        logger.error('Failed to get messages', { orderId, error: error.message });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/send-message', async (req, res) => {
    const { orderId, text, withFiles, managerId, managerName } = req.body;

    if (!orderId) {
        return res.status(400).json({ success: false, error: 'orderId is required' });
    }

    if (!text) {
        return res.status(400).json({ success: false, error: 'text is required' });
    }

    try {
        const result = await creditService.sendMessage(orderId, text, withFiles === true, managerId, managerName);
        res.json(result);
    } catch (error) {
        logger.error('Failed to send message', { orderId, error: error.message });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/comparison-data', async (req, res) => {
    const { orderId } = req.body;

    if (!orderId) {
        return res.status(400).json({ success: false, error: 'orderId is required' });
    }

    try {
        const result = await creditService.getComparisonData(orderId);
        res.json(result);
    } catch (error) {
        logger.error('Failed to get comparison data', { orderId, error: error.message });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/application-request', async (req, res) => {
    const { applicationId, orderId } = req.body;

    if (!applicationId && !orderId) {
        return res.status(400).json({ success: false, error: 'applicationId or orderId is required' });
    }

    try {
        const result = await creditService.getApplicationRequestData(applicationId, orderId);
        res.json(result);
    } catch (error) {
        logger.error('Failed to get application request data', { applicationId, orderId, error: error.message });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/feed', async (req, res) => {
    try {
        const filters = {};

        if (req.query.archive === 'true') {
            filters.archive = true;
        } else if (req.query.archive === 'false' || !req.query.archive) {
            filters.archive = false;
        }

        const cachedFeed = await creditService.getCachedFeed(filters);
        res.json({
            success: true,
            items: cachedFeed.items,
            count: cachedFeed.count,
            lastSync: cachedFeed.lastSync,
            cached: true
        });
    } catch (error) {
        logger.error('Failed to get cached feed data', { error: error.message });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/feed/sync', async (req, res) => {
    try {
        const result = await creditService.syncFeedToDatabase();
        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        logger.error('Failed to sync feed', { error: error.message });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/update-order-status', async (req, res) => {
    const { orderId, status } = req.body;

    if (!orderId) {
        return res.status(400).json({ success: false, error: 'orderId is required' });
    }

    if (!status) {
        return res.status(400).json({ success: false, error: 'status is required' });
    }

    try {
        const result = await creditService.updateOrderStatus(orderId, status);
        res.json(result);
    } catch (error) {
        logger.error('Failed to update order status', { orderId, status, error: error.message });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

const cronExpression = `*/${config.cron.statusCheckInterval} * * * *`;
logger.info(`Setting up cron job with interval: every ${config.cron.statusCheckInterval} minutes`);

cron.schedule(cronExpression, async () => {
    logger.info('Cron job started: checking pending applications');
    try {
        await creditService.checkAllPendingApplications();
        await creditService.syncFeedToDatabase();
    } catch (error) {
        logger.error('Cron job failed', { error: error.message });
    }
});

async function initialSync() {
    logger.info('Running initial feed sync on startup');
    try {
        await creditService.syncFeedToDatabase();
        logger.info('Initial feed sync completed');
    } catch (error) {
        logger.error('Initial feed sync failed', { error: error.message });
    }
}

setTimeout(initialSync, 5000);

const PORT = config.server.port;

process.on('uncaughtException', (error) => {
    if (error.code === 'EPIPE' || error.code === 'ERR_STREAM_DESTROYED') {
        return;
    }
    logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
});

process.on('unhandledRejection', (reason, promise) => {
    if (reason && (reason.code === 'EPIPE' || reason.code === 'ERR_STREAM_DESTROYED')) {
        return;
    }
    logger.error('Unhandled Rejection', { reason: String(reason) });
});

app.listen(PORT, () => {
    logger.info(`Server started on port ${PORT}`);
    logger.info(`Environment: ${config.server.env}`);
    logger.info(`Status check interval: ${config.cron.statusCheckInterval} minutes`);
});
