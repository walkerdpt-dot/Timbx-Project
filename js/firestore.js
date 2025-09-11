// js/firestore.js
import {
    doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, 
    collection, getDocs, query, where, writeBatch, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-functions.js";
import { app } from './state.js'; // ADDED: Import the app instance from the state

// --- Cloud Function Callers ---
export async function callAcceptQuote(quoteId, projectId) {
    const functions = getFunctions(app); // Use the imported app instance
    const acceptQuoteFunction = httpsCallable(functions, 'acceptQuote');
    try {
        const result = await acceptQuoteFunction({ quoteId, projectId });
        return result.data; // e.g., { success: true, message: "..." }
    } catch (error) {
        console.error("Cloud Function Error:", error);
        // Re-throw the error so the UI can catch it
        throw error;
    }
}


// --- User Profile Functions ---

export async function createUserProfile(db, user, username, role, optionalData) {
    const userRef = doc(db, "users", user.uid);
    const profileData = {
        uid: user.uid,
        email: user.email,
        username: username,
        role: role,
        createdAt: serverTimestamp(),
        rating: 0,
        reviewCount: 0,
        completedTransactions: 0,
        ...optionalData
    };
    await setDoc(userRef, profileData);
}

export async function getUserProfile(db, uid) {
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);
    return userSnap.exists() ? { id: userSnap.id, ...userSnap.data() } : null;
}

export async function updateUserProfile(db, uid, data) {
    const userRef = doc(db, "users", uid);
    await updateDoc(userRef, data);
}

export async function getUserProfileById(db, userId) {
    if (!userId) return null;
    const userRef = doc(db, "users", userId);
    const docSnap = await getDoc(userRef);
    if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() };
    }
    return null;
}

// --- Data Fetching Functions ---

export async function fetchProfessionalProfiles(db) {
    const q = query(collection(db, "users"), where("role", "!=", "landowner"));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function fetchTimberSales(db) {
    const querySnapshot = await getDocs(collection(db, "timberSales"));
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function getProjectsForCurrentUser(db, userId) {
    const projectsRef = collection(db, "projects");
    const projectsQuery = query(projectsRef, where("involvedUsers", "array-contains", userId));
    const snapshot = await getDocs(projectsQuery);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}


export async function fetchInquiriesForUser(db, userId) {
    const q = query(collection(db, "inquiries"), where("involvedUsers", "array-contains", userId));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function fetchActiveProjectsForUser(db, user) {
    if (!user) return [];
    const allUserProjects = await getProjectsForCurrentUser(db, user.uid);
    return allUserProjects.filter(p => p.status === 'harvest_in_progress');
}

export async function fetchQuotesForProject(db, projectIds, landownerId) {
    if (!projectIds || projectIds.length === 0) return [];
     
    const q = query(
        collection(db, "quotes"),
        where("projectId", "in", projectIds),
        where("landownerId", "==", landownerId)
    );
     
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function fetchHaulTicketsForUser(db, user) {
    if (!user) return [];
     
    let ticketsQuery;
    const ticketsRef = collection(db, 'haulTickets');

    if (user.role === 'landowner') {
        ticketsQuery = query(ticketsRef, where('ownerId', '==', user.uid));
    } else if (user.role === 'timber-buyer') {
        ticketsQuery = query(ticketsRef, where('supplierId', '==', user.uid));
    } else {
        ticketsQuery = query(ticketsRef, where('submitterId', '==', user.uid));
    }

    try {
        const snapshot = await getDocs(ticketsQuery);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error("Error fetching haul tickets:", error);
        return [];
    }
}


// --- Property Functions ---

export async function getPropertyById(db, propertyId) {
    const docRef = doc(db, "properties", propertyId);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
}

export async function getPropertiesForCurrentUser(db, userId) {
    const q = query(collection(db, "properties"), where("ownerId", "==", userId));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}


export async function saveNewProperty(db, user, boundary, propertyData) {
    const docRef = await addDoc(collection(db, "properties"), {
        ...propertyData,
        ownerId: user.uid,
        ownerName: user.username,
        geoJSON: JSON.stringify(boundary),
        createdAt: serverTimestamp(),
        authorizedUsers: [user.uid]
    });
    return { id: docRef.id, ...propertyData, geoJSON: boundary };
}

export async function updateProperty(db, propertyId, boundary, propertyData) {
    const propRef = doc(db, "properties", propertyId);
    await updateDoc(propRef, {
        ...propertyData,
        geoJSON: JSON.stringify(boundary),
    });
}

export async function deleteProperty(db, propertyId) {
    await deleteDoc(doc(db, "properties", propertyId));
}

// --- Project & Inquiry Functions ---

export async function createNewInquiryProject(db, user, property, services, involvedProfessionalIds = []) {
    const allInvolved = [...new Set([user.uid, ...involvedProfessionalIds])];

    const projectData = {
        ownerId: user.uid,
        ownerName: user.username,
        propertyId: property.id,
        propertyName: property.name,
        geoJSON: property.geoJSON,
        status: 'inquiry',
        servicesSought: services,
        createdAt: serverTimestamp(),
        involvedUsers: allInvolved
    };
    const projectRef = await addDoc(collection(db, "projects"), projectData);
    return { id: projectRef.id, ...projectData };
}

export async function sendCruiseInquiries(db, inquiries) {
    const batch = writeBatch(db);
    inquiries.forEach(inquiryData => {
        const inquiryRef = doc(collection(db, "inquiries"));
        batch.set(inquiryRef, {
            ...inquiryData,
            status: 'pending',
            createdAt: serverTimestamp()
        });
    });
    await batch.commit();
}

export async function updateInquiryStatus(db, inquiryId, status) {
    await updateDoc(doc(db, "inquiries", inquiryId), { status });
}

export async function updateProject(db, projectId, data) {
    await updateDoc(doc(db, "projects", projectId), data);
}

export async function saveTimberSale(db, saleData) {
    await addDoc(collection(db, "timberSales"), {
        ...saleData,
        postedAt: serverTimestamp(),
        status: 'open'
    });
}

// --- NEW FUNCTION ---
export async function getTimberSaleById(db, saleId) {
    const docRef = doc(db, "timberSales", saleId);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
}


// --- Logbook / Haul Ticket Functions ---

export async function saveHaulTicket(db, ticketData) {
    await addDoc(collection(db, "haulTickets"), {
        ...ticketData,
        createdAt: serverTimestamp()
    });
}

export async function deleteHaulTicket(db, ticketId) {
    await deleteDoc(doc(db, "haulTickets", ticketId));
}

// --- Rate Sheet Functions ---

export async function saveProjectRates(db, projectId, rateSets) {
    const projectRef = doc(db, "projects", projectId);
    await updateDoc(projectRef, { rateSets: rateSets });
}