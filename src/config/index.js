require('dotenv').config();

module.exports = {
    server: {
        port: process.env.PORT || 3000,
        env: process.env.NODE_ENV || 'development'
    },

    microinvest: {
        apiUrl: process.env.MICROINVEST_API_URL,
        partnerId: process.env.MICROINVEST_PARTNER_ID,
        apiKey: process.env.MICROINVEST_API_KEY
    },

    easycredit: {
        apiUrl: process.env.EASYCREDIT_API_URL,
        filesUrl: process.env.EASYCREDIT_FILES_URL,
        login: process.env.EASYCREDIT_LOGIN,
        password: process.env.EASYCREDIT_PASSWORD,
        environment: process.env.EASYCREDIT_ENVIRONMENT || 'TEST'
    },

    iute: {
        apiUrl: process.env.IUTE_API_URL,
        apiKey: process.env.IUTE_API_KEY,
        posId: process.env.IUTE_POS_ID,
        salesmanId: process.env.IUTE_SALESMAN_ID || process.env.IUTE_POS_ID,
        webhookBaseUrl: process.env.IUTE_WEBHOOK_BASE_URL || 'https://credit.pandashop.md'
    },

    simla: {
        apiUrl: process.env.SIMLA_API_URL,
        apiKey: process.env.SIMLA_API_KEY
    },

    cron: {
        statusCheckInterval: parseInt(process.env.STATUS_CHECK_INTERVAL) || 1
    },

    loanProducts: {
        '0%_2': '6eddefc9-fbf9-11ee-b780-00155d65140c',
        '0%_3': '52d986f7-0171-11ef-b782-00155d65140c',
        '0%_4': '6eddefdd-fbf9-11ee-b780-00155d65140c',
        '0%_6': '74ff15ad-fbf9-11ee-b780-00155d65140c',
        'retail': '55cc08c9-b61b-11ef-b7b7-00155d65140c'
    },

    statusMapping: {
        'Placed': 'credit-check',
        'Processing': 'credit-check',
        'Approved': 'credit-approved',
        'Refused': 'credit-declined',
        'SignedOnline': 'signed-online',
        'SignedPhysically': 'signed-online',
        'Issued': 'paid',
        'PendingIssue': 'credit-approved',
        'IssueRejected': 'credit-declined'
    },

    easyCreditStatusMapping: {
        'New': 'credit-check',
        'Approved': 'credit-approved',
        'More Data': 'credit-check',
        'Refused': 'credit-declined',
        'Rejected': 'credit-declined',
        'Canceled': 'credit-declined',
        'Disbursed': 'paid',
        'Settled': 'paid'
    },

    iuteStatusMapping: {
        'CUSTOMER_NOT_EXISTS': 'credit-check',
        'PENDING': 'credit-check',
        'IN_PROGRESS': 'credit-check',
        'PAID': 'paid',
        'CANCELLED': 'credit-declined'
    },

    finalStatuses: ['Refused', 'Issued', 'IssueRejected'],
    easyCreditFinalStatuses: ['Refused', 'Rejected', 'Canceled', 'Disbursed', 'Settled'],
    iuteFinalStatuses: ['PAID', 'CANCELLED'],

    orderStatusLabels: {
        'order-deleted': 'Удален или объединен'
    },

    crmFields: {
        idnp: 'indp',
        name: 'name',
        surname: 'surname',
        birthday: 'birthday',
        residence: 'residence',
        creditCompany: 'credit_company',
        creditTerm: 'credit_term',
        zeroCredit: 'zero_credit',
        loanApplicationId: 'loan_application_id'
    }
};
