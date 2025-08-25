// js/auth.js
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { doc, setDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { getUpdatedLocation } from './map.js';

let auth;

export function initializeAuth(app, db, onUserStatusChange) {
    auth = getAuth(app);

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists()) {
                onUserStatusChange({ uid: user.uid, ...userDoc.data() });
            } else {
                onUserStatusChange(user);
            }
        } else {
            onUserStatusChange(null);
        }
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

    const company = document.getElementById('signup-company').value.trim();
    const bio = document.getElementById('signup-bio').value.trim();
    const profilePictureUrl = document.getElementById('signup-profile-picture-url').value.trim();

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
            company: company || "",
            bio: bio || "",
            profilePictureUrl: profilePictureUrl || "",
            rating: 0,
            reviewCount: 0,
            completedTransactions: 0
        };

        if (role === 'forester' || role === 'buyer' || role === 'contractor') {
            newUserProfile.location = getUpdatedLocation();
        }

        await setDoc(doc(db, "users", user.uid), newUserProfile);
        messageDiv.classList.add('hidden');
        await signOut(auth);
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