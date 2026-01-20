const microinvest = require('../clients/microinvest');
const easycredit = require('../clients/easycredit');
const iute = require('../clients/iute');
const simla = require('../clients/simla');
const config = require('../config');
const logger = require('../utils/logger');
const feedRepository = require('./feedRepository');
const { ARCHIVED_ORDER_STATUSES } = require('./feedRepository');

const CREDIT_COMPANY_EASYCREDIT = 'easycredit';
const CREDIT_COMPANY_MICROINVEST = 'microinvest';
const CREDIT_COMPANY_IUTE = 'iute';

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

    formatPhoneForEasyCredit(phone) {
        if (!phone) return null;
        let cleaned = phone.replace(/\D/g, '');
        if (cleaned.startsWith('373')) {
            cleaned = '0' + cleaned.substring(3);
        }
        if (!cleaned.startsWith('0')) {
            cleaned = '0' + cleaned;
        }
        return cleaned;
    }

    getCreditCompany(orderData) {
        const company = Array.isArray(orderData.creditCompany)
            ? orderData.creditCompany[0]
            : orderData.creditCompany;
        return company || CREDIT_COMPANY_MICROINVEST;
    }

    getEasyCreditProductId(term) {
        if (term >= 6 && term <= 11) return 54;
        if (term === 12) return 55;
        if (term >= 13 && term <= 18) return 56;
        if (term >= 19 && term <= 24) return 57;
        if (term >= 25 && term <= 36) return 58;
        return 54;
    }

    getGoodsNameFromOrder(order) {
        if (!order.items || order.items.length === 0) {
            return 'Товар';
        }
        if (order.items.length === 1) {
            return order.items[0].offer?.displayName || order.items[0].offer?.name || 'Товар';
        }
        const names = order.items.map(item =>
            item.offer?.displayName || item.offer?.name || 'Товар'
        );
        return names.join(', ').substring(0, 200);
    }

    async submitApplication(orderId, managerData = {}) {
        logger.info('Submitting application for order', { orderId, managerData });

        if (pendingSubmissions.has(orderId)) {
            throw new Error(`Заявка для заказа ${orderId} уже в процессе отправки`);
        }

        pendingSubmissions.add(orderId);

        try {
            return await this._submitApplicationInternal(orderId, managerData);
        } finally {
            pendingSubmissions.delete(orderId);
        }
    }

    async _submitApplicationInternal(orderId, managerData = {}) {
        const order = await simla.getOrder(orderId);
        if (!order) {
            throw new Error(`Order ${orderId} not found`);
        }

        const orderData = simla.extractOrderData(order);
        const creditCompany = this.getCreditCompany(orderData);

        logger.debug('Order custom fields', {
            orderId,
            customFields: order.customFields,
            creditCompany
        });

        if (creditCompany !== CREDIT_COMPANY_MICROINVEST && creditCompany !== CREDIT_COMPANY_EASYCREDIT) {
            throw new Error(`Order ${orderId} has unknown credit company: ${creditCompany}`);
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
            throw new Error(`Заказ ${orderId} не имеет кредитного типа оплаты`);
        }

        const files = await simla.getOrderFilesAsBase64(orderId, order.site);

        if (creditCompany === CREDIT_COMPANY_EASYCREDIT) {
            return await this._submitEasyCreditApplication(orderId, order, orderData, files, managerData);
        } else {
            return await this._submitMicroinvestApplication(orderId, order, orderData, files, managerData);
        }
    }

    async _submitMicroinvestApplication(orderId, order, orderData, files, managerData = {}) {
        if (files.length === 0) {
            throw new Error(`Необходимо прикрепить фото паспорта к заказу`);
        }

        const loanProductId = this.getLoanProductId(orderData.zeroCredit, orderData.creditTerm);

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

        logger.debug('Microinvest application data prepared', { orderId });

        const result = await microinvest.importLoanApplication(applicationData);

        if (!result?.applicationID) {
            throw new Error('No applicationID in response');
        }

        await simla.updateOrderWithApplicationId(orderId, result.applicationID, order.site);

        if (orderData.payment?.id) {
            await simla.updatePaymentStatus(orderId, orderData.payment.id, 'credit-check', order.site);
            await feedRepository.saveStatusHistory({
                applicationId: result.applicationID,
                statusType: 'crm',
                oldStatus: orderData.payment?.status || null,
                newStatus: 'credit-check',
                source: 'api',
                details: 'Application submitted',
                managerId: managerData.managerId,
                managerName: managerData.managerName
            });
        }

        try {
            await feedRepository.saveApplicationRequest({
                orderId,
                applicationId: result.applicationID,
                creditCompany: CREDIT_COMPANY_MICROINVEST,
                requestData: applicationData,
                filesCount: files.length,
                fileNames: files.map(f => f.name)
            });
        } catch (saveError) {
            logger.error('Failed to save application request data', {
                orderId,
                applicationId: result.applicationID,
                error: saveError.message
            });
        }

        logger.info('Microinvest application submitted successfully', {
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

    async _submitEasyCreditApplication(orderId, order, orderData, files, managerData = {}) {
        const productId = this.getEasyCreditProductId(parseInt(orderData.creditTerm) || 6);
        const firstInstallmentDate = easycredit.calculateFirstInstallmentDate(20);

        const applicationData = {
            productId,
            idnp: orderData.idnp,
            birthDate: this.formatBirthday(orderData.birthday),
            firstName: orderData.name || '',
            lastName: orderData.surname || '',
            phone: this.formatPhoneForEasyCredit(orderData.phone),
            goodsName: this.getGoodsNameFromOrder(order),
            amount: parseFloat(orderData.payment.amount),
            term: parseInt(orderData.creditTerm) || 6,
            firstInstallmentDate
        };

        logger.debug('Easy Credit application data prepared', { orderId, productId });

        const result = await easycredit.createRequest(applicationData);

        if (result?.Status !== 'OK' || !result?.URN) {
            throw new Error(result?.Status || 'No URN in response');
        }

        const urn = result.URN;

        if (files.length > 0) {
            try {
                await new Promise(resolve => setTimeout(resolve, 2000));
                logger.debug('Starting file upload to Easy Credit after delay', { urn, filesCount: files.length });

                await easycredit.uploadFiles(urn, files);
                logger.info('Files uploaded to Easy Credit', {
                    orderId,
                    urn,
                    filesCount: files.length
                });
            } catch (uploadError) {
                logger.error('Failed to upload files to Easy Credit', {
                    orderId,
                    urn,
                    error: uploadError.message,
                    response: uploadError.response?.data
                });
            }
        }

        await simla.updateOrderWithApplicationId(orderId, urn, order.site);

        if (orderData.payment?.id) {
            await simla.updatePaymentStatus(orderId, orderData.payment.id, 'credit-check', order.site);
            await feedRepository.saveStatusHistory({
                applicationId: urn,
                statusType: 'crm',
                oldStatus: orderData.payment?.status || null,
                newStatus: 'credit-check',
                source: 'api',
                details: 'Application submitted',
                managerId: managerData.managerId,
                managerName: managerData.managerName
            });
        }

        try {
            await feedRepository.saveApplicationRequest({
                orderId,
                applicationId: urn,
                creditCompany: CREDIT_COMPANY_EASYCREDIT,
                requestData: applicationData,
                filesCount: files.length,
                fileNames: files.map(f => f.name)
            });
        } catch (saveError) {
            logger.error('Failed to save application request data', {
                orderId,
                applicationId: urn,
                error: saveError.message
            });
        }

        logger.info('Easy Credit application submitted successfully', {
            orderId,
            urn,
            filesCount: files.length
        });

        return {
            orderId,
            applicationId: urn,
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

        const creditCompany = this.getCreditCompany(orderData);

        if (creditCompany === CREDIT_COMPANY_EASYCREDIT) {
            await easycredit.uploadFiles(orderData.loanApplicationId, files);
            logger.info('Files sent to Easy Credit', {
                orderId,
                urn: orderData.loanApplicationId,
                filesCount: files.length
            });
        } else {
            await microinvest.sendContracts(orderData.loanApplicationId, files);
            logger.info('Files sent to Microinvest', {
                orderId,
                applicationId: orderData.loanApplicationId,
                filesCount: files.length
            });
        }

        return {
            orderId,
            applicationId: orderData.loanApplicationId,
            filesCount: files.length,
            creditCompany,
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
        const creditCompany = this.getCreditCompany(orderData);

        if (!orderData.loanApplicationId) {
            logger.debug('Order has no application ID', { orderId });
            return null;
        }

        if (creditCompany === CREDIT_COMPANY_EASYCREDIT) {
            return await this._checkEasyCreditStatus(orderId, order, orderData);
        } else {
            return await this._checkMicroinvestStatus(orderId, order, orderData);
        }
    }

    async _checkMicroinvestStatus(orderId, order, orderData) {
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

            await feedRepository.saveStatusHistory({
                applicationId: orderData.loanApplicationId,
                statusType: 'bank',
                oldStatus: null,
                newStatus: bankStatus.status,
                source: 'cron'
            });

            await feedRepository.saveStatusHistory({
                applicationId: orderData.loanApplicationId,
                statusType: 'crm',
                oldStatus: orderData.payment.status,
                newStatus: crmStatus,
                source: 'cron',
                details: crmStatus === 'conditions-changed' ? 'Bank changed conditions' : null
            });

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

    async _checkEasyCreditStatus(orderId, order, orderData) {
        const statusResponse = await easycredit.checkStatus(orderData.loanApplicationId);

        if (!statusResponse || statusResponse.Status !== 'OK') {
            logger.debug('Easy Credit status not available', {
                orderId,
                urn: orderData.loanApplicationId,
                status: statusResponse?.Status
            });
            return null;
        }

        const requestStatus = statusResponse.RequestStatus;
        const documentStatus = statusResponse.DocumentStatus;

        let crmStatus = config.easyCreditStatusMapping[requestStatus];

        if (!crmStatus) {
            logger.warn('Unknown Easy Credit status', { orderId, requestStatus });
            return null;
        }

        if (crmStatus === 'credit-approved' && requestStatus === 'Approved') {
            const hasChanges = this.checkEasyCreditConditionsChanged(orderData, statusResponse);
            if (hasChanges) {
                crmStatus = 'conditions-changed';
                logger.info('Easy Credit changed conditions', {
                    orderId,
                    urn: orderData.loanApplicationId
                });
            }
        }

        if (orderData.payment && orderData.payment.status !== crmStatus) {
            await simla.updatePaymentStatus(orderId, orderData.payment.id, crmStatus, order.site);

            await feedRepository.saveStatusHistory({
                applicationId: orderData.loanApplicationId,
                statusType: 'bank',
                oldStatus: null,
                newStatus: requestStatus,
                source: 'cron'
            });

            await feedRepository.saveStatusHistory({
                applicationId: orderData.loanApplicationId,
                statusType: 'crm',
                oldStatus: orderData.payment.status,
                newStatus: crmStatus,
                source: 'cron',
                details: crmStatus === 'conditions-changed' ? 'Bank changed conditions' : null
            });

            logger.info('Order status updated (Easy Credit)', {
                orderId,
                urn: orderData.loanApplicationId,
                requestStatus,
                documentStatus,
                crmStatus
            });
        }

        if (requestStatus === 'Approved' && orderData.payment?.type === 'credit') {
            await this.autoAttachEasyCreditContracts(orderId, orderData.loanApplicationId, order.site);
        }

        return {
            orderId,
            applicationId: orderData.loanApplicationId,
            bankStatus: requestStatus,
            documentStatus,
            crmStatus,
            isFinal: config.easyCreditFinalStatuses.includes(requestStatus)
        };
    }

    checkEasyCreditConditionsChanged(orderData, statusResponse) {
        const requestedAmount = parseFloat(orderData.payment?.amount) || 0;
        const requestedTerm = parseInt(orderData.creditTerm) || 0;

        const approvedAmount = statusResponse.LoanAmount || 0;
        const approvedTerm = statusResponse.Installments || 0;

        const amountChanged = Math.abs(requestedAmount - approvedAmount) > 1;
        const termChanged = requestedTerm !== approvedTerm;

        if (amountChanged || termChanged) {
            logger.debug('Easy Credit conditions comparison', {
                requested: { amount: requestedAmount, term: requestedTerm },
                approved: { amount: approvedAmount, term: approvedTerm },
                changes: { amountChanged, termChanged }
            });
            return true;
        }

        return false;
    }

    async autoAttachEasyCreditContracts(orderId, urn, site) {
        try {
            const hasContracts = await simla.checkOrderHasContractFiles(orderId, site);
            if (hasContracts) {
                logger.debug('Contracts already attached', { orderId, urn });
                return;
            }

            const contractResponse = await easycredit.getContract(urn, 'RO');
            if (!contractResponse?.DocTypeA) {
                logger.debug('No Easy Credit contract available yet', { orderId, urn });
                return;
            }

            const fileName = `contract_${urn}.pdf`;
            await simla.uploadFileToOrder(orderId, fileName, contractResponse.DocTypeA, site);

            logger.info('Easy Credit contract auto-attached to order', {
                orderId,
                urn,
                fileName
            });
        } catch (error) {
            logger.error('Auto-attach Easy Credit contract failed', {
                orderId,
                urn,
                error: error.message
            });
        }
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

                const creditCompany = this.getCreditCompany(orderData);
                let bankStatusValue = 'Unknown';
                let documentStatus = null;
                let conditionsChanged = false;
                let comparison = {
                    requested: {
                        amount: parseFloat(orderData.payment?.amount) || 0,
                        term: parseInt(orderData.creditTerm) || 0,
                        productType: 'retail'
                    },
                    approved: null
                };

                if (creditCompany === CREDIT_COMPANY_EASYCREDIT) {
                    const statusResponse = await easycredit.checkStatus(orderData.loanApplicationId);
                    if (statusResponse && statusResponse.Status === 'OK') {
                        bankStatusValue = statusResponse.RequestStatus || 'Unknown';
                        documentStatus = statusResponse.DocumentStatus || null;

                        if (statusResponse.RequestStatus === 'Approved') {
                            conditionsChanged = this.checkEasyCreditConditionsChanged(orderData, statusResponse);
                            comparison.approved = {
                                amount: statusResponse.LoanAmount || 0,
                                term: statusResponse.Installments || 0,
                                productType: 'retail'
                            };
                        }
                    }
                } else {
                    const bankStatus = await microinvest.checkApplicationStatus(orderData.loanApplicationId);
                    if (bankStatus) {
                        bankStatusValue = bankStatus.status || 'Unknown';

                        const requestedProductId = this.getLoanProductId(orderData.zeroCredit, orderData.creditTerm);
                        const requestedProductName = this.getProductName(requestedProductId);
                        comparison.requested.productType = requestedProductName.startsWith('0%') ? '0%' : 'retail';

                        if (bankStatus.status === 'Approved') {
                            conditionsChanged = this.checkConditionsChanged(orderData, bankStatus);
                            const approvedProductName = this.getProductName(bankStatus.loanProductID);
                            comparison.approved = {
                                amount: bankStatus.amount || 0,
                                term: bankStatus.loanTerm || 0,
                                productType: approvedProductName.startsWith('0%') ? '0%' : 'retail'
                            };
                        }
                    }
                }

                const fullOrder = await simla.getOrder(order.id);
                const managerId = fullOrder?.managerId || order.managerId || null;
                const managerName = await simla.getManagerName(managerId);
                logger.debug('Manager info', { orderId: order.id, managerId, managerName });

                feedItems.push({
                    orderId: order.id,
                    orderNumber: order.number,
                    applicationId: orderData.loanApplicationId,
                    creditCompany: creditCompany,
                    customerName: `${orderData.name || ''} ${orderData.surname || ''}`.trim() || '-',
                    bankStatus: bankStatusValue,
                    documentStatus: documentStatus,
                    crmStatus: orderData.payment?.status || null,
                    paymentType: orderData.payment?.type || null,
                    orderStatus: fullOrder?.status || order.status || null,
                    managerId: managerId,
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
                documentStatus: item.documentStatus,
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
                documentStatus: item.documentStatus,
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
        const creditCompany = this.getCreditCompany(orderData);

        if (!orderData.loanApplicationId) {
            throw new Error(`Order ${orderId} has no application ID`);
        }

        let files = [];

        if (creditCompany === CREDIT_COMPANY_EASYCREDIT) {
            const contractResponse = await easycredit.getContract(orderData.loanApplicationId, 'RO');

            if (!contractResponse?.DocTypeA) {
                throw new Error('Контракт пока недоступен. Заявка должна быть одобрена.');
            }

            files = [{
                name: `contract_${orderData.loanApplicationId}.pdf`,
                data: contractResponse.DocTypeA
            }];
        } else {
            const contractsResponse = await microinvest.getContracts(orderData.loanApplicationId);

            if (!contractsResponse?.fileAttachmentSet || contractsResponse.fileAttachmentSet.length === 0) {
                throw new Error('No contracts available for this application');
            }

            files = contractsResponse.fileAttachmentSet.map(file => ({
                name: file.name || `contract_${orderData.loanApplicationId}.pdf`,
                data: file.data
            }));
        }

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

    async refuseApplication(orderId, reason, managerData = {}) {
        logger.info('Refusing application for order', { orderId, reason, managerData });

        const order = await simla.getOrder(orderId);
        if (!order) {
            throw new Error(`Order ${orderId} not found`);
        }

        const orderData = simla.extractOrderData(order);
        const creditCompany = this.getCreditCompany(orderData);

        if (!orderData.loanApplicationId) {
            throw new Error(`Order ${orderId} has no application ID`);
        }

        if (creditCompany === CREDIT_COMPANY_EASYCREDIT) {
            await easycredit.cancelRequest(orderData.loanApplicationId);
        } else {
            await microinvest.sendRefuseRequest(orderData.loanApplicationId, reason);
        }

        if (orderData.payment) {
            await simla.updatePaymentStatus(orderId, orderData.payment.id, 'credit-declined', order.site);
            await feedRepository.saveStatusHistory({
                applicationId: orderData.loanApplicationId,
                statusType: 'crm',
                oldStatus: orderData.payment.status,
                newStatus: 'credit-declined',
                source: 'api',
                details: reason ? `Refused: ${reason}` : 'Application cancelled',
                managerId: managerData.managerId,
                managerName: managerData.managerName
            });
        }

        logger.info('Application refused successfully', {
            orderId,
            applicationId: orderData.loanApplicationId,
            creditCompany,
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
        const creditCompany = this.getCreditCompany(orderData);

        if (!orderData.loanApplicationId) {
            throw new Error(`Order ${orderId} has no application ID`);
        }

        if (creditCompany === CREDIT_COMPANY_EASYCREDIT) {
            const statusResponse = await easycredit.checkStatus(orderData.loanApplicationId);
            const messages = [];

            if (statusResponse?.Message && statusResponse.Message.trim() && statusResponse.Message !== ' # ') {
                messages.push({
                    date: new Date().toISOString(),
                    senderName: 'Easy Credit',
                    senderID: 'easycredit',
                    text: statusResponse.Message
                });
            }

            return {
                orderId,
                applicationId: orderData.loanApplicationId,
                messages,
                isEasyCredit: true,
                success: true
            };
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
        const creditCompany = this.getCreditCompany(orderData);

        if (!orderData.loanApplicationId) {
            throw new Error(`Order ${orderId} has no application ID`);
        }

        if (creditCompany === CREDIT_COMPANY_EASYCREDIT) {
            throw new Error('Easy Credit не поддерживает отправку сообщений. Банк отправляет комментарии в одностороннем порядке.');
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

    async getApplicationRequestData(applicationId, orderId) {
        let request = null;

        if (applicationId) {
            request = await feedRepository.getApplicationRequest(applicationId);
        } else if (orderId) {
            request = await feedRepository.getApplicationRequestByOrderId(orderId);
        }

        if (!request) {
            return {
                success: false,
                error: 'Данные заявки не найдены. Они сохраняются только для новых заявок.'
            };
        }

        return {
            success: true,
            orderId: request.orderId,
            applicationId: request.applicationId,
            creditCompany: request.creditCompany,
            requestData: request.requestData,
            filesCount: request.filesCount,
            fileNames: request.fileNames,
            createdAt: request.createdAt
        };
    }

    async getComparisonData(orderId) {
        const order = await simla.getOrder(orderId);
        if (!order) {
            throw new Error(`Order ${orderId} not found`);
        }

        const orderData = simla.extractOrderData(order);
        const creditCompany = this.getCreditCompany(orderData);

        if (!orderData.loanApplicationId) {
            return {
                orderId,
                hasApplication: false,
                creditCompany,
                success: true
            };
        }

        let bankStatusValue = null;
        let documentStatus = null;
        let customerName = null;
        let approved = null;
        let comparison = null;

        const requested = {
            amount: parseFloat(orderData.payment?.amount) || 0,
            term: parseInt(orderData.creditTerm) || 0,
            productType: 'retail'
        };

        if (creditCompany === CREDIT_COMPANY_EASYCREDIT) {
            const statusResponse = await easycredit.checkStatus(orderData.loanApplicationId);
            if (statusResponse && statusResponse.Status === 'OK') {
                bankStatusValue = statusResponse.RequestStatus || null;
                documentStatus = statusResponse.DocumentStatus || null;

                const approvedStatuses = ['Approved', 'Disbursed', 'Settled'];
                if (approvedStatuses.includes(statusResponse.RequestStatus)) {
                    approved = {
                        amount: statusResponse.LoanAmount || 0,
                        term: statusResponse.Installments || 0,
                        productType: 'retail'
                    };

                    comparison = {
                        amountMatch: Math.abs(requested.amount - approved.amount) <= 1,
                        termMatch: requested.term === approved.term,
                        productMatch: true,
                        hasChanges: Math.abs(requested.amount - approved.amount) > 1 ||
                            requested.term !== approved.term
                    };
                }
            }
        } else {
            const bankStatus = await microinvest.checkApplicationStatus(orderData.loanApplicationId);
            if (bankStatus) {
                bankStatusValue = bankStatus.status;

                const requestedProductId = this.getLoanProductId(orderData.zeroCredit, orderData.creditTerm);
                const requestedProductName = this.getProductName(requestedProductId);
                requested.productType = requestedProductName.startsWith('0%') ? '0%' : 'retail';

                const approvedStatuses = ['Approved', 'SignedOnline', 'SignedPhysically', 'Issued', 'PendingIssue'];
                if (approvedStatuses.includes(bankStatus.status)) {
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

                customerName = `${bankStatus.name || ''} ${bankStatus.surname || ''}`.trim() || null;
            }
        }

        return {
            orderId,
            applicationId: orderData.loanApplicationId,
            hasApplication: true,
            creditCompany,
            bankStatus: bankStatusValue,
            documentStatus,
            crmStatus: orderData.payment?.status || null,
            requested,
            approved,
            comparison,
            customerName,
            success: true
        };
    }

    async getStatusHistory(applicationId) {
        const history = await feedRepository.getStatusHistory(applicationId);

        return {
            applicationId,
            history: history.map(item => ({
                id: item.id,
                statusType: item.statusType,
                oldStatus: item.oldStatus,
                newStatus: item.newStatus,
                source: item.source,
                details: item.details,
                createdAt: item.createdAt
            })),
            success: true
        };
    }

    getFileCleanupStatuses() {
        return [
            'complete',
            'delivered',
            'no-call',
            'no-product',
            'already-buyed',
            'delyv-did-not-suit',
            'prices-did-not-suit',
            'cancel-other',
            'purchase-return',
            'ne-zabral-zakaz'
        ];
    }

    async getFileCleanupStats() {
        const stats = await simla.getFileCleanupStats({
            creditStatuses: this.getFileCleanupStatuses(),
            olderThanMonths: 2
        });

        return {
            success: true,
            ...stats
        };
    }

    async cleanupFilesForArchivedOrders() {
        logger.info('Starting file cleanup for archived orders');

        const orders = await simla.getOrdersForFileCleanup({
            creditStatuses: this.getFileCleanupStatuses(),
            olderThanMonths: 2
        });

        logger.info('Found orders for file cleanup', { count: orders.length });

        let totalDeleted = 0;
        let ordersProcessed = 0;
        let ordersCleaned = 0;

        for (const order of orders) {
            try {
                const result = await simla.deleteOrderFiles(order.id, order.site);
                ordersProcessed++;

                if (result.deletedCount > 0) {
                    totalDeleted += result.deletedCount;
                    ordersCleaned++;
                }
            } catch (error) {
                logger.error('Failed to cleanup files for order', {
                    orderId: order.id,
                    error: error.message
                });
            }
        }

        logger.info('File cleanup completed', {
            ordersProcessed,
            ordersCleaned,
            totalDeleted
        });

        return {
            success: true,
            ordersProcessed,
            ordersCleaned,
            totalDeleted
        };
    }

    async syncCrmHistory() {
        const TRACKED_FIELDS = [
            'payments.status',
            'customFields.credit_sum',
            'customFields.credit_term',
            'customFields.credit_company'
        ];

        const FIELD_LABELS = {
            'payments.status': 'Статус платежа',
            'customFields.credit_sum': 'Сумма кредита',
            'customFields.credit_term': 'Срок кредита',
            'customFields.credit_company': 'Кредитная компания'
        };

        try {
            const lastSyncId = await feedRepository.getSyncMetadata('lastHistoryId');
            const sinceId = lastSyncId ? parseInt(lastSyncId) : null;

            const { history } = await simla.getOrdersHistory(sinceId, 100);

            if (!history || history.length === 0) {
                return { processed: 0, saved: 0 };
            }

            let processed = 0;
            let saved = 0;
            let maxId = sinceId || 0;

            for (const change of history) {
                if (change.id > maxId) {
                    maxId = change.id;
                }

                if (change.source !== 'user') {
                    continue;
                }

                const fieldPath = change.field;
                if (!TRACKED_FIELDS.some(f => fieldPath?.startsWith(f))) {
                    continue;
                }

                const orderId = change.order?.id;
                if (!orderId) continue;

                try {
                    const order = await simla.getOrder(orderId);
                    if (!order) continue;

                    const orderData = simla.extractOrderData(order);
                    const applicationId = orderData.loanApplicationId;

                    if (!applicationId) continue;

                    let managerName = null;
                    if (change.user?.id) {
                        managerName = await simla.getUserName(change.user.id);
                    }

                    const fieldLabel = FIELD_LABELS[fieldPath] || fieldPath;
                    const details = `${fieldLabel}: ${change.oldValue || '-'} -> ${change.newValue || '-'}`;

                    await feedRepository.saveStatusHistory({
                        applicationId,
                        statusType: 'crm',
                        oldStatus: String(change.oldValue || ''),
                        newStatus: String(change.newValue || ''),
                        source: 'user',
                        details,
                        managerId: change.user?.id || null,
                        managerName
                    });

                    saved++;
                    logger.debug('CRM history change saved', {
                        orderId,
                        applicationId,
                        field: fieldPath,
                        managerName
                    });
                } catch (err) {
                    logger.error('Failed to process history change', {
                        changeId: change.id,
                        error: err.message
                    });
                }

                processed++;
            }

            if (maxId > (sinceId || 0)) {
                await feedRepository.saveSyncMetadata('lastHistoryId', String(maxId));
            }

            if (saved > 0) {
                logger.info('CRM history sync completed', { processed, saved });
            }

            return { processed, saved };
        } catch (error) {
            logger.error('syncCrmHistory failed', { error: error.message });
            return { processed: 0, saved: 0, error: error.message };
        }
    }

    async submitIuteApplication(orderId, phone, amount, managerData = {}) {
        logger.info('Submitting Iute application', { orderId, phone, amount, managerData });

        if (pendingSubmissions.has(orderId)) {
            throw new Error(`Заявка для заказа ${orderId} уже в процессе отправки`);
        }

        pendingSubmissions.add(orderId);

        try {
            const order = await simla.getOrder(orderId);
            if (!order) {
                throw new Error(`Заказ ${orderId} не найден в CRM`);
            }

            const orderData = simla.extractOrderData(order);

            if (orderData.loanApplicationId) {
                throw new Error(`Заказ ${orderId} уже имеет заявку: ${orderData.loanApplicationId}`);
            }

            const finalAmount = amount || orderData.totalSumm;
            const customerPhone = phone || orderData.phone;

            if (!customerPhone) {
                throw new Error('Телефон клиента не указан в заказе');
            }

            const formattedPhone = this.formatPhone(customerPhone);

            const iuteOrderId = `CRM-${orderId}`;

            const result = await iute.createOrder({
                orderId: iuteOrderId,
                phone: formattedPhone,
                amount: finalAmount,
                currency: 'MDL',
                items: order.items?.map(item => ({
                    name: item.offer?.displayName || item.offer?.name || 'Товар',
                    id: String(item.offer?.id || item.id),
                    sku: item.offer?.article,
                    price: item.initialPrice,
                    quantity: item.quantity,
                    imageUrl: item.offer?.images?.[0],
                    url: item.offer?.url
                }))
            });

            await simla.updateOrderFields(orderId, {
                [config.crmFields.loanApplicationId]: iuteOrderId,
                [config.crmFields.creditCompany]: CREDIT_COMPANY_IUTE
            });

            const crmStatus = config.iuteStatusMapping[result.status];
            if (crmStatus) {
                await simla.updateOrderPaymentStatus(orderId, crmStatus);
            }

            await feedRepository.saveApplication({
                applicationId: iuteOrderId,
                orderNumber: orderId,
                creditCompany: CREDIT_COMPANY_IUTE,
                bankStatus: result.status,
                customerName: orderData.customerFullName,
                customerPhone: formattedPhone,
                amount: finalAmount,
                term: null,
                productName: null
            });

            await feedRepository.saveStatusHistory({
                applicationId: iuteOrderId,
                statusType: 'bank',
                oldStatus: null,
                newStatus: result.status,
                source: 'api',
                details: result.myiuteCustomer ? 'Клиент MyIute' : 'Клиент не в MyIute, отправлено SMS',
                managerId: managerData.managerId,
                managerName: managerData.managerName
            });

            logger.info('Iute application submitted', {
                orderId,
                iuteOrderId,
                status: result.status,
                myiuteCustomer: result.myiuteCustomer
            });

            return {
                success: true,
                applicationId: iuteOrderId,
                status: result.status,
                message: result.message,
                myiuteCustomer: result.myiuteCustomer
            };
        } finally {
            pendingSubmissions.delete(orderId);
        }
    }

    async handleIuteWebhook(type, body, timestamp, signature) {
        const { orderId, totalAmount, description } = body;

        logger.info('Processing Iute webhook', { type, orderId, totalAmount, description });

        const application = await feedRepository.getApplicationByApplicationId(orderId);
        if (!application) {
            logger.warn('Iute webhook: application not found', { orderId });
            throw new Error(`Application not found: ${orderId}`);
        }

        const crmOrderId = application.orderNumber;
        const oldStatus = application.bankStatus;
        let newStatus;

        if (type === 'confirm') {
            newStatus = 'PAID';
        } else if (type === 'cancel') {
            newStatus = 'CANCELLED';
        } else {
            throw new Error(`Unknown webhook type: ${type}`);
        }

        await feedRepository.updateApplicationStatus(orderId, newStatus);

        const crmStatus = config.iuteStatusMapping[newStatus];
        if (crmStatus && crmOrderId) {
            await simla.updateOrderPaymentStatus(crmOrderId, crmStatus);
        }

        await feedRepository.saveStatusHistory({
            applicationId: orderId,
            statusType: 'bank',
            oldStatus,
            newStatus,
            source: 'webhook',
            details: description || (type === 'confirm' ? 'Кредит выдан' : 'Заявка отменена')
        });

        logger.info('Iute webhook processed', {
            orderId,
            type,
            oldStatus,
            newStatus,
            crmOrderId
        });

        return { success: true, status: newStatus };
    }

    async checkIuteApplicationStatus(applicationId) {
        try {
            const result = await iute.getOrderStatus(applicationId);
            if (!result) {
                return null;
            }

            const application = await feedRepository.getApplicationByApplicationId(applicationId);
            if (application && application.bankStatus !== result.status) {
                await feedRepository.updateApplicationStatus(applicationId, result.status);

                const crmStatus = config.iuteStatusMapping[result.status];
                if (crmStatus && application.orderNumber) {
                    await simla.updateOrderPaymentStatus(application.orderNumber, crmStatus);
                }

                await feedRepository.saveStatusHistory({
                    applicationId,
                    statusType: 'bank',
                    oldStatus: application.bankStatus,
                    newStatus: result.status,
                    source: 'cron'
                });
            }

            return result;
        } catch (error) {
            logger.error('Failed to check Iute application status', { applicationId, error: error.message });
            return null;
        }
    }
}

module.exports = new CreditService();
