const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

class SimlaClient {
    constructor() {
        this.client = axios.create({
            baseURL: config.simla.apiUrl,
            timeout: 30000,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        this.usersCache = new Map();
    }

    buildParams(params = {}) {
        return new URLSearchParams({
            apiKey: config.simla.apiKey,
            ...params
        }).toString();
    }

    async getOrder(orderId) {
        try {
            const response = await this.client.get(`/orders/${orderId}?${this.buildParams({ by: 'id' })}`);
            return response.data?.order;
        } catch (error) {
            logger.error('getOrder failed', { orderId, error: error.message });
            throw error;
        }
    }

    async getOrdersWithPendingCredit() {
        try {
            const params = this.buildParams({
                'filter[customFields][credit_company][]': 'microinvest',
                'filter[customFields][loan_application_id]': '',
                limit: 100
            });

            const response = await this.client.get(`/orders?${params}`);
            return response.data?.orders || [];
        } catch (error) {
            logger.error('getOrdersWithPendingCredit failed', { error: error.message });
            return [];
        }
    }

    async getOrdersWithActiveApplications() {
        try {
            const params = this.buildParams({
                'filter[customFields][credit_company][]': 'microinvest',
                'filter[paymentStatuses][]': 'credit-check',
                limit: 100
            });

            let orders = [];

            const response1 = await this.client.get(`/orders?${params}`);
            orders = orders.concat(response1.data?.orders || []);

            const params2 = this.buildParams({
                'filter[customFields][credit_company][]': 'microinvest',
                'filter[paymentStatuses][]': 'credit-approved',
                limit: 100
            });
            const response2 = await this.client.get(`/orders?${params2}`);
            orders = orders.concat(response2.data?.orders || []);

            const params3 = this.buildParams({
                'filter[customFields][credit_company][]': 'microinvest',
                'filter[paymentStatuses][]': 'conditions-changed',
                limit: 100
            });
            const response3 = await this.client.get(`/orders?${params3}`);
            orders = orders.concat(response3.data?.orders || []);

            const params4 = this.buildParams({
                'filter[customFields][credit_company][]': 'microinvest',
                'filter[paymentStatuses][]': 'credit-declined',
                limit: 100
            });
            const response4 = await this.client.get(`/orders?${params4}`);
            orders = orders.concat(response4.data?.orders || []);

            const filtered = orders.filter(order => {
                const appId = order.customFields?.[config.crmFields.loanApplicationId];
                if (!appId || appId.length === 0) return false;
                if (order.status === 'delivering') return false;
                return true;
            });

            logger.debug('Found orders with active applications', { count: filtered.length });
            return filtered;
        } catch (error) {
            logger.error('getOrdersWithActiveApplications failed', { error: error.message });
            return [];
        }
    }

    async updateOrderCustomFields(orderId, customFields, site) {
        try {
            if (!site) {
                const order = await this.getOrder(orderId);
                site = order?.site;
            }

            if (!site) {
                throw new Error('Site is required for order update');
            }

            const orderData = JSON.stringify({ customFields });
            const body = `apiKey=${config.simla.apiKey}&site=${site}&order=${encodeURIComponent(orderData)}`;

            const response = await this.client.post(
                `/orders/${orderId}/edit?by=id`,
                body
            );

            logger.debug('updateOrderCustomFields success', { orderId, customFields });
            return response.data;
        } catch (error) {
            logger.error('updateOrderCustomFields failed', {
                orderId,
                customFields,
                error: error.message,
                response: error.response?.data
            });
            throw error;
        }
    }

    async updatePaymentStatus(orderId, paymentId, status, site) {
        try {
            if (!site) {
                const order = await this.getOrder(orderId);
                site = order?.site;
            }

            if (!site) {
                throw new Error('Site is required for payment update');
            }

            const paymentData = JSON.stringify({ status });
            const body = `apiKey=${config.simla.apiKey}&site=${site}&payment=${encodeURIComponent(paymentData)}`;

            const response = await this.client.post(
                `/orders/payments/${paymentId}/edit`,
                body
            );

            logger.info('Payment status updated', { orderId, paymentId, status });
            return response.data;
        } catch (error) {
            logger.error('updatePaymentStatus failed', {
                orderId,
                paymentId,
                status,
                error: error.message,
                response: error.response?.data
            });
            throw error;
        }
    }

    async updateOrderWithApplicationId(orderId, applicationId, site) {
        return this.updateOrderCustomFields(orderId, {
            [config.crmFields.loanApplicationId]: applicationId
        }, site);
    }

    async updateOrderStatus(orderId, status, site) {
        try {
            if (!site) {
                const order = await this.getOrder(orderId);
                site = order?.site;
            }

            if (!site) {
                throw new Error('Site is required for order status update');
            }

            const orderData = JSON.stringify({ status });
            const body = `apiKey=${config.simla.apiKey}&site=${site}&order=${encodeURIComponent(orderData)}`;

            const response = await this.client.post(
                `/orders/${orderId}/edit?by=id`,
                body
            );

            logger.info('Order status updated', { orderId, status });
            return response.data;
        } catch (error) {
            logger.error('updateOrderStatus failed', {
                orderId,
                status,
                error: error.message,
                response: error.response?.data
            });
            throw error;
        }
    }

    findCreditPayment(order) {
        if (!order.payments) return null;

        for (const paymentId of Object.keys(order.payments)) {
            const payment = order.payments[paymentId];
            if (payment.type === 'kredit-onlain' || payment.type === 'credit') {
                return { id: paymentId, ...payment };
            }
        }
        return null;
    }

    extractOrderData(order) {
        const cf = order.customFields || {};

        return {
            orderId: order.id,
            orderNumber: order.number,
            phone: order.phone,
            idnp: cf[config.crmFields.idnp],
            name: cf[config.crmFields.name],
            surname: cf[config.crmFields.surname],
            birthday: cf[config.crmFields.birthday],
            residence: cf[config.crmFields.residence],
            creditCompany: cf[config.crmFields.creditCompany],
            creditTerm: cf[config.crmFields.creditTerm],
            zeroCredit: cf[config.crmFields.zeroCredit],
            loanApplicationId: cf[config.crmFields.loanApplicationId],
            payment: this.findCreditPayment(order)
        };
    }

    async getOrderFiles(orderId, site) {
        try {
            if (!site) {
                const order = await this.getOrder(orderId);
                site = order?.site;
            }

            const params = this.buildParams({
                'filter[orderIds][]': orderId,
                'filter[sites][]': site,
                limit: 100
            });

            const response = await this.client.get(`/files?${params}`);
            const files = response.data?.files || [];

            logger.debug('getOrderFiles', { orderId, site, count: files.length });
            return files;
        } catch (error) {
            logger.error('getOrderFiles failed', {
                orderId,
                error: error.message,
                response: error.response?.data
            });
            return [];
        }
    }

    async downloadFile(fileId) {
        try {
            const response = await this.client.get(
                `/files/${fileId}/download?apiKey=${config.simla.apiKey}`,
                { responseType: 'arraybuffer' }
            );

            const base64 = Buffer.from(response.data).toString('base64');
            logger.debug('downloadFile success', { fileId, size: response.data.length });

            return base64;
        } catch (error) {
            logger.error('downloadFile failed', { fileId, error: error.message });
            return null;
        }
    }

    async getOrderFilesAsBase64(orderId, site) {
        const files = await this.getOrderFiles(orderId, site);
        const result = [];

        for (const file of files) {
            const base64 = await this.downloadFile(file.id);
            if (base64) {
                result.push({
                    name: file.filename || `file_${file.id}`,
                    data: base64
                });
            }
        }

        return result;
    }

    async uploadFileToOrder(orderId, fileName, base64Data, site) {
        try {
            if (!site) {
                const order = await this.getOrder(orderId);
                site = order?.site;
            }

            if (!site) {
                throw new Error('Site is required for file upload');
            }

            const buffer = Buffer.from(base64Data, 'base64');

            logger.debug('Preparing file upload', {
                orderId,
                fileName,
                bufferSize: buffer.length
            });

            if (buffer.length === 0) {
                throw new Error('File buffer is empty');
            }

            const contentType = this.getContentType(fileName);
            const uploadUrl = `${config.simla.apiUrl}/files/upload?apiKey=${config.simla.apiKey}`;

            logger.debug('Sending file upload request', {
                uploadUrl: uploadUrl.replace(config.simla.apiKey, '***'),
                contentType,
                bufferSize: buffer.length
            });

            const uploadResponse = await axios.post(uploadUrl, buffer, {
                headers: {
                    'Content-Type': contentType
                },
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            });

            logger.debug('Upload response', {
                status: uploadResponse.status,
                data: uploadResponse.data
            });

            const fileId = uploadResponse.data?.file?.id;

            if (!fileId) {
                throw new Error('No file ID in upload response');
            }

            logger.debug('File uploaded, attaching to order', {
                fileId,
                orderId
            });

            const editBody = `apiKey=${config.simla.apiKey}&file=${encodeURIComponent(JSON.stringify({
                filename: fileName,
                attachment: [{ order: { id: orderId } }]
            }))}`;

            const editResponse = await this.client.post(
                `/files/${fileId}/edit`,
                editBody
            );

            logger.info('File uploaded and attached to order', {
                orderId,
                fileName,
                fileId
            });

            return editResponse.data;
        } catch (error) {
            logger.error('uploadFileToOrder failed', {
                orderId,
                fileName,
                error: error.message,
                response: error.response?.data
            });
            throw error;
        }
    }

    getContentType(fileName) {
        const ext = fileName.toLowerCase().split('.').pop();
        const types = {
            'pdf': 'application/pdf',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'doc': 'application/msword',
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        };
        return types[ext] || 'application/octet-stream';
    }

    async checkOrderHasContractFiles(orderId, site) {
        const files = await this.getOrderFiles(orderId, site);
        return files.some(file => {
            const name = (file.filename || '').toLowerCase();
            return name.includes('contract') ||
                   name.includes('договор') ||
                   name === 'client.pdf' ||
                   name === 'microinvest.pdf';
        });
    }

    async getUser(userId) {
        if (!userId) return null;

        if (this.usersCache.has(userId)) {
            return this.usersCache.get(userId);
        }

        try {
            const response = await this.client.get(`/users/${userId}?${this.buildParams()}`);
            const user = response.data?.user || null;

            if (user) {
                this.usersCache.set(userId, user);
            }

            return user;
        } catch (error) {
            logger.error('getUser failed', { userId, error: error.message });
            return null;
        }
    }

    async getManagerName(managerId) {
        if (!managerId) return null;

        const user = await this.getUser(managerId);
        if (!user) return null;

        const firstName = user.firstName || '';
        const lastName = user.lastName || '';
        return `${firstName} ${lastName}`.trim() || null;
    }
}

module.exports = new SimlaClient();
