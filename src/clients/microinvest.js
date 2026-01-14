const axios = require('axios');
const https = require('https');
const config = require('../config');
const logger = require('../utils/logger');

class MicroinvestClient {
    constructor() {
        this.client = axios.create({
            baseURL: config.microinvest.apiUrl,
            timeout: 30000,
            httpsAgent: new https.Agent({ rejectUnauthorized: false }),
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Accept': 'application/json',
                'Accept-Charset': 'utf-8',
                'apikey': config.microinvest.apiKey,
                'partnerID': config.microinvest.partnerId
            },
            responseType: 'json',
            responseEncoding: 'utf8'
        });
    }

    async getLoanProducts(term = 6, amount = 5000) {
        try {
            const response = await this.client.post('/GetLoanProductSet', { term, amount });
            logger.debug('GetLoanProductSet response', { products: response.data?.loanProductSet?.length });
            return response.data;
        } catch (error) {
            logger.error('GetLoanProductSet failed', { error: error.message });
            throw error;
        }
    }

    async checkIdnp(idnp) {
        try {
            const response = await this.client.post('/CheckIDNP', null, {
                headers: { ...this.client.defaults.headers, 'IDNP': idnp }
            });
            logger.debug('CheckIDNP response', { idnp });
            return response.data;
        } catch (error) {
            logger.error('CheckIDNP failed', { idnp, error: error.message });
            throw error;
        }
    }

    async importLoanApplication(applicationData) {
        try {
            logger.info('Importing loan application', {
                idnp: applicationData.idnp,
                amount: applicationData.amount,
                loanTerm: applicationData.loanTerm
            });

            const response = await this.client.post('/ImportLoanApplication', applicationData);

            if (response.data?.applicationID) {
                logger.info('Loan application created', {
                    applicationID: response.data.applicationID
                });
            }

            return response.data;
        } catch (error) {
            logger.error('ImportLoanApplication failed', {
                idnp: applicationData.idnp,
                error: error.message,
                response: error.response?.data
            });
            throw error;
        }
    }

    async checkApplicationStatus(applicationId) {
        try {
            const response = await this.client.post('/CheckApplicationStatus', null, {
                headers: {
                    ...this.client.defaults.headers,
                    'applicationID': applicationId
                }
            });

            logger.debug('CheckApplicationStatus response', {
                applicationId,
                status: response.data?.status
            });

            return response.data;
        } catch (error) {
            if (error.response?.status === 404) {
                logger.warn('Application not found (may still be processing)', { applicationId });
                return null;
            }
            logger.error('CheckApplicationStatus failed', {
                applicationId,
                error: error.message
            });
            throw error;
        }
    }

    async getContracts(applicationId) {
        try {
            const response = await this.client.post('/GetContracts', null, {
                headers: {
                    ...this.client.defaults.headers,
                    'applicationID': applicationId
                }
            });

            logger.debug('GetContracts response', {
                applicationId,
                filesCount: response.data?.fileAttachmentSet?.length
            });

            return response.data;
        } catch (error) {
            logger.error('GetContracts failed', { applicationId, error: error.message });
            throw error;
        }
    }

    async sendRefuseRequest(applicationId, reason) {
        try {
            logger.debug('Sending refuse request', { applicationId, reason });
            const response = await this.client.post('/SendRefuseRequest', { reason }, {
                headers: {
                    ...this.client.defaults.headers,
                    'applicationID': applicationId
                }
            });

            logger.info('Refuse request sent', { applicationId, reason });
            return response.data;
        } catch (error) {
            logger.error('SendRefuseRequest failed', {
                applicationId,
                error: error.message,
                status: error.response?.status,
                data: error.response?.data
            });
            throw error;
        }
    }

    async sendContracts(applicationId, files) {
        try {
            const fileAttachmentSet = files.map(file => ({
                name: file.name,
                data: file.data
            }));

            const response = await this.client.post('/SendContracts',
                { fileAttachmentSet },
                {
                    headers: {
                        ...this.client.defaults.headers,
                        'applicationID': applicationId
                    },
                    timeout: 60000
                }
            );

            logger.info('SendContracts success', {
                applicationId,
                filesCount: files.length
            });
            return response.data;
        } catch (error) {
            logger.error('SendContracts failed', {
                applicationId,
                error: error.message,
                response: error.response?.data
            });
            throw error;
        }
    }

    async getMessages(applicationId, newMessages = true) {
        try {
            const response = await this.client.post('/GetMessages',
                { newMessages },
                {
                    headers: {
                        ...this.client.defaults.headers,
                        'applicationID': applicationId
                    }
                }
            );

            logger.debug('GetMessages response', {
                applicationId,
                messagesCount: response.data?.messageSet?.length || 0
            });

            return response.data;
        } catch (error) {
            logger.error('GetMessages failed', {
                applicationId,
                error: error.message
            });
            throw error;
        }
    }

    async sendMessage(applicationId, text) {
        try {
            const response = await this.client.post('/SendMessage',
                { text },
                {
                    headers: {
                        ...this.client.defaults.headers,
                        'applicationID': applicationId
                    }
                }
            );

            logger.info('SendMessage success', { applicationId, text });
            return response.data;
        } catch (error) {
            logger.error('SendMessage failed', {
                applicationId,
                error: error.message
            });
            throw error;
        }
    }
}

module.exports = new MicroinvestClient();
