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

// ==================================================================
// HELPER FUNCTIONS FOR GEOJSON TRANSFORMATION
// ==================================================================

/**
 * Converts Leaflet-style coordinates [[lng, lat]] to a 
 * Firestore-compatible format [{lng, lat}].
 * @param {object} geoJSON - The original GeoJSON object from Leaflet.
 * @returns {object} A new GeoJSON object safe to save in Firestore.
 */
function _transformCoordinatesToFirestore(geoJSON) {
    if (!geoJSON?.geometry?.coordinates) {
        return geoJSON; // Return original if no coordinates to transform
    }
    // Create a deep copy to avoid modifying the original object
    const newGeoJSON = JSON.parse(JSON.stringify(geoJSON));
    newGeoJSON.geometry.coordinates = newGeoJSON.geometry.coordinates.map(coordPair => ({
        lng: coordPair[0],
        lat: coordPair[1]
    }));
    return newGeoJSON;
}

/**
 * Converts Firestore-style coordinates [{lng, lat}] back to the
 * Leaflet-compatible format [[lng, lat]].
 * @param {object} geoJSON - The GeoJSON object from Firestore.
 * @returns {object} A new GeoJSON object ready for Leaflet.
 */
function _transformCoordinatesToLeaflet(geoJSON) {
    if (!geoJSON?.geometry?.coordinates) {
        return geoJSON; // Return original if no coordinates to transform
    }
    // Ensure we are not trying to transform already-transformed data
    if (typeof geoJSON.geometry.coordinates[0]?.[0] === 'number') {
        return geoJSON;
    }
    const newGeoJSON = JSON.parse(JSON.stringify(geoJSON));
    newGeoJSON.geometry.coordinates = newGeoJSON.geometry.coordinates.map(coordObject => ([
        coordObject.lng,
        coordObject.lat
    ]));
    return newGeoJSON;
}

// ==================================================================
// EXPORTED FIRESTORE FUNCTIONS (UPDATED)
// ==================================================================

export async function fetchProperties(db) {
    const propertiesCol = collection(db, 'properties');
    const propertySnapshot = await getDocs(propertiesCol);
    return propertySnapshot.docs.map(doc => {
        const data = doc.data();
        // **FIX**: Transform coordinates for Leaflet display
        data.geoJSON = _transformCoordinatesToLeaflet(data.geoJSON);
        return { id: doc.id, ...data };
    });
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
        // **FIX**: Transform coordinates for Firestore storage
        const transformedGeoJSON = _transformCoordinatesToFirestore(geoJSON);

        const docRef = await addDoc(collection(db, "properties"), {
            ...propertyData,
            ownerId: user.uid,
            ownerUsername: user.username,
            geoJSON: transformedGeoJSON, // Use the transformed data
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
        // **FIX**: Transform coordinates for Firestore storage
        const transformedGeoJSON = _transformCoordinatesToFirestore(geoJSON);
        
        const propRef = doc(db, "properties", propertyId);
        await updateDoc(propRef, {
            ...propertyData,
            geoJSON: transformedGeoJSON, // Use the transformed data
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
        const data = propSnap.data();
        // **FIX**: Transform coordinates for Leaflet display
        data.geoJSON = _transformCoordinatesToLeaflet(data.geoJSON);
        return { id: propSnap.id, ...data };
    } else {
        return null;
    }
}

export async function getPropertiesForCurrentUser(db, uid) {
    const q = query(collection(db, "properties"), where("ownerId", "==", uid));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => {
        const data = doc.data();
        // **FIX**: Transform coordinates for Leaflet display
        data.geoJSON = _transformCoordinatesToLeaflet(data.geoJSON);
        return { id: doc.id, ...data };
    });
}

export async function updateUserProfile(db, uid, data) {
    const userRef = doc(db, "users", uid);
    await updateDoc(userRef, data);
}

// These session storage functions do not need changes as they
// handle data that has already been fetched and transformed.
export function saveMarketplaceDataToSession(properties, profiles) {
    sessionStorage.setItem('marketplace_properties', JSON.stringify(properties));
    sessionStorage.setItem('marketplace_profiles', JSON.stringify(profiles));
}

export function getMarketplaceDataFromSession() {
    const properties = JSON.parse(sessionStorage.getItem('marketplace_properties')) || [];
    const profiles = JSON.parse(sessionStorage.getItem('marketplace_profiles')) || [];
    return { properties, profiles };
}

export async function getUserProfileById(db, userId) {
    if (!userId) return null;
    const userRef = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
        return { id: userSnap.id, ...userSnap.data() };
    } else {
        console.log("No such user document!");
        return null;
    }
}