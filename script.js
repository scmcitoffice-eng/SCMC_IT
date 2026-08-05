/* ============================================================
   Deskline — IT Ticket Desk
   All data lives in localStorage under the key "deskline_tickets"
   ============================================================ */

const STORAGE_KEY = 'deskline_tickets';
const COUNTER_KEY = 'deskline_ticket_counter';
const ADMIN_PASSWORD = 'StC@milluS_26';

function requireAdminPassword(actionLabel){
  const input = prompt(`Enter the admin password to ${actionLabel}:`);
  if (input === null) return false; // cancelled
  if (input !== ADMIN_PASSWORD){
    alert('Incorrect password. Action cancelled.');
    return false;
  }
  return true;
}

const STATUSES = ['Open', 'In Progress', 'Resolved', 'Closed'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
const PRIORITY_WEIGHT = { Critical: 3, High: 2, Medium: 1, Low: 0 };

/* ---------- State ---------- */

let tickets = loadTickets();
let activeDrawerId = null;
let filters = { status: 'all', priority: 'all', search: '', sort: 'newest' };

/* ---------- Persistence ---------- */

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

/* ---------- CSV export ---------- */

function csvEscape(value){
  const str = String(value ?? '');
  if (/[",\n]/.test(str)){
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function ticketsToCSV(list){
  const headers = [
    'Ticket ID', 'Title', 'Description', 'Requester', 'Department',
    'Category', 'Priority', 'Status', 'Created At', 'Activity Log'
  ];

  const rows = list.map(t => {
    const activitySummary = (t.activity || [])
      .map(a => `[${formatDate(a.at)}] ${a.text}`)
      .join(' | ');

    return [
      t.id,
      t.title,
      t.description,
      t.requester,
      t.department || '',
      t.category,
      t.priority,
      t.status,
      new Date(t.createdAt).toISOString(),
      activitySummary
    ].map(csvEscape).join(',');
  });

  return [headers.map(csvEscape).join(','), ...rows].join('\r\n');
}

function downloadCSV(){
  if (tickets.length === 0){
    alert('There are no tickets to export yet.');
    return;
  }

  const sorted = [...tickets].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const csv = ticketsToCSV(sorted);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const stamp = new Date().toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = url;
  a.download = `deskline-tickets-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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

/* ---------- Views ---------- */

function showView(view){
  document.getElementById('view-board').hidden = view !== 'board';
  document.getElementById('view-new').hidden = view !== 'new';
  document.querySelectorAll('.rail-item').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.view === view);
  });
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
  renderAll();

  // Nav
  document.querySelectorAll('.rail-item').forEach(btn => {
    btn.addEventListener('click', () => showView(btn.dataset.view));
  });
  document.getElementById('openNewFromBoard').addEventListener('click', () => showView('new'));
  document.getElementById('cancelNew').addEventListener('click', () => {
    document.getElementById('ticketForm').reset();
    showView('board');
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
    if (!requireAdminPassword('delete this ticket')) return;
    if (!confirm('Delete this ticket? This can\'t be undone.')) return;
    tickets = tickets.filter(t => t.id !== activeDrawerId);
    saveTickets();
    closeDrawer();
    renderAll();
  });

  // Export
  document.getElementById('exportBtn').addEventListener('click', downloadCSV);

  // Clear all
  document.getElementById('wipeBtn').addEventListener('click', () => {
    if (!requireAdminPassword('clear all tickets')) return;
    if (!confirm('Erase all tickets? This can\'t be undone.')) return;
    tickets = [];
    saveTickets();
    renderAll();
  });
});

