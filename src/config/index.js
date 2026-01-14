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

    finalStatuses: ['Refused', 'Issued', 'IssueRejected'],

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
