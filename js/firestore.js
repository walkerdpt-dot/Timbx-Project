// js/firestore.js
import { 
    getFirestore, doc, getDoc, setDoc, updateDoc, collection, getDocs, 
    addDoc, deleteDoc, query, where, serverTimestamp, writeBatch
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
    const q = query(usersRef, where("role", "!=", "landowner"));
    const querySnapshot = await getDocs(q);
    const profiles = [];
    querySnapshot.forEach((doc) => {
        profiles.push({ id: doc.id, ...doc.data() });
    });
    return profiles;
}

export async function saveNewProperty(db, currentUser, geoJSON, propertyData) {
    if (!currentUser || !currentUser.uid) {
        throw new Error("You must be logged in to save a property.");
    }
    const propertyPayload = {
        ...propertyData,
        ownerId: currentUser.uid,
        geoJSON: JSON.stringify(geoJSON),
        createdAt: serverTimestamp()
    };
    const docRef = await addDoc(collection(db, "properties"), propertyPayload);
    return { id: docRef.id, ...propertyPayload, geoJSON: geoJSON };
}

export async function saveTimberSale(db, saleData) {
    if (!saleData.ownerId) {
        throw new Error("Cannot save sale without an owner.");
    }
    
    if (saleData.saleMapGeoJSON && typeof saleData.saleMapGeoJSON === 'object') {
        saleData.saleMapGeoJSON = JSON.stringify(saleData.saleMapGeoJSON);
    }

    const payload = {
        ...saleData,
        createdAt: serverTimestamp(),
        status: 'open'
    };

    const docRef = await addDoc(collection(db, "timberSales"), payload);
    return { id: docRef.id, ...payload };
}


export async function saveNewProject(db, projectData) {
    if (!projectData.ownerId) {
        throw new Error("Cannot save project without an owner.");
    }
    
    const payload = { ...projectData };
    if (payload.geoJSON && typeof payload.geoJSON === 'object') {
        payload.geoJSON = JSON.stringify(payload.geoJSON);
    }
    if (payload.annotations && typeof payload.annotations === 'object') {
        payload.annotations = JSON.stringify(payload.annotations);
    }

    const docRef = await addDoc(collection(db, "projects"), payload);
    return { id: docRef.id, ...projectData };
}

export async function createOrGetInquiryProject(db, currentUser, property, services) {
    const projectsRef = collection(db, 'projects');
    const q = query(projectsRef, 
        where("propertyId", "==", property.id), 
        where("status", "==", "inquiry")
    );

    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
        const existingProjectDoc = querySnapshot.docs[0];
        return { id: existingProjectDoc.id, ...existingProjectDoc.data() };
    }

    const projectData = {
        ownerId: currentUser.uid,
        ownerName: currentUser.username,
        propertyId: property.id,
        propertyName: property.name,
        status: 'inquiry',
        servicesSought: services,
        createdAt: serverTimestamp(),
        geoJSON: property.geoJSON
    };

    const docRef = await addDoc(collection(db, "projects"), projectData);
    return { id: docRef.id, ...projectData };
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

export async function getPropertyById(db, propertyId) {
    const propertyRef = doc(db, "properties", propertyId);
    const docSnap = await getDoc(propertyRef);
    if (docSnap.exists()) {
        const data = docSnap.data();
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

export async function sendCruiseInquiries(db, inquiriesData) {
    const inquiriesRef = collection(db, "inquiries");
    
    const promises = inquiriesData.map(inquiry => {
        const payload = {
            ...inquiry,
            status: 'pending',
            createdAt: serverTimestamp()
        };
        return addDoc(inquiriesRef, payload);
    });

    await Promise.all(promises);
}


export async function fetchInquiriesForUser(db, userId) {
    if (!userId) return [];
    const inquiriesRef = collection(db, "inquiries");
    const q = query(inquiriesRef, where("involvedUsers", "array-contains", userId));
    const querySnapshot = await getDocs(q);
    const inquiries = [];
    querySnapshot.forEach((doc) => {
        inquiries.push({ id: doc.id, ...doc.data() });
    });
    return inquiries;
}

export async function fetchQuotesForProject(db, projectIds, landownerId) {
    if (!projectIds || projectIds.length === 0 ||!landownerId) return [];
    const quotesRef = collection(db, "quotes");
    const q = query(quotesRef, where("projectId", "in", projectIds), where("landownerId", "==", landownerId));
    const querySnapshot = await getDocs(q);
    const quotes = [];
    querySnapshot.forEach((doc) => {
        quotes.push({ id: doc.id, ...doc.data() });
    });
    return quotes;
}

export async function updateInquiryStatus(db, inquiryId, newStatus) {
    const inquiryRef = doc(db, "inquiries", inquiryId);
    await updateDoc(inquiryRef, {
        status: newStatus
    });
}

export async function saveHaulTicket(db, ticketData) {
    const payload = {
        ...ticketData,
        createdAt: serverTimestamp()
    };
    const docRef = await addDoc(collection(db, "haulTickets"), payload);
    return { id: docRef.id, ...payload };
}

export async function fetchHaulTicketsForUser(db, user) {
    if (!user) return [];
    const ticketsRef = collection(db, "haulTickets");
    
    let ticketsQuery;

    switch (user.role) {
        case 'landowner':
            ticketsQuery = query(ticketsRef, where("ownerId", "==", user.uid));
            break;
        case 'timber-buyer': // This is the supplier
            ticketsQuery = query(ticketsRef, where("supplierId", "==", user.uid));
            break;
        case 'logging-contractor': // This is the logger/hauler
            ticketsQuery = query(ticketsRef, where("submitterId", "==", user.uid));
            break;
        default:
            return [];
    }

    const ticketsSnapshot = await getDocs(ticketsQuery);
    return ticketsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}


export async function fetchActiveProjectsForUser(db, user) {
    if (!user) return [];
    const projectsRef = collection(db, "projects");
    let projectsQuery;

    if (user.role === 'timber-buyer' || user.role === 'logging-contractor') {
        projectsQuery = query(projectsRef, 
            where("supplierId", "==", user.uid), 
            where("status", "==", "harvest_in_progress")
        );
    } else {
        return [];
    }

    const querySnapshot = await getDocs(projectsQuery);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function deleteHaulTicket(db, ticketId) {
    if (!ticketId) {
        throw new Error("A ticket ID must be provided to delete.");
    }
    await deleteDoc(doc(db, "haulTickets", ticketId));
}

// --- NEW FUNCTION for saving project rates ---
export async function saveProjectRates(db, projectId, rateSets) {
    if (!projectId) {
        throw new Error("A project ID must be provided.");
    }
    const projectRef = doc(db, "projects", projectId);
    await updateDoc(projectRef, {
        rateSets: rateSets
    });
}