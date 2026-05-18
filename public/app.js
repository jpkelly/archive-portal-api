const state = {
  token: localStorage.getItem('archivePortalToken') || '',
  user: null,
  domainId: null,
  accountId: null,
  folderId: null,
};

const els = {
  loginCard: document.getElementById('loginCard'),
  loginForm: document.getElementById('loginForm'),
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
  messageDetail: document.getElementById('messageDetail'),
};

function setStatus(message) {
  els.status.textContent = message || '';
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
  els.currentUser.textContent = state.user ? `${state.user.email} (${state.user.role})` : '';
}

async function loadDomains() {
  const data = await api('/domains');
  renderButtonList(
    els.domainList,
    data.domains || [],
    (d) => `${d.name} (${d.status})`,
    async (domain) => {
      state.domainId = domain.id;
      state.accountId = null;
      state.folderId = null;
      clearList(els.folderList, 'Select an account first.');
      clearList(els.messageList, 'Select a folder first.');
      els.messageDetail.textContent = 'Select a message to view details.';
      await loadAccounts(domain.id);
    }
  );
}

async function loadAccounts(domainId) {
  const data = await api(`/domains/${domainId}/accounts`);
  renderButtonList(
    els.accountList,
    data.accounts || [],
    (a) => `${a.username} (${a.message_count || 0} msgs)`,
    async (account) => {
      state.accountId = account.id;
      state.folderId = null;
      clearList(els.messageList, 'Select a folder first.');
      els.messageDetail.textContent = 'Select a message to view details.';
      await loadFolders(state.domainId, account.id);
    }
  );
}

async function loadFolders(domainId, accountId) {
  const data = await api(`/domains/${domainId}/accounts/${accountId}/folders`);
  renderButtonList(
    els.folderList,
    data.folders || [],
    (f) => `${f.path} (${f.message_count || 0})`,
    async (folder) => {
      state.folderId = folder.id;
      await loadMessages(folder.id);
    }
  );
}

async function loadMessages(folderId) {
  const data = await api(`/messages/folders/${folderId}/messages?limit=50&offset=0`);
  renderButtonList(
    els.messageList,
    data.messages || [],
    (m) => `${m.subject || '(no subject)'} - ${m.from_email || 'unknown'}`,
    async (message) => {
      await loadMessage(message.id);
    }
  );
}

async function loadMessage(messageId) {
  const data = await api(`/messages/${messageId}`);
  const m = data.message;
  els.messageDetail.textContent = [
    `Subject: ${m.subject || ''}`,
    `From: ${m.from_name || ''} <${m.from_email || ''}>`,
    `To: ${m.to_list || ''}`,
    `CC: ${m.cc_list || ''}`,
    `Sent: ${m.sent_at || ''}`,
    '',
    m.body_text || m.preview_text || '(no body available)',
  ].join('\n');
}

async function bootstrapFromToken() {
  if (!state.token) {
    renderAuthState();
    clearList(els.domainList, 'Log in to load domains.');
    clearList(els.accountList, 'Select a domain first.');
    clearList(els.folderList, 'Select an account first.');
    clearList(els.messageList, 'Select a folder first.');
    return;
  }

  try {
    const me = await api('/auth/me');
    state.user = me.user;
    renderAuthState();
    await loadDomains();
    clearList(els.accountList, 'Select a domain first.');
    clearList(els.folderList, 'Select an account first.');
    clearList(els.messageList, 'Select a folder first.');
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
    clearList(els.accountList, 'Select a domain first.');
    clearList(els.folderList, 'Select an account first.');
    clearList(els.messageList, 'Select a folder first.');
    els.password.value = '';
  } catch (err) {
    setStatus(err.message);
  }
});

els.logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('archivePortalToken');
  state.token = '';
  state.user = null;
  state.domainId = null;
  state.accountId = null;
  state.folderId = null;
  renderAuthState();
  clearList(els.domainList, 'Log in to load domains.');
  clearList(els.accountList, 'Select a domain first.');
  clearList(els.folderList, 'Select an account first.');
  clearList(els.messageList, 'Select a folder first.');
  els.messageDetail.textContent = 'Select a message to view details.';
});

bootstrapFromToken();
