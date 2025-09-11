// js/state.js

// This file holds the global state for the application to avoid circular dependencies.

// --- Firebase State ---
export let db = null;
export let auth = null;
export let app = null; // ADDED: To hold the main Firebase app instance
export const setDb = (database) => { db = database; };
export const setAuth = (ath) => { auth = ath; };
export const setApp = (firebaseApp) => { app = firebaseApp; }; // ADDED: A function to set the app instance

// --- User State ---
export let currentUser = null;
export const setCurrentUser = (user) => { currentUser = user; };

// --- Data State ---
export let allProperties = [];
export let allProjects = [];
export let allProfessionalProfiles = [];
export let allInquiries = [];
export let allTimberSales = []; // NEW: For public marketplace listings
export const setAllProperties = (data) => { allProperties = data; };
export const setAllProjects = (data) => { allProjects = data; };
export const setAllProfessionalProfiles = (data) => { allProfessionalProfiles = data; };
export const setAllInquiries = (data) => { allInquiries = data; };
export const setAllTimberSales = (data) => { allTimberSales = data; }; // NEW 

// --- Map State ---
export let globalMarketplaceLayerGroup = null;
export const setGlobalMarketplaceLayerGroup = (layerGroup) => { globalMarketplaceLayerGroup = layerGroup; };