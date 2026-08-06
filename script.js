/* ============================================================
   Deskline — IT Ticket Desk
   Tickets are stored in Firebase Realtime Database (path "tickets")
   so every signed-in account sees the same live queue, instead of
   each browser keeping its own localStorage copy.
   ============================================================ */

import {
  db,
  ref,
  push,
  set,
  update,
  remove,
  onValue,
  runTransaction
} from './firebase-init.js';

const TICKETS_PATH = 'tickets';
const COUNTER_PATH = 'meta/ticketCounter';

const STATUSES = ['Open', 'In Progress', 'Resolved', 'Closed'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
const PRIORITY_WEIGHT = { Critical: 3, High: 2, Medium: 1, Low: 0 };

// Editing, clearing, or deleting a ticket requires this password.
const EDIT_PASSWORD = 'p@ssw0rd';

// Prompts for the edit password and returns true only if it matches.
// Returns false (with an alert, unless the prompt was cancelled) otherwise.
function verifyEditPassword(actionLabel){
  const entered = window.prompt(`Enter password to ${actionLabel}:`);
  if (entered === null) return false; // user cancelled
  if (entered !== EDIT_PASSWORD){
    alert('Incorrect password.');
    return false;
  }
  return true;
}

/* ---------- State ---------- */

let tickets = [];              // kept in sync with Realtime Database via onValue
let activeDrawerId = null;     // Realtime Database key of the open ticket
let filters = { status: 'all', priority: 'all', search: '', sort: 'newest' };

/* ---------- Realtime Database: tickets ---------- */

// Atomically hands out the next TCK-#### number, shared across everyone.
async function nextTicketId(){
  const counterRef = ref(db, COUNTER_PATH);
  const result = await runTransaction(counterRef, (current) => (current || 0) + 1);
  return 'TCK-' + String(result.snapshot.val()).padStart(4, '0');
}

async function createTicket(data){
  const displayId = await nextTicketId();
  const now = new Date().toISOString();
  const newRef = push(ref(db, TICKETS_PATH));
  await set(newRef, {
    ...data,
    id: displayId,
    status: 'Open',
    createdAt: now,
    activity: [{ text: 'Ticket opened.', at: now }]
  });
}

async function updateTicket(docId, patch){
  await update(ref(db, `${TICKETS_PATH}/${docId}`), patch);
}

async function deleteTicket(docId){
  await remove(ref(db, `${TICKETS_PATH}/${docId}`));
}

// Starts the live listener. Every insert/update/delete by any signed-in
// user re-fires this callback for everyone with the full ticket list.
function watchTickets(onChange){
  const ticketsRef = ref(db, TICKETS_PATH);
  return onValue(ticketsRef, (snapshot) => {
    const val = snapshot.val() || {};
    tickets = Object.entries(val).map(([docId, data]) => ({ docId, ...data }));
    onChange();
  }, (err) => {
    console.error('Ticket sync failed', err);
  });
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
    tr.dataset.id = t.docId;
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
      <td class="col-actions"><button class="row-action" data-open="${t.docId}">Open →</button></td>
    `;
    tr.addEventListener('click', () => openDrawer(t.docId));
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
  // Keep the open drawer's activity log in sync if its ticket just changed.
  if (activeDrawerId){
    const t = currentDrawerTicket();
    if (t) renderActivity(t);
  }
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

function openDrawer(docId){
  const t = tickets.find(t => t.docId === docId);
  if (!t) return;
  activeDrawerId = docId;

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
  return tickets.find(t => t.docId === activeDrawerId);
}

/* ---------- Event wiring ---------- */

document.addEventListener('DOMContentLoaded', () => {
  // Live sync: re-render the whole board whenever the database changes,
  // whether that change came from this tab or someone else's account.
  watchTickets(renderAll);

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
  document.getElementById('ticketForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try{
      await createTicket({
        title: document.getElementById('fTitle').value.trim(),
        description: document.getElementById('fDescription').value.trim(),
        requester: document.getElementById('fRequester').value.trim(),
        department: document.getElementById('fDepartment').value.trim(),
        category: document.getElementById('fCategory').value,
        priority: document.getElementById('fPriority').value
      });
      e.target.reset();
      showView('board');
    }catch(err){
      console.error('Failed to create ticket', err);
      alert('Could not save the ticket. Please try again.');
    }finally{
      submitBtn.disabled = false;
    }
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

  document.getElementById('drawerStatus').addEventListener('change', async (e) => {
    const t = currentDrawerTicket();
    if (!t) return;
    const oldStatus = t.status;
    const newStatus = e.target.value;

    if (!verifyEditPassword('change this ticket\'s status')){
      e.target.value = oldStatus; // revert the select
      return;
    }

    const activity = [...(t.activity || []), { text: `Status changed from ${oldStatus} to ${newStatus}.`, at: new Date().toISOString() }];
    try{
      await updateTicket(t.docId, { status: newStatus, activity });
    }catch(err){
      console.error('Failed to update status', err);
      alert('Could not update status. Please try again.');
    }
  });

  document.getElementById('drawerPriority').addEventListener('change', async (e) => {
    const t = currentDrawerTicket();
    if (!t) return;
    const oldPriority = t.priority;
    const newPriority = e.target.value;

    if (!verifyEditPassword('change this ticket\'s priority')){
      e.target.value = oldPriority; // revert the select
      return;
    }

    const activity = [...(t.activity || []), { text: `Priority changed from ${oldPriority} to ${newPriority}.`, at: new Date().toISOString() }];
    try{
      await updateTicket(t.docId, { priority: newPriority, activity });
    }catch(err){
      console.error('Failed to update priority', err);
      alert('Could not update priority. Please try again.');
    }
  });

  document.getElementById('activityForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('activityInput');
    const text = input.value.trim();
    if (!text) return;
    const t = currentDrawerTicket();
    if (!t) return;
    const activity = [...(t.activity || []), { text, at: new Date().toISOString() }];
    try{
      await updateTicket(t.docId, { activity });
      input.value = '';
    }catch(err){
      console.error('Failed to add activity', err);
      alert('Could not add that note. Please try again.');
    }
  });

  document.getElementById('deleteTicketBtn').addEventListener('click', async () => {
    if (!activeDrawerId) return;
    if (!confirm('Delete this ticket? This can\'t be undone.')) return;
    if (!verifyEditPassword('delete this ticket')) return;
    try{
      await deleteTicket(activeDrawerId);
      closeDrawer();
    }catch(err){
      console.error('Failed to delete ticket', err);
      alert('Could not delete the ticket. Please try again.');
    }
  });

  document.getElementById('wipeBtn').addEventListener('click', async () => {
    if (!confirm('Erase all tickets for everyone? This can\'t be undone.')) return;
    if (!verifyEditPassword('clear all tickets')) return;
    try{
      await Promise.all(tickets.map(t => deleteTicket(t.docId)));
    }catch(err){
      console.error('Failed to clear tickets', err);
      alert('Could not clear all tickets. Please try again.');
    }
  });
});

