# План интеграции Easy Credit

## Обзор

Добавление второй кредитной компании Easy Credit в существующую систему интеграции с Simla CRM.

**Оценка сложности:** Низкая-средняя
**Подход:** Минимальные изменения без глубокого рефакторинга

---

## API Easy Credit

### Базовые URL

| Среда | URL |
|-------|-----|
| TEST | `https://api.ecredit.md/TEST/...` |
| PRODUCTION | `https://api.ecredit.md/PRODUCTION/...` |
| Файлы | `https://partener.ecredit.md/api/{environment}/files/upload` |

### Документация

- Swagger: https://api.ecredit.md/docs
- ReDoc: https://api.ecredit.md/redoc

### Методы API

| Метод | Endpoint | Описание | Аналог Microinvest |
|-------|----------|----------|-------------------|
| Продукты | `POST /ECM_ShopProducts` | Список кредитных продуктов | GetLoanProductSet |
| Проверка IDNP | `POST /Preapproved_v2_1` | Преодобренная сумма по IDNP | CheckIDNP |
| Расчёт платежа | `POST /ECM_InstallmentCalc` | Калькулятор рассрочки | CalculateLoan |
| Создание заявки | `POST /Request_v3` | Новая заявка на кредит | ImportLoanApplication |
| Статус заявки | `POST /URNStatus_v2` | Проверка статуса | CheckApplicationStatus |
| Контракт | `POST /ECM_GetDocs_V2` | Скачать PDF контракта | GetContracts |
| Отмена | `POST /ECM_CancelRequest` | Отменить заявку | SendRefuseRequest |
| Загрузка файлов | `POST /files/upload` | Загрузить документы | (при создании заявки) |

### Авторизация

```json
{
    "Login": "string",
    "Password": "string"
}
```

Credentials передаются в теле запроса, не в headers.

---

## Создание заявки (Request_v3)

### Обязательные поля

| Поле API | Описание | Источник в Simla |
|----------|----------|------------------|
| `Login` | Логин | `.env` |
| `Password` | Пароль | `.env` |
| `Product` | ID продукта (integer) | Маппинг / выбор |
| `UIN` | IDNP (13 цифр) | `customFields.credit_idnp` |
| `ApDateOfBirth` | Дата рождения (`YYYY-MM-DD`) | `customFields.credit_birthday` |
| `ApFirstName` | Имя | `customFields.credit_name` |
| `ApLastName` | Фамилия | `customFields.credit_surname` |
| `CaMobile` | Телефон | `customer.phone` |
| `GoodsName` | Название товара | `order.items[].name` |
| `CreditAmount` | Сумма кредита (>= 100) | `payment.amount` |
| `NumberOfInstallments` | Срок (3-60 мес) | `customFields.credit_term` |
| `FirstInstallmentDate` | Дата первого платежа | Вычислить: `today + 20 дней` |

### Необязательные поля

- `ApFatherName` - отчество
- `GoodsPrice` - цена товара
- `IdCard` - номер паспорта
- И другие (адрес, работа, контактное лицо)

### Минимальный payload

```json
{
    "Login": "shop_login",
    "Password": "shop_password",
    "Product": 54,
    "UIN": "2001234567890",
    "ApDateOfBirth": "1990-05-15",
    "ApFirstName": "Ion",
    "ApLastName": "Popescu",
    "CaMobile": "069123456",
    "GoodsName": "iPhone 15 Pro",
    "CreditAmount": 25000,
    "NumberOfInstallments": 12,
    "FirstInstallmentDate": "2026-02-15"
}
```

### Ответ

```json
{
    "response": {
        "Status": "OK",
        "URN": "001234567"
    }
}
```

`URN` - 9-значный номер заявки (аналог `applicationID` у Microinvest).

---

## Загрузка файлов (files/upload)

**Важно:** Файлы загружаются ПОСЛЕ создания заявки (не вместе как у Microinvest).

### Endpoint

```
POST https://partener.ecredit.md/api/{environment}/files/upload
```

### Параметры (multipart/form-data)

| Поле | Тип | Описание |
|------|-----|----------|
| `Login` | string | Логин |
| `Password` | string | Пароль |
| `URN` | string | Номер заявки (9 цифр) |
| `files` | binary[] | Файлы (PDF, JPEG, PNG, TIFF, BMP, HEIC) |

### Лимиты

- Макс. размер: 50 MB
- Форматы: `application/pdf`, `image/jpeg`, `image/tiff`, `image/bmp`, `image/png`, `image/heic`

---

## Статусы заявки (URNStatus_v2)

### Двойной статус

Easy Credit использует два статуса:

**RequestStatus** - решение банка:
| Значение | Описание (RU) |
|----------|---------------|
| `New` | Новый |
| `Approved` | Одобрено |
| `More Data` | Нужны данные |
| `Refused` | Отказ |
| `Canceled` | Отменено |
| `Disbursed` | Выдан |
| `Settled` | Погашен |

**DocumentStatus** - этап документов:
| Значение | Описание (RU) |
|----------|---------------|
| `Currently At Shop` | В магазине |
| `Received By EasyCredit` | Получено EasyCredit |
| `Received FCopy` | Получена копия |
| `Checked By EasyCredit` | Проверено EasyCredit |
| `Identified La Distanta` | Идентифицирован онлайн |
| `Sign and Receive La Distanta` | Подписано онлайн |
| `Not Identified La Distanta` | Не идентифицирован |

### Пример ответа

```json
{
    "response": {
        "RequestStatus": "Approved",
        "DocumentStatus": "Currently At Shop",
        "LoanAmount": 25000,
        "InstallmentAmount": 2300,
        "Installments": 12,
        "ProductID": 54,
        "ProductName": "eSimplu 12 luni",
        "Message": "Комментарий от банка",
        "Status": "OK"
    }
}
```

---

## Сообщения

### Ограничения Easy Credit

- **Получение сообщений:** Только поле `Message` из `URNStatus_v2`
- **Отправка сообщений:** НЕТ API метода

### Решение для виджета

Не скрывать блок сообщений, но:
1. Показывать `Message` от банка (если есть)
2. При попытке отправить → ошибка: "Easy Credit не поддерживает отправку сообщений"

---

## План разработки

### 1. Конфигурация

**Файл:** `.env`

```env
# Easy Credit API
EASYCREDIT_API_URL=https://api.ecredit.md
EASYCREDIT_FILES_URL=https://partener.ecredit.md/api
EASYCREDIT_LOGIN=xxx
EASYCREDIT_PASSWORD=xxx
EASYCREDIT_ENVIRONMENT=PRODUCTION
```

**Файл:** `src/config/index.js`

Добавить секцию `easycredit` с credentials и маппингом статусов.

---

### 2. Клиент Easy Credit

**Файл:** `src/clients/easycredit.js`

Методы:
- `getProducts()` - список продуктов
- `checkIdnp(idnp, birthDate)` - преодобренная сумма
- `calculateInstallment(productId, amount, term, firstDate)` - расчёт
- `createRequest(data)` - создание заявки
- `uploadFiles(urn, files)` - загрузка файлов
- `checkStatus(urn)` - статус заявки
- `getContract(urn, language)` - скачать контракт
- `cancelRequest(urn)` - отмена

---

### 3. Изменения в creditService.js

Добавить условную логику по `creditCompany`:

```javascript
async submitApplication(orderId) {
    const orderData = ...;

    if (orderData.creditCompany === 'easycredit') {
        // 1. Создать заявку
        const result = await easycredit.createRequest({...});
        // 2. Загрузить файлы отдельно
        await easycredit.uploadFiles(result.URN, files);
        // 3. Сохранить URN в Simla
        await simla.updateOrderWithApplicationId(orderId, result.URN);
    } else {
        // Microinvest (текущая логика)
    }
}
```

Аналогично для:
- `checkAndUpdateStatus()` - получать 2 статуса
- `getContractsForDownload()` - другой endpoint
- `refuseApplication()` - другой endpoint
- `sendMessage()` - ошибка для easycredit

---

### 4. База данных (Prisma)

**Файл:** `prisma/schema.prisma`

```prisma
model FeedItem {
    // ... существующие поля
    documentStatus    String?   // Новое поле для Easy Credit
}
```

Миграция:
```bash
npx prisma migrate dev --name add_document_status
```

---

### 5. Feed Repository

**Файл:** `src/services/feedRepository.js`

- Сохранять `documentStatus` при sync
- Возвращать `documentStatus` в feed items

---

### 6. Виджет

**Файл:** `widget/src/CreditWidget.vue`

#### Карточка заявки:
```vue
<div class="status">{{ item.bankStatus }}</div>
<div v-if="item.documentStatus && item.creditCompany === 'easycredit'" class="document-status">
    Документы: {{ item.documentStatus }}
</div>
```

#### Блок сообщений:
```javascript
async sendMessage() {
    if (this.creditCompany === 'easycredit') {
        this.error = 'Easy Credit не поддерживает отправку сообщений. Банк отправляет комментарии в одностороннем порядке.';
        return;
    }
    // ... текущая логика
}
```

---

### 7. Маппинг статусов для CRM

```javascript
const easyCreditStatusMapping = {
    // RequestStatus -> paymentStatus в Simla
    'New': 'credit-check',
    'Approved': 'credit-approved',
    'More Data': 'credit-check',
    'Refused': 'credit-declined',
    'Canceled': 'credit-declined',
    'Disbursed': 'credit-issued',
    'Settled': 'credit-issued'
};
```

---

## Чеклист

### Подготовка
- [ ] Получить credentials от Easy Credit (Login, Password)
- [ ] Протестировать API в Postman
- [ ] Добавить поле `credit_company: easycredit` в Simla (если нет)

### Backend
- [ ] Добавить env переменные
- [ ] Создать `src/clients/easycredit.js`
- [ ] Обновить `src/config/index.js`
- [ ] Обновить `src/services/creditService.js`
- [ ] Добавить миграцию Prisma (documentStatus)
- [ ] Обновить `src/services/feedRepository.js`

### Frontend (Widget)
- [ ] Отображение двойного статуса в карточке
- [ ] Ошибка при отправке сообщения для easycredit
- [ ] Отображение `Message` от банка

### Тестирование
- [ ] Создание заявки Easy Credit
- [ ] Загрузка файлов
- [ ] Проверка статуса
- [ ] Скачивание контракта
- [ ] Отмена заявки
- [ ] Feed sync с двойным статусом

---

## Оценка трудозатрат

| Компонент | Строк кода | Сложность |
|-----------|------------|-----------|
| `easycredit.js` | ~200 | Низкая |
| `creditService.js` изменения | ~100 | Низкая |
| Prisma + feedRepository | ~30 | Низкая |
| Виджет | ~50 | Низкая |
| Конфиг | ~30 | Низкая |
| **Итого** | **~400** | **Низкая** |

---

## Ссылки на документацию

- REST API: `C:\Users\shtef\Desktop\easy credit docs\rest api\`
- SOAP API (устаревшее): `C:\Users\shtef\Desktop\easy credit docs\`
- Статусы: `Request-Doc Status.xlsx`, `DOCUMENT_STATUS - shop.ecredit.md.xlsx`
