const state = {
  token: localStorage.getItem('archivePortalToken') || '',
  user: null,
  domainId: null,
  accountId: null,
  folderId: null,
  currentMessage: null,
  viewMode: 'plain',
  messageLimit: 100,
  messageOffset: 0,
  messageTotal: 0,
  messageQuery: '',
  messageDateFrom: '',
  messageDateTo: '',
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
};

function defaultUsageBeforeDate() {
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

function setAdminUsageStatus(text) {
  if (!els.adminUsageStatus) return;
  els.adminUsageStatus.textContent = text || 'No usage data loaded yet.';
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

  const res = await fetch(path, { ...options, headers });
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

function applyUsageSuggestion(row) {
  if (!row) return;
  const domain = state.domains.find((d) => d.id === row.domain_id);
  if (domain) {
    state.domainId = domain.id;
    els.adminDomainSelect.value = domain.id;
  }

  state.adminArchiveSelectedIds = new Set([String(row.account_id)]);
  els.adminArchiveMode.value = 'before';
  els.adminArchiveBeforeDate.value = state.usageBeforeDate;
  applyArchiveModeVisibility();

  const openTarget = domain || state.selectedDomain;
  if (openTarget) {
    openDomain(openTarget).catch(() => {});
  }
  setStatus(`Prepared archive selection for ${row.username} (${row.domain_name}).`, 'info');
}

function renderUsageTable(rows) {
  if (!els.adminUsageTable) return;
  const list = rows || [];
  els.adminUsageTable.innerHTML = '';

  if (!list.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'No usage rows available yet. Run a scan first.';
    els.adminUsageTable.appendChild(empty);
    return;
  }

  const topRows = list.slice(0, 200);
  topRows.forEach((row, index) => {
    const item = document.createElement('div');
    item.className = 'usage-row';

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
    meta.textContent = `Files: ${Number(row.total_files || 0).toLocaleString()} · Scanned: ${scanned}`;
    identity.appendChild(title);
    identity.appendChild(meta);

    const totals = document.createElement('div');
    totals.className = 'usage-totals';
    totals.innerHTML = `
      <span title=">3 years">${formatBytes(row.bucket_gt3y_bytes)} old</span>
      <span title="1-3 years">${formatBytes(row.bucket_1y_to_3y_bytes)} mid</span>
      <span title="<1 year">${formatBytes(row.bucket_lt1y_bytes)} new</span>
      <strong>${formatBytes(row.total_bytes)}</strong>
      <em>Reclaim: ${formatBytes(row.reclaimable_bytes)}</em>
    `;

    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'button ghost';
    action.textContent = 'Use For Archive';
    action.addEventListener('click', () => applyUsageSuggestion(row));

    item.appendChild(rank);
    item.appendChild(identity);
    item.appendChild(totals);
    item.appendChild(action);
    els.adminUsageTable.appendChild(item);
  });
}

async function loadGlobalUsage(scan = false) {
  if (!state.user || state.user.role !== 'admin') return;
  if (!els.adminUsageBeforeDate) return;
  const beforeDate = els.adminUsageBeforeDate.value || state.usageBeforeDate;
  state.usageBeforeDate = beforeDate;

  const params = new URLSearchParams({ beforeDate });
  if (scan) params.set('scan', 'true');
  const data = await api(`/domains/usage?${params.toString()}`);
  state.usageRows = data.usage || [];
  state.usageDomainRollups = data.domains || [];
  state.usageScanStatus = data.scans || null;
  renderUsageTable(state.usageRows);

  const activeDomainScan = state.selectedDomain && state.usageScanStatus
    ? state.usageScanStatus[state.selectedDomain.id]
    : null;
  if (scan) {
    setAdminUsageStatus(`Usage scan queued for cutoff ${beforeDate}. Refresh in a few seconds.`);
  } else if (activeDomainScan && activeDomainScan.status === 'running') {
    setAdminUsageStatus(`Domain scan running: ${activeDomainScan.message || 'in progress'}`);
  } else {
    setAdminUsageStatus(`Loaded ${state.usageRows.length} account usage rows (cutoff ${beforeDate}).`);
  }
}

async function loadDomainUsage(scan = false) {
  if (!state.selectedDomain) return;
  if (!els.adminUsageBeforeDate) return;
  const beforeDate = els.adminUsageBeforeDate.value || state.usageBeforeDate;
  state.usageBeforeDate = beforeDate;

  const params = new URLSearchParams({ beforeDate });
  if (scan) params.set('scan', 'true');
  const data = await api(`/domains/${state.selectedDomain.id}/usage?${params.toString()}`);

  if (Array.isArray(data.usage) && data.usage.length) {
    state.usageRows = data.usage.map((row) => ({
      ...row,
      domain_id: state.selectedDomain.id,
      domain_name: state.selectedDomain.name,
    }));
    renderUsageTable(state.usageRows);
  }

  if (scan) {
    setAdminUsageStatus(data.progress && data.progress.message
      ? data.progress.message
      : `Usage scan queued for ${state.selectedDomain.name}.`);
  } else if (data.progress && data.progress.status === 'running') {
    setAdminUsageStatus(`Running: ${data.progress.message || 'usage scan in progress'}`);
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
  state.selectedMembers = data.members || [];
  populateAdminControls(data.domain);
  renderAdminMembers();
  
  // Load accounts to show sync status
  const accountsData = await api(`/domains/${domainId}/accounts`);
  state.adminAccounts = accountsData.accounts || [];
  renderAccountSyncStatus(state.adminAccounts);
  renderArchiveAccountTable(state.adminAccounts);
  await loadDomainUsage(false).catch(() => {});
  if (data.domain && data.domain.name) {
    els.adminArchiveDiscoverBtn.textContent = `Scan ${data.domain.name}`;
  }
}

async function openDomain(domain) {
  if (!domain) return;
  state.domainId = domain.id;
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

function stopAccountRefreshPolling() {
  if (!accountRefreshTimer) return;
  clearInterval(accountRefreshTimer);
  accountRefreshTimer = null;
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
      setTimeout(() => {
        openDomain(state.domains[0]).catch(() => {});
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
      setTimeout(() => {
        openDomain(state.domains[0]).catch(() => {});
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
  state.activeTab = 'viewer';
  state.viewMode = 'plain';
  stopAccountRefreshPolling();
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

if (els.adminUsageRefreshBtn) {
  els.adminUsageRefreshBtn.addEventListener('click', async () => {
    await loadGlobalUsage(false);
  });
}

if (els.adminUsageScanDomainBtn) {
  els.adminUsageScanDomainBtn.addEventListener('click', async () => {
    if (!state.selectedDomain) {
      setStatus('Select a domain first.');
      return;
    }
    await loadDomainUsage(true);
    await loadGlobalUsage(false).catch(() => {});
  });
}

if (els.adminUsageScanAllBtn) {
  els.adminUsageScanAllBtn.addEventListener('click', async () => {
    await loadGlobalUsage(true);
  });
}

if (els.adminUsageBeforeDate) {
  els.adminUsageBeforeDate.addEventListener('change', () => {
    const v = els.adminUsageBeforeDate.value;
    if (v) state.usageBeforeDate = v;
  });
}

bootstrapFromToken();
applyArchiveModeVisibility();
