// js/firestore.js

import { getFirestore, collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, query, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

// Functions to share data between pages
export function saveMarketplaceDataToSession(properties, profiles) {
  try {
    sessionStorage.setItem('marketplace_properties', JSON.stringify(properties));
    sessionStorage.setItem('marketplace_profiles', JSON.stringify(profiles));
  } catch (error) {
    console.error("Could not save data to session storage:", error);
  }
}

export function getMarketplaceDataFromSession() {
  try {
    const properties = JSON.parse(sessionStorage.getItem('marketplace_properties')) || [];
    const profiles = JSON.parse(sessionStorage.getItem('marketplace_profiles')) || [];
    return { properties, profiles };
  } catch (error) {
    console.error("Could not get data from session storage:", error);
    return { properties: [], profiles: [] };
  }
}

export async function fetchProperties(db) {
    try {
        const snapshot = await getDocs(collection(db, 'properties'));
        const properties = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return properties;
    } catch (error) {
        console.error("Error fetching properties:", error);
        return [];
    }
}

export async function fetchProfessionalProfiles(db) {
    try {
        const snapshot = await getDocs(collection(db, 'users'));
        const profiles = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
        return profiles;
    } catch (error) {
        console.error("Error fetching professional profiles:", error);
        return [];
    }
}

export async function getPropertiesForCurrentUser(db, userId) {
    const propertiesRef = query(collection(db, "properties"), where("ownerId", "==", userId));
    const querySnapshot = await getDocs(propertiesRef);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}


export async function saveNewProperty(db, currentUser, geoJSON) {
    if (!geoJSON) {
        throw new Error('Please draw the property boundary first.');
    }
    if (!currentUser || currentUser.role !== 'seller') {
        throw new Error('You do not have permission to save properties.');
    }

    const name = document.getElementById('property-name').value.trim();
    const age = document.getElementById('property-age').value;
    const timberType = document.getElementById('property-timber-type').value;
    const species = document.getElementById('property-species').value.trim();
    const serviceType = document.getElementById('property-service-type').value;

    if (!name || !age || !timberType || !species || !serviceType) {
        throw new Error('Please fill in all required property details.');
    }

    const newPropertyData = {
        name: name,
        description: document.getElementById('property-desc').value.trim(),
        age: parseInt(age),
        timberType: timberType,
        species: species,
        subdominantSpecies: document.getElementById('property-subdominant-species').value.trim(),
        previousCutYear: document.getElementById('property-previous-cut-year').value ? parseInt(document.getElementById('property-previous-cut-year').value) : null,
        previousCutType: document.getElementById('property-previous-cut-type').value.trim(),
        serviceType: serviceType,
        geoJSON: JSON.stringify(geoJSON),
        ownerId: currentUser.uid,
        ownerUsername: currentUser.username,
        biddingCloses: new Date(new Date().setMonth(new Date().getMonth() + 1)),
        createdAt: serverTimestamp(),
        forester: null,
        bids: []
    };

    const docRef = await addDoc(collection(db, "properties"), newPropertyData);
    return { id: docRef.id, serviceType: serviceType };
}

export async function deleteProperty(db, propertyId) {
    await deleteDoc(doc(db, "properties", propertyId));
}

export async function assignForester(db, propertyId, foresterUid, foresterUsername) {
    const propertyRef = doc(db, "properties", propertyId);
    await updateDoc(propertyRef, {
        forester: {
            id: foresterUid,
            username: foresterUsername,
            assignedAt: serverTimestamp(),
            status: 'Assigned'
        }
    });
}

export async function getPropertyById(db, propertyId) {
    const propertyDocRef = doc(db, "properties", propertyId);
    const propertyDoc = await getDoc(propertyDocRef);
    return propertyDoc.exists() ? { id: propertyDoc.id, ...propertyDoc.data() } : null;
}

export async function placeBid(db, propertyId, bidAmount, currentUser) {
    const property = await getPropertyById(db, propertyId);
    if (!property) throw new Error("Property not found.");
    
    const currentHighestBid = property.bids.length > 0 ? Math.max(...property.bids.map(b => b.amount)) : 0;
    if (isNaN(bidAmount) || bidAmount <= currentHighestBid) {
        throw new Error(`Your bid must be greater than the current highest bid ($${currentHighestBid.toLocaleString()}).`);
    }

    const updatedBids = [...property.bids];
    const existingBidIndex = updatedBids.findIndex(bid => bid.bidderId === currentUser.uid);

    if (existingBidIndex !== -1) {
        updatedBids[existingBidIndex].amount = bidAmount;
        updatedBids[existingBidIndex].timestamp = serverTimestamp();
    } else {
        updatedBids.push({
            bidderId: currentUser.uid,
            bidderUsername: currentUser.username,
            amount: bidAmount,
            timestamp: serverTimestamp()
        });
    }

    await updateDoc(doc(db, "properties", propertyId), { bids: updatedBids });
}

export async function saveCruiseData(db, propertyId, currentUser) {
    const totalAcreage = parseFloat(document.getElementById('cruise-total-acreage').value);
    const plots = parseFloat(document.getElementById('cruise-plots').value);
    const tonnagePerAcre = parseFloat(document.getElementById('cruise-tonnage-per-acre').value);
    const pricePerTon = parseFloat(document.getElementById('cruise-price-per-ton').value);
    const bdFootPerAcre = parseFloat(document.getElementById('cruise-bd-foot-per-acre').value);

    const tonnageTotal = totalAcreage * tonnagePerAcre;
    const bdFootTotal = totalAcreage * bdFootPerAcre;
    const estimatedValue = tonnageTotal * pricePerTon;

    const cruiseData = {
        totalAcreage,
        plots,
        siteGroundInfo: document.getElementById('cruise-site-ground-info').value,
        dominantTrees: document.getElementById('cruise-dominant-trees').value,
        subdominantTrees: document.getElementById('cruise-subdominant-trees').value,
        timberGrade: document.getElementById('cruise-timber-grade').value,
        bdFootPerAcre,
        tonnagePerAcre,
        bdFootTotal,
        tonnageTotal,
        pricePerTon,
        estimatedValue,
        cuttingRecommendation: document.getElementById('cruise-cutting-recommendation').value,
        ownerCuttingPreference: document.getElementById('cruise-owner-preference').value,
        timestamp: serverTimestamp()
    };
    
    const propertyRef = doc(db, "properties", propertyId);
    const propertyDoc = await getDoc(propertyRef);
    const property = propertyDoc.data();

    const updatedForesterData = {
        ...property.forester,
        id: currentUser.uid,
        username: currentUser.username,
        status: 'Cruised',
        cruiseData: cruiseData
    };
    
    await updateDoc(propertyRef, { forester: updatedForesterData });
}

export async function getProjectsForUser(db, currentUser) {
    if (!currentUser) return [];

    let projectsToRender = [];
    const propertiesCollection = collection(db, "properties");

    if (currentUser.role === 'forester') {
        const q = query(propertiesCollection, where("forester.id", "==", currentUser.uid));
        const snapshot = await getDocs(q);
        projectsToRender = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } else if (currentUser.role === 'buyer') {
        const q = query(propertiesCollection, where("bids", "!=", []));
        const snapshot = await getDocs(q);
        snapshot.forEach(doc => {
            const prop = doc.data();
            if (prop.bids && prop.bids.some(b => b.bidderId === currentUser.uid)) {
                projectsToRender.push({ id: doc.id, ...prop });
            }
        });
    } else if (currentUser.role === 'seller') {
        const q = query(propertiesCollection, where("ownerId", "==", currentUser.uid));
        const snapshot = await getDocs(q);
        projectsToRender = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    
    return projectsToRender;
}

export async function markProjectComplete(db, propertyId) {
    const propertyRef = doc(db, "properties", propertyId);
    await updateDoc(propertyRef, { "forester.status": "Completed" });
}

export async function updateUserProfile(db, userId, updatedData) {
    const userRef = doc(db, "users", userId);
    await updateDoc(userRef, updatedData);
}
