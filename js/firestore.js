// js/firestore.js
import { 
    collection, 
    addDoc, 
    getDocs, 
    doc, 
    getDoc, 
    deleteDoc, 
    query, 
    where,
    updateDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

export async function fetchProperties(db) {
    const propertiesCol = collection(db, 'properties');
    const propertySnapshot = await getDocs(propertiesCol);
    return propertySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function fetchProfessionalProfiles(db) {
    const usersCol = collection(db, 'users');
    const q = query(usersCol, where("role", "in", ["forester", "buyer", "contractor"]));
    const profileSnapshot = await getDocs(q);
    return profileSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function saveNewProperty(db, user, geoJSON, propertyData) {
    if (!user) throw new Error("You must be logged in to add a property.");
    try {
        const docRef = await addDoc(collection(db, "properties"), {
            ...propertyData,
            ownerId: user.uid,
            ownerUsername: user.username,
            geoJSON: geoJSON,
            createdAt: serverTimestamp()
        });
        return { id: docRef.id, serviceType: propertyData.serviceType };
    } catch (error) {
        console.error("Error adding document: ", error);
        throw new Error("Failed to save property.");
    }
}

export async function updateProperty(db, propertyId, geoJSON, propertyData) {
    if (!propertyId) throw new Error("Property ID is required for updates.");
    try {
        const propRef = doc(db, "properties", propertyId);
        await updateDoc(propRef, {
            ...propertyData,
            geoJSON: geoJSON,
        });
    } catch (error) {
        console.error("Error updating document: ", error);
        throw new Error("Failed to update property.");
    }
}

export async function deleteProperty(db, propertyId) {
    try {
        await deleteDoc(doc(db, "properties", propertyId));
    } catch (error) {
        console.error("Error deleting property: ", error);
        throw new Error("Failed to delete property.");
    }
}

export async function getPropertyById(db, propertyId) {
    const propRef = doc(db, "properties", propertyId);
    const propSnap = await getDoc(propRef);
    if (propSnap.exists()) {
        return { id: propSnap.id, ...propSnap.data() };
    } else {
        return null;
    }
}

export async function getPropertiesForCurrentUser(db, uid) {
    const q = query(collection(db, "properties"), where("ownerId", "==", uid));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function updateUserProfile(db, uid, data) {
    const userRef = doc(db, "users", uid);
    await updateDoc(userRef, data);
}

export function saveMarketplaceDataToSession(properties, profiles) {
    sessionStorage.setItem('marketplace_properties', JSON.stringify(properties));
    sessionStorage.setItem('marketplace_profiles', JSON.stringify(profiles));
}

export function getMarketplaceDataFromSession() {
    const properties = JSON.parse(sessionStorage.getItem('marketplace_properties')) || [];
    const profiles = JSON.parse(sessionStorage.getItem('marketplace_profiles')) || [];
    return { properties, profiles };
}