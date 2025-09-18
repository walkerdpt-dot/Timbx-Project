// js/main.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { firebaseConfig } from './config.js';
import { initializeAuth, handleLogin, handleSignup, handleLogout } from './auth.js';
import { getPropertyById, getProjectsForCurrentUser, getPropertiesForCurrentUser, fetchProfessionalProfiles, fetchTimberSales, fetchInquiriesForUser, updateInquiryStatus, deleteProperty, deleteHaulTicket } from './firestore.js';
import { getMapInstance, initGlobalMap } from './map.js';

import {
    db, auth, currentUser, allProperties,
    setDb, setAuth, setCurrentUser, setApp,
    setAllProperties, setAllProjects, setAllProfessionalProfiles, setAllInquiries, setAllTimberSales,
    setGlobalMarketplaceLayerGroup, globalMarketplaceLayerGroup
} from './state.js';

import * as ui from './ui.js';
import {
    handleSaveProperty, handleSubmitBidOrQuote, handleDeclineInquiry,
    handleUpdateProfile, handleLogLoadSubmit, calculateNetWeight, handleSaveRateSheet,
    getSignupOptionalData, handleSendInquiries, handleAcceptQuote, handleCancelInquiry,
    handleTimberSaleSubmit, handleRetractCruise, handleCompleteProject, handleStartTimberSale,
    handleDeclineProject, handlePostFeedEntry, handleUpdateLoadSubmit
} from './forms.js';

// --- Constants ---
export const FORESTER_SPECIALTIES = [ "Timber Cruising & Appraisal", "Harvest Management", "Reforestation Planning", "Forest Management Plans", "Prescribed Burning" ];
export const BUYER_PRODUCTS = [ "Pine Sawtimber", "Pine Pulpwood", "Hardwood Sawtimber", "Hardwood Pulpwood", "Poles", "Crossties" ];
export const LOGGING_CONTRACTOR_SERVICES = [ "Timber Harvesting", "Log Hauling", "Road Building", "Land Clearing" ];
export const SERVICE_PROVIDER_SERVICES = [ "Mechanical Site Prep", "Chemical Site Prep", "Herbaceous Weed Control", "Prescribed Burning", "Machine Planting", "Hand Planting", "Road & Firelane Maint.", "Material Hauling (Gravel/Dirt)" ];


// --- App Initialization & Routing ---
document.addEventListener('DOMContentLoaded', () => {
    try {
        const app = initializeApp(firebaseConfig);
        setApp(app); 
        const firestoreDb = getFirestore(app);
        setDb(firestoreDb);
        const firebaseAuth = initializeAuth(app, firestoreDb, onUserStatusChange, handleNavigation);
        setAuth(firebaseAuth);
        window.auth = firebaseAuth; 

        attachAllEventListeners();

        window.addEventListener('hashchange', handleNavigation);
         
    } catch (error) {
        console.error("FATAL ERROR during startup:", error);
        alert("A critical error occurred while initializing the application. Please check the console and refresh the page.");
    }
});

export function onUserStatusChange(user) {
    const loadingOverlay = document.getElementById('loading-overlay');
    setCurrentUser(user);
     
    return new Promise(async (resolve) => {
        if (user && user.uid) {
            loadingOverlay.classList.remove('hidden');
            try {
                const projects = await getProjectsForCurrentUser(db, user.uid);
                setAllProjects(projects);

                const propertyIds = [...new Set(projects.map(p => p.propertyId))];
                 
                const propertyPromises = propertyIds.map(id =>
                    getPropertyById(db, id).catch(error => {
                        console.warn(`Could not fetch property ${id}, possibly due to permissions for a pending inquiry.`, error.message);
                        return null;
                    })
                );

                const [propertiesFromProjects, profiles, inquiries, sales] = await Promise.all([
                    Promise.all(propertyPromises),
                    fetchProfessionalProfiles(db),
                    fetchInquiriesForUser(db, user.uid),
                    fetchTimberSales(db)
                ]);
                 
                const allUserProps = new Map();
                propertiesFromProjects.forEach(p => p && allUserProps.set(p.id, p));

                if (user.role === 'landowner') {
                    const ownedProperties = await getPropertiesForCurrentUser(db, user.uid);
                    ownedProperties.forEach(p => p && allUserProps.set(p.id, p));
                }

                setAllProperties(Array.from(allUserProps.values()));
                setAllProfessionalProfiles(profiles);
                setAllInquiries(inquiries || []);
                setAllTimberSales(sales || []);

            } catch (error) {
                console.error("Failed to fetch initial marketplace data:", error);
            } finally {
                loadingOverlay.classList.add('hidden');
            }
        } else {
            setAllProperties([]);
            setAllProjects([]);
            setAllProfessionalProfiles([]);
            setAllInquiries([]);
            setAllTimberSales([]);
        }
        ui.updateLoginUI();
        resolve(); 
    });
}

async function handleNavigation() {
    const hash = window.location.hash || '#home';
    
    const protectedRoutes = ['#dashboard', '#properties', '#my-projects', '#my-inquiries', '#logbook', '#my-profile', '#add-edit-property', '#add-edit-cruise'];
    const currentRoute = hash.split('?')[0];

    if (!currentUser && protectedRoutes.includes(currentRoute)) {
        window.location.hash = '#home';
        return;
    }

    if (currentUser && (currentRoute === '#home' || currentRoute === '')) {
        window.location.hash = '#dashboard';
        return; 
    }

    document.querySelectorAll('.main-section').forEach(sec => sec.classList.add('hidden'));

    const sectionId = currentRoute.substring(1);
    const section = document.getElementById(sectionId);
      
    if (section) {
        section.classList.remove('hidden');
        await renderMainSection(sectionId);
    } else {
        const fallbackSectionId = currentUser ? 'dashboard' : 'home';
        const fallbackSection = document.getElementById(fallbackSectionId);
        if (fallbackSection) {
            fallbackSection.classList.remove('hidden');
            await renderMainSection(fallbackSectionId);
        }
    }
}

async function renderMainSection(sectionId) {
    switch (sectionId) {
        case 'dashboard': 
            await ui.renderDashboard();
            break;
        case 'marketplace':
            let map = getMapInstance('global-map');
            if (!map) {
                map = initGlobalMap();
                if (map) {
                    const newLayerGroup = L.featureGroup().addTo(map);
                    setGlobalMarketplaceLayerGroup(newLayerGroup);
                }
            }
            if (map) {
                map.off('moveend').on('moveend', () => {
                    document.getElementById('search-this-area-btn').classList.remove('hidden');
                });
            }
            setTimeout(() => map?.invalidateSize(), 0);
            ui.updateMapAndList();
            break;
        case 'properties':
            await ui.renderPropertiesForCurrentUser();
            setTimeout(() => getMapInstance('my-properties-map')?.invalidateSize(), 0);
            break;
        case 'add-edit-property':
            const propParams = new URLSearchParams(window.location.hash.split('?')[1]);
            const propertyId = propParams.get('id');
            const propertyToEdit = propertyId ? allProperties.find(p => p.id === propertyId) : null;
            ui.populatePropertyForm(propertyToEdit);
            break;
        case 'add-edit-cruise':
            const cruiseParams = new URLSearchParams(window.location.hash.split('?')[1]);
            const projectId = cruiseParams.get('projectId');
            await ui.populateCruiseFormPage(projectId);
            break;
        case 'my-inquiries':
            await ui.renderInquiriesForCurrentUser();
            break;
        case 'my-projects':
            await ui.renderMyProjects();
            break;
        case 'my-profile':
            ui.renderMyProfile();
            break;
        case 'logbook':
            ui.initializeLogbook();
            break;
    }
}

function attachAllEventListeners() {
    document.querySelectorAll('nav a:not(#user-display)').forEach(link => {
        link.addEventListener('click', (e) => {
            const targetHash = new URL(e.currentTarget.href).hash;
            if (window.location.hash !== targetHash) {
                window.location.hash = targetHash;
            } else {
                handleNavigation();
            }
        });
    });

    document.addEventListener('harvestAreasUpdated', () => {
        if (!document.getElementById('add-edit-cruise').classList.contains('hidden')) {
            ui.updateMapLegend();
            ui.updateInventoryStandDropdowns();
        }
    });

    document.getElementById('login-button')?.addEventListener('click', () => ui.openModal('login-modal'));
    document.getElementById('signup-button')?.addEventListener('click', ui.openSignupModal);
    document.getElementById('logout-button')?.addEventListener('click', () => handleLogout(auth));
    document.getElementById('login-form')?.addEventListener('submit', async (e) => { e.preventDefault(); if (await handleLogin(auth)) ui.closeModal('login-modal'); });
    document.getElementById('signup-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (await handleSignup(auth, db, getSignupOptionalData())) {
            ui.closeModal('signup-modal');
            ui.openModal('login-modal');
        }
    });
    document.getElementById('show-signup-from-login-link')?.addEventListener('click', (e) => { e.preventDefault(); ui.closeModal('login-modal'); ui.openSignupModal(); });
    document.getElementById('show-login-from-signup-link')?.addEventListener('click', (e) => { e.preventDefault(); ui.closeModal('signup-modal'); ui.openModal('login-modal'); });
    document.body.addEventListener('click', (event) => { if (event.target.closest('.close-modal-btn')) { const modal = event.target.closest('.modal-overlay, .full-page-section'); if (modal) ui.closeModal(modal.id); } });
    document.querySelectorAll('[data-demo-role]').forEach(button => button.addEventListener('click', (e) => loginAsDemoUser(e.target.dataset.demoRole)));

    document.getElementById('search-this-area-btn')?.addEventListener('click', () => { ui.updateMapAndList(); document.getElementById('search-this-area-btn').classList.add('hidden'); });
    document.querySelectorAll('#map-filters input[type="checkbox"]').forEach(box => box.addEventListener('change', ui.updateMapAndList));
    ui.setupServiceFilter('filter-foresters', 'filter-forester-services', FORESTER_SPECIALTIES);
    ui.setupServiceFilter('filter-logging-contractors', 'filter-logging-contractor-services', LOGGING_CONTRACTOR_SERVICES);
    ui.setupServiceFilter('filter-service-providers', 'filter-service-provider-services', SERVICE_PROVIDER_SERVICES);

    document.getElementById('property-form')?.addEventListener('submit', handleSaveProperty);
    document.getElementById('submit-quote-form')?.addEventListener('submit', handleSubmitBidOrQuote);
    document.getElementById('decline-form')?.addEventListener('submit', handleDeclineInquiry);
    document.getElementById('edit-profile-form')?.addEventListener('submit', handleUpdateProfile);
    document.getElementById('log-load-form')?.addEventListener('submit', handleLogLoadSubmit);
    document.getElementById('rate-sheet-form')?.addEventListener('submit', handleSaveRateSheet);
    document.getElementById('timber-sale-form')?.addEventListener('submit', handleTimberSaleSubmit);
    document.getElementById('send-invites-btn')?.addEventListener('click', handleSendInquiries);
    document.getElementById('project-feed-form')?.addEventListener('submit', handlePostFeedEntry);
    document.getElementById('edit-load-form')?.addEventListener('submit', handleUpdateLoadSubmit);

    document.getElementById('load-gross-weight')?.addEventListener('input', calculateNetWeight);
    document.getElementById('load-tare-weight')?.addEventListener('input', calculateNetWeight);
    document.getElementById('edit-load-gross-weight')?.addEventListener('input', ui.calculateEditNetWeight);
    document.getElementById('edit-load-tare-weight')?.addEventListener('input', ui.calculateEditNetWeight);

    document.getElementById('signup-role')?.addEventListener('change', (e) => {
        const roleSpecificContainer = document.getElementById('signup-role-specific-container');
        roleSpecificContainer.querySelectorAll('[id^="signup-"][id$="-details"]').forEach(div => div.classList.add('hidden'));
        if (e.target.value && e.target.value !== 'landowner') {
            document.getElementById(`signup-${e.target.value}-details`)?.classList.remove('hidden');
            roleSpecificContainer.classList.remove('hidden');
        } else {
            roleSpecificContainer.classList.add('hidden');
        }
    });
     
    document.getElementById('btn-add-property')?.addEventListener('click', () => {
        window.location.hash = '#add-edit-property';
    });
    document.getElementById('edit-my-profile-button')?.addEventListener('click', ui.openEditProfileModal);

    document.body.addEventListener('click', async (e) => {
        const target = e.target.closest('button, a');
        if (!target) return;

        const { dataset, id, classList } = target;

        if (classList.contains('view-project-feed-btn')) ui.openProjectFeedModal(dataset.projectId);
        else if (classList.contains('edit-load-btn')) ui.openEditLoadModal(dataset.ticketId);
        else if (classList.contains('submit-quote-action-btn')) ui.openForesterQuoteModal(dataset.inquiryId);
        else if (classList.contains('decline-inquiry-btn')) ui.openDeclineModal(dataset.inquiryId);
        else if (classList.contains('view-quotes-btn')) ui.openViewQuotesModal(dataset.projectId);
        else if (classList.contains('accept-quote-btn')) await handleAcceptQuote(dataset.quoteId, dataset.projectId);
        else if (classList.contains('view-inquiry-btn')) ui.openViewInquiryModal(dataset.inquiryId);
        else if (classList.contains('cancel-inquiry-btn')) handleCancelInquiry(dataset.inquiryId);
        else if (classList.contains('decline-project-btn')) handleDeclineProject(dataset.projectId);
        else if (classList.contains('manage-rates-btn')) ui.openRateSheetModal(dataset.projectId);
        else if (classList.contains('submit-cruise-btn')) window.location.hash = `#add-edit-cruise?projectId=${dataset.projectId}`;
        else if (classList.contains('approve-cruise-btn')) window.location.hash = `#add-edit-cruise?projectId=${dataset.projectId}`;
        else if (classList.contains('retract-cruise-btn')) handleRetractCruise(dataset.projectId);
        else if (classList.contains('edit-property-btn')) window.location.hash = `#add-edit-property?id=${dataset.propertyId}`;
        else if (classList.contains('seek-services-btn')) ui.openServiceSelectModal(dataset.propertyId, dataset.propertyName);
        else if (classList.contains('service-category-btn')) {
            const propertyId = target.closest('.modal-content').parentElement.dataset.propertyId;
            const role = dataset.serviceCategory;
            ui.openInviteProfessionalModal(propertyId, role);
        }
        else if (id === 'btn-accept-cruise-report') handleCompleteProject(dataset.projectId);
        else if (id === 'btn-start-timber-sale') handleStartTimberSale(dataset.projectId);
        else if (classList.contains('archive-inquiry-btn')) {
            const confirmed = await ui.showConfirmationModal(
                "Archive Inquiry?",
                "Are you sure you want to archive this inquiry? It will be hidden from your main list."
            );
            if (confirmed) {
                await updateInquiryStatus(db, dataset.inquiryId, 'archived');
                ui.renderInquiriesForCurrentUser();
            }
        } else if (classList.contains('delete-property-btn')) {
            const confirmed = await ui.showConfirmationModal(
                "Delete Property?",
                "Are you sure? This action cannot be undone and will permanently delete the property."
            );
            if (confirmed) {
                await deleteProperty(db, dataset.propertyId);
                await onUserStatusChange(currentUser);
            }
        } else if (classList.contains('delete-load-btn')) {
            const confirmed = await ui.showConfirmationModal(
                "Delete Ticket?",
                "Are you sure you want to permanently delete this haul ticket?"
            );
            if (confirmed) {
                await deleteHaulTicket(db, dataset.ticketId);
                ui.renderMyLoads();
            }
        } else if (classList.contains('more-options-btn')) {
            const dropdown = target.nextElementSibling;
            document.querySelectorAll('.more-options-dropdown').forEach(d => d !== dropdown && d.classList.add('hidden'));
            dropdown.classList.toggle('hidden');
            e.stopPropagation();
        }
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.more-options-container')) {
            document.querySelectorAll('.more-options-dropdown').forEach(d => d.classList.add('hidden'));
        }
    });
}

async function loginAsDemoUser(role) {
    const credentials = {
        'landowner': { email: 'landowner@demo.timbx.com', password: 'demopassword' },
        'timber-buyer': { email: 'timber-buyer@demo.timbx.com', password: 'demopassword' },
        'forester': { email: 'forester@demo.timbx.com', password: 'demopassword' },
        'logging-contractor': { email: 'logging-contractor@demo.timbx.com', password: 'demopassword' },
        'service-provider': { email: 'service-provider@demo.timbx.com', password: 'demopassword' }
    }[role];

    if (!credentials) return;

    try {
        await signInWithEmailAndPassword(auth, credentials.email, credentials.password);
        ui.closeModal('login-modal');
    } catch (error) {
        console.error(`Demo login for ${role} failed:`, error);
        alert(`Could not log in as demo ${role}. Please ensure the account exists.`);
    }
}