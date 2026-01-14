const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

const prisma = new PrismaClient();

const ARCHIVED_ORDER_STATUSES = ['delivering', 'cancel-other', 'complete', 'shipped'];

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
                    crmStatus: item.crmStatus || null,
                    paymentType: item.paymentType || null,
                    orderStatus: item.orderStatus || null,
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
                    crmStatus: item.crmStatus || null,
                    paymentType: item.paymentType || null,
                    orderStatus: item.orderStatus || null,
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

    async disconnect() {
        await prisma.$disconnect();
    }
}

module.exports = new FeedRepository();
