/* ============================================================
   Deskline — IT Ticket Desk
   All data lives in localStorage under the key "deskline_tickets"
   ============================================================ */

const STORAGE_KEY = 'deskline_tickets';
const COUNTER_KEY = 'deskline_ticket_counter';
const USERS_KEY = 'deskline_users';
const USER_COUNTER_KEY = 'deskline_user_counter';
const SESSION_KEY = 'deskline_session';

const STATUSES = ['Open', 'In Progress', 'Resolved', 'Closed'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
const PRIORITY_WEIGHT = { Critical: 3, High: 2, Medium: 1, Low: 0 };
const ROLES = ['Agent', 'Admin'];

/* ---------- State ---------- */

let tickets = loadTickets();
let users = loadUsers();
let session = loadSession();
let activeDrawerId = null;
let filters = { status: 'all', priority: 'all', search: '', sort: 'newest' };

/* ---------- Persistence: users & session ---------- */

function loadUsers(){
  try{
    const raw = localStorage.getItem(USERS_KEY);
    if (raw) return JSON.parse(raw);
    // Seed a default admin so there's always a way in.
    const seeded = [{
      id: nextUserId(),
      name: 'Alex Rivera',
      email: 'admin@deskline.io',
      username: 'admin',
      password: 'admin123',
      role: 'Admin',
      createdAt: new Date().toISOString()
    }];
    localStorage.setItem(USERS_KEY, JSON.stringify(seeded));
    return seeded;
  }catch(e){
    console.error('Failed to load users', e);
    return [];
  }
}

function saveUsers(){
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function nextUserId(){
  let n = parseInt(localStorage.getItem(USER_COUNTER_KEY) || '0', 10) + 1;
  localStorage.setItem(USER_COUNTER_KEY, String(n));
  return 'usr-' + String(n).padStart(4, '0');
}

function loadSession(){
  try{
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  }catch(e){
    return null;
  }
}

function saveSession(){
  if (session){
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(SESSION_KEY);
  }
}

function currentUser(){
  if (!session) return null;
  return users.find(u => u.id === session.userId) || null;
}

function attemptLogin(username, password){
  const match = users.find(u =>
    u.username.toLowerCase() === username.trim().toLowerCase() &&
    u.password === password
  );
  if (!match) return false;
  session = { userId: match.id };
  saveSession();
  return true;
}

function logout(){
  session = null;
  saveSession();
  applyAuthState();
}

function initials(name){
  return name.trim().split(/\s+/).slice(0, 2).map(p => p[0].toUpperCase()).join('');
}

/* ---------- Persistence: tickets ---------- */

function loadTickets(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  }catch(e){
    console.error('Failed to load tickets', e);
    return [];
  }
}

function saveTickets(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets));
}

function nextTicketId(){
  let n = parseInt(localStorage.getItem(COUNTER_KEY) || '0', 10) + 1;
  localStorage.setItem(COUNTER_KEY, String(n));
  return 'TCK-' + String(n).padStart(4, '0');
}

/* ---------- Helpers ---------- */

function formatDate(iso){
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function timeAgo(iso){
  const diffMs = Date.now() - new Date(iso).getTime();
  const hrs = diffMs / 3600000;
  if (hrs < 1) return Math.max(1, Math.round(diffMs / 60000)) + 'm ago';
  if (hrs < 24) return Math.round(hrs) + 'h ago';
  return Math.round(hrs / 24) + 'd ago';
}

function statusClass(status){
  return 'badge-' + status.replace(/\s+/g, '');
}

function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ---------- Rendering: table ---------- */

function getFilteredTickets(){
  let list = [...tickets];

  if (filters.status !== 'all'){
    list = list.filter(t => t.status === filters.status);
  }
  if (filters.priority !== 'all'){
    list = list.filter(t => t.priority === filters.priority);
  }
  if (filters.search.trim()){
    const q = filters.search.trim().toLowerCase();
    list = list.filter(t =>
      t.title.toLowerCase().includes(q) ||
      t.requester.toLowerCase().includes(q) ||
      t.id.toLowerCase().includes(q)
    );
  }

  switch (filters.sort){
    case 'oldest':
      list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      break;
    case 'priority':
      list.sort((a, b) => PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority]);
      break;
    default: // newest
      list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  return list;
}

function renderTable(){
  const tbody = document.getElementById('ticketTableBody');
  const emptyState = document.getElementById('emptyState');
  const list = getFilteredTickets();

  tbody.innerHTML = '';

  if (list.length === 0){
    emptyState.classList.add('is-visible');
  } else {
    emptyState.classList.remove('is-visible');
  }

  for (const t of list){
    const tr = document.createElement('tr');
    tr.dataset.id = t.id;
    tr.innerHTML = `
      <td class="cell-id">${t.id}</td>
      <td>
        <div class="cell-title">${escapeHtml(t.title)}</div>
        <div class="cell-title-sub">${escapeHtml(t.department || 'No department listed')}</div>
      </td>
      <td class="cell-category">${escapeHtml(t.category)}</td>
      <td><span class="badge badge-${t.priority}"><span class="badge-dot"></span>${t.priority}</span></td>
      <td><span class="badge ${statusClass(t.status)}"><span class="badge-dot"></span>${t.status}</span></td>
      <td class="cell-requester">${escapeHtml(t.requester)}</td>
      <td class="cell-date">${formatDate(t.createdAt)}</td>
      <td class="col-actions"><button class="row-action" data-open="${t.id}">Open →</button></td>
    `;
    tr.addEventListener('click', () => openDrawer(t.id));
    tbody.appendChild(tr);
  }
}

/* ---------- Rendering: stats ---------- */

function renderStats(){
  const counts = { Open: 0, 'In Progress': 0, Resolved: 0, Closed: 0 };
  let criticalOpen = 0;
  let openAgeSum = 0;
  let openCount = 0;

  for (const t of tickets){
    counts[t.status] = (counts[t.status] || 0) + 1;
    if (t.status === 'Open' || t.status === 'In Progress'){
      openCount++;
      openAgeSum += (Date.now() - new Date(t.createdAt).getTime());
      if (t.priority === 'Critical' && t.status === 'Open') criticalOpen++;
    }
  }

  document.getElementById('statOpen').textContent = counts.Open;
  document.getElementById('statProgress').textContent = counts['In Progress'];
  document.getElementById('statResolved').textContent = counts.Resolved;
  document.getElementById('statClosed').textContent = counts.Closed;
  document.getElementById('statCritical').textContent = criticalOpen;

  const avgAgeEl = document.getElementById('statAvgAge');
  if (openCount === 0){
    avgAgeEl.textContent = '—';
  } else {
    const avgHrs = (openAgeSum / openCount) / 3600000;
    avgAgeEl.textContent = avgHrs < 24
      ? Math.round(avgHrs) + 'h'
      : (avgHrs / 24).toFixed(1) + 'd';
  }
}

function renderAll(){
  renderTable();
  renderStats();
}

/* ---------- Rendering: users ---------- */

function renderUsers(){
  const tbody = document.getElementById('userTableBody');
  const emptyState = document.getElementById('usersEmptyState');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (users.length === 0){
    emptyState.classList.add('is-visible');
  } else {
    emptyState.classList.remove('is-visible');
  }

  const me = currentUser();

  for (const u of users){
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="cell-title">${escapeHtml(u.name)}</td>
      <td class="cell-requester">${escapeHtml(u.username)}</td>
      <td class="cell-requester">${escapeHtml(u.email)}</td>
      <td><span class="badge badge-${u.role}"><span class="badge-dot"></span>${u.role}</span></td>
      <td class="cell-date">${formatDate(u.createdAt)}</td>
      <td class="col-actions">
        ${me && me.id !== u.id ? `<button class="row-action" data-remove-user="${u.id}">Remove</button>` : ''}
      </td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll('[data-remove-user]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.removeUser;
      const target = users.find(u => u.id === id);
      if (!target) return;
      if (!confirm(`Remove ${target.name}'s access? They won't be able to sign in.`)) return;
      users = users.filter(u => u.id !== id);
      saveUsers();
      renderUsers();
    });
  });
}

/* ---------- Auth state ---------- */

function applyAuthState(){
  const loginScreen = document.getElementById('loginScreen');
  const appRoot = document.getElementById('appRoot');
  const me = currentUser();

  if (!me){
    loginScreen.hidden = false;
    appRoot.hidden = true;
    return;
  }

  loginScreen.hidden = true;
  appRoot.hidden = false;

  document.getElementById('railUserAvatar').textContent = initials(me.name);
  document.getElementById('railUserName').textContent = me.name;
  document.getElementById('railUserRole').textContent = me.role;

  const usersNavBtn = document.getElementById('usersNavBtn');
  const isAdmin = me.role === 'Admin';
  usersNavBtn.hidden = !isAdmin;
  if (!isAdmin) showView('board');

  renderAll();
}

/* ---------- Views ---------- */

function showView(view){
  document.getElementById('view-board').hidden = view !== 'board';
  document.getElementById('view-new').hidden = view !== 'new';
  document.getElementById('view-users').hidden = view !== 'users';
  document.getElementById('view-new-user').hidden = view !== 'new-user';
  document.querySelectorAll('.rail-item').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.view === view);
  });
  if (view === 'users') renderUsers();
}

/* ---------- Drawer ---------- */

function openDrawer(id){
  const t = tickets.find(t => t.id === id);
  if (!t) return;
  activeDrawerId = id;

  document.getElementById('drawerId').textContent = t.id;
  document.getElementById('drawerTitle').textContent = t.title;
  document.getElementById('drawerCategory').textContent = t.category;
  document.getElementById('drawerRequester').textContent = t.requester;
  document.getElementById('drawerDepartment').textContent = t.department || '—';
  document.getElementById('drawerOpened').textContent = `${formatDate(t.createdAt)} · ${timeAgo(t.createdAt)}`;
  document.getElementById('drawerDescription').textContent = t.description;

  const statusSel = document.getElementById('drawerStatus');
  statusSel.innerHTML = STATUSES.map(s => `<option value="${s}" ${s === t.status ? 'selected' : ''}>${s}</option>`).join('');

  const prioritySel = document.getElementById('drawerPriority');
  prioritySel.innerHTML = PRIORITIES.map(p => `<option value="${p}" ${p === t.priority ? 'selected' : ''}>${p}</option>`).join('');

  renderActivity(t);

  document.getElementById('drawerBackdrop').classList.add('is-open');
}

function closeDrawer(){
  document.getElementById('drawerBackdrop').classList.remove('is-open');
  activeDrawerId = null;
}

function renderActivity(t){
  const log = document.getElementById('activityLog');
  if (!t.activity || t.activity.length === 0){
    log.innerHTML = '<div class="activity-empty">No activity yet.</div>';
    return;
  }
  log.innerHTML = [...t.activity].reverse().map(a => `
    <div class="activity-entry">
      <div class="activity-entry-text">${escapeHtml(a.text)}</div>
      <div class="activity-entry-time">${formatDate(a.at)} · ${timeAgo(a.at)}</div>
    </div>
  `).join('');
}

function currentDrawerTicket(){
  return tickets.find(t => t.id === activeDrawerId);
}

/* ---------- Event wiring ---------- */

document.addEventListener('DOMContentLoaded', () => {
  applyAuthState();

  // Login
  document.getElementById('loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    const errorEl = document.getElementById('loginError');
    if (attemptLogin(username, password)){
      errorEl.hidden = true;
      e.target.reset();
      applyAuthState();
      showView('board');
    } else {
      errorEl.textContent = 'Incorrect username or password.';
      errorEl.hidden = false;
    }
  });

  document.getElementById('logoutBtn').addEventListener('click', () => {
    logout();
    showView('board');
  });

  // Nav
  document.querySelectorAll('.rail-item').forEach(btn => {
    btn.addEventListener('click', () => showView(btn.dataset.view));
  });
  document.getElementById('openNewFromBoard').addEventListener('click', () => showView('new'));
  document.getElementById('cancelNew').addEventListener('click', () => {
    document.getElementById('ticketForm').reset();
    showView('board');
  });

  // Users
  document.getElementById('openNewUserFromBoard').addEventListener('click', () => {
    document.getElementById('userFormError').hidden = true;
    showView('new-user');
  });
  document.getElementById('cancelNewUser').addEventListener('click', () => {
    document.getElementById('userForm').reset();
    showView('users');
  });

  document.getElementById('userForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('uName').value.trim();
    const email = document.getElementById('uEmail').value.trim();
    const username = document.getElementById('uUsername').value.trim();
    const password = document.getElementById('uPassword').value;
    const role = document.getElementById('uRole').value;
    const errorEl = document.getElementById('userFormError');

    const taken = users.some(u => u.username.toLowerCase() === username.toLowerCase());
    if (taken){
      errorEl.textContent = 'That username is already taken.';
      errorEl.hidden = false;
      return;
    }

    users.push({
      id: nextUserId(),
      name, email, username, password, role,
      createdAt: new Date().toISOString()
    });
    saveUsers();
    errorEl.hidden = true;
    e.target.reset();
    showView('users');
  });

  // New ticket form
  document.getElementById('ticketForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const ticket = {
      id: nextTicketId(),
      title: document.getElementById('fTitle').value.trim(),
      description: document.getElementById('fDescription').value.trim(),
      requester: document.getElementById('fRequester').value.trim(),
      department: document.getElementById('fDepartment').value.trim(),
      category: document.getElementById('fCategory').value,
      priority: document.getElementById('fPriority').value,
      status: 'Open',
      createdAt: new Date().toISOString(),
      activity: [{ text: 'Ticket opened.', at: new Date().toISOString() }]
    };
    tickets.push(ticket);
    saveTickets();
    renderAll();
    e.target.reset();
    showView('board');
  });

  // Filters
  document.getElementById('searchInput').addEventListener('input', (e) => {
    filters.search = e.target.value;
    renderTable();
  });

  document.getElementById('statusChips').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    filters.status = chip.dataset.value;
    document.querySelectorAll('#statusChips .chip').forEach(c => c.classList.toggle('is-active', c === chip));
    renderTable();
  });

  document.getElementById('priorityFilter').addEventListener('change', (e) => {
    filters.priority = e.target.value;
    renderTable();
  });

  document.getElementById('sortBy').addEventListener('change', (e) => {
    filters.sort = e.target.value;
    renderTable();
  });

  // Drawer
  document.getElementById('drawerClose').addEventListener('click', closeDrawer);
  document.getElementById('drawerBackdrop').addEventListener('click', (e) => {
    if (e.target.id === 'drawerBackdrop') closeDrawer();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && activeDrawerId) closeDrawer();
  });

  document.getElementById('drawerStatus').addEventListener('change', (e) => {
    const t = currentDrawerTicket();
    if (!t) return;
    const oldStatus = t.status;
    t.status = e.target.value;
    t.activity.push({ text: `Status changed from ${oldStatus} to ${t.status}.`, at: new Date().toISOString() });
    saveTickets();
    renderAll();
    renderActivity(t);
  });

  document.getElementById('drawerPriority').addEventListener('change', (e) => {
    const t = currentDrawerTicket();
    if (!t) return;
    const oldPriority = t.priority;
    t.priority = e.target.value;
    t.activity.push({ text: `Priority changed from ${oldPriority} to ${t.priority}.`, at: new Date().toISOString() });
    saveTickets();
    renderAll();
    renderActivity(t);
  });

  document.getElementById('activityForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('activityInput');
    const text = input.value.trim();
    if (!text) return;
    const t = currentDrawerTicket();
    if (!t) return;
    t.activity.push({ text, at: new Date().toISOString() });
    saveTickets();
    renderActivity(t);
    input.value = '';
  });

  document.getElementById('deleteTicketBtn').addEventListener('click', () => {
    if (!activeDrawerId) return;
    if (!confirm('Delete this ticket? This can\'t be undone.')) return;
    tickets = tickets.filter(t => t.id !== activeDrawerId);
    saveTickets();
    closeDrawer();
    renderAll();
  });

  // Sample data / wipe
  document.getElementById('seedBtn').addEventListener('click', () => {
    if (tickets.length && !confirm('This adds sample tickets to your current queue. Continue?')) return;
    tickets.push(...sampleTickets());
    saveTickets();
    renderAll();
  });

  document.getElementById('wipeBtn').addEventListener('click', () => {
    if (!confirm('Erase all tickets? This can\'t be undone.')) return;
    tickets = [];
    saveTickets();
    renderAll();
  });
});

/* ---------- Sample data ---------- */

function sampleTickets(){
  const now = Date.now();
  const hoursAgo = (h) => new Date(now - h * 3600000).toISOString();

  return [
    {
      id: nextTicketId(),
      title: 'VPN drops every few minutes on laptop',
      description: 'Connection disconnects roughly every 5-10 minutes since the update yesterday. Reconnecting works but it\'s constant. Using the office SSID at home over fiber.',
      requester: 'Maria Santos',
      department: 'Finance',
      category: 'Network',
      priority: 'High',
      status: 'Open',
      createdAt: hoursAgo(3),
      activity: [{ text: 'Ticket opened.', at: hoursAgo(3) }]
    },
    {
      id: nextTicketId(),
      title: 'Cannot access shared drive after password reset',
      description: 'Reset password this morning per the email prompt. Email and Slack work fine but the shared drive still asks for old credentials.',
      requester: 'James Okafor',
      department: 'Marketing',
      category: 'Access & Accounts',
      priority: 'Medium',
      status: 'In Progress',
      createdAt: hoursAgo(20),
      activity: [
        { text: 'Ticket opened.', at: hoursAgo(20) },
        { text: 'Assigned to helpdesk tier 2.', at: hoursAgo(14) }
      ]
    },
    {
      id: nextTicketId(),
      title: 'Production database server unresponsive',
      description: 'Primary DB node stopped responding to health checks at 2:14am. Failover has not triggered. Customer-facing app is down.',
      requester: 'Dev Patel',
      department: 'Engineering',
      category: 'Network',
      priority: 'Critical',
      status: 'Open',
      createdAt: hoursAgo(1),
      activity: [{ text: 'Ticket opened.', at: hoursAgo(1) }]
    },
    {
      id: nextTicketId(),
      title: 'New hire laptop setup — starts Monday',
      description: 'Need a standard engineering laptop image provisioned with the usual dev toolchain for a new starter joining next week.',
      requester: 'Priya Raman',
      department: 'People Ops',
      category: 'Hardware',
      priority: 'Low',
      status: 'Resolved',
      createdAt: hoursAgo(72),
      activity: [
        { text: 'Ticket opened.', at: hoursAgo(72) },
        { text: 'Laptop imaged and tested.', at: hoursAgo(50) },
        { text: 'Status changed from In Progress to Resolved.', at: hoursAgo(48) }
      ]
    },
    {
      id: nextTicketId(),
      title: 'Outlook not syncing on iPhone',
      description: 'Mail app shows a sync error and hasn\'t pulled new messages since last night. Already tried removing and re-adding the account once.',
      requester: 'Tom Berger',
      department: 'Sales',
      category: 'Email',
      priority: 'Medium',
      status: 'Closed',
      createdAt: hoursAgo(96),
      activity: [
        { text: 'Ticket opened.', at: hoursAgo(96) },
        { text: 'Fixed by re-authenticating the mail profile.', at: hoursAgo(90) },
        { text: 'Status changed from Resolved to Closed.', at: hoursAgo(88) }
      ]
    },
    {
      id: nextTicketId(),
      title: 'Requesting Figma seat for design review',
      description: 'Need an editor seat (not viewer) to leave comments and adjust components ahead of Thursday\'s design review.',
      requester: 'Aiko Tanaka',
      department: 'Product',
      category: 'Software',
      priority: 'Low',
      status: 'Open',
      createdAt: hoursAgo(6),
      activity: [{ text: 'Ticket opened.', at: hoursAgo(6) }]
    }
  ];
}
