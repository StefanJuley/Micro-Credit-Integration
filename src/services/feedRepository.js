const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

const prisma = new PrismaClient();

const ARCHIVED_ORDER_STATUSES = [
    'delivering',
    'delivered',
    'complete',
    'shipped',
    'no-call',
    'no-product',
    'already-buyed',
    'delyv-did-not-suit',
    'prices-did-not-suit',
    'cancel-other',
    'purchase-return',
    'ne-zabral-zakaz'
];

class FeedRepository {
    async upsertFeedItem(item) {
        try {
            return await prisma.feedItem.upsert({
                where: { orderId: item.orderId },
                update: {
                    orderNumber: item.orderNumber,
                    applicationId: item.applicationId,
                    creditCompany: item.creditCompany || null,
                    customerName: item.customerName,
                    bankStatus: item.bankStatus,
                    documentStatus: item.documentStatus || null,
                    crmStatus: item.crmStatus || null,
                    paymentType: item.paymentType || null,
                    orderStatus: item.orderStatus || null,
                    managerId: item.managerId || null,
                    managerName: item.managerName || null,
                    conditionsChanged: item.conditionsChanged || false,
                    comparison: item.comparison || null,
                    orderCreatedAt: item.orderCreatedAt ? new Date(item.orderCreatedAt) : null,
                },
                create: {
                    orderId: item.orderId,
                    orderNumber: item.orderNumber,
                    applicationId: item.applicationId,
                    creditCompany: item.creditCompany || null,
                    customerName: item.customerName,
                    bankStatus: item.bankStatus,
                    documentStatus: item.documentStatus || null,
                    crmStatus: item.crmStatus || null,
                    paymentType: item.paymentType || null,
                    orderStatus: item.orderStatus || null,
                    managerId: item.managerId || null,
                    managerName: item.managerName || null,
                    conditionsChanged: item.conditionsChanged || false,
                    comparison: item.comparison || null,
                    orderCreatedAt: item.orderCreatedAt ? new Date(item.orderCreatedAt) : null,
                },
            });
        } catch (error) {
            logger.error('Failed to upsert feed item', { orderId: item.orderId, error: error.message });
            throw error;
        }
    }

    async upsertMany(items) {
        const results = [];
        for (const item of items) {
            try {
                const result = await this.upsertFeedItem(item);
                results.push(result);
            } catch (error) {
                logger.error('Failed to upsert item in batch', { orderId: item.orderId, error: error.message });
            }
        }
        return results;
    }

    async getAllFeedItems(filters = {}) {
        const where = {};

        if (filters.bankStatus) {
            where.bankStatus = filters.bankStatus;
        }

        if (filters.conditionsChanged !== undefined) {
            where.conditionsChanged = filters.conditionsChanged;
        }

        if (filters.creditCompany) {
            where.creditCompany = filters.creditCompany;
        }

        if (filters.archive === true) {
            where.orderStatus = { in: ARCHIVED_ORDER_STATUSES };
        } else if (filters.archive === false) {
            where.OR = [
                { orderStatus: null },
                { orderStatus: { notIn: ARCHIVED_ORDER_STATUSES } }
            ];
        }

        return await prisma.feedItem.findMany({
            where,
            orderBy: { orderCreatedAt: 'desc' },
        });
    }

    async getFeedItemByOrderId(orderId) {
        return await prisma.feedItem.findUnique({
            where: { orderId },
        });
    }

    async deleteFeedItem(orderId) {
        try {
            return await prisma.feedItem.delete({
                where: { orderId },
            });
        } catch (error) {
            if (error.code === 'P2025') {
                return null;
            }
            throw error;
        }
    }

    async deleteByStatus(statuses) {
        return await prisma.feedItem.deleteMany({
            where: {
                bankStatus: { in: statuses },
            },
        });
    }

    async getLastSyncTime() {
        const metadata = await prisma.syncMetadata.findUnique({
            where: { key: 'feed_last_sync' },
        });
        return metadata ? new Date(metadata.value) : null;
    }

    async updateLastSyncTime() {
        const now = new Date().toISOString();
        await prisma.syncMetadata.upsert({
            where: { key: 'feed_last_sync' },
            update: { value: now },
            create: { key: 'feed_last_sync', value: now },
        });
        return now;
    }

    async getCount() {
        return await prisma.feedItem.count();
    }

    async saveSentMessage(data) {
        return await prisma.sentMessage.create({
            data: {
                applicationId: data.applicationId,
                messageText: data.messageText,
                managerId: data.managerId,
                managerName: data.managerName
            }
        });
    }

    async getSentMessagesByApplicationId(applicationId) {
        return await prisma.sentMessage.findMany({
            where: { applicationId },
            orderBy: { sentAt: 'asc' }
        });
    }

    async saveApplicationRequest(data) {
        try {
            return await prisma.applicationRequest.upsert({
                where: { applicationId: data.applicationId },
                update: {
                    orderId: data.orderId,
                    creditCompany: data.creditCompany,
                    requestData: data.requestData,
                    filesCount: data.filesCount || 0,
                    fileNames: data.fileNames || []
                },
                create: {
                    orderId: data.orderId,
                    applicationId: data.applicationId,
                    creditCompany: data.creditCompany,
                    requestData: data.requestData,
                    filesCount: data.filesCount || 0,
                    fileNames: data.fileNames || []
                }
            });
        } catch (error) {
            logger.error('Failed to save application request', {
                applicationId: data.applicationId,
                error: error.message
            });
            throw error;
        }
    }

    async getApplicationRequest(applicationId) {
        return await prisma.applicationRequest.findUnique({
            where: { applicationId }
        });
    }

    async getApplicationRequestByOrderId(orderId) {
        return await prisma.applicationRequest.findFirst({
            where: { orderId }
        });
    }

    async saveStatusHistory(data) {
        try {
            return await prisma.statusHistory.create({
                data: {
                    applicationId: data.applicationId,
                    statusType: data.statusType,
                    oldStatus: data.oldStatus || null,
                    newStatus: data.newStatus,
                    source: data.source,
                    details: data.details || null,
                    managerId: data.managerId || null,
                    managerName: data.managerName || null
                }
            });
        } catch (error) {
            logger.error('Failed to save status history', {
                applicationId: data.applicationId,
                error: error.message
            });
        }
    }

    async getStatusHistory(applicationId) {
        return await prisma.statusHistory.findMany({
            where: { applicationId },
            orderBy: { createdAt: 'asc' }
        });
    }

    async updateApplicationStatus(applicationId, bankStatus, crmStatus = null) {
        try {
            const updateData = { bankStatus };
            if (crmStatus !== null) {
                updateData.crmStatus = crmStatus;
            }

            return await prisma.feedItem.updateMany({
                where: { applicationId },
                data: updateData
            });
        } catch (error) {
            logger.error('Failed to update application status', {
                applicationId,
                bankStatus,
                crmStatus,
                error: error.message
            });
        }
    }

    async getApplicationByApplicationId(applicationId) {
        return await prisma.feedItem.findFirst({
            where: { applicationId }
        });
    }

    async getSyncMetadata(key) {
        const record = await prisma.syncMetadata.findUnique({
            where: { key }
        });
        return record?.value || null;
    }

    async saveSyncMetadata(key, value) {
        await prisma.syncMetadata.upsert({
            where: { key },
            update: { value },
            create: { key, value }
        });
    }

    async disconnect() {
        await prisma.$disconnect();
    }
}

module.exports = new FeedRepository();
module.exports.ARCHIVED_ORDER_STATUSES = ARCHIVED_ORDER_STATUSES;
