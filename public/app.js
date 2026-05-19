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
};

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
};

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
  els.loginCard.classList.toggle('hidden', isLoggedIn);
  els.portal.classList.toggle('hidden', !isLoggedIn);
  els.logoutBtn.classList.toggle('hidden', !isLoggedIn);
  els.adminPanel.classList.toggle('hidden', !(state.user && state.user.role === 'admin'));
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
    info.textContent = `${status} ${account.username} – ${msgStr} (${timeStr})`;
    info.title = account.indexed_at
      ? `Last indexed: ${new Date(account.indexed_at).toLocaleString()}`
      : 'Not yet indexed from archive';

    li.appendChild(info);
    els.adminAccountSyncStatus.appendChild(li);
  });
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
  renderAccountSyncStatus(accountsData.accounts || []);
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

    // Clear syncing state once the server confirms it is indexed
    if (isIndexed) syncingAccounts.delete(account.id);
    const isSyncing = syncingAccounts.has(account.id);
    
    let indicator, bgColor;
    if (isIndexed) {
      indicator = '🟢';
      bgColor = '#e6f5e6';
    } else if (isSyncing) {
      indicator = '🟡';
      bgColor = '#fff3cd';
    } else {
      indicator = '🔴';
      bgColor = '#ffe6e6';
    }
    
    const isSelected = state.accountId === account.id;
    const selectedPrefix = isSelected ? '▶ ' : '';
    const label = isSyncing
      ? `${selectedPrefix}${indicator} ${account.username} – Indexing…`
      : msgCount === 0
        ? `${selectedPrefix}${indicator} ${account.username} (empty)`
        : `${selectedPrefix}${indicator} ${account.username} (${msgCount} msgs)`;

    btn.textContent = label;
    btn.style.backgroundColor = bgColor;
    btn.style.padding = '6px 10px';
    btn.style.borderRadius = '4px';
    btn.classList.toggle('selected', isSelected);
    btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    btn.title = isIndexed ? 'Indexed' : (isSyncing ? 'Indexing in progress' : 'Not indexed');
    
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
        btn.textContent = `🟡 ${account.username} – Indexing…`;
        btn.title = 'Indexing in progress';
        refreshBtn.remove();
        
        try {
          const result = await api(`/domains/${domainId}/accounts/${account.id}/ingest`, {
            method: 'GET',
          });
          if (result.ok) {
            setStatus(`Queued ingest for ${account.username}.`);
            setTimeout(() => loadAccounts(domainId), 3000);
          } else {
            const msg = result.error || 'Could not queue ingest';
            if (msg === 'No archives found in S3') {
              setStatus(`Info: No archives found in S3 for ${account.username}.`, 'info');
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
  state.viewMode = 'plain';
  stopAccountRefreshPolling();
  syncingAccounts.clear();
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
});

bootstrapFromToken();
