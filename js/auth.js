// js/auth.js
 import {
     getAuth,
     onAuthStateChanged,
     createUserWithEmailAndPassword,
     signInWithEmailAndPassword,
     signOut
 } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
 import { createUserProfile, getUserProfile } from './firestore.js';
 import { showInfoModal } from './ui.js';

 export function initializeAuth(app, db, onUserStatusChange, onInitialLoadComplete) {
     const auth = getAuth(app);

     onAuthStateChanged(auth, async (user) => {
         if (user) {
             const userProfile = await getUserProfile(db, user.uid);
             await onUserStatusChange(userProfile);
         } else {
             await onUserStatusChange(null);
         }
         // CRITICAL FIX: This function (handleNavigation) is now called here to guarantee
         // that all user data is loaded BEFORE the app tries to render a page.
         onInitialLoadComplete();
     });

     return auth;
 }

 export async function handleLogin(auth) {
     const email = document.getElementById('login-email').value;
     const password = document.getElementById('login-password').value;
     const messageDiv = document.getElementById('login-message');

     try {
         await signInWithEmailAndPassword(auth, email, password);
         messageDiv.classList.add('hidden');
         messageDiv.textContent = '';
         return true;
     } catch (error) {
         console.error("Login failed:", error);
         messageDiv.textContent = error.message;
         messageDiv.classList.remove('hidden');
         return false;
     }
 }

 export async function handleSignup(auth, db, optionalData) {
     const email = document.getElementById('signup-email').value;
     const password = document.getElementById('signup-password').value;
     const username = document.getElementById('signup-username').value;
     const role = document.getElementById('signup-role').value;
     const messageDiv = document.getElementById('signup-message');

     if (!role) {
         messageDiv.textContent = "Please select a role.";
         messageDiv.classList.remove('hidden');
         return false;
     }

     try {
         const userCredential = await createUserWithEmailAndPassword(auth, email, password);
         const user = userCredential.user;

         await createUserProfile(db, user, username, role, optionalData);

         messageDiv.classList.add('hidden');
         messageDiv.textContent = '';
         showInfoModal("Signup Successful!", "Your account has been created. Please log in to continue.");
         return true;

     } catch (error) {
         console.error("Signup failed:", error);
         messageDiv.textContent = error.message;
         messageDiv.classList.remove('hidden');
         return false;
     }
 }

 export async function handleLogout(auth) {
     try {
         await signOut(auth);
     } catch (error) {
         console.error("Logout failed:", error);
         alert("Failed to log out. Please try again.");
     }
 }