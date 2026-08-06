/* ============================================================
   Deskline — Auth
   Client-side only demo auth. Accounts + session live in
   localStorage. Passwords are SHA-256 hashed before storage so
   they're not sitting around in plain text, but this is NOT a
   substitute for real server-side authentication — anyone with
   console access to this browser can still read localStorage.
   ============================================================ */

const USERS_KEY = 'deskline_users';
const SESSION_KEY = 'deskline_session';

/* ---------- Users ---------- */

function loadUsers(){
  try{
    const raw = localStorage.getItem(USERS_KEY);
    return raw ? JSON.parse(raw) : [];
  }catch(e){
    console.error('Failed to load users', e);
    return [];
  }
}

function saveUsers(users){
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function findUser(email){
  const norm = email.trim().toLowerCase();
  return loadUsers().find(u => u.email === norm);
}

async function hashPassword(password){
  const enc = new TextEncoder().encode(password);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function createUser({ name, email, password }){
  const users = loadUsers();
  const norm = email.trim().toLowerCase();
  if (users.some(u => u.email === norm)){
    throw new Error('An account with that email already exists.');
  }
  const user = {
    name: name.trim(),
    email: norm,
    passwordHash: await hashPassword(password),
    createdAt: new Date().toISOString()
  };
  users.push(user);
  saveUsers(users);
  return user;
}

async function verifyUser(email, password){
  const user = findUser(email);
  if (!user) return null;
  const hash = await hashPassword(password);
  return hash === user.passwordHash ? user : null;
}

/* ---------- Session ---------- */

function getSession(){
  try{
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  }catch(e){
    return null;
  }
}

function setSession(user){
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    name: user.name,
    email: user.email,
    loggedInAt: new Date().toISOString()
  }));
}

function clearSession(){
  localStorage.removeItem(SESSION_KEY);
}

/* Redirects to the login page if nobody's signed in.
   Call this as early as possible on protected pages. */
function requireAuth(){
  const session = getSession();
  if (!session){
    window.location.replace('login.html');
    return null;
  }
  return session;
}

function initials(name){
  return name.trim().split(/\s+/).slice(0, 2).map(p => p[0].toUpperCase()).join('');
}
