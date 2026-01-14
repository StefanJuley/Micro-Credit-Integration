const express = require('express');
const path = require('path');
const { registerModule, deactivateModule, MODULE_CODE } = require('./register');
const creditService = require('../services/creditService');
const logger = require('../utils/logger');

const router = express.Router();

router.use('/static', express.static(path.join(__dirname, '../../static')));

function serveCreditWidget(req, res) {
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Security-Policy', "frame-ancestors *");
    res.removeHeader('X-Frame-Options');
    res.send(`<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Microinvest Credit Widget</title>
    <link rel="stylesheet" href="/static/credit.css">
</head>
<body>
    <div id="remote-ui-root"></div>
    <script src="/static/credit.js"></script>
</body>
</html>`);
}

router.get('/widget', serveCreditWidget);
router.get('/credit', serveCreditWidget);
router.get('/widget/credit', serveCreditWidget);

router.get('/settings', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Microinvest Credit - Settings</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; }
                .container { max-width: 600px; margin: 0 auto; }
                h1 { color: #333; }
                .status { padding: 10px; border-radius: 4px; margin: 10px 0; }
                .status.active { background: #d4edda; color: #155724; }
                .info { background: #f8f9fa; padding: 15px; border-radius: 4px; }
                .info p { margin: 5px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Microinvest Credit Integration</h1>
                <div class="status active">Module Active</div>
                <div class="info">
                    <p><strong>Module Code:</strong> ${MODULE_CODE}</p>
                    <p><strong>Version:</strong> 1.0.0</p>
                    <p>Module integrates credit applications with Microinvest bank.</p>
                </div>
            </div>
        </body>
        </html>
    `);
});

router.post('/activity', async (req, res) => {
    logger.debug('Activity callback received', { body: req.body });
    res.json({ success: true });
});

router.post('/register', async (req, res) => {
    const baseUrl = req.body.baseUrl || `${req.protocol}://${req.get('host')}`;

    try {
        const result = await registerModule(baseUrl);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/deactivate', async (req, res) => {
    try {
        const result = await deactivateModule();
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/action/submit', async (req, res) => {
    const { orderId } = req.body;

    if (!orderId) {
        return res.status(400).json({ success: false, error: 'orderId is required' });
    }

    try {
        const result = await creditService.submitApplication(orderId);
        res.json(result);
    } catch (error) {
        logger.error('Submit action failed', { orderId, error: error.message });
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/action/send-files', async (req, res) => {
    const { orderId } = req.body;

    if (!orderId) {
        return res.status(400).json({ success: false, error: 'orderId is required' });
    }

    try {
        const result = await creditService.sendFilesToBank(orderId);
        res.json(result);
    } catch (error) {
        logger.error('Send files action failed', { orderId, error: error.message });
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/action/check-status', async (req, res) => {
    const { orderId } = req.body;

    if (!orderId) {
        return res.status(400).json({ success: false, error: 'orderId is required' });
    }

    try {
        const result = await creditService.checkAndUpdateStatus(orderId);
        res.json({ success: true, result });
    } catch (error) {
        logger.error('Check status action failed', { orderId, error: error.message });
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
