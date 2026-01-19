const axios = require('axios');
const FormData = require('form-data');
const config = require('../config');
const logger = require('../utils/logger');

class EasyCreditClient {
    constructor() {
        const baseURL = `${config.easycredit.apiUrl}/${config.easycredit.environment}`;

        this.client = axios.create({
            baseURL,
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            auth: {
                username: config.easycredit.login,
                password: config.easycredit.password
            }
        });

        this.filesClient = axios.create({
            baseURL: `${config.easycredit.filesUrl}/${config.easycredit.environment}`,
            timeout: 120000,
            auth: {
                username: config.easycredit.login,
                password: config.easycredit.password
            }
        });

        this.credentials = {
            Login: config.easycredit.login,
            Password: config.easycredit.password
        };
    }

    async getProducts() {
        try {
            const response = await this.client.post('/ECM_ShopProducts', this.credentials);

            logger.debug('ECM_ShopProducts response', {
                productsCount: response.data?.response?.Products?.length
            });

            return response.data?.response;
        } catch (error) {
            logger.error('ECM_ShopProducts failed', { error: error.message });
            throw error;
        }
    }

    async checkIdnp(idnp, birthDate) {
        try {
            const response = await this.client.post('/Preapproved_v2_1', {
                ...this.credentials,
                UIN: idnp,
                DateOfBirth: birthDate
            });

            logger.debug('Preapproved_v2_1 response', { idnp });
            return response.data?.response;
        } catch (error) {
            logger.error('Preapproved_v2_1 failed', { idnp, error: error.message });
            throw error;
        }
    }

    async calculateInstallment(productId, amount, numberOfInstallments, firstInstallmentDate) {
        try {
            const response = await this.client.post('/ECM_InstallmentCalc', {
                ...this.credentials,
                ProductID: productId,
                Amount: amount,
                NumberOfInstallments: numberOfInstallments,
                FirstInstallmentDate: firstInstallmentDate
            });

            logger.debug('ECM_InstallmentCalc response', { productId, amount });
            return response.data?.response;
        } catch (error) {
            logger.error('ECM_InstallmentCalc failed', { error: error.message });
            throw error;
        }
    }

    async createRequest(applicationData) {
        try {
            const payload = {
                ...this.credentials,
                Product: applicationData.productId,
                UIN: applicationData.idnp,
                ApDateOfBirth: applicationData.birthDate,
                ApFirstName: applicationData.firstName,
                ApLastName: applicationData.lastName,
                CaMobile: applicationData.phone,
                GoodsName: applicationData.goodsName,
                CreditAmount: applicationData.amount,
                NumberOfInstallments: applicationData.term,
                FirstInstallmentDate: applicationData.firstInstallmentDate
            };

            if (applicationData.goodsPrice) {
                payload.GoodsPrice = applicationData.goodsPrice;
            }

            if (applicationData.patronymic) {
                payload.ApFatherName = applicationData.patronymic;
            }

            logger.info('Creating Easy Credit request', {
                idnp: applicationData.idnp,
                amount: applicationData.amount,
                term: applicationData.term
            });

            const response = await this.client.post('/Request_v3', payload);

            if (response.data?.response?.URN) {
                logger.info('Easy Credit request created', {
                    URN: response.data.response.URN
                });
            }

            return response.data?.response;
        } catch (error) {
            const responseData = error.response?.data;
            const apiMessage = responseData?.response?.Message ||
                               responseData?.message ||
                               responseData?.detail ||
                               (typeof responseData === 'string' ? responseData : null);

            logger.error('Request_v3 failed', {
                idnp: applicationData.idnp,
                status: error.response?.status,
                error: error.message,
                response: responseData
            });

            if (apiMessage) {
                const msg = typeof apiMessage === 'string' ? apiMessage : JSON.stringify(apiMessage);
                throw new Error(msg);
            }
            if (error.response?.status === 422) {
                throw new Error(`Ошибка валидации: ${JSON.stringify(responseData?.detail || responseData)}`);
            }
            throw error;
        }
    }

    async uploadFiles(urn, files, retryCount = 0) {
        const maxRetries = 2;
        const retryDelay = 2000;

        try {
            const formData = new FormData();
            formData.append('Login', this.credentials.Login);
            formData.append('Password', this.credentials.Password);
            formData.append('URN', urn);

            for (const file of files) {
                const buffer = Buffer.from(file.data, 'base64');
                formData.append('files', buffer, {
                    filename: file.name,
                    contentType: this.getContentType(file.name)
                });
            }

            const response = await this.filesClient.post('/files/upload', formData, {
                headers: {
                    ...formData.getHeaders()
                }
            });

            logger.info('Files uploaded to Easy Credit', {
                urn,
                filesCount: files.length,
                response: response.data?.detail?.status || 'OK'
            });

            return response.data;
        } catch (error) {
            const status = error.response?.status;
            const shouldRetry = (status === 401 || status === 503) && retryCount < maxRetries;

            logger.error('Files upload failed', {
                urn,
                error: error.message,
                status,
                response: error.response?.data,
                attempt: retryCount + 1,
                willRetry: shouldRetry
            });

            if (shouldRetry) {
                logger.info(`Retrying file upload in ${retryDelay}ms`, { urn, attempt: retryCount + 2 });
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                return this.uploadFiles(urn, files, retryCount + 1);
            }

            throw error;
        }
    }

    getContentType(filename) {
        const ext = filename.toLowerCase().split('.').pop();
        const types = {
            'pdf': 'application/pdf',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'tiff': 'image/tiff',
            'tif': 'image/tiff',
            'bmp': 'image/bmp',
            'heic': 'image/heic'
        };
        return types[ext] || 'application/octet-stream';
    }

    async checkStatus(urn) {
        try {
            const response = await this.client.post('/URNStatus_v2', {
                ...this.credentials,
                URN: urn
            });

            const result = response.data?.response;

            logger.debug('URNStatus_v2 response', {
                urn,
                requestStatus: result?.RequestStatus,
                documentStatus: result?.DocumentStatus
            });

            return result;
        } catch (error) {
            if (error.response?.status === 404) {
                logger.warn('URN not found', { urn });
                return null;
            }
            logger.error('URNStatus_v2 failed', {
                urn,
                error: error.message
            });
            throw error;
        }
    }

    async getContract(urn, language = 'RO') {
        try {
            const response = await this.client.post('/ECM_GetDocs_V2', {
                ...this.credentials,
                URN: urn,
                Language: language
            });

            logger.debug('ECM_GetDocs_V2 response', {
                urn,
                hasFile: !!response.data?.response?.File
            });

            return response.data?.response;
        } catch (error) {
            logger.error('ECM_GetDocs_V2 failed', {
                urn,
                error: error.message
            });
            throw error;
        }
    }

    async cancelRequest(urn) {
        try {
            const response = await this.client.post('/ECM_CancelRequest', {
                ...this.credentials,
                URN: urn
            });

            logger.info('Easy Credit request canceled', { urn });
            return response.data?.response;
        } catch (error) {
            logger.error('ECM_CancelRequest failed', {
                urn,
                error: error.message
            });
            throw error;
        }
    }

    async listUploadedFiles(urn) {
        try {
            const response = await this.client.post('/ListUploadedFiles', {
                ...this.credentials,
                URN: urn
            });

            logger.debug('ListUploadedFiles response', {
                urn,
                filesCount: response.data?.response?.Files?.length
            });

            return response.data?.response;
        } catch (error) {
            logger.error('ListUploadedFiles failed', {
                urn,
                error: error.message
            });
            throw error;
        }
    }

    formatDate(date) {
        if (!date) return null;
        if (date instanceof Date) {
            return date.toISOString().split('T')[0];
        }
        if (typeof date === 'string') {
            if (date.match(/^\d{4}-\d{2}-\d{2}$/)) return date;
            const parts = date.split(/[./-]/);
            if (parts.length === 3) {
                if (parts[0].length === 4) return date;
                return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            }
        }
        return date;
    }

    calculateFirstInstallmentDate(daysFromNow = 20) {
        const date = new Date();
        date.setDate(date.getDate() + daysFromNow);
        return date.toISOString().split('T')[0];
    }
}

module.exports = new EasyCreditClient();
