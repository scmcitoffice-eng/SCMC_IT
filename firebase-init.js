// Firebase initialization for Deskline
// Uses the Firebase JS SDK v10 modular CDN build (no bundler needed).

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAnalytics, isSupported as analyticsIsSupported } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-analytics.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCSWNaYQGaoGWnUyOrglf4SYvy5BhIX8LU",
  authDomain: "ticket-b7192.firebaseapp.com",
  projectId: "ticket-b7192",
  storageBucket: "ticket-b7192.firebasestorage.app",
  messagingSenderId: "1031791296558",
  appId: "1:1031791296558:web:4346371f0f38846efc9fbf",
  measurementId: "G-6ZK9SZDMEK"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Analytics needs a supported browser context (fails inside some sandboxed
// iframes/previews), so this is guarded rather than assumed to succeed.
let analytics = null;
analyticsIsSupported().then((supported) => {
  if (supported){
    analytics = getAnalytics(app);
  }
}).catch(() => { /* analytics unavailable in this environment, ignore */ });

export {
  app,
  auth,
  analytics,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  updateProfile
};
