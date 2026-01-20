const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

class IuteClient {
    constructor() {
        this.client = axios.create({
            baseURL: config.iute.apiUrl,
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': config.iute.apiKey
            }
        });
    }

    async getPartnerInfo() {
        try {
            const response = await this.client.get('/api/v1/physical-api-partners/me');
            logger.debug('Iute getPartnerInfo response', { data: response.data });
            return response.data;
        } catch (error) {
            logger.error('Iute getPartnerInfo failed', { error: error.message });
            throw error;
        }
    }

    async createOrder(orderData) {
        try {
            const payload = {
                myiutePhone: orderData.phone,
                orderId: orderData.orderId,
                totalAmount: orderData.amount,
                currency: orderData.currency || 'MDL',
                merchant: {
                    posIdentifier: config.iute.posId,
                    salesmanIdentifier: config.iute.salesmanId,
                    userConfirmationUrl: `${config.iute.webhookBaseUrl}/api/iute/confirm`,
                    userCancelUrl: `${config.iute.webhookBaseUrl}/api/iute/cancel`
                }
            };

            if (orderData.items && orderData.items.length > 0) {
                payload.items = orderData.items.map(item => ({
                    displayName: item.name,
                    id: item.id,
                    sku: item.sku,
                    unitPrice: item.price,
                    qty: item.quantity,
                    itemImageUrl: item.imageUrl,
                    itemUrl: item.url
                }));
            }

            logger.info('Iute createOrder request', {
                orderId: orderData.orderId,
                phone: orderData.phone,
                amount: orderData.amount
            });

            const response = await this.client.post('/api/v1/physical-api-partners/order', payload);

            logger.info('Iute createOrder response', {
                orderId: orderData.orderId,
                status: response.data?.status,
                myiuteCustomer: response.data?.myiuteCustomer
            });

            return response.data;
        } catch (error) {
            logger.error('Iute createOrder failed', {
                orderId: orderData.orderId,
                error: error.message,
                response: error.response?.data
            });
            throw error;
        }
    }

    async getOrderStatus(orderId) {
        try {
            const response = await this.client.get(`/api/v1/physical-api-partners/orders/${orderId}/status`);

            logger.debug('Iute getOrderStatus response', {
                orderId,
                status: response.data?.status
            });

            return response.data;
        } catch (error) {
            if (error.response?.status === 404) {
                logger.warn('Iute order not found', { orderId });
                return null;
            }
            logger.error('Iute getOrderStatus failed', {
                orderId,
                error: error.message
            });
            throw error;
        }
    }

    async withdrawOrder(orderId) {
        try {
            logger.info('Iute withdrawOrder request', { orderId });

            const response = await this.client.post(`/api/v1/physical-api-partners/orders/${orderId}/withdraw`);

            logger.info('Iute withdrawOrder success', { orderId });
            return response.data;
        } catch (error) {
            logger.error('Iute withdrawOrder failed', {
                orderId,
                error: error.message,
                response: error.response?.data
            });
            throw error;
        }
    }

    verifyWebhookSignature(body, timestamp, signature, publicKey) {
        if (!publicKey) {
            logger.warn('Iute webhook signature verification skipped - no public key');
            return true;
        }

        try {
            const crypto = require('crypto');
            const data = JSON.stringify(body) + timestamp;
            const verify = crypto.createVerify('SHA256');
            verify.update(data);
            return verify.verify(publicKey, signature, 'base64');
        } catch (error) {
            logger.error('Iute webhook signature verification failed', { error: error.message });
            return false;
        }
    }
}

module.exports = new IuteClient();
