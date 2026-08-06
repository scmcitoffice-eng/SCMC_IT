/* ============================================================
   Deskline — Auth
   Backed by Firebase Authentication (email/password). Replaces
   the earlier localStorage-only demo auth.
   ============================================================ */

import {
  auth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  updateProfile
} from './firebase-init.js';

/* ---------- Account actions ---------- */

async function signUp(name, email, password){
  const cred = await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
  if (name && name.trim()){
    await updateProfile(cred.user, { displayName: name.trim() });
  }
  return cred.user;
}

async function signIn(email, password){
  const cred = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
  return cred.user;
}

async function logOut(){
  await signOut(auth);
}

/* ---------- Session state ---------- */

// Fires immediately with the current user (or null), then on every
// sign-in/sign-out. Returns an unsubscribe function.
function onAuth(callback){
  return onAuthStateChanged(auth, callback);
}

// For protected pages: redirects to login.html once Firebase confirms
// there's no signed-in user. Fires `onSignedIn(user)` if there is one.
function requireAuth(onSignedIn){
  return onAuth((user) => {
    if (!user){
      window.location.replace('login.html');
    } else if (onSignedIn){
      onSignedIn(user);
    }
  });
}

/* ---------- Helpers ---------- */

function initials(name){
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2).map(p => p[0].toUpperCase()).join('');
}

// Turns Firebase's auth/xyz-error-code into a short, readable message.
function friendlyAuthError(err){
  const map = {
    'auth/invalid-email': 'That email address looks invalid.',
    'auth/user-disabled': 'This account has been disabled.',
    'auth/user-not-found': 'Email or password is incorrect.',
    'auth/wrong-password': 'Email or password is incorrect.',
    'auth/invalid-credential': 'Email or password is incorrect.',
    'auth/email-already-in-use': 'An account with that email already exists.',
    'auth/weak-password': 'Password should be at least 6 characters.',
    'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
    'auth/network-request-failed': 'Network error — check your connection and try again.',
    'auth/unauthorized-domain': 'This domain isn\'t authorized in the Firebase console yet.'
  };
  return map[err?.code] || err?.message || 'Something went wrong. Please try again.';
}

export { signUp, signIn, logOut, onAuth, requireAuth, initials, friendlyAuthError };
