const microinvest = require('../clients/microinvest');
const simla = require('../clients/simla');
const config = require('../config');
const logger = require('../utils/logger');
const feedRepository = require('./feedRepository');
const { ARCHIVED_ORDER_STATUSES } = require('./feedRepository');

const productIdToName = Object.entries(config.loanProducts).reduce((acc, [key, id]) => {
    acc[id] = key;
    return acc;
}, {});

const pendingSubmissions = new Set();

class CreditService {
    getProductName(productId) {
        return productIdToName[productId] || 'unknown';
    }

    getLoanProductId(zeroCredit, creditTerm) {
        if (zeroCredit === 'true' || zeroCredit === true) {
            const key = `0%_${creditTerm}`;
            return config.loanProducts[key] || config.loanProducts['retail'];
        }
        return config.loanProducts['retail'];
    }

    formatBirthday(birthday) {
        if (!birthday) return null;
        if (birthday.match(/^\d{4}-\d{2}-\d{2}$/)) return birthday;
        const parts = birthday.split(/[./-]/);
        if (parts.length === 3) {
            if (parts[0].length === 4) return birthday;
            return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
        return birthday;
    }

    formatPhone(phone) {
        if (!phone) return null;
        let cleaned = phone.replace(/\D/g, '');
        if (cleaned.startsWith('373')) {
            return '+' + cleaned;
        }
        if (cleaned.startsWith('0')) {
            return '+373' + cleaned.substring(1);
        }
        return '+373' + cleaned;
    }

    async submitApplication(orderId) {
        logger.info('Submitting application for order', { orderId });

        if (pendingSubmissions.has(orderId)) {
            throw new Error(`Заявка для заказа ${orderId} уже в процессе отправки`);
        }

        pendingSubmissions.add(orderId);

        try {
            return await this._submitApplicationInternal(orderId);
        } finally {
            pendingSubmissions.delete(orderId);
        }
    }

    async _submitApplicationInternal(orderId) {
        const order = await simla.getOrder(orderId);
        if (!order) {
            throw new Error(`Order ${orderId} not found`);
        }

        const orderData = simla.extractOrderData(order);

        logger.debug('Order custom fields', {
            orderId,
            customFields: order.customFields,
            creditCompany: orderData.creditCompany
        });

        const creditCompanyValue = Array.isArray(orderData.creditCompany)
            ? orderData.creditCompany[0]
            : orderData.creditCompany;

        if (creditCompanyValue !== 'microinvest') {
            throw new Error(`Order ${orderId} is not for Microinvest (company: ${creditCompanyValue})`);
        }

        if (orderData.loanApplicationId) {
            throw new Error(`Order ${orderId} already has application ID: ${orderData.loanApplicationId}`);
        }

        if (!orderData.idnp) {
            throw new Error(`Не указан IDNP клиента`);
        }

        if (!orderData.name) {
            throw new Error(`Не указано имя клиента`);
        }

        if (/[а-яёА-ЯЁ]/.test(orderData.name)) {
            throw new Error(`Имя должно быть на латинице`);
        }

        if (!orderData.surname) {
            throw new Error(`Не указана фамилия клиента`);
        }

        if (/[а-яёА-ЯЁ]/.test(orderData.surname)) {
            throw new Error(`Фамилия должна быть на латинице`);
        }

        if (!orderData.birthday) {
            throw new Error(`Не указана дата рождения клиента`);
        }

        if (!orderData.payment) {
            throw new Error(`Order ${orderId} has no credit payment`);
        }

        const loanProductId = this.getLoanProductId(orderData.zeroCredit, orderData.creditTerm);

        const files = await simla.getOrderFilesAsBase64(orderId, order.site);

        if (files.length === 0) {
            throw new Error(`Необходимо прикрепить фото паспорта к заказу`);
        }

        const applicationData = {
            idnp: orderData.idnp,
            name: orderData.name || '',
            surname: orderData.surname || '',
            birthDate: this.formatBirthday(orderData.birthday),
            phoneCell: this.formatPhone(orderData.phone),
            agreementLoanHistoryPD: true,
            marketingAgreement: true,
            loanProductID: loanProductId,
            loanTerm: String(orderData.creditTerm),
            amount: String(orderData.payment.amount),
            comment: `Nr. comenzii: ${orderData.orderNumber}`
        };

        if (files.length > 0) {
            applicationData.fileAttachmentSet = files.map(file => ({
                name: file.name,
                data: file.data
            }));
            logger.info('Files attached to application', {
                orderId,
                filesCount: files.length,
                fileNames: files.map(f => f.name)
            });
        }

        logger.debug('Application data prepared', { orderId, applicationData: { ...applicationData, fileAttachmentSet: applicationData.fileAttachmentSet ? `[${applicationData.fileAttachmentSet.length} files]` : undefined } });

        const result = await microinvest.importLoanApplication(applicationData);

        if (!result?.applicationID) {
            throw new Error('No applicationID in response');
        }

        await simla.updateOrderWithApplicationId(orderId, result.applicationID, order.site);

        if (orderData.payment?.id) {
            await simla.updatePaymentStatus(orderId, orderData.payment.id, 'credit-check', order.site);
        }

        logger.info('Application submitted successfully', {
            orderId,
            applicationId: result.applicationID,
            filesCount: files.length
        });

        return {
            orderId,
            applicationId: result.applicationID,
            filesCount: files.length,
            success: true
        };
    }

    async sendFilesToBank(orderId) {
        logger.info('Sending files to bank for order', { orderId });

        const order = await simla.getOrder(orderId);
        if (!order) {
            throw new Error(`Order ${orderId} not found`);
        }

        const orderData = simla.extractOrderData(order);

        if (!orderData.loanApplicationId) {
            throw new Error(`Order ${orderId} has no application ID`);
        }

        const files = await simla.getOrderFilesAsBase64(orderId, order.site);

        if (files.length === 0) {
            throw new Error(`Order ${orderId} has no files attached`);
        }

        await microinvest.sendContracts(orderData.loanApplicationId, files);

        logger.info('Files sent successfully', {
            orderId,
            applicationId: orderData.loanApplicationId,
            filesCount: files.length
        });

        return {
            orderId,
            applicationId: orderData.loanApplicationId,
            filesCount: files.length,
            success: true
        };
    }

    async checkAndUpdateStatus(orderId) {
        const order = await simla.getOrder(orderId);
        if (!order) {
            logger.warn('Order not found for status check', { orderId });
            return null;
        }

        const orderData = simla.extractOrderData(order);

        if (!orderData.loanApplicationId) {
            logger.debug('Order has no application ID', { orderId });
            return null;
        }

        const bankStatus = await microinvest.checkApplicationStatus(orderData.loanApplicationId);

        if (!bankStatus) {
            logger.debug('Application status not available yet', {
                orderId,
                applicationId: orderData.loanApplicationId
            });
            return null;
        }

        let crmStatus = config.statusMapping[bankStatus.status];

        if (!crmStatus) {
            logger.warn('Unknown bank status', { orderId, bankStatus: bankStatus.status });
            return null;
        }

        if (crmStatus === 'credit-approved' && bankStatus.status === 'Approved') {
            const hasChanges = this.checkConditionsChanged(orderData, bankStatus);
            if (hasChanges) {
                crmStatus = 'conditions-changed';
                logger.info('Bank changed credit conditions', {
                    orderId,
                    applicationId: orderData.loanApplicationId
                });
            }
        }

        if (orderData.payment && orderData.payment.status !== crmStatus) {
            await simla.updatePaymentStatus(orderId, orderData.payment.id, crmStatus, order.site);

            logger.info('Order status updated', {
                orderId,
                applicationId: orderData.loanApplicationId,
                bankStatus: bankStatus.status,
                crmStatus
            });
        }

        if (bankStatus.status === 'Approved' && orderData.payment?.type === 'credit') {
            await this.autoAttachContracts(orderId, orderData.loanApplicationId, order.site);
        }

        return {
            orderId,
            applicationId: orderData.loanApplicationId,
            bankStatus: bankStatus.status,
            crmStatus,
            isFinal: config.finalStatuses.includes(bankStatus.status)
        };
    }

    async autoAttachContracts(orderId, applicationId, site) {
        try {
            const hasContracts = await simla.checkOrderHasContractFiles(orderId, site);
            if (hasContracts) {
                logger.debug('Contracts already attached', { orderId, applicationId });
                return;
            }

            const contractsResponse = await microinvest.getContracts(applicationId);
            if (!contractsResponse?.fileAttachmentSet || contractsResponse.fileAttachmentSet.length === 0) {
                logger.debug('No contracts available yet', { orderId, applicationId });
                return;
            }

            for (const file of contractsResponse.fileAttachmentSet) {
                const fileName = file.name || `contract_${applicationId}.pdf`;
                await simla.uploadFileToOrder(orderId, fileName, file.data, site);

                logger.info('Contract auto-attached to order', {
                    orderId,
                    applicationId,
                    fileName
                });
            }
        } catch (error) {
            logger.error('Auto-attach contracts failed', {
                orderId,
                applicationId,
                error: error.message
            });
        }
    }

    checkConditionsChanged(orderData, bankStatus) {
        const requestedProductId = this.getLoanProductId(orderData.zeroCredit, orderData.creditTerm);
        const requestedProductName = this.getProductName(requestedProductId);

        const requestedAmount = parseFloat(orderData.payment?.amount) || 0;
        const requestedTerm = parseInt(orderData.creditTerm) || 0;
        const requestedProductType = requestedProductName.startsWith('0%') ? '0%' : 'retail';

        const approvedAmount = bankStatus.amount || 0;
        const approvedTerm = bankStatus.loanTerm || 0;
        const approvedProductName = this.getProductName(bankStatus.loanProductID);
        const approvedProductType = approvedProductName.startsWith('0%') ? '0%' : 'retail';

        const amountChanged = requestedAmount !== approvedAmount;
        const termChanged = requestedTerm !== approvedTerm;
        const productChanged = requestedProductType !== approvedProductType;

        if (amountChanged || termChanged || productChanged) {
            logger.debug('Conditions comparison', {
                requested: { amount: requestedAmount, term: requestedTerm, productType: requestedProductType },
                approved: { amount: approvedAmount, term: approvedTerm, productType: approvedProductType },
                changes: { amountChanged, termChanged, productChanged }
            });
            return true;
        }

        return false;
    }

    async checkAllPendingApplications() {
        logger.info('Starting status check for all pending applications');

        const orders = await simla.getOrdersWithActiveApplications();
        logger.info(`Found ${orders.length} orders with active applications`);

        const results = [];

        for (const order of orders) {
            try {
                const result = await this.checkAndUpdateStatus(order.id);
                if (result) {
                    results.push(result);
                }
                await this.sleep(500);
            } catch (error) {
                logger.error('Failed to check order status', {
                    orderId: order.id,
                    error: error.message
                });
            }
        }

        const updated = results.filter(r => r).length;
        const final = results.filter(r => r?.isFinal).length;

        logger.info('Status check completed', {
            total: orders.length,
            updated,
            final
        });

        return results;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async getFeedData() {
        logger.info('Getting feed data for all active applications');

        const orders = await simla.getOrdersWithActiveApplications();
        const feedItems = [];

        if (orders.length > 0) {
            logger.info('First order keys', { keys: Object.keys(orders[0]) });
        }

        for (const order of orders) {
            try {
                if (order.status && ARCHIVED_ORDER_STATUSES.includes(order.status)) {
                    logger.debug('Skipping order with archived status', { orderId: order.id, status: order.status });
                    continue;
                }

                const orderData = simla.extractOrderData(order);
                if (!orderData.loanApplicationId) continue;

                const bankStatus = await microinvest.checkApplicationStatus(orderData.loanApplicationId);

                let conditionsChanged = false;
                const requestedProductId = this.getLoanProductId(orderData.zeroCredit, orderData.creditTerm);
                const requestedProductName = this.getProductName(requestedProductId);

                let comparison = {
                    requested: {
                        amount: parseFloat(orderData.payment?.amount) || 0,
                        term: parseInt(orderData.creditTerm) || 0,
                        productType: requestedProductName.startsWith('0%') ? '0%' : 'retail'
                    },
                    approved: null
                };

                if (bankStatus && bankStatus.status === 'Approved') {
                    conditionsChanged = this.checkConditionsChanged(orderData, bankStatus);
                    const approvedProductName = this.getProductName(bankStatus.loanProductID);

                    comparison.approved = {
                        amount: bankStatus.amount || 0,
                        term: bankStatus.loanTerm || 0,
                        productType: approvedProductName.startsWith('0%') ? '0%' : 'retail'
                    };
                }

                const managerName = await simla.getManagerName(order.managerId);
                logger.info('Manager info', { orderId: order.id, managerId: order.managerId, managerName });

                feedItems.push({
                    orderId: order.id,
                    orderNumber: order.number,
                    applicationId: orderData.loanApplicationId,
                    creditCompany: orderData.creditCompany,
                    customerName: `${orderData.name || ''} ${orderData.surname || ''}`.trim() || '-',
                    bankStatus: bankStatus?.status || 'Unknown',
                    crmStatus: orderData.payment?.status || null,
                    paymentType: orderData.payment?.type || null,
                    orderStatus: order.status || null,
                    managerId: order.managerId || null,
                    managerName: managerName || null,
                    conditionsChanged,
                    comparison,
                    createdAt: order.createdAt || null
                });

                await this.sleep(200);
            } catch (error) {
                logger.error('Failed to get feed item', {
                    orderId: order.id,
                    error: error.message
                });
            }
        }

        logger.info('Feed data retrieved', { count: feedItems.length });
        return feedItems;
    }

    async syncFeedToDatabase() {
        logger.info('Starting feed sync to database');

        try {
            const feedItems = await this.getFeedData();
            const activeOrderIds = new Set(feedItems.map(item => item.orderId));

            const itemsToSync = feedItems.map(item => ({
                orderId: item.orderId,
                orderNumber: item.orderNumber,
                applicationId: item.applicationId,
                creditCompany: item.creditCompany,
                customerName: item.customerName,
                bankStatus: item.bankStatus,
                crmStatus: item.crmStatus,
                paymentType: item.paymentType,
                orderStatus: item.orderStatus,
                managerId: item.managerId,
                managerName: item.managerName,
                conditionsChanged: item.conditionsChanged,
                comparison: item.comparison,
                orderCreatedAt: item.createdAt,
            }));

            if (itemsToSync.length > 0) {
                await feedRepository.upsertMany(itemsToSync);
            }

            const existingItems = await feedRepository.getAllFeedItems({ archive: false });
            const staleItems = existingItems.filter(item => !activeOrderIds.has(item.orderId));

            for (const staleItem of staleItems) {
                try {
                    const order = await simla.getOrder(staleItem.orderId);
                    if (order && order.status !== staleItem.orderStatus) {
                        await feedRepository.upsertFeedItem({
                            ...staleItem,
                            orderStatus: order.status,
                            crmStatus: simla.findCreditPayment(order)?.status || staleItem.crmStatus,
                        });
                        logger.debug('Updated stale item order status', {
                            orderId: staleItem.orderId,
                            oldStatus: staleItem.orderStatus,
                            newStatus: order.status
                        });
                    }
                } catch (error) {
                    logger.warn('Failed to update stale item', {
                        orderId: staleItem.orderId,
                        error: error.message
                    });
                }
            }

            await feedRepository.updateLastSyncTime();

            logger.info('Feed sync completed', { synced: feedItems.length });
            return { synced: feedItems.length };
        } catch (error) {
            logger.error('Feed sync failed', { error: error.message });
            throw error;
        }
    }

    async getCachedFeed(filters = {}) {
        logger.debug('Getting cached feed from database', { filters });

        const items = await feedRepository.getAllFeedItems(filters);
        const lastSync = await feedRepository.getLastSyncTime();

        return {
            items: items.map(item => ({
                orderId: item.orderId,
                orderNumber: item.orderNumber,
                applicationId: item.applicationId,
                creditCompany: item.creditCompany,
                customerName: item.customerName,
                bankStatus: item.bankStatus,
                crmStatus: item.crmStatus,
                paymentType: item.paymentType,
                orderStatus: item.orderStatus,
                managerId: item.managerId,
                managerName: item.managerName,
                conditionsChanged: item.conditionsChanged,
                comparison: item.comparison,
                createdAt: item.orderCreatedAt,
            })),
            lastSync,
            count: items.length,
        };
    }

    async removeFeedItem(orderId) {
        return await feedRepository.deleteFeedItem(orderId);
    }

    async updateOrderStatus(orderId, newStatus) {
        logger.info('Updating order status', { orderId, newStatus });

        const order = await simla.getOrder(orderId);
        if (!order) {
            throw new Error(`Order ${orderId} not found`);
        }

        await simla.updateOrderStatus(orderId, newStatus, order.site);

        logger.info('Order status updated successfully', { orderId, newStatus });

        return {
            orderId,
            newStatus,
            success: true
        };
    }

    async getContractsAndAttach(orderId) {
        logger.info('Getting contracts for order', { orderId });

        const order = await simla.getOrder(orderId);
        if (!order) {
            throw new Error(`Order ${orderId} not found`);
        }

        const orderData = simla.extractOrderData(order);

        if (!orderData.loanApplicationId) {
            throw new Error(`Order ${orderId} has no application ID`);
        }

        const contractsResponse = await microinvest.getContracts(orderData.loanApplicationId);

        if (!contractsResponse?.fileAttachmentSet || contractsResponse.fileAttachmentSet.length === 0) {
            throw new Error('No contracts available for this application');
        }

        const uploadedFiles = [];

        for (const file of contractsResponse.fileAttachmentSet) {
            const fileName = file.name || `contract_${Date.now()}.pdf`;

            await simla.uploadFileToOrder(orderId, fileName, file.data, order.site);
            uploadedFiles.push(fileName);

            logger.info('Contract file attached to order', {
                orderId,
                applicationId: orderData.loanApplicationId,
                fileName
            });
        }

        logger.info('All contracts attached successfully', {
            orderId,
            applicationId: orderData.loanApplicationId,
            filesCount: uploadedFiles.length
        });

        return {
            orderId,
            applicationId: orderData.loanApplicationId,
            filesCount: uploadedFiles.length,
            fileNames: uploadedFiles,
            success: true
        };
    }

    async getContractsForDownload(orderId) {
        logger.info('Getting contracts for download', { orderId });

        const order = await simla.getOrder(orderId);
        if (!order) {
            throw new Error(`Order ${orderId} not found`);
        }

        const orderData = simla.extractOrderData(order);

        if (!orderData.loanApplicationId) {
            throw new Error(`Order ${orderId} has no application ID`);
        }

        const contractsResponse = await microinvest.getContracts(orderData.loanApplicationId);

        if (!contractsResponse?.fileAttachmentSet || contractsResponse.fileAttachmentSet.length === 0) {
            throw new Error('No contracts available for this application');
        }

        const files = contractsResponse.fileAttachmentSet.map(file => ({
            name: file.name || `contract_${orderData.loanApplicationId}.pdf`,
            data: file.data
        }));

        const hasContracts = await simla.checkOrderHasContractFiles(orderId, order.site);
        if (!hasContracts) {
            for (const file of files) {
                try {
                    await simla.uploadFileToOrder(orderId, file.name, file.data, order.site);
                    logger.info('Contract attached via download button', {
                        orderId,
                        applicationId: orderData.loanApplicationId,
                        fileName: file.name
                    });
                } catch (uploadError) {
                    logger.error('Failed to attach contract via download', {
                        orderId,
                        fileName: file.name,
                        error: uploadError.message
                    });
                }
            }
        }

        logger.info('Contracts ready for download', {
            orderId,
            applicationId: orderData.loanApplicationId,
            filesCount: files.length
        });

        return {
            orderId,
            applicationId: orderData.loanApplicationId,
            files,
            success: true
        };
    }

    async refuseApplication(orderId, reason) {
        logger.info('Refusing application for order', { orderId, reason });

        const order = await simla.getOrder(orderId);
        if (!order) {
            throw new Error(`Order ${orderId} not found`);
        }

        const orderData = simla.extractOrderData(order);

        if (!orderData.loanApplicationId) {
            throw new Error(`Order ${orderId} has no application ID`);
        }

        await microinvest.sendRefuseRequest(orderData.loanApplicationId, reason);

        if (orderData.payment) {
            await simla.updatePaymentStatus(orderId, orderData.payment.id, 'credit-declined', order.site);
        }

        logger.info('Application refused successfully', {
            orderId,
            applicationId: orderData.loanApplicationId,
            reason
        });

        return {
            orderId,
            applicationId: orderData.loanApplicationId,
            success: true
        };
    }

    async getMessages(orderId, newOnly = true) {
        const order = await simla.getOrder(orderId);
        if (!order) {
            throw new Error(`Order ${orderId} not found`);
        }

        const orderData = simla.extractOrderData(order);

        if (!orderData.loanApplicationId) {
            throw new Error(`Order ${orderId} has no application ID`);
        }

        const response = await microinvest.getMessages(orderData.loanApplicationId, newOnly);

        const messages = response?.messageSet || [];

        const sentMessages = await feedRepository.getSentMessagesByApplicationId(orderData.loanApplicationId);

        const enrichedMessages = messages.map(msg => {
            if (msg.senderID && msg.senderID.startsWith('PAN')) {
                const matchingSent = sentMessages.find(sent =>
                    sent.messageText === msg.text &&
                    Math.abs(new Date(sent.sentAt).getTime() - new Date(msg.date).getTime()) < 60000
                );

                if (matchingSent) {
                    return {
                        ...msg,
                        managerName: matchingSent.managerName,
                        managerId: matchingSent.managerId
                    };
                }
            }
            return msg;
        });

        return {
            orderId,
            applicationId: orderData.loanApplicationId,
            messages: enrichedMessages,
            success: true
        };
    }

    async sendMessage(orderId, text, withFiles = false, managerId = null, managerName = null) {
        logger.info('Sending message for order', { orderId, withFiles, managerId, managerName });

        const order = await simla.getOrder(orderId);
        if (!order) {
            throw new Error(`Order ${orderId} not found`);
        }

        const orderData = simla.extractOrderData(order);

        if (!orderData.loanApplicationId) {
            throw new Error(`Order ${orderId} has no application ID`);
        }

        let files = null;
        if (withFiles) {
            files = await simla.getOrderFilesAsBase64(orderId, order.site);
            if (files.length === 0) {
                throw new Error(`Нет файлов для отправки`);
            }
        }

        await microinvest.sendMessage(orderData.loanApplicationId, text, files);

        if (managerId && managerName) {
            try {
                await feedRepository.saveSentMessage({
                    applicationId: orderData.loanApplicationId,
                    messageText: text,
                    managerId,
                    managerName
                });
                logger.info('Saved message sender info', {
                    applicationId: orderData.loanApplicationId,
                    managerId,
                    managerName
                });
            } catch (error) {
                logger.error('Failed to save message sender info', { error: error.message });
            }
        }

        logger.info('Message sent successfully', {
            orderId,
            applicationId: orderData.loanApplicationId,
            filesCount: files?.length || 0
        });

        return {
            orderId,
            applicationId: orderData.loanApplicationId,
            filesCount: files?.length || 0,
            success: true
        };
    }

    async getComparisonData(orderId) {
        const order = await simla.getOrder(orderId);
        if (!order) {
            throw new Error(`Order ${orderId} not found`);
        }

        const orderData = simla.extractOrderData(order);

        if (!orderData.loanApplicationId) {
            return {
                orderId,
                hasApplication: false,
                success: true
            };
        }

        const bankStatus = await microinvest.checkApplicationStatus(orderData.loanApplicationId);

        const requestedProductId = this.getLoanProductId(orderData.zeroCredit, orderData.creditTerm);
        const requestedProductName = this.getProductName(requestedProductId);

        const requested = {
            amount: parseFloat(orderData.payment?.amount) || 0,
            term: parseInt(orderData.creditTerm) || 0,
            productType: requestedProductName.startsWith('0%') ? '0%' : 'retail'
        };

        let approved = null;
        let comparison = null;

        const approvedStatuses = ['Approved', 'SignedOnline', 'SignedPhysically', 'Issued', 'PendingIssue'];
        const isApproved = bankStatus && approvedStatuses.includes(bankStatus.status);

        if (isApproved) {
            const approvedProductName = this.getProductName(bankStatus.loanProductID);

            approved = {
                amount: bankStatus.amount || 0,
                term: bankStatus.loanTerm || 0,
                productType: approvedProductName.startsWith('0%') ? '0%' : 'retail'
            };

            comparison = {
                amountMatch: requested.amount === approved.amount,
                termMatch: requested.term === approved.term,
                productMatch: requested.productType === approved.productType,
                hasChanges: requested.amount !== approved.amount ||
                    requested.term !== approved.term ||
                    requested.productType !== approved.productType
            };
        }

        return {
            orderId,
            applicationId: orderData.loanApplicationId,
            hasApplication: true,
            bankStatus: bankStatus?.status || null,
            crmStatus: orderData.payment?.status || null,
            requested,
            approved,
            comparison,
            customerName: bankStatus ? `${bankStatus.name || ''} ${bankStatus.surname || ''}`.trim() : null,
            success: true
        };
    }
}

module.exports = new CreditService();
