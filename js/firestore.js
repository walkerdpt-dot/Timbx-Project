// js/firestore.js
import { 
    getFirestore, doc, getDoc, setDoc, updateDoc, collection, getDocs, 
    addDoc, deleteDoc, query, where, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

export async function createUserProfile(db, user, username, role, optionalData) {
    try {
        await setDoc(doc(db, "users", user.uid), {
            uid: user.uid,
            email: user.email,
            username: username,
            role: role,
            createdAt: serverTimestamp(),
            rating: 0,
            reviewCount: 0,
            completedTransactions: 0,
            ...optionalData
        });
        return true;
    } catch (e) {
        console.error("Error adding document: ", e);
        return false;
    }
}

export async function getUserProfile(db, uid) {
    const docRef = doc(db, "users", uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        return { uid, ...docSnap.data() };
    } else {
        return null;
    }
}

export async function getUserProfileById(db, uid) {
    if (!uid) return null;
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);
    return userSnap.exists() ? { id: userSnap.id, ...userSnap.data() } : null;
}

export async function fetchProperties(db) {
    const propertiesCol = collection(db, 'properties');
    const propertySnapshot = await getDocs(propertiesCol);
    return propertySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function fetchProjects(db) {
    const projectsCol = collection(db, 'projects');
    const projectSnapshot = await getDocs(projectsCol);
    return projectSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function fetchProfessionalProfiles(db) {
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("role", "!=", "seller"));
    const querySnapshot = await getDocs(q);
    const profiles = [];
    querySnapshot.forEach((doc) => {
        profiles.push({ id: doc.id, ...doc.data() });
    });
    return profiles;
}


export async function saveNewProperty(db, currentUser, geoJSON, propertyData) {
    if (!currentUser) {
        throw new Error("You must be logged in to save a property.");
    }
    const propertyPayload = {
        ...propertyData,
        ownerId: currentUser.uid,
        geoJSON: JSON.stringify(geoJSON), // Store GeoJSON as a string
        createdAt: serverTimestamp()
    };
    const docRef = await addDoc(collection(db, "properties"), propertyPayload);
    return { id: docRef.id, ...propertyPayload, geoJSON: geoJSON }; // Return with geoJSON as object
}

// THIS IS THE NEW FUNCTION
export async function saveNewProject(db, projectData) {
    if (!projectData.ownerId) {
        throw new Error("Cannot save project without an owner.");
    }
    // Ensure GeoJSON objects are stored as strings for Firestore compatibility
    const payload = { ...projectData };
    if (payload.geoJSON && typeof payload.geoJSON === 'object') {
        payload.geoJSON = JSON.stringify(payload.geoJSON);
    }
    if (payload.annotations && typeof payload.annotations === 'object') {
        payload.annotations = JSON.stringify(payload.annotations);
    }

    const docRef = await addDoc(collection(db, "projects"), payload);
    return { id: docRef.id, ...projectData }; // Return the original data with the new ID
}

export async function updateProperty(db, propertyId, geoJSON, propertyData) {
    const propertyRef = doc(db, "properties", propertyId);
    await updateDoc(propertyRef, {
        ...propertyData,
        geoJSON: JSON.stringify(geoJSON)
    });
}

export async function updateProject(db, projectId, projectData) {
    const projectRef = doc(db, 'projects', projectId);
    await updateDoc(projectRef, projectData);
}

export async function deleteProperty(db, propertyId) {
    await deleteDoc(doc(db, "properties", propertyId));
}

export async function deleteProject(db, projectId) {
    await deleteDoc(doc(db, "projects", projectId));
}

export async function getPropertyById(db, propertyId) {
    const propertyRef = doc(db, "properties", propertyId);
    const docSnap = await getDoc(propertyRef);
    if (docSnap.exists()) {
        const data = docSnap.data();
        // Parse GeoJSON string back to an object when fetching
        if (data.geoJSON && typeof data.geoJSON === 'string') {
            data.geoJSON = JSON.parse(data.geoJSON);
        }
        return { id: docSnap.id, ...data };
    } else {
        return null;
    }
}

export async function getPropertiesForCurrentUser(db, uid) {
    const propertiesRef = collection(db, "properties");
    const q = query(propertiesRef, where("ownerId", "==", uid));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => {
        const data = doc.data();
        if (data.geoJSON && typeof data.geoJSON === 'string') {
            data.geoJSON = JSON.parse(data.geoJSON);
        }
        return { id: doc.id, ...data };
    });
}

export async function updateUserProfile(db, uid, updatedData) {
    const userRef = doc(db, "users", uid);
    await updateDoc(userRef, updatedData);
}

export function saveMarketplaceDataToSession(properties, profiles) {
    sessionStorage.setItem('allProperties', JSON.stringify(properties));
    sessionStorage.setItem('allProfessionalProfiles', JSON.stringify(profiles));
}

export function getMarketplaceDataFromSession() {
    const properties = JSON.parse(sessionStorage.getItem('allProperties'));
    const profiles = JSON.parse(sessionStorage.getItem('allProfessionalProfiles'));
    return [properties, profiles];
}