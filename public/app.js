const UI_PREF_KEYS = {
  selectedDomainId: 'archivePortalSelectedDomainId',
  usageBeforeDate: 'archivePortalUsageBeforeDate',
  archiveBeforeDate: 'archivePortalArchiveBeforeDate',
  archiveFromDate: 'archivePortalArchiveFromDate',
  archiveToDate: 'archivePortalArchiveToDate',
  messageDateFrom: 'archivePortalMessageDateFrom',
  messageDateTo: 'archivePortalMessageDateTo',
};

function isIsoDateOnly(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function getStoredDate(key) {
  const v = localStorage.getItem(key) || '';
  return isIsoDateOnly(v) ? v : '';
}

function setStoredDate(key, value) {
  const normalized = String(value || '').slice(0, 10);
  if (isIsoDateOnly(normalized)) {
    localStorage.setItem(key, normalized);
  } else {
    localStorage.removeItem(key);
  }
}

function getStoredDomainId() {
  return localStorage.getItem(UI_PREF_KEYS.selectedDomainId) || '';
}

function setStoredDomainId(domainId) {
  const id = String(domainId || '').trim();
  if (id) {
    localStorage.setItem(UI_PREF_KEYS.selectedDomainId, id);
  } else {
    localStorage.removeItem(UI_PREF_KEYS.selectedDomainId);
  }
}

const state = {
  token: localStorage.getItem('archivePortalToken') || '',
  user: null,
  domainId: getStoredDomainId() || null,
  accountId: null,
  folderId: null,
  currentMessage: null,
  viewMode: 'plain',
  messageLimit: 100,
  messageOffset: 0,
  messageTotal: 0,
  messageQuery: '',
  messageDateFrom: getStoredDate(UI_PREF_KEYS.messageDateFrom),
  messageDateTo: getStoredDate(UI_PREF_KEYS.messageDateTo),
  domains: [],
  selectedDomain: null,
  selectedMembers: [],
  adminAccounts: [],
  adminArchiveSelectedIds: new Set(),
  activeTab: 'viewer',
  orphans: [],
  archiveAllPoll: null,
  usageRows: [],
  usageDomainRollups: [],
  usageScanStatus: null,
  usageBeforeDate: defaultUsageBeforeDate(),
  usageOpsInFlight: 0,
  usageBusyLabel: '',
  usageRowRefreshInFlight: new Set(),
  usageRowRefreshErrors: new Map(),
  usageRowRefreshStartedAt: new Map(),
  usageRowRefreshTargetCutoff: new Map(),
  usageRowRefreshOutcome: new Map(),
  usageRowBulkScanPending: new Set(),
  usageRowBulkBaseline: new Map(),
  usageBulkScanCutoff: '',
};

function defaultUsageBeforeDate() {
  const stored = getStoredDate(UI_PREF_KEYS.usageBeforeDate);
  if (stored) return stored;
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

const els = {
  loginCard: document.getElementById('loginCard'),
  loginForm: document.getElementById('loginForm'),
  loginBtn: document.querySelector('#loginForm button[type="submit"]'),
  email: document.getElementById('email'),
  password: document.getElementById('password'),
  portal: document.getElementById('portal'),
  currentUser: document.getElementById('currentUser'),
  logoutBtn: document.getElementById('logoutBtn'),
  status: document.getElementById('status'),
  domainList: document.getElementById('domainList'),
  accountList: document.getElementById('accountList'),
  folderList: document.getElementById('folderList'),
  messageList: document.getElementById('messageList'),
  messageSearch: document.getElementById('messageSearch'),
  messageDateFrom: document.getElementById('messageDateFrom'),
  messageDateTo: document.getElementById('messageDateTo'),
  messageSearchBtn: document.getElementById('messageSearchBtn'),
  messageResetBtn: document.getElementById('messageResetBtn'),
  messagePrevBtn: document.getElementById('messagePrevBtn'),
  messageNextBtn: document.getElementById('messageNextBtn'),
  messagePageInfo: document.getElementById('messagePageInfo'),
  messageDetail: document.getElementById('messageDetail'),
  messageDetailEmail: document.getElementById('messageDetailEmail'),
  viewToggle: document.getElementById('viewToggle'),
  togglePlain: document.getElementById('togglePlain'),
  toggleEmail: document.getElementById('toggleEmail'),
  adminPanel: document.getElementById('adminPanel'),
  adminDomainSelect: document.getElementById('adminDomainSelect'),
  adminDomainStatus: document.getElementById('adminDomainStatus'),
  adminSaveDomainBtn: document.getElementById('adminSaveDomainBtn'),
  adminSyncAccountsBtn: document.getElementById('adminSyncAccountsBtn'),
  adminSyncAllAccountsBtn: document.getElementById('adminSyncAllAccountsBtn'),
  adminMemberEmail: document.getElementById('adminMemberEmail'),
  adminMemberPermission: document.getElementById('adminMemberPermission'),
  adminAddMemberBtn: document.getElementById('adminAddMemberBtn'),
  adminDomainMembers: document.getElementById('adminDomainMembers'),
  adminAccountSyncStatus: document.getElementById('adminAccountSyncStatus'),
  adminQueueSyncBtn: document.getElementById('adminQueueSyncBtn'),
  adminArchiveAccountList: document.getElementById('adminArchiveAccountList'),
  adminArchiveSelectAll: document.getElementById('adminArchiveSelectAll'),
  adminArchiveSelectNone: document.getElementById('adminArchiveSelectNone'),
  adminArchiveMode: document.getElementById('adminArchiveMode'),
  adminArchiveBeforeWrap: document.getElementById('adminArchiveBeforeWrap'),
  adminArchiveBeforeDate: document.getElementById('adminArchiveBeforeDate'),
  adminArchiveFromWrap: document.getElementById('adminArchiveFromWrap'),
  adminArchiveFromDate: document.getElementById('adminArchiveFromDate'),
  adminArchiveToWrap: document.getElementById('adminArchiveToWrap'),
  adminArchiveToDate: document.getElementById('adminArchiveToDate'),
  adminArchiveStartBtn: document.getElementById('adminArchiveStartBtn'),
  adminArchiveVerifyBtn: document.getElementById('adminArchiveVerifyBtn'),
  adminDeleteMessagesBtn: document.getElementById('adminDeleteMessagesBtn'),
  adminArchiveDiscoverBtn: document.getElementById('adminArchiveDiscoverBtn'),
  adminArchiveResetBtn: document.getElementById('adminArchiveResetBtn'),
  adminArchiveDiscoverAllBtn: document.getElementById('adminArchiveDiscoverAllBtn'),
  adminArchivePruneBtn: document.getElementById('adminArchivePruneBtn'),
  adminArchiveAllBtn: document.getElementById('adminArchiveAllBtn'),
  adminArchiveSummary: document.getElementById('adminArchiveSummary'),
  adminArchiveStatus: document.getElementById('adminArchiveStatus'),
  adminUsageBeforeDate: document.getElementById('adminUsageBeforeDate'),
  adminUsageRefreshBtn: document.getElementById('adminUsageRefreshBtn'),
  adminUsageScanDomainBtn: document.getElementById('adminUsageScanDomainBtn'),
  adminUsageScanAllBtn: document.getElementById('adminUsageScanAllBtn'),
  adminUsageDomainIndicator: document.getElementById('adminUsageDomainIndicator'),
  adminUsageStatus: document.getElementById('adminUsageStatus'),
  adminUsageTable: document.getElementById('adminUsageTable'),
  portalTabs: document.getElementById('portalTabs'),
  tabEmailViewer: document.getElementById('tabEmailViewer'),
  tabAdminPanel: document.getElementById('tabAdminPanel'),
};

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!value) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let n = value;
  let idx = 0;
  while (n >= 1024 && idx < units.length - 1) {
    n /= 1024;
    idx += 1;
  }
  return `${n.toFixed(n >= 100 || idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function normalizeDateOnlyText(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatElapsed(ms) {
  const totalSeconds = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatClock(value) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString();
}

function setupEnhancedDatePickers() {
  const dateInputs = Array.from(document.querySelectorAll('.js-date-picker'));
  if (!dateInputs.length) return;

  if (typeof window.flatpickr !== 'function') {
    // Fallback to native pickers if the enhancement library fails to load.
    dateInputs.forEach((input) => {
      input.addEventListener('focus', () => {
        if (typeof input.showPicker === 'function') {
          try {
            input.showPicker();
          } catch (_) {
            // Ignore; native picker behavior varies by browser.
          }
        }
      });
    });
    return;
  }

  const commonPickerOptions = {
    dateFormat: 'Y-m-d',
    allowInput: true,
    disableMobile: true,
    monthSelectorType: 'static',
    onReady: (selectedDates, dateStr, instance) => {
      if (!instance || !instance.calendarContainer) return;
      if (instance.calendarContainer.querySelector('.fp-today-btn')) return;

      const footer = document.createElement('div');
      footer.className = 'fp-footer-actions';

      const todayBtn = document.createElement('button');
      todayBtn.type = 'button';
      todayBtn.className = 'fp-today-btn';
      todayBtn.textContent = 'Today';
      todayBtn.addEventListener('click', () => {
        const now = new Date();
        instance.setDate(now, true, 'Y-m-d');
        instance.close();
      });

      footer.appendChild(todayBtn);
      instance.calendarContainer.appendChild(footer);
    },
  };

  dateInputs.forEach((input) => {
    window.flatpickr(input, {
      ...commonPickerOptions,
      defaultDate: input.value || null,
    });
  });
}

function hydrateDateInputsFromPreferences() {
  if (els.messageDateFrom) {
    els.messageDateFrom.value = state.messageDateFrom || '';
  }
  if (els.messageDateTo) {
    els.messageDateTo.value = state.messageDateTo || '';
  }
  if (els.adminUsageBeforeDate) {
    els.adminUsageBeforeDate.value = state.usageBeforeDate || defaultUsageBeforeDate();
  }
  if (els.adminArchiveBeforeDate) {
    els.adminArchiveBeforeDate.value = getStoredDate(UI_PREF_KEYS.archiveBeforeDate) || state.usageBeforeDate;
  }
  if (els.adminArchiveFromDate) {
    els.adminArchiveFromDate.value = getStoredDate(UI_PREF_KEYS.archiveFromDate);
  }
  if (els.adminArchiveToDate) {
    els.adminArchiveToDate.value = getStoredDate(UI_PREF_KEYS.archiveToDate);
  }
}

function setAdminUsageStatus(text) {
  if (!els.adminUsageStatus) return;
  els.adminUsageStatus.textContent = text || 'No usage data loaded yet.';
}

function updateSelectedDomainIndicator() {
  if (!els.adminUsageDomainIndicator) return;

  const hasSelectedDomain = Boolean(state.selectedDomain && state.selectedDomain.name);
  const domainLabel = hasSelectedDomain ? state.selectedDomain.name : 'none';
  els.adminUsageDomainIndicator.textContent = `Selected domain: ${domainLabel}`;
  els.adminUsageDomainIndicator.classList.toggle('active', hasSelectedDomain);

  if (els.adminUsageScanDomainBtn) {
    els.adminUsageScanDomainBtn.title = hasSelectedDomain
      ? `Queue an asynchronous read-only usage scan for ${state.selectedDomain.name}.`
      : 'Select a domain first, then run Scan Selected Domain.';
  }
}

function isBulkDomainScanProgress(progress) {
  if (!progress || progress.status !== 'running') return false;
  const msg = String(progress.message || '').toLowerCase();
  if (msg.startsWith('refreshing ')) return false;
  if (msg.includes('scanning ') || msg.includes('queued usage scan')) return true;
  return Number(progress.total || 0) > 1;
}

function rowScannedAtMs(row) {
  if (!row || !row.scanned_at) return 0;
  const ms = Date.parse(row.scanned_at);
  return Number.isFinite(ms) ? ms : 0;
}

// Mark a set of rows as part of an in-progress bulk scan. Clears any existing
// completion badge for those rows so the green badge disappears until each row
// is rescanned, and records each row's current scanned_at as a baseline so we
// can detect genuine completion as scanned_at advances during polling.
function beginBulkScanTracking(accountIds, cutoff) {
  state.usageBulkScanCutoff = normalizeDateOnlyText(cutoff) || '';
  const rowsById = new Map(state.usageRows.map((row) => [String(row.account_id), row]));
  accountIds.forEach((rawId) => {
    const accountId = String(rawId);
    state.usageRowRefreshOutcome.delete(accountId);
    state.usageRowBulkScanPending.add(accountId);
    state.usageRowBulkBaseline.set(accountId, rowScannedAtMs(rowsById.get(accountId)));
  });
}

// As bulk-scan rows complete (scanned_at advances and cutoff matches), set the
// per-row completion badge. When forceFinalize is true (scan no longer running)
// resolve any rows still pending so spinners do not hang indefinitely.
function reconcileBulkScan(forceFinalize = false) {
  if (state.usageRowBulkScanPending.size === 0) return;
  const cutoff = state.usageBulkScanCutoff;
  const rowsById = new Map(state.usageRows.map((row) => [String(row.account_id), row]));
  Array.from(state.usageRowBulkScanPending).forEach((accountId) => {
    const row = rowsById.get(accountId);
    if (!row) {
      if (forceFinalize) {
        state.usageRowBulkScanPending.delete(accountId);
        state.usageRowBulkBaseline.delete(accountId);
      }
      return;
    }
    const baseline = Number(state.usageRowBulkBaseline.get(accountId) || 0);
    const advanced = rowScannedAtMs(row) > baseline;
    const rowCutoff = normalizeDateOnlyText(row.before_date);
    const hasError = Boolean(row.error || row.scan_error);
    if (!advanced && !forceFinalize) return;
    if (!advanced && forceFinalize) {
      // Row was never rescanned in this pass. Only surface a badge if the DB
      // actually recorded an error for it; otherwise clear it silently so we
      // don't show a false "completed with error".
      if (hasError) {
        state.usageRowRefreshOutcome.set(accountId, {
          state: 'failed',
          at: rowScannedAtMs(row) || Date.now(),
          cutoff: rowCutoff || cutoff,
          message: String(row.error || row.scan_error),
        });
      }
      state.usageRowBulkScanPending.delete(accountId);
      state.usageRowBulkBaseline.delete(accountId);
      return;
    }
    const cutoffMatches = cutoff ? rowCutoff === cutoff : true;
    state.usageRowRefreshOutcome.set(accountId, {
      state: !hasError && cutoffMatches ? 'completed' : 'failed',
      at: rowScannedAtMs(row) || Date.now(),
      cutoff: cutoff || rowCutoff,
      message: hasError ? String(row.error || row.scan_error) : undefined,
    });
    state.usageRowBulkScanPending.delete(accountId);
    state.usageRowBulkBaseline.delete(accountId);
  });
}

function setUsageButtonBusy(buttonEl, busy, busyText) {
  if (!buttonEl) return;
  if (!buttonEl.dataset.defaultText) {
    buttonEl.dataset.defaultText = buttonEl.textContent || '';
  }
  buttonEl.disabled = busy;
  buttonEl.textContent = busy ? busyText : buttonEl.dataset.defaultText;
}

function isUsageBusy() {
  return state.usageOpsInFlight > 0;
}

function updateUsageBusyUi() {
  const busy = isUsageBusy();
  const label = state.usageBusyLabel || 'Updating Usage...';
  setUsageButtonBusy(els.adminUsageRefreshBtn, busy, label);
  setUsageButtonBusy(els.adminUsageScanDomainBtn, busy, label);
  setUsageButtonBusy(els.adminUsageScanAllBtn, busy, label);
  renderUsageTable(state.usageRows);
}

function beginUsageOperation(label) {
  state.usageOpsInFlight += 1;
  if (label) state.usageBusyLabel = label;
  updateUsageBusyUi();
}

function endUsageOperation() {
  state.usageOpsInFlight = Math.max(0, state.usageOpsInFlight - 1);
  if (!state.usageOpsInFlight) {
    state.usageBusyLabel = '';
  }
  updateUsageBusyUi();
}

function setStatus(message, level = 'error') {
  els.status.textContent = message || '';
  els.status.classList.remove('status-error', 'status-info');
  if (!message) return;
  els.status.classList.add(level === 'info' ? 'status-info' : 'status-error');
}

function setLoginBusy(busy) {
  if (!els.loginBtn) return;
  els.loginBtn.disabled = busy;
  els.loginBtn.textContent = busy ? 'Signing in...' : 'Sign in';
}

function clearList(listEl, emptyText) {
  listEl.innerHTML = '';
  const li = document.createElement('li');
  li.className = 'muted';
  li.textContent = emptyText;
  listEl.appendChild(li);
}

function renderButtonList(listEl, rows, labelFn, onClick) {
  listEl.innerHTML = '';
  if (!rows.length) {
    clearList(listEl, 'No items found.');
    return;
  }

  rows.forEach((row) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = labelFn(row);
    btn.addEventListener('click', () => onClick(row));
    li.appendChild(btn);
    listEl.appendChild(li);
  });
}

function resetMessageView(emptyText) {
  state.messageOffset = 0;
  state.messageTotal = 0;
  state.messageQuery = '';
  state.messageDateFrom = '';
  state.messageDateTo = '';
  els.messageSearch.value = '';
  els.messageDateFrom.value = '';
  els.messageDateTo.value = '';
  clearList(els.messageList, emptyText);
  els.messagePageInfo.textContent = '';
  els.messagePrevBtn.disabled = true;
  els.messageNextBtn.disabled = true;
}

function formatMessageDate(sentAt, receivedAt) {
  const v = sentAt || receivedAt;
  if (!v) return 'unknown date';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString();
}

function updateMessagePager(rowsCount) {
  const total = state.messageTotal;
  const page = Math.floor(state.messageOffset / state.messageLimit) + 1;
  const totalPages = Math.max(1, Math.ceil(total / state.messageLimit));
  const showingStart = total ? state.messageOffset + 1 : 0;
  const showingEnd = Math.min(state.messageOffset + rowsCount, total);
  const suffix = state.messageQuery ? ` | filter: "${state.messageQuery}"` : '';
  const dateSuffix = (state.messageDateFrom || state.messageDateTo)
    ? ` | date: ${state.messageDateFrom || '..'} to ${state.messageDateTo || '..'}`
    : '';

  els.messagePageInfo.textContent = `Showing ${showingStart}-${showingEnd} of ${total} | page ${page}/${totalPages}${suffix}${dateSuffix}`;
  els.messagePrevBtn.disabled = state.messageOffset <= 0;
  els.messageNextBtn.disabled = (state.messageOffset + rowsCount) >= total;
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  const method = String(options.method || 'GET').toUpperCase();
  const fetchOptions = { ...options, headers };
  if (method === 'GET') {
    // Avoid stale admin data behind browser/proxy caching.
    fetchOptions.cache = 'no-store';
  }

  const res = await fetch(path, fetchOptions);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }

  return data;
}

function renderAuthState() {
  const isLoggedIn = Boolean(state.token);
  const isAdmin = Boolean(state.user && state.user.role === 'admin');
  els.loginCard.classList.toggle('hidden', isLoggedIn);
  els.logoutBtn.classList.toggle('hidden', !isLoggedIn);
  els.portalTabs.classList.toggle('hidden', !(isLoggedIn && isAdmin));
  if (!isLoggedIn) {
    els.portal.classList.add('hidden');
    els.adminPanel.classList.add('hidden');
  } else if (!isAdmin) {
    els.portal.classList.remove('hidden');
    els.adminPanel.classList.add('hidden');
  } else {
    const showAdmin = state.activeTab === 'admin';
    els.portal.classList.toggle('hidden', showAdmin);
    els.adminPanel.classList.toggle('hidden', !showAdmin);
    els.tabEmailViewer.classList.toggle('active', !showAdmin);
    els.tabAdminPanel.classList.toggle('active', showAdmin);
  }
  if (state.user) {
    const primary = state.user.primary_email || state.user.email;
    const login = state.user.primary_email && state.user.primary_email !== state.user.email
      ? ` (${state.user.email})`
      : '';
    const roleLabel = state.user.role === 'admin' ? 'Master Admin' : state.user.role;
    els.currentUser.textContent = `${primary}${login} (${roleLabel})`;
  } else {
    els.currentUser.textContent = '';
  }
  updateSelectedDomainIndicator();
}

function renderAdminMembers() {
  const members = state.selectedMembers || [];
  if (!members.length) {
    clearList(els.adminDomainMembers, 'No members found.');
    return;
  }

  els.adminDomainMembers.innerHTML = '';
  members.forEach((member) => {
    const li = document.createElement('li');
    li.className = 'admin-member';
    const text = document.createElement('span');
    const primary = member.primary_email && member.primary_email !== member.email
      ? ` | ${member.primary_email}`
      : '';
    text.textContent = `${member.email}${primary} (${member.permission})`;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button ghost';
    button.textContent = 'Remove';
    button.addEventListener('click', async () => {
      if (!state.selectedDomain) return;
      await api(`/domains/${state.selectedDomain.id}/members/${member.id}`, { method: 'DELETE' });
      await loadAdminDomain(state.selectedDomain.id);
    });
    li.appendChild(text);
    li.appendChild(button);
    els.adminDomainMembers.appendChild(li);
  });
}

function renderAccountSyncStatus(accounts) {
  if (!accounts || !accounts.length) {
    clearList(els.adminAccountSyncStatus, 'No accounts found.');
    return;
  }

  els.adminAccountSyncStatus.innerHTML = '';
  const indexed = accounts.filter((a) => a.sync_status === 'indexed').length;
  const notIndexed = accounts.filter((a) => a.sync_status === 'not_indexed').length;

  const summary = document.createElement('li');
  summary.style.padding = '8px';
  summary.style.borderBottom = '1px solid var(--border)';
  summary.style.marginBottom = '8px';
  summary.innerHTML = `
    <strong style="font-size: 0.85rem;">Summary:</strong> ${indexed} indexed, ${notIndexed} waiting for sync
  `;
  els.adminAccountSyncStatus.appendChild(summary);

  accounts.forEach((account) => {
    const li = document.createElement('li');
    li.style.display = 'flex';
    li.style.justifyContent = 'space-between';
    li.style.alignItems = 'center';
    li.style.gap = '8px';

    const info = document.createElement('span');
    info.style.fontSize = '0.85rem';
    const status = account.sync_status === 'indexed' ? '✓' : '⏳';
    const msgStr = account.message_count > 0 ? `${account.message_count} msgs` : 'empty';
    const timeStr = account.indexed_at
      ? new Date(account.indexed_at).toLocaleDateString()
      : 'never';
    const archive = account.archive_state;
    const archiveStr = archive
      ? (archive.verified ? ' | archive: verified' : ` | archive: ${archive.status || 'pending'}`)
      : ' | archive: none';
    info.textContent = `${status} ${account.username} – ${msgStr} (${timeStr})${archiveStr}`;
    info.title = account.indexed_at
      ? `Last indexed: ${new Date(account.indexed_at).toLocaleString()}`
      : 'Not yet indexed from archive';

    li.appendChild(info);
    els.adminAccountSyncStatus.appendChild(li);
  });
}

function renderArchiveAccountTable(accounts) {
  const container = els.adminArchiveAccountList;
  container.innerHTML = '';

  // Summary line
  if (els.adminArchiveSummary) {
    if (!accounts || !accounts.length) {
      els.adminArchiveSummary.textContent = '';
    } else {
      const total = accounts.length;
      const archived = accounts.filter((a) => a.archive_state).length;
      const deleted = accounts.filter((a) => a.archive_state && a.archive_state.deletion_status === 'deleted').length;
      const pending = total - archived;
      const parts = [`${archived} of ${total} accounts archived`];
      if (deleted) parts.push(`${deleted} messages deleted`);
      if (pending) parts.push(`${pending} not yet archived`);
      els.adminArchiveSummary.textContent = parts.join('  \u00b7  ');
    }
  }

  if (!accounts || !accounts.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.style.cssText = 'padding: 8px; font-size: 0.85rem; margin: 0;';
    empty.textContent = 'No accounts found for this domain.';
    container.appendChild(empty);
    return;
  }

  accounts.forEach((account) => {
    const archive = account.archive_state;
    const id = String(account.id);

    const item = document.createElement('div');
    item.className = 'archive-account-item';

    const row = document.createElement('div');
    row.className = 'archive-account-row';

    // Checkbox
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `archiveAcct_${id}`;
    checkbox.value = id;
    checkbox.checked = state.adminArchiveSelectedIds.has(id);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        state.adminArchiveSelectedIds.add(id);
      } else {
        state.adminArchiveSelectedIds.delete(id);
      }
    });

    // Label
    const label = document.createElement('label');
    label.htmlFor = `archiveAcct_${id}`;
    label.className = 'archive-account-label';
    label.textContent = account.username;

    // Message count
    const msgs = document.createElement('span');
    msgs.className = 'archive-account-msgs';
    msgs.textContent = account.message_count > 0 ? `${account.message_count} msgs` : 'empty';

    // Archive status badge
    const badge = document.createElement('span');
    badge.className = 'archive-status-badge';
    if (!archive) {
      badge.textContent = 'No Archive';
      badge.dataset.state = 'none';
    } else if (archive.status === 'running') {
      badge.textContent = 'Running\u2026';
      badge.dataset.state = 'running';
    } else if (archive.verified) {
      badge.textContent = '\u2713 Verified';
      badge.dataset.state = 'verified';
    } else if (archive.status === 'complete' || archive.status === 'done') {
      badge.textContent = 'Complete';
      badge.dataset.state = 'complete';
    } else if (archive.status === 'error') {
      badge.textContent = 'Error';
      badge.dataset.state = 'error';
    } else {
      badge.textContent = archive.status || 'Pending';
      badge.dataset.state = 'pending';
    }

    // Deletion status badge
    const delBadge = document.createElement('span');
    delBadge.className = 'archive-status-badge';
    if (archive && archive.deletion_status === 'deleted') {
      delBadge.textContent = 'Msgs Deleted';
      delBadge.dataset.state = 'deleted';
    } else if (archive && archive.deletion_status === 'ready') {
      delBadge.textContent = 'Del Ready';
      delBadge.dataset.state = 'del-ready';
    } else {
      delBadge.style.visibility = 'hidden';
      delBadge.textContent = '\u2013';
    }

    // Range
    const range = document.createElement('span');
    range.className = 'archive-account-range';
    if (archive) {
      range.textContent = archive.range_label
        || (archive.mode === 'before' ? `before ${archive.beforeDate}` : `${archive.fromDate} \u2192 ${archive.toDate}`);
    } else {
      range.textContent = '\u2014';
    }

    // Expand toggle
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'archive-detail-toggle';
    toggle.setAttribute('aria-label', 'Toggle archive details');
    if (archive) {
      toggle.textContent = '\u25bc';
    } else {
      toggle.style.visibility = 'hidden';
      toggle.textContent = '\u25bc';
    }

    // Detail panel
    const detail = document.createElement('div');
    detail.className = 'archive-account-detail hidden';
    if (archive) {
      if (archive.archive_s3_uri) {
        const uriSpan = document.createElement('span');
        uriSpan.className = 'archive-s3-uri';
        uriSpan.textContent = archive.archive_s3_uri;
        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'button ghost archive-copy-btn';
        copyBtn.textContent = 'Copy URI';
        copyBtn.addEventListener('click', () => {
          navigator.clipboard.writeText(archive.archive_s3_uri).then(() => {
            copyBtn.textContent = 'Copied!';
            setTimeout(() => { copyBtn.textContent = 'Copy URI'; }, 1500);
          });
        });
        detail.appendChild(uriSpan);
        detail.appendChild(copyBtn);
      }
      if (archive.verification_checked_at) {
        const verSpan = document.createElement('span');
        verSpan.className = 'archive-detail-meta';
        verSpan.textContent = `Verified: ${archive.verification_checked_at.slice(0, 10)}`;
        detail.appendChild(verSpan);
      }
    }

    toggle.addEventListener('click', () => {
      const isOpen = !detail.classList.contains('hidden');
      detail.classList.toggle('hidden', isOpen);
      toggle.textContent = isOpen ? '\u25bc' : '\u25b2';
    });

    row.appendChild(checkbox);
    row.appendChild(label);
    row.appendChild(msgs);
    row.appendChild(badge);
    row.appendChild(delBadge);
    row.appendChild(range);
    row.appendChild(toggle);
    item.appendChild(row);
    item.appendChild(detail);
    container.appendChild(item);
  });
}

async function applyUsageSuggestion(row) {
  if (!row) return;
  const domain = state.domains.find((d) => d.id === row.domain_id);
  if (domain) {
    state.domainId = domain.id;
    els.adminDomainSelect.value = domain.id;
  }

  state.adminArchiveSelectedIds = new Set([String(row.account_id)]);
  els.adminArchiveMode.value = 'before';
  els.adminArchiveBeforeDate.value = state.usageBeforeDate;
  setStoredDate(UI_PREF_KEYS.archiveBeforeDate, state.usageBeforeDate);
  applyArchiveModeVisibility();

  const openTarget = domain || state.selectedDomain;
  if (openTarget) {
    await openDomain(openTarget).catch(() => {});
  }
  if (els.adminArchiveStatus) {
    els.adminArchiveStatus.textContent = `Selected ${row.username} for Archive Lifecycle Management. Next step: click Create Archive.`;
  }
  if (els.adminArchiveStatus && typeof els.adminArchiveStatus.scrollIntoView === 'function') {
    els.adminArchiveStatus.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  setStatus(`Prepared archive selection for ${row.username} (${row.domain_name}).`, 'info');
}

async function refreshUsageRow(row) {
  if (!row || !row.domain_id || !row.account_id) return;
  const id = String(row.account_id);
  if (state.usageRowRefreshInFlight.has(id)) return;

  state.usageRowRefreshInFlight.add(id);
  state.usageRowRefreshStartedAt.set(id, Date.now());
  state.usageRowRefreshOutcome.delete(id);
  renderUsageTable(state.usageRows);
  try {
    const beforeDate = (els.adminUsageBeforeDate && els.adminUsageBeforeDate.value) || state.usageBeforeDate;
    state.usageRowRefreshTargetCutoff.set(id, normalizeDateOnlyText(beforeDate));
    const result = await api(`/domains/${row.domain_id}/usage/${row.account_id}/refresh`, {
      method: 'POST',
      body: JSON.stringify({ beforeDate }),
    });
    if (result && result.queued) {
      startUsageRefreshPolling();
      setAdminUsageStatus(`Refreshing ${row.username} in background for cutoff ${beforeDate}.`);
      const outcome = await waitForUsageRowRefresh(row, beforeDate);
      if (outcome.state === 'updated') {
        state.usageRowRefreshErrors.delete(String(row.account_id));
        state.usageRowRefreshOutcome.set(String(row.account_id), {
          state: 'completed',
          at: Date.now(),
          cutoff: normalizeDateOnlyText(beforeDate),
        });
        setAdminUsageStatus(`Refreshed ${row.username} for cutoff ${beforeDate}.`);
      } else if (outcome.state === 'failed') {
        state.usageRowRefreshErrors.set(String(row.account_id), outcome.message || 'unknown error');
        state.usageRowRefreshOutcome.set(String(row.account_id), {
          state: 'failed',
          at: Date.now(),
          cutoff: normalizeDateOnlyText(beforeDate),
          message: outcome.message || 'unknown error',
        });
        setAdminUsageStatus(`Refresh failed for ${row.username}: ${outcome.message || 'unknown error'}`);
      } else {
        state.usageRowRefreshErrors.set(String(row.account_id), 'Refresh timed out — try again in a moment.');
        state.usageRowRefreshOutcome.set(String(row.account_id), {
          state: 'failed',
          at: Date.now(),
          cutoff: normalizeDateOnlyText(beforeDate),
          message: 'Refresh timed out — try again in a moment.',
        });
        setAdminUsageStatus(`Refresh still running for ${row.username}. Try Refresh Row again in a moment.`);
      }
    } else {
      await loadGlobalUsage(false, { background: true });
      state.usageRowRefreshOutcome.set(String(row.account_id), {
        state: 'completed',
        at: Date.now(),
        cutoff: normalizeDateOnlyText(beforeDate),
      });
      setAdminUsageStatus(`Refreshed ${row.username} for cutoff ${beforeDate}.`);
    }
  } catch (err) {
    state.usageRowRefreshOutcome.set(String(row.account_id), {
      state: 'failed',
      at: Date.now(),
      cutoff: normalizeDateOnlyText((els.adminUsageBeforeDate && els.adminUsageBeforeDate.value) || state.usageBeforeDate),
      message: err.message,
    });
    setStatus(`Row usage refresh failed: ${err.message}`);
  } finally {
    state.usageRowRefreshInFlight.delete(id);
    state.usageRowRefreshStartedAt.delete(id);
    state.usageRowRefreshTargetCutoff.delete(id);
    renderUsageTable(state.usageRows);
  }
}

async function waitForUsageRowRefresh(row, beforeDate) {
  const accountId = String(row.account_id);
  const domainId = String(row.domain_id);
  const targetCutoff = normalizeDateOnlyText(beforeDate);
  const originalScannedMs = row && row.scanned_at ? (Date.parse(row.scanned_at) || 0) : 0;
  const start = Date.now();
  const timeoutMs = 120000;

  while (Date.now() - start < timeoutMs) {
    const params = new URLSearchParams({ beforeDate: targetCutoff, _ts: String(Date.now()) });
    const data = await api(`/domains/${domainId}/usage?${params.toString()}`);
    if (data && data.progress) {
      state.usageScanStatus = state.usageScanStatus || {};
      state.usageScanStatus[domainId] = data.progress;
    }
    const refreshedRow = Array.isArray(data && data.usage)
      ? data.usage.find((r) => String(r.account_id) === accountId)
      : null;

    if (refreshedRow) {
      const merged = {
        ...refreshedRow,
        domain_id: row.domain_id,
        domain_name: row.domain_name,
      };
      state.usageRows = (state.usageRows || []).map((r) => (
        String(r.account_id) === accountId ? merged : r
      ));
      renderUsageTable(state.usageRows);
    }

    const refreshedCutoff = normalizeDateOnlyText(refreshedRow && refreshedRow.before_date);
    const refreshedScannedMs = refreshedRow && refreshedRow.scanned_at
      ? (Date.parse(refreshedRow.scanned_at) || 0)
      : 0;
    // Only treat the scan as finished once scanned_at advances past the value
    // we started from. Until then the row still shows the previous snapshot and
    // we must keep polling rather than declare a (false) cutoff mismatch.
    const scanAdvanced = refreshedScannedMs > originalScannedMs;

    if (refreshedRow && scanAdvanced && refreshedRow.error) {
      return { state: 'failed', message: refreshedRow.error };
    }

    if (refreshedRow && scanAdvanced && refreshedCutoff && refreshedCutoff === targetCutoff) {
      return { state: 'updated' };
    }

    if (refreshedRow && scanAdvanced && refreshedCutoff && refreshedCutoff !== targetCutoff) {
      return {
        state: 'failed',
        message: `refresh completed but cutoff is still ${refreshedCutoff || 'unknown'} (expected ${targetCutoff})`,
      };
    }

    if (data && data.progress && data.progress.status === 'failed') {
      return { state: 'failed', message: data.progress.message || 'scan failed' };
    }

    await delay(2000);
  }

  return { state: 'timeout' };
}

function renderUsageTable(rows) {
  if (!els.adminUsageTable) return;
  const list = rows || [];
  els.adminUsageTable.innerHTML = '';

  if (isUsageBusy()) {
    const loading = document.createElement('div');
    loading.className = 'usage-loading-banner';
    loading.innerHTML = `<span class="usage-loading-dot" aria-hidden="true"></span>${state.usageBusyLabel || 'Updating usage data...'}`;
    els.adminUsageTable.appendChild(loading);
  }

  if (!list.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'No usage rows available yet. Run a scan first.';
    els.adminUsageTable.appendChild(empty);
    return;
  }

  const topRows = list.slice(0, 200);
  const selectedCutoff = normalizeDateOnlyText(
    (els.adminUsageBeforeDate && els.adminUsageBeforeDate.value) || state.usageBeforeDate
  );
  const selectedDomainId = state.selectedDomain ? String(state.selectedDomain.id) : '';
  topRows.forEach((row, index) => {
    const item = document.createElement('div');
    item.className = 'usage-row';
    if (isUsageBusy()) item.classList.add('usage-row-updating');

    const rank = document.createElement('span');
    rank.className = 'usage-rank';
    rank.textContent = String(index + 1);

    const identity = document.createElement('div');
    identity.className = 'usage-identity';
    const title = document.createElement('strong');
    title.textContent = `${row.username} @ ${row.domain_name}`;
    const meta = document.createElement('span');
    meta.className = 'muted';
    const scanned = row.scanned_at ? new Date(row.scanned_at).toLocaleString() : 'never';
    const rowCutoff = normalizeDateOnlyText(row.before_date);
    const isCutoffMismatch = Boolean(rowCutoff && selectedCutoff && rowCutoff !== selectedCutoff);
    const accountId = String(row.account_id);
    const refreshingRow = state.usageRowRefreshInFlight.has(accountId);
    const rowRefreshError = state.usageRowRefreshErrors.get(accountId);
    const rowRefreshStartedAt = state.usageRowRefreshStartedAt.get(accountId) || Date.now();
    const rowRefreshTargetCutoff = state.usageRowRefreshTargetCutoff.get(accountId) || selectedCutoff;
    const rowRefreshOutcome = state.usageRowRefreshOutcome.get(accountId);
    const domainProgress = state.usageScanStatus && state.usageScanStatus[String(row.domain_id)];
    const domainScanRunning = Boolean(
      selectedDomainId
      && String(row.domain_id) === selectedDomainId
      && isBulkDomainScanProgress(domainProgress)
    );
    const rowBulkScanning = state.usageRowBulkScanPending.has(accountId);
    const rowScanning = rowBulkScanning || domainScanRunning;
    const progressDone = Number(domainProgress && domainProgress.done || 0);
    const progressTotal = Number(domainProgress && domainProgress.total || 0);
    const progressFraction = progressTotal > 0 ? `${Math.min(progressDone, progressTotal)}/${progressTotal}` : 'working';
    const rowElapsed = formatElapsed(Date.now() - rowRefreshStartedAt);
    const domainElapsed = domainProgress && domainProgress.startedAt
      ? formatElapsed(Date.now() - Date.parse(domainProgress.startedAt))
      : null;
    const rowProgressCutoff = normalizeDateOnlyText((domainProgress && domainProgress.beforeDate) || rowRefreshTargetCutoff);
    const staleSuffix = isCutoffMismatch
      ? (refreshingRow
        ? ' · refreshing selected cutoff...'
        : (rowScanning ? ' · scanning selected cutoff...' : ' · stale for selected cutoff'))
      : '';
    meta.textContent = `Files: ${Number(row.total_files || 0).toLocaleString()} · Scanned: ${scanned}${rowCutoff ? ` · Cutoff: ${rowCutoff}` : ''}${staleSuffix}`;
    if (isCutoffMismatch && !refreshingRow && !rowScanning) {
      meta.classList.add('usage-cutoff-stale');
    }
    if (rowScanning) {
      item.classList.add('usage-row-scanning');
    }
    identity.appendChild(title);
    identity.appendChild(meta);
    if (refreshingRow) {
      const progressSpan = document.createElement('span');
      progressSpan.className = 'usage-row-progress';
      const progressMessage = domainProgress && domainProgress.message ? ` · ${domainProgress.message}` : '';
      progressSpan.textContent = `Refreshing for ${rowProgressCutoff || rowRefreshTargetCutoff} · ${progressFraction} · ${rowElapsed}${progressMessage}`;
      identity.appendChild(progressSpan);
    }
    if (!refreshingRow && rowScanning) {
      const progressSpan = document.createElement('span');
      progressSpan.className = 'usage-row-progress';
      const progressMessage = domainProgress && domainProgress.message ? ` · ${domainProgress.message}` : '';
      const scanCutoff = state.usageBulkScanCutoff || rowProgressCutoff || selectedCutoff;
      progressSpan.textContent = `Scanning for ${scanCutoff} · ${progressFraction}${domainElapsed ? ` · ${domainElapsed}` : ''}${progressMessage}`;
      identity.appendChild(progressSpan);
    }
    if (!refreshingRow && rowRefreshOutcome) {
      const outcomeSpan = document.createElement('span');
      outcomeSpan.className = `usage-row-completion ${rowRefreshOutcome.state === 'completed' ? 'ok' : 'failed'}`;
      const outcomeCutoff = normalizeDateOnlyText(rowRefreshOutcome.cutoff) || rowCutoff || selectedCutoff;
      const outcomeAt = formatClock(rowRefreshOutcome.at);
      if (rowRefreshOutcome.state === 'completed') {
        outcomeSpan.textContent = `Completed for ${outcomeCutoff}${outcomeAt ? ` at ${outcomeAt}` : ''}`;
      } else {
        outcomeSpan.textContent = `Completed with error for ${outcomeCutoff}${outcomeAt ? ` at ${outcomeAt}` : ''}`;
      }
      identity.appendChild(outcomeSpan);
    }
    if (rowRefreshError) {
      const errSpan = document.createElement('span');
      errSpan.className = 'usage-row-error';
      errSpan.textContent = `Scan error: ${rowRefreshError}`;
      identity.appendChild(errSpan);
    }

    const totals = document.createElement('div');
    totals.className = 'usage-totals';
    totals.innerHTML = `
      <span title=">3 years">${formatBytes(row.bucket_gt3y_bytes)} 3y+</span>
      <span title="1-3 years">${formatBytes(row.bucket_1y_to_3y_bytes)} 1-3y</span>
      <span title="<1 year">${formatBytes(row.bucket_lt1y_bytes)} <1y</span>
      <strong>${formatBytes(row.total_bytes)}</strong>
      <em>Reclaim: ${formatBytes(row.reclaimable_bytes)}</em>
    `;

    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'button ghost';
    action.textContent = refreshingRow ? 'Refreshing...' : 'Refresh Row';
    action.title = 'Recalculate usage buckets for this mailbox using the selected cutoff date.';
    action.disabled = refreshingRow;
    action.addEventListener('click', () => refreshUsageRow(row));

    item.appendChild(rank);
    item.appendChild(identity);
    item.appendChild(totals);
    item.appendChild(action);
    els.adminUsageTable.appendChild(item);
  });
}

async function loadGlobalUsage(scan = false, options = {}) {
  if (!state.user || state.user.role !== 'admin') return;
  if (!els.adminUsageBeforeDate) return;
  const isBackground = Boolean(options && options.background);
  if (!isBackground) {
    beginUsageOperation(scan ? 'Queueing Scan...' : 'Refreshing Usage...');
  }
  try {
    const beforeDate = els.adminUsageBeforeDate.value || state.usageBeforeDate;
    state.usageBeforeDate = beforeDate;
    setStoredDate(UI_PREF_KEYS.usageBeforeDate, beforeDate);

    const params = new URLSearchParams({ beforeDate });
    if (scan) params.set('scan', 'true');
    params.set('_ts', String(Date.now()));
    const data = await api(`/domains/usage?${params.toString()}`);
    const incomingRows = Array.isArray(data.usage) ? data.usage : [];
    // Protect against transient empty responses racing with concurrent refreshes.
    if (incomingRows.length === 0 && state.usageRows.length > 0 && !scan) {
      setAdminUsageStatus('Usage refresh returned no rows temporarily; keeping previous rows. Try refresh again if this persists.');
    } else {
      state.usageRows = incomingRows;
    }
    state.usageDomainRollups = data.domains || [];
    state.usageScanStatus = data.scans || null;
    renderUsageTable(state.usageRows);

    const runningScanExists = Object.values(state.usageScanStatus || {}).some(
      (progress) => progress && progress.status === 'running'
    );
    reconcileBulkScan(!runningScanExists);
    renderUsageTable(state.usageRows);
    if (runningScanExists) {
      startUsageRefreshPolling();
    } else {
      stopUsageRefreshPolling();
    }

    const activeDomainScan = state.selectedDomain && state.usageScanStatus
      ? state.usageScanStatus[state.selectedDomain.id]
      : null;
    const rowCutoffs = Array.from(new Set(
      state.usageRows
        .map((row) => normalizeDateOnlyText(row.before_date))
        .filter(Boolean)
    ));
    const hasCutoffMismatch = rowCutoffs.length > 0 && rowCutoffs.some((d) => d !== beforeDate);
    const refreshedAt = new Date().toLocaleTimeString();
    if (scan) {
      setAdminUsageStatus(`Usage scan queued for cutoff ${beforeDate}. Last refresh ${refreshedAt}.`);
    } else if (activeDomainScan && activeDomainScan.status === 'running') {
      setAdminUsageStatus(`Domain scan running: ${activeDomainScan.message || 'in progress'} (last refresh ${refreshedAt})`);
    } else if (hasCutoffMismatch) {
      setAdminUsageStatus(`Loaded ${state.usageRows.length} rows, but currently scanned cutoff is ${rowCutoffs.join(', ')}. Click Scan All Domains to recalculate for ${beforeDate}. Last refresh ${refreshedAt}.`);
    } else {
      setAdminUsageStatus(`Loaded ${state.usageRows.length} account usage rows (cutoff ${beforeDate}). Last refresh ${refreshedAt}.`);
    }
  } finally {
    if (!isBackground) {
      endUsageOperation();
    }
  }
}

async function loadDomainUsage(scan = false) {
  if (!state.selectedDomain) return;
  if (!els.adminUsageBeforeDate) return;
  beginUsageOperation(scan ? 'Queueing Domain Scan...' : 'Refreshing Domain Usage...');
  try {
    const beforeDate = els.adminUsageBeforeDate.value || state.usageBeforeDate;
    state.usageBeforeDate = beforeDate;
    setStoredDate(UI_PREF_KEYS.usageBeforeDate, beforeDate);

    const params = new URLSearchParams({ beforeDate });
    if (scan) params.set('scan', 'true');
    params.set('_ts', String(Date.now()));
    const data = await api(`/domains/${state.selectedDomain.id}/usage?${params.toString()}`);

    if (Array.isArray(data.usage) && data.usage.length) {
      state.usageRows = data.usage.map((row) => ({
        ...row,
        domain_id: state.selectedDomain.id,
        domain_name: state.selectedDomain.name,
      }));
      const domainScanRunning = Boolean(data.progress && data.progress.status === 'running');
      reconcileBulkScan(!domainScanRunning);
      renderUsageTable(state.usageRows);
    }

    const refreshedAt = new Date().toLocaleTimeString();
    const rowCutoffs = Array.from(new Set(
      (data.usage || [])
        .map((row) => normalizeDateOnlyText(row.before_date))
        .filter(Boolean)
    ));
    const hasCutoffMismatch = rowCutoffs.length > 0 && rowCutoffs.some((d) => d !== beforeDate);
    if (scan) {
      setAdminUsageStatus(data.progress && data.progress.message
        ? data.progress.message
        : `Usage scan queued for ${state.selectedDomain.name}. Last refresh ${refreshedAt}.`);
    } else if (data.progress && data.progress.status === 'running') {
      setAdminUsageStatus(`Running: ${data.progress.message || 'usage scan in progress'} (last refresh ${refreshedAt})`);
    } else if (hasCutoffMismatch) {
      setAdminUsageStatus(`Loaded ${state.usageRows.length} rows for ${state.selectedDomain.name}, but scanned cutoff is ${rowCutoffs.join(', ')}. Click Scan Selected Domain to recalculate for ${beforeDate}. Last refresh ${refreshedAt}.`);
    } else if (Array.isArray(data.usage) && data.usage.length === 0) {
      setAdminUsageStatus(`Selected domain ${state.selectedDomain.name} has no usage rows yet. Global usage list is unchanged. Last refresh ${refreshedAt}.`);
    } else {
      setAdminUsageStatus(`Loaded ${state.usageRows.length} usage rows for ${state.selectedDomain.name}. Last refresh ${refreshedAt}.`);
    }
  } finally {
    endUsageOperation();
  }
}

function applyArchiveModeVisibility() {
  const mode = els.adminArchiveMode.value;
  const isBefore = mode === 'before';
  els.adminArchiveBeforeWrap.classList.toggle('hidden', !isBefore);
  els.adminArchiveFromWrap.classList.toggle('hidden', isBefore);
  els.adminArchiveToWrap.classList.toggle('hidden', isBefore);
}

function populateAdminControls(domain) {
  els.adminDomainSelect.innerHTML = '';
  state.domains.forEach((d) => {
    const opt = document.createElement('option');
    opt.value = d.id;
    opt.textContent = `${d.name} (${d.status})`;
    if (domain && d.id === domain.id) opt.selected = true;
    els.adminDomainSelect.appendChild(opt);
  });
  els.adminDomainStatus.value = domain ? domain.status : 'active';
}

async function loadAdminDomain(domainId) {
  const data = await api(`/domains/${domainId}`);
  state.selectedDomain = data.domain;
  state.domainId = data.domain ? data.domain.id : state.domainId;
  setStoredDomainId(state.domainId);
  updateSelectedDomainIndicator();
  state.selectedMembers = data.members || [];
  populateAdminControls(data.domain);
  renderAdminMembers();
  
  // Load accounts to show sync status
  const accountsData = await api(`/domains/${domainId}/accounts`);
  state.adminAccounts = accountsData.accounts || [];
  renderAccountSyncStatus(state.adminAccounts);
  renderArchiveAccountTable(state.adminAccounts);
  // Keep usage table in global mode; domain/account polling can otherwise
  // replace global rows with an empty domain-scoped list.
  await loadGlobalUsage(false, { background: true }).catch(() => {});
  if (data.domain && data.domain.name) {
    els.adminArchiveDiscoverBtn.textContent = `Scan ${data.domain.name}`;
  }
}

async function openDomain(domain) {
  if (!domain) return;
  state.domainId = domain.id;
  setStoredDomainId(domain.id);
  state.accountId = null;
  state.folderId = null;
  clearList(els.folderList, 'Select an account first.');
  resetMessageView('Select a folder first.');
  els.messageDetail.textContent = 'Select a message to view details.';
  if (state.user && state.user.role === 'admin') {
    await loadAdminDomain(domain.id);
  }
  await loadAccounts(domain.id);
}

async function loadDomains() {
  const data = await api('/domains');
  state.domains = data.domains || [];
  if (state.user && state.user.role === 'admin') {
    populateAdminControls(state.selectedDomain);
  }
  renderButtonList(
    els.domainList,
    state.domains,
    (d) => `${d.name} (${d.status})`,
    async (domain) => {
      await openDomain(domain);
    }
  );
}

let accountRefreshTimer = null;
let usageRefreshTimer = null;

function stopAccountRefreshPolling() {
  if (!accountRefreshTimer) return;
  clearInterval(accountRefreshTimer);
  accountRefreshTimer = null;
}

function stopUsageRefreshPolling() {
  if (!usageRefreshTimer) return;
  clearInterval(usageRefreshTimer);
  usageRefreshTimer = null;
}

function startUsageRefreshPolling() {
  if (usageRefreshTimer) return;
  usageRefreshTimer = setInterval(async () => {
    if (!state.user || state.user.role !== 'admin') {
      stopUsageRefreshPolling();
      return;
    }
    try {
      await loadGlobalUsage(false, { background: true });
    } catch (_) {
      // Keep polling; transient failures should not stop refreshes.
    }
  }, 4000);
}

function startAccountRefreshPolling() {
  if (accountRefreshTimer) return;
  accountRefreshTimer = setInterval(async () => {
    if (syncingAccounts.size === 0) {
      stopAccountRefreshPolling();
      return;
    }

    if (!state.domainId) return;

    try {
      await loadAccounts(state.domainId);
      if (state.user && state.user.role === 'admin' && state.selectedDomain && state.selectedDomain.id === state.domainId) {
        await loadAdminDomain(state.domainId);
      }
    } catch (_) {
      // Keep polling; transient failures should not stop refreshes.
    }
  }, 5000);
}

async function queueReindexAllAccessibleAccounts() {
  if (!state.token || !state.domains.length) return;

  await api('/auth/reset-usage', { method: 'GET' });

  if (state.domainId) {
    try {
      await loadAccounts(state.domainId);
      if (state.user && state.user.role === 'admin' && state.selectedDomain && state.selectedDomain.id === state.domainId) {
        await loadAdminDomain(state.domainId);
      }
    } catch (_) {
      // Keep going; per-account queueing below may still succeed.
    }
  }

  let queued = 0;
  let noArchive = 0;
  let failed = 0;

  for (const domain of state.domains) {
    let accounts = [];
    try {
      const accountsData = await api(`/domains/${domain.id}/accounts`);
      accounts = accountsData.accounts || [];
    } catch (_) {
      failed += 1;
      continue;
    }

    for (const account of accounts) {
      syncingAccounts.add(account.id);
      try {
        const result = await api(`/domains/${domain.id}/accounts/${account.id}/ingest`, {
          method: 'GET',
        });
        if (result.ok) {
          queued += 1;
          startAccountRefreshPolling();
        } else if (result.error === 'No archives found in S3') {
          syncingAccounts.delete(account.id);
          noArchive += 1;
        } else {
          syncingAccounts.delete(account.id);
          failed += 1;
        }
      } catch (_) {
        syncingAccounts.delete(account.id);
        failed += 1;
      }
    }
  }

  setStatus(
    `Info: Login re-index queued for ${queued} accounts (${noArchive} without archive, ${failed} failed).`,
    'info'
  );
}

const syncingAccounts = new Set();
const noArchiveAccounts = new Set();

async function loadAccounts(domainId) {
  const data = await api(`/domains/${domainId}/accounts`);
  const accountList = data.accounts || [];
  
  els.accountList.innerHTML = '';
  if (!accountList.length) {
    clearList(els.accountList, 'No accounts found.');
    return;
  }

  accountList.forEach((account) => {
    const li = document.createElement('li');
    li.style.cssText = 'margin-bottom:4px;display:flex;align-items:center;gap:6px;flex-wrap:nowrap;';
    
    // Main account button
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'account-main-button';
    btn.style.flex = '1 1 auto';
    btn.style.minWidth = '0';
    btn.style.textAlign = 'left';
    btn.style.overflow = 'hidden';
    btn.style.textOverflow = 'ellipsis';
    btn.style.whiteSpace = 'nowrap';
    
    const msgCount = account.message_count || 0;
    const isIndexed = account.sync_status === 'indexed';
    const hasServerIndexing = account.sync_status === 'indexing';
    const isNoArchiveEmpty = noArchiveAccounts.has(account.id);

    // Clear syncing state once the server confirms it is indexed
    if (isIndexed) {
      syncingAccounts.delete(account.id);
      noArchiveAccounts.delete(account.id);
    }
    if (hasServerIndexing) {
      syncingAccounts.add(account.id);
    }
    const isSyncing = hasServerIndexing || syncingAccounts.has(account.id);
    
    const isIndexedWithMessages = isIndexed && msgCount > 0;
    const isIndexedEmpty = (isIndexed && msgCount === 0) || isNoArchiveEmpty;

    let indicator = '';
    let bgColor = '';
    if (isSyncing) {
      indicator = '🟡';
      bgColor = '#fff3cd';
    } else if (isIndexedWithMessages) {
      indicator = '🟢';
      bgColor = '#e6f5e6';
    } else if (isIndexedEmpty) {
      indicator = '🔴';
      bgColor = '#ffe6e6';
    }
    
    const isSelected = state.accountId === account.id;
    const indicatorPrefix = indicator ? `${indicator} ` : '';
    const progressText = (typeof account.sync_progress === 'string' && account.sync_progress.trim())
      ? account.sync_progress.trim()
      : 'Indexing...';
    const label = isSyncing
      ? `${indicatorPrefix}${account.username} – ${progressText}`
      : isIndexedEmpty
        ? `${indicatorPrefix}${account.username} (empty)`
        : msgCount === 0
          ? `${indicatorPrefix}${account.username}`
        : `${indicatorPrefix}${account.username} (${msgCount} msgs)`;

    btn.textContent = label;
    btn.style.backgroundColor = bgColor || '';
    btn.style.padding = '6px 10px';
    btn.style.borderRadius = '4px';
    btn.classList.toggle('selected', isSelected);
    btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    if (isSyncing) {
      btn.title = 'Indexing in progress';
    } else if (isIndexedWithMessages) {
      btn.title = 'Indexed';
    } else if (isIndexed && msgCount === 0) {
      btn.title = 'Indexed (empty)';
    } else {
      btn.title = 'Not indexed';
    }
    
    btn.addEventListener('click', async () => {
      state.accountId = account.id;
      const selectedButtons = els.accountList.querySelectorAll('.account-main-button.selected');
      selectedButtons.forEach((selectedBtn) => {
        selectedBtn.classList.remove('selected');
        selectedBtn.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('selected');
      btn.setAttribute('aria-pressed', 'true');
      state.folderId = null;
      resetMessageView('Select a folder first.');
      els.messageDetail.textContent = 'Select a message to view details.';
      if (!isIndexed && !isSyncing && !isIndexedEmpty) {
        clearList(els.folderList, 'Not indexed.');
        return;
      }
      if (isIndexedEmpty) {
        clearList(els.folderList, 'No items found.');
        return;
      }
      await loadFolders(state.domainId, account.id);
    });
    
    // Sync button: show for not-yet-indexed (not syncing) or admin on any account
    const canSync = (!isIndexed && !isSyncing) || state.user?.role === 'admin';
    if (canSync) {
      const refreshBtn = document.createElement('button');
      refreshBtn.type = 'button';
      refreshBtn.className = 'button ghost';
      refreshBtn.textContent = '↻';
      refreshBtn.style.cssText = 'flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:1.5rem;height:1.5rem;padding:0;font-size:0.8rem;line-height:1;border-radius:999px;min-width:1.5rem;max-width:1.5rem;';
      refreshBtn.title = isIndexed ? 'Re-sync archive' : 'Trigger archive ingest';
      
      refreshBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        // Immediately show yellow / indexing state
        syncingAccounts.add(account.id);
        btn.style.backgroundColor = '#fff3cd';
        btn.textContent = `🟡 ${account.username} – 1/5 queued`;
        btn.title = 'Indexing in progress';
        refreshBtn.remove();
        
        try {
          const result = await api(`/domains/${domainId}/accounts/${account.id}/ingest`, {
            method: 'GET',
          });
          if (result.ok) {
            noArchiveAccounts.delete(account.id);
            setStatus(`Queued ingest for ${account.username}.`);
            startAccountRefreshPolling();
            setTimeout(() => loadAccounts(domainId), 3000);
          } else {
            const msg = result.error || 'Could not queue ingest';
            if (msg === 'No archives found in S3') {
              noArchiveAccounts.add(account.id);
              setStatus(`Info: No archives found in S3 for ${account.username}.`, 'info');
              if (state.accountId === account.id) {
                clearList(els.folderList, 'No items found.');
              }
            } else {
              setStatus(`Error: ${msg}`);
            }
            syncingAccounts.delete(account.id);
            setTimeout(() => loadAccounts(domainId), 0);
          }
        } catch (err) {
          setStatus(`Error: ${err.message}`);
          syncingAccounts.delete(account.id);
          setTimeout(() => loadAccounts(domainId), 0);
        }
      });
      
      li.appendChild(btn);
      li.appendChild(refreshBtn);
    } else {
      li.appendChild(btn);
    }
    
    els.accountList.appendChild(li);
  });
}


async function loadFolders(domainId, accountId) {
  const data = await api(`/domains/${domainId}/accounts/${accountId}/folders`);
  renderButtonList(
    els.folderList,
    data.folders || [],
    (f) => `${f.path} (${f.message_count || 0})`,
    async (folder) => {
      state.folderId = folder.id;
      state.messageOffset = 0;
      state.messageQuery = '';
      state.messageDateFrom = '';
      state.messageDateTo = '';
      els.messageSearch.value = '';
      els.messageDateFrom.value = '';
      els.messageDateTo.value = '';
      await loadMessages(folder.id);
    }
  );
}

async function loadMessages(folderId) {
  const params = new URLSearchParams({
    limit: String(state.messageLimit),
    offset: String(state.messageOffset),
  });
  if (state.messageQuery) {
    params.set('q', state.messageQuery);
  }
  if (state.messageDateFrom) {
    params.set('fromDate', state.messageDateFrom);
  }
  if (state.messageDateTo) {
    params.set('toDate', state.messageDateTo);
  }
  const data = await api(`/messages/folders/${folderId}/messages?${params.toString()}`);
  state.messageTotal = Number(data.total || 0);
  renderButtonList(
    els.messageList,
    data.messages || [],
    (m) => `${formatMessageDate(m.sent_at, m.received_at)} | ${m.subject || '(no subject)'} - ${m.from_email || 'unknown'}`,
    async (message) => {
      await loadMessage(message.id);
    }
  );
  updateMessagePager((data.messages || []).length);
}

function parseJsonList(val) {
  if (!val) return '';
  try {
    const arr = JSON.parse(val);
    return Array.isArray(arr) ? arr.join(', ') : String(arr);
  } catch (_) {
    return String(val);
  }
}

function renderPlainView(m) {
  els.messageDetail.classList.remove('muted');
  els.messageDetail.textContent = [
    `Subject: ${m.subject || ''}`,
    `From: ${m.from_name ? m.from_name + ' <' + m.from_email + '>' : (m.from_email || '')}`,
    `To: ${parseJsonList(m.to_list)}`,
    `CC: ${parseJsonList(m.cc_list)}`,
    `Sent: ${m.sent_at || ''}`,
    '',
    m.body_text || m.preview_text || '(no body available)',
  ].join('\n');
}

function looksLikeHtml(text) {
  if (!text) return false;
  const t = text.trimStart();
  return /^<!doctype\s+html/i.test(t) || /^<html[\s>]/i.test(t) || (/<\/?(body|table|td|div|p|br|span|font|img|a)\b/i.test(t));
}

function normalizeEmailHtml(html) {
  if (!html) return '';
  let out = html;

  // about:srcdoc cannot resolve scheme-relative URLs correctly, force https.
  out = out.replace(/\b(src|href)=(["'])\/\//gi, '$1=$2https://');

  // Some senders block image hotlinking when Referer is present.
  out = out.replace(/<img\b/gi, '<img referrerpolicy="no-referrer" loading="eager"');

  // Keep email content readable inside the panel and prevent horizontal overflow.
  if (/<head[\s>]/i.test(out)) {
    out = out.replace(/<head([^>]*)>/i, '<head$1><style>img{max-width:100%;height:auto;}table{max-width:100%;}body{overflow-wrap:anywhere;}</style>');
  } else {
    out = '<style>img{max-width:100%;height:auto;}table{max-width:100%;}body{overflow-wrap:anywhere;}</style>' + out;
  }

  return out;
}

function renderEmailView(m) {
  const toStr = parseJsonList(m.to_list);
  const ccStr = parseJsonList(m.cc_list);
  const fromStr = m.from_name ? `${m.from_name} \u003c${m.from_email}\u003e` : (m.from_email || '');

  const wrap = els.messageDetailEmail;
  wrap.innerHTML = '';

  // Header block (always plain text — safe DOM construction)
  const header = document.createElement('div');
  header.className = 'email-header';

  const rows = [
    ['Subject', m.subject || '(no subject)'],
    ['From', fromStr],
    ['To', toStr],
    ...(ccStr ? [['CC', ccStr]] : []),
    ['Date', m.sent_at || ''],
  ];

  rows.forEach(([label, value]) => {
    const row = document.createElement('div');
    row.className = 'email-header-row';
    const labelEl = document.createElement('span');
    labelEl.className = 'email-header-label';
    labelEl.textContent = label;
    const valueEl = document.createElement('span');
    valueEl.className = 'email-header-value';
    valueEl.textContent = value;
    row.appendChild(labelEl);
    row.appendChild(valueEl);
    header.appendChild(row);
  });

  const divider = document.createElement('hr');
  divider.className = 'email-divider';

  wrap.appendChild(header);
  wrap.appendChild(divider);

  const htmlBody = (m.body_html || '').trim();
  const bodyText = m.body_text || m.preview_text || '';

  if (htmlBody || looksLikeHtml(bodyText)) {
    // Render HTML in a sandboxed iframe — JS, forms and navigation are all blocked.
    // allow-same-origin lets us read scrollHeight for auto-resize after load.
    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-same-origin');
    iframe.className = 'email-iframe';
    iframe.srcdoc = normalizeEmailHtml(htmlBody || bodyText);
    iframe.addEventListener('load', () => {
      try {
        const h = iframe.contentDocument.documentElement.scrollHeight;
        if (h > 80) iframe.style.height = h + 'px';
      } catch (_) {}
    });
    wrap.appendChild(iframe);
  } else {
    const body = document.createElement('div');
    body.className = 'email-body';
    body.textContent = bodyText || '(no body available)';
    wrap.appendChild(body);
  }
}

function applyViewMode() {
  const isPlain = state.viewMode === 'plain';
  els.messageDetail.classList.toggle('hidden', !isPlain);
  els.messageDetailEmail.classList.toggle('hidden', isPlain);
  els.togglePlain.classList.toggle('active', isPlain);
  els.toggleEmail.classList.toggle('active', !isPlain);
}

async function loadMessage(messageId) {
  const data = await api(`/messages/${messageId}`);
  const m = data.message;
  state.currentMessage = m;
  els.viewToggle.classList.remove('hidden');
  renderPlainView(m);
  renderEmailView(m);
  applyViewMode();
}

async function bootstrapFromToken() {
  if (!state.token) {
    renderAuthState();
    clearList(els.domainList, 'Log in to load domains.');
    clearList(els.accountList, 'Select a domain first.');
    clearList(els.folderList, 'Select an account first.');
    resetMessageView('Select a folder first.');
    return;
  }

  try {
    const me = await api('/auth/me');
    state.user = me.user;
    renderAuthState();
    await loadDomains();
    if (state.domains.length) {
      const preferredDomainId = getStoredDomainId();
      const preferredDomain = state.domains.find((d) => d.id === preferredDomainId) || state.domains[0];
      setTimeout(() => {
        openDomain(preferredDomain).catch(() => {});
      }, 0);
    } else if (!state.domainId) {
      clearList(els.accountList, 'Select a domain first.');
      clearList(els.folderList, 'Select an account first.');
      resetMessageView('Select a folder first.');
    }
  } catch (err) {
    localStorage.removeItem('archivePortalToken');
    state.token = '';
    state.user = null;
    renderAuthState();
    setStatus(err.message);
  }
}

els.loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus('');
  setLoginBusy(true);

  try {
    const payload = {
      email: els.email.value.trim(),
      password: els.password.value,
    };

    const data = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('archivePortalToken', data.token);
    renderAuthState();
    await loadDomains();
    if (state.domains.length) {
      const preferredDomainId = getStoredDomainId();
      const preferredDomain = state.domains.find((d) => d.id === preferredDomainId) || state.domains[0];
      setTimeout(() => {
        openDomain(preferredDomain).catch(() => {});
      }, 0);
    } else if (!state.domainId) {
      clearList(els.accountList, 'Select a domain first.');
      clearList(els.folderList, 'Select an account first.');
      resetMessageView('Select a folder first.');
    }
    els.password.value = '';
    setStatus('Info: Logged in. Re-indexing is running in the background and counts will populate as processing completes.', 'info');
    setTimeout(() => {
      queueReindexAllAccessibleAccounts().catch((err) => {
        setStatus(`Error: ${err.message}`);
      });
    }, 0);
  } catch (err) {
    setStatus(err.message);
  } finally {
    setLoginBusy(false);
  }
});

els.togglePlain.addEventListener('click', () => {
  state.viewMode = 'plain';
  applyViewMode();
});

els.toggleEmail.addEventListener('click', () => {
  state.viewMode = 'email';
  applyViewMode();
});

els.adminDomainSelect.addEventListener('change', async () => {
  if (!state.user || state.user.role !== 'admin') return;
  const domain = state.domains.find((d) => d.id === els.adminDomainSelect.value);
  if (!domain) return;
  state.domainId = domain.id;
  state.accountId = null;
  state.folderId = null;
  clearList(els.accountList, 'Select a domain first.');
  clearList(els.folderList, 'Select an account first.');
  resetMessageView('Select a folder first.');
  await loadAdminDomain(domain.id);
  await loadAccounts(domain.id);
});

els.adminSaveDomainBtn.addEventListener('click', async () => {
  if (!state.selectedDomain) return;
  await api(`/domains/${state.selectedDomain.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: els.adminDomainStatus.value }),
  });
  await loadDomains();
  await loadAdminDomain(state.selectedDomain.id);
});

els.adminSyncAccountsBtn.addEventListener('click', async () => {
  if (!state.selectedDomain) return;
  const button = els.adminSyncAccountsBtn;
  const originalText = button.textContent;

  button.disabled = true;
  button.textContent = 'Refreshing...';

  try {
    const data = await api(`/domains/${state.selectedDomain.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ syncAccounts: true }),
    });
    await loadAccounts(state.selectedDomain.id);
    await loadAdminDomain(state.selectedDomain.id);
    setStatus(`Refreshed ${data.domain}: +${data.inserted} accounts (${data.total} total).`);
  } catch (err) {
    setStatus(err.message);
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
});

if (els.adminSyncAllAccountsBtn) {
  els.adminSyncAllAccountsBtn.addEventListener('click', async () => {
    const button = els.adminSyncAllAccountsBtn;
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = 'Syncing all...';

    try {
      const result = await api('/domains/sync-accounts-all', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      await loadDomains();
      if (state.selectedDomain) {
        await loadAdminDomain(state.selectedDomain.id).catch(() => {});
      }

      const failedCount = Array.isArray(result.failed) ? result.failed.length : 0;
      setStatus(
        `All-domain sync complete: +${result.inserted || 0} accounts across ${result.domainsWithChanges || 0}/${result.processedDomains || 0} domains (${failedCount} failed). Total accounts: ${result.totalAccounts || 0}.`,
        'info'
      );
    } catch (err) {
      setStatus(`All-domain sync failed: ${err.message}`);
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  });
}

els.adminQueueSyncBtn.addEventListener('click', async () => {
  if (!state.selectedDomain) return;
  setStatus('Queuing unindexed accounts for sync... (background job will process nightly)');
});

els.adminArchiveMode.addEventListener('change', () => {
  applyArchiveModeVisibility();
});

els.adminArchiveSelectAll.addEventListener('click', () => {
  state.adminArchiveSelectedIds = new Set(state.adminAccounts.map((a) => String(a.id)));
  renderArchiveAccountTable(state.adminAccounts);
});

els.adminArchiveSelectNone.addEventListener('click', () => {
  state.adminArchiveSelectedIds.clear();
  renderArchiveAccountTable(state.adminAccounts);
});

els.adminArchiveDiscoverBtn.addEventListener('click', async () => {
  if (!state.selectedDomain) return;
  els.adminArchiveDiscoverBtn.disabled = true;
  els.adminArchiveStatus.textContent = 'Scanning S3 for existing archives…';
  try {
    const result = await api(`/domains/${state.selectedDomain.id}/archive/discover`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const results = result.results || [];
    const already = results.filter((r) => r.status === 'skipped').length;
    const notInS3 = results.filter((r) => r.status === 'not_found').length;
    const parts = [];
    if (result.discovered) parts.push(`${result.discovered} new archive${result.discovered !== 1 ? 's' : ''} registered`);
    if (already) parts.push(`${already} already registered`);
    if (notInS3) parts.push(`${notInS3} not in S3`);
    els.adminArchiveStatus.textContent = parts.length ? parts.join(' · ') + '.' : 'Scan complete.';
    await loadAdminDomain(state.selectedDomain.id);
  } catch (err) {
    setStatus(`Discover failed: ${err.message}`);
  }
  els.adminArchiveDiscoverBtn.disabled = false;
});

els.adminArchiveDiscoverAllBtn.addEventListener('click', async () => {
  els.adminArchiveDiscoverAllBtn.disabled = true;
  els.adminArchiveStatus.textContent = 'Scanning S3 for archives across all domains…';
  try {
    const result = await api('/domains/discover-all', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const domainSummary = (result.domains || [])
      .filter((d) => d.discovered > 0)
      .map((d) => `${d.domain}: ${d.discovered}`)
      .join(', ');
    let statusMsg =
      `Discovered ${result.discovered} archive${result.discovered !== 1 ? 's' : ''} across all domains` +
      (domainSummary ? ` (${domainSummary})` : '') + '.';
    const orphans = result.orphans || [];
    if (orphans.length > 0) {
      statusMsg += ` ${orphans.length} orphaned S3 archive${orphans.length !== 1 ? 's' : ''} detected.`;
      state.orphans = orphans;
      els.adminArchivePruneBtn.disabled = false;
      els.adminArchivePruneBtn.textContent = `Prune Orphans (${orphans.length})`;
    } else {
      statusMsg += ' No orphaned archives.';
      state.orphans = [];
      els.adminArchivePruneBtn.disabled = true;
      els.adminArchivePruneBtn.textContent = 'Prune Orphans';
    }
    els.adminArchiveStatus.textContent = statusMsg;
    if (state.selectedDomain) {
      await loadAdminDomain(state.selectedDomain.id);
    }
  } catch (err) {
    setStatus(`Discover all failed: ${err.message}`);
  }
  els.adminArchiveDiscoverAllBtn.disabled = false;
});

els.adminArchiveAllBtn.addEventListener('click', async () => {
  const mode = els.adminArchiveMode.value;
  const payload = { mode, skipExisting: true };
  if (mode === 'before') {
    payload.beforeDate = els.adminArchiveBeforeDate.value;
    if (!payload.beforeDate) { setStatus('Before Date is required.'); return; }
  } else {
    payload.fromDate = els.adminArchiveFromDate.value;
    payload.toDate = els.adminArchiveToDate.value;
    if (!payload.fromDate || !payload.toDate) { setStatus('From Date and To Date are required.'); return; }
  }
  const rangeLabel = mode === 'before' ? `before ${payload.beforeDate}` : `${payload.fromDate} to ${payload.toDate}`;
  const msg = `Archive ALL accounts across ALL domains for range: ${rangeLabel}\n\nAccounts that already have a completed archive will be skipped.\nUse Reset Selected first if you need to re-archive specific accounts.\n\nProceed?`;
  if (!confirm(msg)) return;
  els.adminArchiveAllBtn.disabled = true;
  els.adminArchiveStatus.textContent = 'Queueing archive jobs across all domains…';
  try {
    const result = await api('/domains/archive-all', { method: 'POST', body: JSON.stringify(payload) });
    els.adminArchiveStatus.textContent =
      `Archive all queued: ${result.queued} accounts (${result.label}). ${result.skipped} skipped. Running — checking progress…`;
    if (state.archiveAllPoll) clearInterval(state.archiveAllPoll);
    state.archiveAllPoll = setInterval(async () => {
      try {
        const prog = await api('/domains/archive-all/progress');
        const c = prog.counts || {};
        const running = c.running || 0;
        const completed = (c.completed || 0) + (c.completed_no_files || 0);
        const failed = c.failed || 0;
        els.adminArchiveStatus.textContent =
          `Archive all: ${running} running · ${completed} completed · ${failed} failed`;
        if (running === 0) {
          clearInterval(state.archiveAllPoll);
          state.archiveAllPoll = null;
          els.adminArchiveAllBtn.disabled = false;
          els.adminArchiveStatus.textContent =
            `Archive all complete: ${completed} completed · ${failed} failed. Reload a domain to review.`;
        }
      } catch (_) {}
    }, 5000);
  } catch (err) {
    setStatus(`Archive all failed: ${err.message}`);
    els.adminArchiveAllBtn.disabled = false;
  }
});

els.adminArchivePruneBtn.addEventListener('click', async () => {
  const orphans = state.orphans || [];
  if (!orphans.length) return;
  const list = orphans
    .map((o) => `• ${o.domain}/${o.username} [${o.timestamp}] (${(o.bytes / 1024 / 1024).toFixed(1)} MB)`)
    .join('\n');
  const msg =
    `${orphans.length} orphaned S3 archive${orphans.length !== 1 ? 's' : ''} will be permanently deleted from S3:\n\n${list}\n\nThis cannot be undone. Proceed?`;
  if (!confirm(msg)) return;
  els.adminArchivePruneBtn.disabled = true;
  els.adminArchiveStatus.textContent = 'Pruning orphaned archives from S3…';
  try {
    const result = await api('/domains/prune-orphans?confirm=true', { method: 'POST', body: JSON.stringify({}) });
    els.adminArchiveStatus.textContent =
      `Pruned ${result.pruned} orphaned archive${result.pruned !== 1 ? 's' : ''} from S3.` +
      (result.errors && result.errors.length ? ` ${result.errors.length} error(s).` : '');
    state.orphans = [];
    els.adminArchivePruneBtn.textContent = 'Prune Orphans';
  } catch (err) {
    setStatus(`Prune failed: ${err.message}`);
    els.adminArchivePruneBtn.disabled = false;
  }
});

els.adminArchiveResetBtn.addEventListener('click', async () => {
  if (!state.selectedDomain) return;
  const selected = Array.from(state.adminArchiveSelectedIds);
  const withRecords = selected.filter((id) => {
    const a = state.adminAccounts.find((acc) => String(acc.id) === id);
    return a && a.archive_state;
  });
  if (!withRecords.length) {
    setStatus('None of the selected accounts have an archive record to reset.');
    return;
  }
  const hasDeleted = withRecords.some((id) => {
    const a = state.adminAccounts.find((acc) => String(acc.id) === id);
    return a && a.archive_state && a.archive_state.deletion_status === 'deleted';
  });
  const names = withRecords.map((id) => {
    const a = state.adminAccounts.find((acc) => String(acc.id) === id);
    return a ? a.username : id;
  });
  let msg = `Reset archive records for ${withRecords.length} account${withRecords.length !== 1 ? 's' : ''}:\n${names.join(', ')}\n\nThis removes their records from the database only. S3 files are NOT deleted.`;
  if (hasDeleted) {
    msg += '\n\n\u26a0 Warning: some of these accounts have already had messages deleted.';
  }
  if (!confirm(msg)) return;
  els.adminArchiveResetBtn.disabled = true;
  let resetCount = 0;
  for (const accountId of withRecords) {
    const a = state.adminAccounts.find((acc) => String(acc.id) === accountId);
    try {
      await api(`/domains/${state.selectedDomain.id}/accounts/${accountId}/archive-state`, { method: 'DELETE' });
      resetCount++;
    } catch (err) {
      setStatus(`Error resetting ${a ? a.username : accountId}: ${err.message}`);
    }
  }
  setStatus(`Reset ${resetCount} archive record${resetCount !== 1 ? 's' : ''}.`, 'info');
  await loadAdminDomain(state.selectedDomain.id);
  els.adminArchiveResetBtn.disabled = false;
});

els.adminArchiveStartBtn.addEventListener('click', async () => {
  if (!state.selectedDomain) return;
  const selected = Array.from(state.adminArchiveSelectedIds);
  if (!selected.length) {
    setStatus('Select at least one account to archive.');
    return;
  }

  const mode = els.adminArchiveMode.value;
  const payload = { mode };
  if (mode === 'before') {
    payload.beforeDate = els.adminArchiveBeforeDate.value;
    if (!payload.beforeDate) {
      setStatus('Before Date is required.');
      return;
    }
  } else {
    payload.fromDate = els.adminArchiveFromDate.value;
    payload.toDate = els.adminArchiveToDate.value;
    if (!payload.fromDate || !payload.toDate) {
      setStatus('From Date and To Date are required for range mode.');
      return;
    }
  }

  // Conflict check: warn if any selected accounts already have archive records
  const withExisting = selected.filter((id) => {
    const a = state.adminAccounts.find((acc) => String(acc.id) === id);
    return a && a.archive_state;
  });
  if (withExisting.length) {
    const alreadyDeleted = withExisting.filter((id) => {
      const a = state.adminAccounts.find((acc) => String(acc.id) === id);
      return a.archive_state.deletion_status === 'deleted';
    });
    const lines = withExisting.map((id) => {
      const a = state.adminAccounts.find((acc) => String(acc.id) === id);
      const del = a.archive_state.deletion_status === 'deleted' ? ' \u26a0 messages already deleted' : '';
      return `\u2022 ${a.username} (${a.archive_state.range_label || 'unknown range'})${del}`;
    }).join('\n');
    let msg = `${withExisting.length} account${withExisting.length !== 1 ? 's' : ''} already have an archive record:\n${lines}\n\nProceeding will replace their records with the new date range. Old S3 files are NOT deleted.`;
    if (alreadyDeleted.length) {
      msg += `\n\n\u26a0 Warning: ${alreadyDeleted.length} account${alreadyDeleted.length !== 1 ? 's' : ''} have already had messages deleted \u2014 those messages cannot be re-archived.`;
    }
    msg += '\n\nContinue?';
    if (!confirm(msg)) return;
  }

  els.adminArchiveStartBtn.disabled = true;
  let succeeded = 0;
  let failed = 0;

  for (const accountId of selected) {
    const account = state.adminAccounts.find((a) => String(a.id) === accountId);
    const username = account ? account.username : accountId;
    els.adminArchiveStatus.textContent = `Archiving ${username}\u2026 (${succeeded + failed + 1}/${selected.length})`;

    try {
      await api(`/domains/${state.selectedDomain.id}/accounts/${accountId}/archive/create`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      // Poll until job finishes.
      let guard = 0;
      while (guard < 80) {
        guard += 1;
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const sd = await api(`/domains/${state.selectedDomain.id}/accounts/${accountId}/archive-state`);
        if (!sd.archive || sd.archive.status !== 'running') break;
      }
      succeeded += 1;
    } catch (err) {
      setStatus(`Error archiving ${username}: ${err.message}`);
      failed += 1;
    }
  }

  els.adminArchiveStatus.textContent = `Archive complete: ${succeeded} succeeded, ${failed} failed.`;
  await loadAdminDomain(state.selectedDomain.id);
  els.adminArchiveStartBtn.disabled = false;
});

els.adminArchiveVerifyBtn.addEventListener('click', async () => {
  if (!state.selectedDomain) return;
  const selected = Array.from(state.adminArchiveSelectedIds);
  if (!selected.length) {
    setStatus('Select at least one account to verify.');
    return;
  }

  let verified = 0;
  let skipped = 0;
  let errors = 0;
  for (const accountId of selected) {
    const account = state.adminAccounts.find((a) => String(a.id) === accountId);
    const username = account ? account.username : accountId;
    if (!account || !account.archive_state) {
      skipped += 1;
      continue;
    }
    try {
      await api(`/domains/${state.selectedDomain.id}/accounts/${accountId}/archive/verify`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      verified += 1;
    } catch (err) {
      setStatus(`Error verifying ${username}: ${err.message}`);
      errors += 1;
    }
  }

  const parts = [];
  if (verified) parts.push(`${verified} verified`);
  if (skipped) parts.push(`${skipped} skipped (no archive)`);
  if (errors) parts.push(`${errors} error${errors !== 1 ? 's' : ''}`);
  setStatus(`Verification complete: ${parts.join(' · ')}.`, 'info');
  await loadAdminDomain(state.selectedDomain.id);
});

els.adminDeleteMessagesBtn.addEventListener('click', async () => {
  if (!state.selectedDomain) return;
  const selected = Array.from(state.adminArchiveSelectedIds);
  if (!selected.length) {
    setStatus('Select at least one account.');
    return;
  }

  const verifiedSelected = selected.filter((accountId) => {
    const a = state.adminAccounts.find((acc) => String(acc.id) === accountId);
    return a && a.archive_state && a.archive_state.verified;
  });

  if (!verifiedSelected.length) {
    setStatus('None of the selected accounts have a verified archive. Run Verify Archive first.');
    return;
  }

  const names = verifiedSelected.map((id) => {
    const a = state.adminAccounts.find((acc) => String(acc.id) === id);
    return a ? a.username : id;
  }).join(', ');
  const ok = window.confirm(`Delete server-side messages for:\n${names}\n\nThis cannot be undone.`);
  if (!ok) return;

  els.adminDeleteMessagesBtn.disabled = true;
  let totalDeleted = 0;
  let failed = 0;

  for (const accountId of verifiedSelected) {
    const account = state.adminAccounts.find((a) => String(a.id) === accountId);
    const username = account ? account.username : accountId;
    try {
      const data = await api(`/domains/${state.selectedDomain.id}/accounts/${accountId}/archive/delete-messages`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      totalDeleted += data.deleted_count || 0;
    } catch (err) {
      setStatus(`Error deleting messages for ${username}: ${err.message}`);
      failed += 1;
    }
  }

  setStatus(`Deleted ${totalDeleted} server-side messages across ${verifiedSelected.length - failed} account(s).`, 'info');
  await loadAdminDomain(state.selectedDomain.id);
  await loadAccounts(state.selectedDomain.id);
  els.adminDeleteMessagesBtn.disabled = false;
});

els.adminAddMemberBtn.addEventListener('click', async () => {
  if (!state.selectedDomain) return;
  const email = els.adminMemberEmail.value.trim();
  const permission = els.adminMemberPermission.value;
  if (!email) return;
  await api(`/domains/${state.selectedDomain.id}/members`, {
    method: 'POST',
    body: JSON.stringify({ email, permission }),
  });
  els.adminMemberEmail.value = '';
  await loadAdminDomain(state.selectedDomain.id);
});

els.messageSearchBtn.addEventListener('click', async () => {
  if (!state.folderId) return;
  state.messageQuery = els.messageSearch.value.trim();
  state.messageDateFrom = els.messageDateFrom.value;
  state.messageDateTo = els.messageDateTo.value;
  setStoredDate(UI_PREF_KEYS.messageDateFrom, state.messageDateFrom);
  setStoredDate(UI_PREF_KEYS.messageDateTo, state.messageDateTo);
  state.messageOffset = 0;
  await loadMessages(state.folderId);
});

els.messageSearch.addEventListener('keydown', async (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  if (!state.folderId) return;
  state.messageQuery = els.messageSearch.value.trim();
  state.messageDateFrom = els.messageDateFrom.value;
  state.messageDateTo = els.messageDateTo.value;
  setStoredDate(UI_PREF_KEYS.messageDateFrom, state.messageDateFrom);
  setStoredDate(UI_PREF_KEYS.messageDateTo, state.messageDateTo);
  state.messageOffset = 0;
  await loadMessages(state.folderId);
});

els.messageResetBtn.addEventListener('click', async () => {
  if (!state.folderId) return;
  state.messageQuery = '';
  state.messageDateFrom = '';
  state.messageDateTo = '';
  state.messageOffset = 0;
  els.messageSearch.value = '';
  els.messageDateFrom.value = '';
  els.messageDateTo.value = '';
  setStoredDate(UI_PREF_KEYS.messageDateFrom, '');
  setStoredDate(UI_PREF_KEYS.messageDateTo, '');
  await loadMessages(state.folderId);
});

els.messagePrevBtn.addEventListener('click', async () => {
  if (!state.folderId) return;
  if (state.messageOffset <= 0) return;
  state.messageOffset = Math.max(0, state.messageOffset - state.messageLimit);
  await loadMessages(state.folderId);
});

els.messageNextBtn.addEventListener('click', async () => {
  if (!state.folderId) return;
  const nextOffset = state.messageOffset + state.messageLimit;
  if (nextOffset >= state.messageTotal) return;
  state.messageOffset = nextOffset;
  await loadMessages(state.folderId);
});

els.logoutBtn.addEventListener('click', async () => {
  try {
    if (state.token) {
      await api('/auth/logout', { method: 'POST' });
    }
  } catch (_) {
    // Continue with local logout even if server-side cleanup fails.
  }

  localStorage.removeItem('archivePortalToken');
  state.token = '';
  state.user = null;
  state.domainId = null;
  state.accountId = null;
  state.folderId = null;
  state.currentMessage = null;
  state.messageOffset = 0;
  state.messageTotal = 0;
  state.messageQuery = '';
  state.messageDateFrom = '';
  state.messageDateTo = '';
  state.domains = [];
  state.selectedDomain = null;
  state.selectedMembers = [];
  state.adminAccounts = [];
  state.adminArchiveSelectedIds = new Set();
  state.usageRows = [];
  state.usageDomainRollups = [];
  state.usageScanStatus = null;
  state.usageBeforeDate = defaultUsageBeforeDate();
  state.usageOpsInFlight = 0;
  state.usageBusyLabel = '';
  state.usageRowRefreshInFlight = new Set();
  state.activeTab = 'viewer';
  state.viewMode = 'plain';
  updateSelectedDomainIndicator();
  stopAccountRefreshPolling();
  stopUsageRefreshPolling();
  syncingAccounts.clear();
  noArchiveAccounts.clear();
  setStatus('');
  renderAuthState();
  clearList(els.domainList, 'Log in to load domains.');
  clearList(els.accountList, 'Select a domain first.');
  clearList(els.folderList, 'Select an account first.');
  resetMessageView('Select a folder first.');
  els.messageDetail.textContent = 'Select a message to view details.';
  els.messageDetail.classList.remove('hidden');
  els.messageDetailEmail.innerHTML = '';
  els.messageDetailEmail.classList.add('hidden');
  els.viewToggle.classList.add('hidden');
  if (els.adminUsageBeforeDate) {
    els.adminUsageBeforeDate.value = state.usageBeforeDate;
  }
  if (els.adminUsageTable) {
    els.adminUsageTable.innerHTML = '';
  }
  setAdminUsageStatus('No usage data loaded yet.');
});

els.tabEmailViewer.addEventListener('click', () => {
  state.activeTab = 'viewer';
  renderAuthState();
});

els.tabAdminPanel.addEventListener('click', async () => {
  state.activeTab = 'admin';
  renderAuthState();
  // Ensure accounts are loaded if switching to admin tab before openDomain completed.
  if (!state.adminAccounts.length && state.domains.length) {
    const domainId = state.selectedDomain ? state.selectedDomain.id : state.domains[0].id;
    await loadAdminDomain(domainId).catch(() => {});
  }
  await loadGlobalUsage(false).catch(() => {});
});

if (els.adminUsageBeforeDate) {
  els.adminUsageBeforeDate.value = state.usageBeforeDate;
}

hydrateDateInputsFromPreferences();
updateUsageBusyUi();
setupEnhancedDatePickers();
updateSelectedDomainIndicator();

if (els.adminUsageRefreshBtn) {
  els.adminUsageRefreshBtn.addEventListener('click', async () => {
    try {
      await loadGlobalUsage(false);
    } catch (err) {
      setStatus(`Usage refresh failed: ${err.message}`);
    }
  });
}

if (els.adminUsageScanDomainBtn) {
  els.adminUsageScanDomainBtn.addEventListener('click', async () => {
    if (!state.selectedDomain) {
      setStatus('Select a domain first.');
      return;
    }
    try {
      const cutoff = (els.adminUsageBeforeDate && els.adminUsageBeforeDate.value) || state.usageBeforeDate;
      const domainAccountIds = state.usageRows
        .filter((row) => String(row.domain_id) === String(state.selectedDomain.id))
        .map((row) => row.account_id);
      beginBulkScanTracking(domainAccountIds, cutoff);
      renderUsageTable(state.usageRows);
      await loadDomainUsage(true);
      await loadGlobalUsage(false).catch(() => {});
    } catch (err) {
      setStatus(`Domain usage scan failed: ${err.message}`);
    }
  });
}

if (els.adminUsageScanAllBtn) {
  els.adminUsageScanAllBtn.addEventListener('click', async () => {
    try {
      const cutoff = (els.adminUsageBeforeDate && els.adminUsageBeforeDate.value) || state.usageBeforeDate;
      const allAccountIds = state.usageRows.map((row) => row.account_id);
      beginBulkScanTracking(allAccountIds, cutoff);
      renderUsageTable(state.usageRows);
      await loadGlobalUsage(true);
    } catch (err) {
      setStatus(`Global usage scan failed: ${err.message}`);
    }
  });
}

if (els.adminUsageBeforeDate) {
  els.adminUsageBeforeDate.addEventListener('change', () => {
    const v = els.adminUsageBeforeDate.value;
    if (v) {
      state.usageBeforeDate = v;
      setStoredDate(UI_PREF_KEYS.usageBeforeDate, v);
      setAdminUsageStatus(`Cutoff changed to ${v}. Run Scan Selected Domain or Scan All Domains to recalculate reclaim values.`);
      renderUsageTable(state.usageRows);
    }
  });
}

if (els.adminArchiveBeforeDate) {
  els.adminArchiveBeforeDate.addEventListener('change', () => {
    setStoredDate(UI_PREF_KEYS.archiveBeforeDate, els.adminArchiveBeforeDate.value);
  });
}

if (els.adminArchiveFromDate) {
  els.adminArchiveFromDate.addEventListener('change', () => {
    setStoredDate(UI_PREF_KEYS.archiveFromDate, els.adminArchiveFromDate.value);
  });
}

if (els.adminArchiveToDate) {
  els.adminArchiveToDate.addEventListener('change', () => {
    setStoredDate(UI_PREF_KEYS.archiveToDate, els.adminArchiveToDate.value);
  });
}

if (els.messageDateFrom) {
  els.messageDateFrom.addEventListener('change', () => {
    state.messageDateFrom = els.messageDateFrom.value;
    setStoredDate(UI_PREF_KEYS.messageDateFrom, state.messageDateFrom);
  });
}

if (els.messageDateTo) {
  els.messageDateTo.addEventListener('change', () => {
    state.messageDateTo = els.messageDateTo.value;
    setStoredDate(UI_PREF_KEYS.messageDateTo, state.messageDateTo);
  });
}

bootstrapFromToken();
applyArchiveModeVisibility();
