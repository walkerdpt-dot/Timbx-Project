// js/state.js

// This file holds the global state for the application to avoid circular dependencies.

// --- Firebase State ---
export let db = null;
export let auth = null;
export let app = null;
export const setDb = (database) => { db = database; };
export const setAuth = (ath) => { auth = ath; };
export const setApp = (firebaseApp) => { app = firebaseApp; };

// --- User State ---
export let currentUser = null;
export const setCurrentUser = (user) => { currentUser = user; };

// --- Data State ---
export let allProperties = [];
export let allProjects = [];
export let allProfessionalProfiles = [];
export let allInquiries = [];
export let allTimberSales = [];
export let allHaulTickets = []; // NEW for real-time logbook
export let allActivities = []; // NEW for dashboard feed

export const setAllProperties = (data) => { allProperties = data; };
export const setAllProjects = (data) => { allProjects = data; };
export const setAllProfessionalProfiles = (data) => { allProfessionalProfiles = data; };
export const setAllInquiries = (data) => { allInquiries = data; };
export const setAllTimberSales = (data) => { allTimberSales = data; };
export const setAllHaulTickets = (data) => { allHaulTickets = data; }; // NEW
export const setAllActivities = (data) => { allActivities = data; }; // NEW

// --- Map State ---
export let globalMarketplaceLayerGroup = null;
export const setGlobalMarketplaceLayerGroup = (layerGroup) => { globalMarketplaceLayerGroup = layerGroup; };

// --- Real-Time Listener State ---
export let activeListeners = [];
export const addActiveListener = (unsubscribe) => {
    activeListeners.push(unsubscribe);
};
export const clearActiveListeners = () => {
    activeListeners.forEach(unsubscribe => unsubscribe());
    activeListeners = [];
};