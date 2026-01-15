<template>
  <div style="display: flex; justify-content: space-between; width: 100%;">
    <UiToolbarButton size="sm" @click="handleDetails">
      Детали заявки
    </UiToolbarButton>

    <UiToolbarButton size="sm" :loading="submitLoading" @click="handleSubmit">
      Отправить заявку
    </UiToolbarButton>
  </div>

  <UiModalSidebar v-model:opened="modalOpened" size="lg" direction="left" @close="closeModal">
    <template #title>Кредитная заявка</template>

    <div class="mi-content">
      <UiLoader v-if="loading" :overlay="false" />

      <div v-else-if="error" class="mi-error">
        {{ error }}
      </div>

      <div v-else class="mi-details">
        <div v-if="applicationId" class="mi-section">
          <div class="mi-row">
            <span class="mi-label">ID заявки:</span>
            <span class="mi-value">{{ applicationId }}</span>
          </div>

          <div v-if="comparisonData" class="mi-status-info">
            <div class="mi-row">
              <span class="mi-label">Статус в банке:</span>
              <span class="mi-value">{{ getStatusText(comparisonData.bankStatus) }}</span>
            </div>
            <div class="mi-row">
              <span class="mi-label">Статус в CRM:</span>
              <span class="mi-value">{{ getCrmStatusText(comparisonData.crmStatus) }}</span>
            </div>
            <div v-if="comparisonData.customerName" class="mi-row">
              <span class="mi-label">Клиент:</span>
              <span class="mi-value">{{ comparisonData.customerName }}</span>
            </div>
          </div>
        </div>

        <div v-if="comparisonData?.approved" class="mi-comparison-section">
          <h4 class="mi-section-title">Сравнение условий</h4>
          <div class="mi-comparison-table">
            <div class="mi-comparison-header">
              <span></span>
              <span>Запрошено</span>
              <span>Одобрено</span>
            </div>
            <div :class="['mi-comparison-row', comparisonData.comparison?.amountMatch ? 'match' : 'mismatch']">
              <span class="mi-comparison-label">Сумма</span>
              <span class="mi-comparison-value">{{ formatAmount(comparisonData.requested?.amount) }}</span>
              <span class="mi-comparison-value">{{ formatAmount(comparisonData.approved?.amount) }}</span>
            </div>
            <div :class="['mi-comparison-row', comparisonData.comparison?.termMatch ? 'match' : 'mismatch']">
              <span class="mi-comparison-label">Срок</span>
              <span class="mi-comparison-value">{{ comparisonData.requested?.term }} мес.</span>
              <span class="mi-comparison-value">{{ comparisonData.approved?.term }} мес.</span>
            </div>
            <div :class="['mi-comparison-row', comparisonData.comparison?.productMatch ? 'match' : 'mismatch']">
              <span class="mi-comparison-label">Тип</span>
              <span class="mi-comparison-value">{{ comparisonData.requested?.productType }}</span>
              <span class="mi-comparison-value">{{ comparisonData.approved?.productType }}</span>
            </div>
          </div>
          <div v-if="comparisonData.comparison?.hasChanges" class="mi-warning">
            Банк изменил условия кредита
          </div>
        </div>

        <div v-else-if="!applicationId" class="mi-section">
          <p class="mi-info-text">Заявка еще не создана</p>
        </div>

        <div class="mi-actions">
          <div class="mi-actions-left">
            <UiButton
              v-if="!applicationId"
              :loading="submitLoading"
              :disabled="submitLoading"
              appearance="primary"
              size="sm"
              @click="submitApplication"
            >
              Отправить заявку
            </UiButton>

            <UiButton
              v-if="applicationId"
              :loading="statusLoading"
              :disabled="statusLoading"
              appearance="secondary"
              size="sm"
              @click="loadComparisonData"
            >
              Обновить данные
            </UiButton>

            <UiButton
              v-if="applicationId"
              :loading="contractsLoading"
              :disabled="contractsLoading"
              appearance="secondary"
              size="sm"
              @click="getContracts"
            >
              Скачать контракт
            </UiButton>
          </div>

          <div class="mi-actions-right">
            <button
              v-if="applicationId && canCancel"
              :disabled="cancelLoading"
              class="mi-cancel-btn"
              @click="showCancelDialog = true"
            >
              {{ cancelLoading ? 'Отмена...' : 'Отменить заявку' }}
            </button>
          </div>
        </div>

        <div v-if="contractLinks.length > 0" class="mi-contract-links">
          <p class="mi-links-title">Файлы контракта:</p>
          <a
            v-for="(link, index) in contractLinks"
            :key="index"
            :href="link.url"
            target="_blank"
            rel="noopener noreferrer"
            class="mi-contract-link"
          >
            {{ link.name }}
          </a>
        </div>

        <div v-if="applicationId" class="mi-messages-section">
          <h4 class="mi-section-title">Сообщения</h4>
          <div class="mi-messages-list">
            <div v-if="messagesLoading" class="mi-messages-loading">
              Загрузка...
            </div>
            <div v-else-if="messages.length === 0" class="mi-messages-empty">
              Нет сообщений
            </div>
            <div v-else class="mi-messages">
              <div v-for="(msg, index) in messages" :key="index" class="mi-message-item">
                <span class="mi-message-text">{{ msg.text || msg }}</span>
              </div>
            </div>
          </div>
          <div class="mi-message-input">
            <div class="mi-textbox-wrapper">
              <UiTextbox
                :value="newMessage"
                placeholder="Введите сообщение..."
                size="sm"
                @update:value="updateNewMessage"
              />
            </div>
            <UiButton
              :loading="sendingMessage"
              :disabled="!canSendMessage"
              appearance="primary"
              size="sm"
              @click="sendMessageToBank"
            >
              Отправить
            </UiButton>
          </div>
          <div class="mi-send-files">
            <UiButton
              :loading="sendingFiles"
              appearance="secondary"
              size="sm"
              @click="sendFilesToBank"
            >
              Отправить прикрепленные документы
            </UiButton>
          </div>
        </div>

        <div v-if="message" :class="['mi-message', messageType]">
          {{ message }}
        </div>
      </div>
    </div>

    <template #footer>
      <div class="mi-footer-spread">
        <UiButton appearance="secondary" @click="closeModal">
          Закрыть
        </UiButton>
        <UiButton appearance="secondary" @click="showFeedModal = true">
          Лента
        </UiButton>
      </div>
    </template>
  </UiModalSidebar>

  <UiModalSidebar v-model:opened="showFeedModal" size="lg" direction="left" scrolling="native" @close="showFeedModal = false">
    <template #title>
      <div class="mi-feed-header">
        <span>{{ isArchiveView ? 'Архив заявок' : 'Лента заявок' }}</span>
        <span v-if="feedItems.length > 0" class="mi-feed-count">{{ feedItems.length }}</span>
      </div>
    </template>

    <div class="mi-feed-content">
      <div class="mi-feed-controls">
        <div class="mi-feed-filters-row">
          <select
            :value="feedStatusFilter"
            class="mi-select mi-filter-select"
            @change="onStatusFilterChange"
          >
            <option value="">Все статусы</option>
            <option value="Processing">На проверке</option>
            <option value="Approved">Одобрен</option>
            <option value="conditions-changed">Условия изменены</option>
            <option value="Refused">Отклонен</option>
          </select>
          <select
            :value="feedCompanyFilter"
            class="mi-select mi-filter-select"
            @change="onCompanyFilterChange"
          >
            <option value="">Все компании</option>
            <option value="microinvest">Microinvest</option>
            <option value="easy-credit">Easy Credit</option>
            <option value="iute-credit">Iute Credit</option>
            <option value="maib">Maib</option>
          </select>
          <select
            :value="feedManagerFilter"
            class="mi-select mi-filter-select"
            @change="onManagerFilterChange"
          >
            <option value="">Все менеджеры</option>
            <option value="my">{{ currentUserDisplayName }}</option>
          </select>
          <button
            class="mi-action-btn mi-action-btn-primary mi-filter-btn"
            @click="applyFilters"
          >
            Применить
          </button>
        </div>
        <div class="mi-feed-filters-row">
          <div class="mi-search-wrapper" @keydown="onSearchKeydown">
            <UiTextbox
              :value="feedSearchQuery"
              placeholder="Поиск (Enter)..."
              size="sm"
              @update:value="updateSearchQuery"
            />
          </div>
          <button
            class="mi-action-btn mi-action-btn-secondary mi-filter-btn"
            :disabled="!hasActiveFilters"
            @click="resetFilters"
          >
            Сбросить
          </button>
        </div>
      </div>

      <div class="mi-feed-list-wrapper">
        <UiLoader v-if="feedLoading && feedItems.length === 0" :overlay="false" />

        <div v-else-if="displayedFeedItems.length === 0" class="mi-feed-empty">
          {{ isArchiveView ? 'Нет архивных заявок' : 'Нет активных заявок' }}
        </div>

        <div v-else class="mi-feed-list">
        <div
          v-for="item in displayedFeedItems"
          :key="item.orderId"
          :class="['mi-feed-item', getFeedItemClass(item), !isArchiveView ? getAgeClass(item.createdAt) : '']"
        >
          <div class="mi-feed-item-header">
            <span class="mi-feed-order">#{{ item.orderNumber }}</span>
            <span :class="['mi-feed-status', getStatusClass(item.bankStatus)]">
              {{ getStatusText(item.bankStatus) }}
            </span>
          </div>

          <div class="mi-feed-item-body">
            <div class="mi-feed-row">
              <span class="mi-feed-label">Клиент:</span>
              <span class="mi-feed-value">{{ item.customerName }}</span>
            </div>
            <div class="mi-feed-row">
              <span class="mi-feed-label">ID заявки:</span>
              <span class="mi-feed-value">{{ item.applicationId }}</span>
            </div>
            <div v-if="item.comparison" class="mi-feed-row">
              <span class="mi-feed-label">Сумма:</span>
              <span class="mi-feed-value">
                {{ formatAmount(item.comparison.requested.amount) }}
                <span v-if="item.conditionsChanged" class="mi-feed-changed">
                  → {{ formatAmount(item.comparison.approved.amount) }}
                </span>
              </span>
            </div>
            <div v-if="item.comparison" class="mi-feed-row">
              <span class="mi-feed-label">Срок:</span>
              <span class="mi-feed-value">
                {{ item.comparison.requested.term }} мес.
                <span v-if="item.conditionsChanged && item.comparison.requested.term !== item.comparison.approved.term" class="mi-feed-changed">
                  → {{ item.comparison.approved.term }} мес.
                </span>
              </span>
            </div>
            <div v-if="item.orderStatus" class="mi-feed-row">
              <span class="mi-feed-label">Статус заказа:</span>
              <span class="mi-feed-value">{{ getOrderStatusText(item.orderStatus) }}</span>
            </div>
            <div v-if="item.managerName" class="mi-feed-row">
              <span class="mi-feed-label">Менеджер:</span>
              <span class="mi-feed-value">{{ item.managerName }}</span>
            </div>
            <div v-if="getSignatureStatus(item.bankStatus)" class="mi-feed-row">
              <span class="mi-feed-label">Подпись:</span>
              <span :class="['mi-feed-value', 'mi-signature-' + (item.bankStatus === 'Approved' ? 'pending' : 'done')]">
                {{ getSignatureStatus(item.bankStatus) }}
              </span>
            </div>
            <div v-if="!isArchiveView" class="mi-feed-row mi-feed-age-row">
              <span class="mi-feed-label">Создан:</span>
              <span :class="['mi-feed-value', 'mi-age-text', getAgeClass(item.createdAt)]">
                {{ getDaysAgoText(item.createdAt) }}
              </span>
            </div>
          </div>

          <div class="mi-feed-item-actions">
            <div class="mi-feed-actions-left">
              <a
                :href="`/orders/${item.orderId}/edit`"
                target="_blank"
                rel="noopener noreferrer"
                class="mi-action-btn mi-action-btn-primary"
              >
                Открыть заказ
              </a>
            </div>
            <div class="mi-feed-actions-right">
              <button
                v-if="item.bankStatus === 'Approved' && !isArchiveView"
                :disabled="item.delivering"
                class="mi-action-btn mi-action-btn-primary"
                @click="moveToDelivering(item)"
              >
                {{ item.delivering ? 'Загрузка...' : 'В доставку' }}
              </button>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>

    <template #footer>
      <div class="mi-footer-spread">
        <UiButton appearance="secondary" @click="showFeedModal = false">
          Закрыть
        </UiButton>
        <div class="mi-footer-actions">
          <button
            :disabled="feedLoading"
            class="mi-action-btn mi-action-btn-primary"
            @click="loadFeed"
          >
            {{ feedLoading ? 'Загрузка...' : 'Обновить' }}
          </button>
          <UiButton appearance="secondary" @click="toggleArchiveView">
            {{ isArchiveView ? 'Активные' : 'Архив' }}
          </UiButton>
        </div>
      </div>
    </template>
  </UiModalSidebar>

  <UiModalSidebar v-model:opened="showCancelDialog" size="sm" direction="left" @close="showCancelDialog = false">
    <template #title>Отмена заявки</template>
    <div class="mi-cancel-content">
      <p>Укажите причину отмены:</p>
      <textarea
        v-model="cancelReason"
        class="mi-textarea"
        rows="3"
        placeholder="Причина отмены..."
      ></textarea>
    </div>
    <template #footer>
      <div class="mi-cancel-footer">
        <UiButton appearance="secondary" @click="showCancelDialog = false">
          Отмена
        </UiButton>
        <button
          :disabled="cancelLoading"
          class="mi-cancel-btn"
          @click="cancelApplication"
        >
          {{ cancelLoading ? 'Отмена...' : 'Подтвердить отмену' }}
        </button>
      </div>
    </template>
  </UiModalSidebar>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useOrderCardContext as useOrder, useCurrentUserContext, useField } from '@retailcrm/embed-ui';
import {
  UiButton,
  UiLoader,
  UiModalSidebar,
  UiTextbox,
  UiToolbarButton,
} from '@retailcrm/embed-ui-v1-components/remote';

const API_BASE = 'https://credit.pandashop.md';

const order = useOrder();
const orderId = useField(order, 'id');

const currentUser = useCurrentUserContext();
const currentUserId = useField(currentUser, 'id');
const currentUserFirstName = useField(currentUser, 'firstName');
const currentUserLastName = useField(currentUser, 'lastName');

const modalOpened = ref(false);
const loading = ref(false);
const error = ref('');
const submitLoading = ref(false);
const statusLoading = ref(false);
const filesLoading = ref(false);
const contractsLoading = ref(false);
const cancelLoading = ref(false);
const messagesLoading = ref(false);
const sendingMessage = ref(false);
const sendingFiles = ref(false);
const message = ref('');
const messageType = ref<'success' | 'error' | ''>('');

const applicationId = ref<string | null>(null);
const comparisonData = ref<any>(null);
const contractLinks = ref<Array<{ name: string; url: string }>>([]);
const messages = ref<any[]>([]);
const newMessage = ref('');
const showCancelDialog = ref(false);
const cancelReason = ref('');

const canSendMessage = computed(() => {
  return newMessage.value.trim().length > 0 && !sendingMessage.value;
});

const currentUserDisplayName = computed(() => {
  const firstName = currentUserFirstName.value || '';
  const lastName = currentUserLastName.value || '';
  const name = `${firstName} ${lastName}`.trim();
  return name || 'Мои заявки';
});

const showFeedModal = ref(false);
const feedLoading = ref(false);
const feedItems = ref<any[]>([]);
const feedStatusFilter = ref('');
const feedCompanyFilter = ref('');
const feedManagerFilter = ref('');
const feedSearchQuery = ref('');
const displayedFeedItems = ref<any[]>([]);
const hasActiveFilters = ref(false);
const isArchiveView = ref(false);

function filterFeedItems(items: any[], statusFilter: string, companyFilter: string, managerFilter: string, searchQuery: string): any[] {
  const query = searchQuery.toLowerCase().trim();
  return items.filter(item => {
    if (statusFilter) {
      if (statusFilter === 'conditions-changed') {
        if (!item.conditionsChanged) return false;
      } else if (statusFilter === 'Approved') {
        if (item.conditionsChanged) return false;
        const approvedStatuses = ['Approved', 'SignedOnline', 'SignedPhysically', 'Issued', 'PendingIssue'];
        if (!approvedStatuses.includes(item.bankStatus)) return false;
      } else {
        if (item.conditionsChanged) return false;
        if (item.bankStatus !== statusFilter) return false;
      }
    }
    if (companyFilter && item.creditCompany !== companyFilter) {
      return false;
    }
    if (managerFilter === 'my' && item.managerId !== currentUserId.value) {
      return false;
    }
    if (query) {
      const orderNumber = String(item.orderNumber || '').toLowerCase();
      const customerName = String(item.customerName || '').toLowerCase();
      const applicationId = String(item.applicationId || '').toLowerCase();
      if (!orderNumber.includes(query) && !customerName.includes(query) && !applicationId.includes(query)) {
        return false;
      }
    }
    return true;
  });
}

function onStatusFilterChange(e: Event) {
  feedStatusFilter.value = (e.target as HTMLSelectElement).value;
}

function onCompanyFilterChange(e: Event) {
  feedCompanyFilter.value = (e.target as HTMLSelectElement).value;
}

function onManagerFilterChange(e: Event) {
  feedManagerFilter.value = (e.target as HTMLSelectElement).value;
}

function applyFilters() {
  const filtered = filterFeedItems(feedItems.value, feedStatusFilter.value, feedCompanyFilter.value, feedManagerFilter.value, feedSearchQuery.value);
  displayedFeedItems.value = [...filtered];
  hasActiveFilters.value = feedStatusFilter.value !== '' || feedCompanyFilter.value !== '' || feedManagerFilter.value !== '' || feedSearchQuery.value !== '';
}

function resetFilters() {
  feedStatusFilter.value = '';
  feedCompanyFilter.value = '';
  feedManagerFilter.value = '';
  feedSearchQuery.value = '';
  displayedFeedItems.value = [...feedItems.value];
  hasActiveFilters.value = false;
}

function onSearchKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    applyFilters();
  }
}

watch(showFeedModal, (opened) => {
  if (opened && feedItems.value.length === 0) {
    loadFeed();
  }
});

const canCancel = computed(() => {
  const status = comparisonData.value?.bankStatus;
  return status && !['Refused', 'Issued', 'IssueRejected', 'SignedOnline', 'SignedPhysically'].includes(status);
});

async function handleSubmit() {
  if (!orderId.value) {
    alert('Order ID not found');
    return;
  }

  submitLoading.value = true;

  try {
    const response = await fetch(`${API_BASE}/api/send-application`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: orderId.value }),
    });

    const data = await response.json();

    if (data.success) {
      applicationId.value = data.applicationId;
      message.value = `Заявка отправлена! ID: ${data.applicationId}`;
      messageType.value = 'success';
      modalOpened.value = true;
      await loadComparisonData();
    } else {
      message.value = `Ошибка: ${data.error || 'Не удалось отправить'}`;
      messageType.value = 'error';
      modalOpened.value = true;
    }
  } catch (err: any) {
    message.value = `Ошибка: ${err.message}`;
    messageType.value = 'error';
    modalOpened.value = true;
  } finally {
    submitLoading.value = false;
  }
}

async function handleDetails() {
  modalOpened.value = true;
  await loadComparisonData();
  await loadMessages();
}

function closeModal() {
  modalOpened.value = false;
  message.value = '';
}

async function loadComparisonData() {
  if (!orderId.value) return;

  statusLoading.value = true;
  error.value = '';

  try {
    const response = await fetch(`${API_BASE}/api/comparison-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: orderId.value }),
    });

    const data = await response.json();

    if (data.success) {
      applicationId.value = data.applicationId || null;
      comparisonData.value = data;
    } else {
      error.value = data.error || 'Не удалось загрузить данные';
    }
  } catch (err: any) {
    error.value = err.message || 'Ошибка загрузки';
  } finally {
    statusLoading.value = false;
  }
}

async function loadMessages() {
  if (!orderId.value || !applicationId.value) return;

  messagesLoading.value = true;

  try {
    const response = await fetch(`${API_BASE}/api/get-messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: orderId.value, newOnly: false }),
    });

    const data = await response.json();

    if (data.success) {
      messages.value = data.messages || [];
    }
  } catch (err: any) {
    console.error('Failed to load messages:', err);
  } finally {
    messagesLoading.value = false;
  }
}

async function submitApplication() {
  if (!orderId.value) return;

  submitLoading.value = true;
  message.value = '';

  try {
    const response = await fetch(`${API_BASE}/api/send-application`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: orderId.value }),
    });

    const data = await response.json();

    if (data.success) {
      message.value = `Заявка отправлена! ID: ${data.applicationId}`;
      messageType.value = 'success';
      applicationId.value = data.applicationId;
      await loadComparisonData();
    } else {
      message.value = `Ошибка: ${data.error || 'Ошибка отправки'}`;
      messageType.value = 'error';
    }
  } catch (err: any) {
    message.value = `Ошибка: ${err.message}`;
    messageType.value = 'error';
  } finally {
    submitLoading.value = false;
  }
}

async function sendFiles() {
  if (!orderId.value) return;

  filesLoading.value = true;
  message.value = '';

  try {
    const response = await fetch(`${API_BASE}/api/send-files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: orderId.value }),
    });

    const data = await response.json();

    if (data.success) {
      message.value = `Файлы отправлены: ${data.filesCount || 0}`;
      messageType.value = 'success';
    } else {
      message.value = `Ошибка: ${data.error || 'Ошибка отправки файлов'}`;
      messageType.value = 'error';
    }
  } catch (err: any) {
    message.value = `Ошибка: ${err.message}`;
    messageType.value = 'error';
  } finally {
    filesLoading.value = false;
  }
}

async function getContracts() {
  if (!orderId.value) return;

  contractsLoading.value = true;
  message.value = '';
  contractLinks.value = [];

  try {
    const response = await fetch(`${API_BASE}/api/download-contracts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: orderId.value }),
    });

    const data = await response.json();

    if (data.success && data.files) {
      contractLinks.value = data.files.map((file: any, index: number) => ({
        name: file.name,
        url: `${API_BASE}/api/contract-file/${orderId.value}/${index}`
      }));
      message.value = `Готово ${data.files.length} файлов. Кликните по ссылкам ниже для скачивания.`;
      messageType.value = 'success';
    } else {
      message.value = `Ошибка: ${data.error || 'Не удалось получить контракт'}`;
      messageType.value = 'error';
    }
  } catch (err: any) {
    message.value = `Ошибка: ${err.message}`;
    messageType.value = 'error';
  } finally {
    contractsLoading.value = false;
  }
}

async function cancelApplication() {
  if (!orderId.value) return;

  cancelLoading.value = true;

  try {
    const response = await fetch(`${API_BASE}/api/refuse-application`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: orderId.value,
        reason: cancelReason.value || 'Client refused'
      }),
    });

    const data = await response.json();

    if (data.success) {
      message.value = 'Заявка отменена';
      messageType.value = 'success';
      showCancelDialog.value = false;
      cancelReason.value = '';
      await loadComparisonData();
    } else {
      message.value = `Ошибка: ${data.error || 'Не удалось отменить заявку'}`;
      messageType.value = 'error';
    }
  } catch (err: any) {
    message.value = `Ошибка: ${err.message}`;
    messageType.value = 'error';
  } finally {
    cancelLoading.value = false;
  }
}

function updateNewMessage(val: string | number) {
  newMessage.value = String(val);
}

function updateSearchQuery(val: string | number) {
  feedSearchQuery.value = String(val);
}

async function sendMessageToBank() {
  if (!orderId.value || !newMessage.value.trim()) return;

  sendingMessage.value = true;

  try {
    const response = await fetch(`${API_BASE}/api/send-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: orderId.value,
        text: newMessage.value.trim()
      }),
    });

    const data = await response.json();

    if (data.success) {
      newMessage.value = '';
      await loadMessages();
    } else {
      message.value = `Ошибка: ${data.error || 'Не удалось отправить сообщение'}`;
      messageType.value = 'error';
    }
  } catch (err: any) {
    message.value = `Ошибка: ${err.message}`;
    messageType.value = 'error';
  } finally {
    sendingMessage.value = false;
  }
}

async function sendFilesToBank() {
  if (!orderId.value) return;

  sendingFiles.value = true;
  message.value = '';

  try {
    const response = await fetch(`${API_BASE}/api/send-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: orderId.value,
        text: 'Прикрепляю документы',
        withFiles: true
      }),
    });

    const data = await response.json();

    if (data.success) {
      message.value = `Документы отправлены (${data.filesCount} файлов)`;
      messageType.value = 'success';
      await loadMessages();
    } else {
      message.value = `Ошибка: ${data.error || 'Не удалось отправить документы'}`;
      messageType.value = 'error';
    }
  } catch (err: any) {
    message.value = `Ошибка: ${err.message}`;
    messageType.value = 'error';
  } finally {
    sendingFiles.value = false;
  }
}

function formatAmount(amount: number): string {
  if (!amount) return '0 MDL';
  return new Intl.NumberFormat('ru-RU').format(amount) + ' MDL';
}

function getStatusText(status: string): string {
  const statusMap: Record<string, string> = {
    'Placed': 'Размещена',
    'Processing': 'В обработке',
    'Approved': 'Одобрена',
    'Refused': 'Отклонена',
    'SignedPhysically': 'Одобрена',
    'SignedOnline': 'Одобрена',
    'Cancelled': 'Отменена',
    'Issued': 'Выдано',
    'PendingIssue': 'Ожидает выдачи',
    'IssueRejected': 'Выдача отклонена',
  };
  return statusMap[status] || status || '-';
}

function getCrmStatusText(status: string): string {
  const statusMap: Record<string, string> = {
    'credit-check': 'На проверке',
    'credit-approved': 'Одобрен',
    'credit-declined': 'Отклонен',
    'signed-online': 'Подписан онлайн',
    'paid': 'Выдан',
    'conditions-changed': 'Условия изменены',
  };
  return statusMap[status] || status || '-';
}

async function loadFeed() {
  feedLoading.value = true;

  try {
    const archiveParam = isArchiveView.value ? 'true' : 'false';
    const response = await fetch(`${API_BASE}/api/feed?archive=${archiveParam}`);
    const data = await response.json();

    if (data.success) {
      const items = data.items.map((item: any) => ({
        ...item,
        delivering: false
      }));
      feedItems.value = items;
      const filtered = filterFeedItems(items, feedStatusFilter.value, feedCompanyFilter.value, feedManagerFilter.value, feedSearchQuery.value);
      displayedFeedItems.value = [...filtered];
    }
  } catch (err: any) {
    console.error('Failed to load feed:', err);
  } finally {
    feedLoading.value = false;
  }
}

function toggleArchiveView() {
  isArchiveView.value = !isArchiveView.value;
  feedStatusFilter.value = '';
  feedCompanyFilter.value = '';
  feedManagerFilter.value = '';
  feedSearchQuery.value = '';
  hasActiveFilters.value = false;
  loadFeed();
}

function getFeedItemClass(item: any): string {
  if (item.conditionsChanged) return 'conditions-changed';
  if (item.bankStatus === 'Approved' || item.bankStatus === 'SignedOnline' || item.bankStatus === 'SignedPhysically') return 'approved';
  if (item.bankStatus === 'Refused' || item.bankStatus === 'IssueRejected') return 'refused';
  if (item.bankStatus === 'Processing' || item.bankStatus === 'Placed') return 'processing';
  return '';
}

function getStatusClass(status: string): string {
  if (status === 'Approved' || status === 'SignedOnline' || status === 'SignedPhysically') return 'status-approved';
  if (status === 'Refused' || status === 'IssueRejected') return 'status-refused';
  if (status === 'Processing' || status === 'Placed') return 'status-processing';
  if (status === 'Issued') return 'status-issued';
  return '';
}

function getTimeAgo(dateStr: string | null): { days: number; hours: number; totalHours: number } {
  if (!dateStr) return { days: 0, hours: 0, totalHours: 0 };
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  if (diffMs < 0) {
    return { days: 0, hours: 0, totalHours: 0 };
  }

  const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;

  return { days, hours, totalHours };
}

function getDaysAgo(dateStr: string | null): number {
  return getTimeAgo(dateStr).days;
}

function getDaysAgoText(dateStr: string | null): string {
  const { days, totalHours } = getTimeAgo(dateStr);

  if (totalHours === 0) return 'Менее часа';

  if (days === 0) {
    if (totalHours === 1) return '1 час назад';
    if (totalHours >= 2 && totalHours <= 4) return `${totalHours} часа назад`;
    if (totalHours >= 5 && totalHours <= 20) return `${totalHours} часов назад`;
    return `${totalHours} час назад`;
  }

  if (days === 1) return '1 день назад';
  if (days >= 2 && days <= 4) return `${days} дня назад`;
  return `${days} дней назад`;
}

function getAgeClass(dateStr: string | null): string {
  const days = getDaysAgo(dateStr);
  if (days <= 2) return 'age-fresh';
  if (days <= 4) return 'age-warning';
  return 'age-urgent';
}

function getSignatureStatus(bankStatus: string): string | null {
  if (bankStatus === 'SignedOnline') return 'подписан онлайн';
  if (bankStatus === 'SignedPhysically') return 'подписан физически';
  if (bankStatus === 'Approved') return 'не подписан';
  return null;
}

function getOrderStatusText(status: string | null): string {
  if (!status) return '-';
  const statusMap: Record<string, string> = {
    'new': 'Новый',
    'on-order': 'Под заказ',
    'avail-confirmed': 'В обработке',
    'send-to-delivery': 'Передан в доставку',
    'pending-payment': 'Ожидает оплаты',
    'prepayed': 'Предоплата поступила',
    'ready-for-pickup': 'Готов к выдаче',
    'delivering': 'Доставляется',
    'delivered': 'Доставлен',
    'complete': 'Выполнен',
    'shipped': 'Отгружен',
    'no-call': 'Недозвон',
    'no-product': 'Нет в наличии',
    'already-buyed': 'Купил в другом месте',
    'delyv-did-not-suit': 'Не устроила доставка',
    'prices-did-not-suit': 'Не устроила цена',
    'cancel-other': 'Отменен',
    'purchase-return': 'Возврат',
    'ne-zabral-zakaz': 'Не забрал заказ',
    'credit-check': 'Проверка кредита',
    'credit-approved': 'Кредит одобрен',
    'conditions-changed': 'Условия изменены',
  };
  return statusMap[status] || status;
}

async function moveToDelivering(item: any) {
  item.delivering = true;

  try {
    const response = await fetch(`${API_BASE}/api/update-order-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: item.orderId,
        status: 'delivering'
      }),
    });

    const data = await response.json();

    if (data.success) {
      feedItems.value = feedItems.value.filter(i => i.orderId !== item.orderId);
      displayedFeedItems.value = displayedFeedItems.value.filter(i => i.orderId !== item.orderId);
    } else {
      alert(`Ошибка: ${data.error || 'Не удалось обновить статус'}`);
    }
  } catch (err: any) {
    alert(`Ошибка: ${err.message}`);
  } finally {
    item.delivering = false;
  }
}
</script>

<style lang="less">
.mi-content {
  padding: 16px;
}

.mi-error {
  color: #991b1b;
  padding: 12px;
  background: #fee2e2;
  border-radius: 6px;
}

.mi-info-text {
  color: #6b7280;
  margin: 0;
}

.mi-details {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.mi-section {
  background: #f9fafb;
  padding: 12px;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
}

.mi-section-title {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: #374151;
}

.mi-status-info {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #e5e7eb;
}

.mi-row {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;

  &:first-child {
    padding-top: 0;
  }

  &:last-child {
    padding-bottom: 0;
  }
}

.mi-label {
  color: #6b7280;
  font-size: 13px;
}

.mi-value {
  font-weight: 500;
  color: #1f2937;
  font-size: 13px;
}

.mi-comparison-section {
  background: #f9fafb;
  padding: 12px;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
}

.mi-comparison-table {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mi-comparison-header {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
  padding: 8px;
  font-weight: 600;
  font-size: 12px;
  color: #6b7280;
  text-transform: uppercase;
}

.mi-comparison-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
  padding: 8px;
  border-radius: 4px;
  transition: background 0.2s;

  &.match {
    background: #d1fae5;
  }

  &.mismatch {
    background: #fee2e2;
  }
}

.mi-comparison-label {
  font-size: 13px;
  color: #374151;
  font-weight: 500;
}

.mi-comparison-value {
  font-size: 13px;
  color: #1f2937;
  text-align: left;
}

.mi-warning {
  margin-top: 12px;
  padding: 8px 12px;
  background: #fef3c7;
  border: 1px solid #f59e0b;
  border-radius: 4px;
  color: #92400e;
  font-size: 13px;
  font-weight: 500;
}

.mi-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.mi-actions-left {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.mi-actions-right {
  display: flex;
  gap: 8px;
}

.mi-cancel-btn {
  height: 34px;
  padding: 0 12px;
  font-size: 13px;
  font-weight: 500;
  color: #fff;
  background-color: #dc2626;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.mi-cancel-btn:hover {
  background-color: #b91c1c;
}

.mi-cancel-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.mi-message {
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;

  &.success {
    background: #d1fae5;
    color: #065f46;
  }

  &.error {
    background: #fee2e2;
    color: #991b1b;
  }
}

.mi-contract-links {
  background: #f0f9ff;
  padding: 12px;
  border-radius: 6px;
  border: 1px solid #bae6fd;
}

.mi-links-title {
  margin: 0 0 8px 0;
  font-size: 13px;
  color: #0369a1;
  font-weight: 500;
}

.mi-contract-link {
  display: block;
  padding: 8px 12px;
  margin-top: 4px;
  background: #fff;
  border: 1px solid #e0f2fe;
  border-radius: 4px;
  color: #0284c7;
  text-decoration: none;
  font-size: 13px;

  &:hover {
    background: #e0f2fe;
    text-decoration: underline;
  }
}

.mi-messages-section {
  background: #f9fafb;
  padding: 12px;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
}

.mi-messages-list {
  max-height: 200px;
  overflow-y: auto;
  margin-bottom: 12px;
}

.mi-messages-loading,
.mi-messages-empty {
  color: #6b7280;
  font-size: 13px;
  text-align: center;
  padding: 16px;
}

.mi-messages {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mi-message-item {
  padding: 8px 12px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
}

.mi-message-text {
  font-size: 13px;
  color: #374151;
}

.mi-message-input {
  display: flex;
  gap: 8px;
}

.mi-send-files {
  margin-top: 8px;
}

.mi-textbox-wrapper {
  flex: 1;
  display: flex;

  > span {
    flex: 1;
    display: flex;
  }

  input {
    width: 100%;
  }
}

.mi-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;

  &:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
  }
}

.mi-cancel-content {
  padding: 16px;

  p {
    margin: 0 0 12px 0;
    color: #374151;
  }
}

.mi-textarea {
  width: 100%;
  min-height: 350px;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
  resize: vertical;

  &:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
  }
}

.mi-cancel-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.mi-feed-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.mi-feed-count {
  background: #2563eb;
  color: white;
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 12px;
  font-weight: 600;
}

.mi-feed-content {
  padding: 0;
  transform: translateY(-24px);
  margin-bottom: -24px;
}

.mi-feed-controls {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 32px;
  margin: 0 -32px;
  background: #fff;
  position: sticky;
  top: 0;
  z-index: 10;
  border-bottom: 1px solid #e5e7eb;
}

.mi-feed-filters-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.mi-feed-list-wrapper {
  padding: 24px 32px 16px 32px;
}

.mi-feed-filters {
  display: flex;
  gap: 8px;
}

.mi-select {
  -webkit-appearance: none;
  -moz-appearance: none;
  appearance: none;
  padding: 8px 32px 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 400;
  font-family: inherit;
  line-height: 1.4;
  color: #111827;
  background-color: #ffffff;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b7280' d='M2.5 4.5L6 8l3.5-3.5'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  background-size: 12px;
  cursor: pointer;
  min-width: 150px;
  height: 36px;

  &:hover {
    border-color: #9ca3af;
  }

  &:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
  }

  option {
    padding: 8px 12px;
    font-weight: 400;
    color: #111827;
    background: #ffffff;
  }
}

.mi-filter-select {
  flex: 1;
  min-width: 120px;
  max-width: 160px;
}

.mi-filter-btn {
  min-width: 100px;
}

.mi-feed-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.mi-checkbox-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #6b7280;
  cursor: pointer;

  input {
    cursor: pointer;
  }
}

.mi-feed-empty {
  text-align: center;
  padding: 40px;
  color: #6b7280;
  font-size: 14px;
}

.mi-feed-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mi-feed-item {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px;
  transition: all 0.2s;

  &.approved {
    border-left: 4px solid #10b981;
  }

  &.conditions-changed {
    border-left: 4px solid #f59e0b;
    background: #fffbeb;
  }

  &.refused {
    border-left: 4px solid #ef4444;
    background: #fef2f2;
  }

  &.processing {
    border-left: 4px solid #6366f1;
  }

  &.age-fresh {
    background: linear-gradient(to right, #d1fae5 0%, #fff 30%);
  }

  &.age-warning {
    background: linear-gradient(to right, #fef3c7 0%, #fff 30%);
  }

  &.age-urgent {
    background: linear-gradient(to right, #fee2e2 0%, #fff 30%);
  }
}

.mi-feed-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.mi-feed-order {
  font-weight: 600;
  font-size: 14px;
  color: #1f2937;
}

.mi-feed-status {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 500;

  &.status-approved {
    background: #d1fae5;
    color: #065f46;
  }

  &.status-refused {
    background: #fee2e2;
    color: #991b1b;
  }

  &.status-processing {
    background: #e0e7ff;
    color: #3730a3;
  }

  &.status-signed {
    background: #dbeafe;
    color: #1e40af;
  }

  &.status-issued {
    background: #d1fae5;
    color: #065f46;
  }
}

.mi-feed-item-body {
  margin-bottom: 12px;
}

.mi-feed-row {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
  font-size: 13px;
}

.mi-feed-label {
  color: #6b7280;
}

.mi-feed-value {
  color: #1f2937;
  font-weight: 500;
}

.mi-feed-changed {
  color: #f59e0b;
  font-weight: 600;
}

.mi-feed-age-row {
  margin-top: 4px;
  padding-top: 8px;
  border-top: 1px dashed #e5e7eb;
}

.mi-age-text {
  font-weight: 500;

  &.age-fresh {
    color: #059669;
  }

  &.age-warning {
    color: #d97706;
  }

  &.age-urgent {
    color: #dc2626;
    font-weight: 600;
  }
}

.mi-signature-pending {
  color: #6b7280;
  font-style: italic;
}

.mi-signature-done {
  color: #059669;
  font-weight: 600;
}

.mi-feed-item-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 8px;
  border-top: 1px solid #e5e7eb;
}

.mi-feed-actions-left {
  display: flex;
  gap: 8px;
}

.mi-feed-actions-right {
  display: flex;
  gap: 8px;
}

.mi-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 14px;
  min-height: 36px;
  font-size: 13px;
  font-weight: 500;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  text-decoration: none;
  transition: all 0.15s ease;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

.mi-action-btn-primary {
  background: #2563eb;
  color: #ffffff;

  &:hover:not(:disabled) {
    background: #1d4ed8;
    color: #ffffff;
    text-decoration: none;
  }
}

.mi-action-btn-secondary {
  background: #f3f4f6;
  color: #374151;

  &:hover:not(:disabled) {
    background: #e5e7eb;
    text-decoration: none;
  }
}

.mi-footer-spread {
  display: flex;
  justify-content: space-between;
  width: 100%;
}

.mi-footer-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.mi-search-wrapper {
  width: 325px;

  > span {
    width: 100%;
  }
}

.mi-feed-filters-row:last-child .mi-filter-btn {
  margin-left: auto;
}

.mi-link-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 500;
  color: #2563eb;
  background: transparent;
  border: none;
  border-radius: 6px;
  text-decoration: none;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: #eff6ff;
    text-decoration: none;
  }

  &.mi-link-button-secondary {
    background: #f3f4f6;
    color: #374151;

    &:hover {
      background: #e5e7eb;
    }
  }
}
</style>
