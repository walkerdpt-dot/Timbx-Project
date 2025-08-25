// js/auth.js

import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut,
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { doc, setDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { getUpdatedLocation } from './map.js';

let auth;

export function initializeAuth(app, db, onUserStatusChange) {
    auth = getAuth(app);

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            console.log("Auth state changed: User is signed in.", user.uid);
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists()) {
                onUserStatusChange({ uid: user.uid, ...userDoc.data() });
            } else {
                console.log("User document doesn't exist yet, might be a new sign-up.");
                onUserStatusChange(user);
            }
        } else {
            console.log("Auth state changed: User is signed out.");
            onUserStatusChange(null);
        }
    });

    return auth;
}

export async function handleLogin(auth, db) {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const messageDiv = document.getElementById('login-message');

    try {
        await signInWithEmailAndPassword(auth, email, password);
        messageDiv.classList.add('hidden');
        return true;
    } catch (error) {
        messageDiv.textContent = error.message;
        messageDiv.classList.remove('hidden');
        return false;
    }
}

export async function handleSignup(auth, db) {
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const username = document.getElementById('signup-username').value;
    const role = document.getElementById('signup-role').value;
    const messageDiv = document.getElementById('signup-message');

    // --- MODIFICATION START ---
    // Get values from the new optional fields.
    const company = document.getElementById('signup-company').value.trim();
    const bio = document.getElementById('signup-bio').value.trim();
    const profilePictureUrl = document.getElementById('signup-profile-picture-url').value.trim();
    // --- MODIFICATION END ---


    if (!role) {
        messageDiv.textContent = "Please select a role.";
        messageDiv.classList.remove('hidden');
        return false;
    }

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        const newUserProfile = {
            username: username,
            email: user.email,
            role: role,
            createdAt: serverTimestamp(),
            // --- MODIFICATION START ---
            // Add new optional fields to the profile object.
            company: company || "",
            bio: bio || "",
            profilePictureUrl: profilePictureUrl || "",
            // --- MODIFICATION END ---
            rating: 0,
            reviewCount: 0,
            completedTransactions: 0
        };

        if (role === 'forester' || role === 'buyer' || role === 'contractor') {
            newUserProfile.location = getUpdatedLocation();
            if (role === 'forester') {
                newUserProfile.experience = document.getElementById('forester-experience').value;
                newUserProfile.certifications = document.getElementById('forester-certifications').value;
            } else if (role === 'buyer') {
                newUserProfile.lookingFor = document.getElementById('buyer-looking-for').value;
            } else if (role === 'contractor') {
                newUserProfile.services = document.getElementById('contractor-services').value;
            }
        }

        await setDoc(doc(db, "users", user.uid), newUserProfile);
        messageDiv.classList.add('hidden');
        await signOut(auth); // Sign out user to force login after signup
        return true;
    } catch (error) {
        messageDiv.textContent = error.message;
        messageDiv.classList.remove('hidden');
        return false;
    }
}


export async function handleLogout(auth) {
    await signOut(auth);
}

export async function handleGoogleSignIn() {
    // This function will need to be expanded to handle profile creation for new Google users.
    // For now, it will just sign them in.
    const provider = new GoogleAuthProvider();
    try {
        const result = await signInWithPopup(auth, provider);
        // This gives you a Google Access Token. You can use it to access the Google API.
        const credential = GoogleAuthProvider.credentialFromResult(result);
        const token = credential.accessToken;
        // The signed-in user info.
        const user = result.user;
        console.log("Google sign in successful", user);
    } catch (error) {
        // Handle Errors here.
        const errorCode = error.code;
        const errorMessage = error.message;
        // The email of the user's account used.
        const email = error.customData.email;
        // The AuthCredential type that was used.
        const credential = GoogleAuthProvider.credentialFromError(error);
        console.error("Google sign in error", errorCode, errorMessage);
    }
}