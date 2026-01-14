const config = require('../config');
const logger = require('../utils/logger');
const axios = require('axios');
const FormData = require('form-data');

const MODULE_CODE = 'micro-credit';

async function registerModule(baseUrl) {
    const moduleConfig = {
        code: MODULE_CODE,
        integrationCode: MODULE_CODE,
        active: true,
        name: 'Micro Credit',
        logo: `${baseUrl}/static/logo.svg`,
        clientId: generateClientId(),
        baseUrl: baseUrl,
        accountUrl: `${baseUrl}/module/settings`,
        integrations: {
            embedJs: {
                entrypoint: '/widget/credit',
                stylesheet: '/static/credit.css',
                targets: ['order/card:payment.before']
            }
        }
    };

    const formData = new FormData();
    formData.append('integrationModule', JSON.stringify(moduleConfig));

    const url = `${config.simla.apiUrl}/integration-modules/${MODULE_CODE}/edit`;

    logger.debug('Registering module', { url, config: moduleConfig });

    try {
        const response = await axios.post(url, formData, {
            headers: {
                'X-API-KEY': config.simla.apiKey,
                ...formData.getHeaders()
            }
        });

        logger.debug('Registration response', { data: response.data });

        if (response.data.success) {
            logger.info('Module registered successfully', { code: MODULE_CODE });
            return { success: true, code: MODULE_CODE };
        } else {
            logger.error('Module registration failed', { error: response.data.errorMsg, errors: response.data.errors });
            return { success: false, error: response.data.errorMsg, errors: response.data.errors };
        }
    } catch (error) {
        logger.error('Module registration error', {
            error: error.message,
            response: error.response?.data
        });
        throw error;
    }
}

async function deactivateModule() {
    const formData = new FormData();
    formData.append('integrationModule', JSON.stringify({ code: MODULE_CODE, active: false }));

    try {
        const response = await axios.post(
            `${config.simla.apiUrl}/integration-modules/${MODULE_CODE}/edit`,
            formData,
            {
                headers: {
                    'X-API-KEY': config.simla.apiKey,
                    ...formData.getHeaders()
                }
            }
        );

        return response.data;
    } catch (error) {
        logger.error('Module deactivation error', { error: error.message });
        throw error;
    }
}

function generateClientId() {
    return 'mi_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

module.exports = {
    MODULE_CODE,
    registerModule,
    deactivateModule
};
