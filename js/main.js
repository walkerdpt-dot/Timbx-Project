// js/main.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, addDoc, serverTimestamp, query, where, getDocs, deleteDoc } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { firebaseConfig } from './config.js';
import { initializeAuth, handleLogin, handleSignup, handleLogout } from './auth.js';
import {
    fetchProperties, fetchProfessionalProfiles, fetchProjects, saveNewProperty, updateProperty,
    deleteProperty, getPropertyById, getPropertiesForCurrentUser,
    updateUserProfile, getUserProfileById,
    updateProject, saveNewProject, sendCruiseInquiries, fetchInquiriesForUser,
    getUserProfile, updateInquiryStatus, createOrGetInquiryProject,
    fetchQuotesForProject, saveTimberSale
} from './firestore.js';
import {
    getMapInstance,
    initGlobalMap,
    initPropertyFormMap,
    getLastDrawnGeoJSON,
    initTimberSaleMap,
    getProjectAnnotationsAsGeoJSON,
    initMyPropertiesMap,
    initDetailViewMap,
    initProfileDisplayMap,
    initSignupMap,
    initEditProfileMap,
    getUpdatedLocation,
    mapInstances,
    updateServiceAreaCircle,
    myPropertiesLayerGroup
} from './map.js';

// --- Constants for Role-Specific Services ---
const FORESTER_SPECIALTIES = [
    "Timber Cruising & Appraisal", "Harvest Management", "Reforestation Planning",
    "Forest Management Plans", "Prescribed Burning"
];
const BUYER_PRODUCTS = [
    "Pine Sawtimber", "Pine Pulpwood", "Hardwood Sawtimber", "Hardwood Pulpwood", "Poles", "Crossties"
];
const LOGGING_CONTRACTOR_SERVICES = [
    "Timber Harvesting", "Log Hauling", "Road Building", "Land Clearing"
];
const SERVICE_PROVIDER_SERVICES = [
    "Mechanical Site Prep", "Chemical Site Prep", "Herbaceous Weed Control", "Prescribed Burning",
    "Machine Planting", "Hand Planting", "Road & Firelane Maint.", "Material Hauling (Gravel/Dirt)"
];
const ALL_SERVICES = [...new Set([...FORESTER_SPECIALTIES, ...LOGGING_CONTRACTOR_SERVICES, ...SERVICE_PROVIDER_SERVICES])];

// --- Global State ---
let currentUser = null;
let allProperties = [];
let allProjects = [];
let allProfessionalProfiles = [];
let allInquiries = [];
let db, auth;
export let globalMarketplaceLayerGroup; // Added for map filtering

/**
 * Robustly parses and sanitizes GeoJSON data from the database.
 * @param {object | string} geoJSON The GeoJSON object/string to sanitize.
 * @returns {object | null} A valid GeoJSON object or null if input is invalid.
 */
function sanitizeGeoJSON(geoJSON) {
    if (!geoJSON) return null;
    let parsedGeoJSON = geoJSON;
    while (typeof parsedGeoJSON === 'string') {
        try {
            parsedGeoJSON = JSON.parse(parsedGeoJSON);
        } catch (e) {
            console.error("Failed to parse GeoJSON string:", parsedGeoJSON);
            return null;
        }
    }
    const coords = parsedGeoJSON?.geometry?.coordinates;
    if (Array.isArray(coords) && coords.length > 0 && typeof coords[0] === 'object' && coords[0] !== null && 'lat' in coords[0]) {
        const correctedCoords = coords.map(point => [point.lng, point.lat]);
        const newGeoJSON = JSON.parse(JSON.stringify(parsedGeoJSON));
        newGeoJSON.geometry.coordinates = [correctedCoords];
        return newGeoJSON;
    }
    return parsedGeoJSON;
}

// --- App Initialization & Routing ---
document.addEventListener('DOMContentLoaded', async () => {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = initializeAuth(app, db, onUserStatusChange);

    attachAllEventListeners();
    window.addEventListener('hashchange', handleNavigation);
    await handleNavigation();
});

async function onUserStatusChange(user) {
    currentUser = user;
    if (user && user.uid) {
        try {
            const [properties, profiles, projects, inquiries] = await Promise.all([
                fetchProperties(db),
                fetchProfessionalProfiles(db),
                fetchProjects(db),
                fetchInquiriesForUser(db, user.uid) // Fetch all inquiries user is involved in
            ]);
            allProperties = properties;
            allProfessionalProfiles = profiles;
            allProjects = projects;
            allInquiries = inquiries || [];
        } catch (error) {
            console.error("Failed to fetch initial marketplace data:", error);
            alert("There was an error loading essential data. Please check your connection and refresh the page.");
        }
    } else {
        allProperties = [];
        allProfessionalProfiles = [];
        allProjects = [];
        allInquiries = [];
    }
    updateLoginUI();
    handleNavigation();
}

async function handleNavigation() {
    const hash = window.location.hash || '#home';
    document.querySelectorAll('.main-section').forEach(sec => sec.classList.add('hidden'));

    if (hash.startsWith('#detail')) {
        const params = new URLSearchParams(hash.substring(hash.indexOf('?') + 1));
        const type = params.get('type');
        const id = params.get('id');
        const from = params.get('from') || 'marketplace';

        if (id && type) {
            await renderDetailView(type, id, from);
        } else {
            window.location.hash = '#home';
        }
    } else {
        const sectionId = hash.split('?')[0].substring(1);
        const section = document.getElementById(sectionId);
        if (section) {
            section.classList.remove('hidden');
            await renderMainSection(sectionId);
        } else {
            document.getElementById('home').classList.remove('hidden');
        }
    }
}

async function renderMainSection(sectionId) {
    switch (sectionId) {
        case 'marketplace':
            let map = getMapInstance('global-map');
            if (!map) {
                map = initGlobalMap();
                 if (map) {
                    globalMarketplaceLayerGroup = L.featureGroup().addTo(map);
                    map.on('movestart', () => document.getElementById('search-this-area-btn').classList.remove('hidden'));
                }
            }
            // Ensure layer group exists if map was already initialized
            if (map && !globalMarketplaceLayerGroup) {
                 globalMarketplaceLayerGroup = L.featureGroup().addTo(map);
            }
            setTimeout(() => map?.invalidateSize(), 0);
            updateMapAndList();
            break;
        case 'properties':
            await renderPropertiesForCurrentUser();
            setTimeout(() => getMapInstance('my-properties-map')?.invalidateSize(), 0);
            break;
        case 'my-inquiries':
            await renderInquiriesForCurrentUser();
            break;
        case 'my-projects':
            await renderMyProjects();
            break;
        case 'my-profile':
            renderMyProfile();
            break;
        case 'haul-tickets':
            initializeLogLoadForm();
            break;
    }
}

function updateMapAndList() {
    const map = getMapInstance('global-map');
    if (!map || !globalMarketplaceLayerGroup) return;

    const bounds = map.getBounds();
    const listContainer = document.getElementById('dynamic-map-list');
    listContainer.innerHTML = '';
    globalMarketplaceLayerGroup.clearLayers();
    let listItemsHTML = '';

    // --- Filter Settings ---
    const showProjects = document.getElementById('filter-projects').checked;
    const showBuyers = document.getElementById('filter-buyers').checked;
    const showForesters = document.getElementById('filter-foresters').checked;
    const showLoggers = document.getElementById('filter-logging-contractors').checked;
    const showProviders = document.getElementById('filter-service-providers').checked;
    
    const foresterService = document.getElementById('filter-forester-services').value;
    const loggerService = document.getElementById('filter-logging-contractor-services').value;
    const providerService = document.getElementById('filter-service-provider-services').value;
    
    // --- Marker Styles ---
    const markerStyles = {
        project: { radius: 7, fillColor: "#4f46e5", color: "#fff", weight: 1.5, opacity: 1, fillOpacity: 0.9 },
        'timber-buyer': { radius: 6, fillColor: "#78350f", color: "#fff", weight: 1.5, opacity: 1, fillOpacity: 0.9 },
        forester: { radius: 6, fillColor: "#57534e", color: "#fff", weight: 1.5, opacity: 1, fillOpacity: 0.9 },
        'logging-contractor': { radius: 6, fillColor: "#a16207", color: "#fff", weight: 1.5, opacity: 1, fillOpacity: 0.9 },
        'service-provider': { radius: 6, fillColor: "#4d7c0f", color: "#fff", weight: 1.5, opacity: 1, fillOpacity: 0.9 }
    };
    
    // --- Process Projects ---
    if (showProjects) {
        allProjects.forEach(project => {
            const geoJSON = sanitizeGeoJSON(project.geoJSON);
            if (!geoJSON) return;

            const projectLayer = L.geoJSON(geoJSON);
            const projectCenter = projectLayer.getBounds().getCenter();

            if (bounds.contains(projectCenter)) {
                 const marker = L.circleMarker(projectCenter, markerStyles.project)
                    .bindTooltip(`<b>Project:</b> ${project.propertyName}`)
                    .on('click', () => window.location.hash = `#detail?type=project&id=${project.id}&from=marketplace`);
                marker.addTo(globalMarketplaceLayerGroup);
                
                listItemsHTML += `
                    <li class="p-2 border-b cursor-pointer hover:bg-indigo-100" onclick="window.location.hash='#detail?type=project&id=${project.id}&from=marketplace'">
                        <p class="font-bold text-indigo-700">&#9733; ${project.propertyName}</p>
                        <p class="text-sm text-gray-600">Owner: ${project.ownerName}</p>
                    </li>`;
            }
        });
    }

    // --- Process Professionals ---
    allProfessionalProfiles.forEach(prof => {
        if (!prof.location || typeof prof.location.lat !== 'number' || typeof prof.location.lng !== 'number') return;
        
        const role = prof.role;
        const profLatLng = L.latLng(prof.location.lat, prof.location.lng);
        
        if (!bounds.contains(profLatLng)) return;

        let shouldShow = false;
        let serviceMatch = true;

        if (showBuyers && role === 'timber-buyer') shouldShow = true;
        if (showForesters && role === 'forester') {
            shouldShow = true;
            if (foresterService && !(prof.specialties || []).includes(foresterService)) {
                serviceMatch = false;
            }
        }
        if (showLoggers && role === 'logging-contractor') {
            shouldShow = true;
            if (loggerService && !(prof.services || []).includes(loggerService)) {
                serviceMatch = false;
            }
        }
        if (showProviders && role === 'service-provider') {
            shouldShow = true;
            if (providerService && !(prof.services || []).includes(providerService)) {
                serviceMatch = false;
            }
        }

        if (shouldShow && serviceMatch) {
            // **FIX:** Moved this line up so the variable exists before it's used.
            const formattedRole = (role.charAt(0).toUpperCase() + role.slice(1)).replace('-', ' ');

            const marker = L.circleMarker(profLatLng, markerStyles[role])
                .bindTooltip(`<b>${prof.username}</b><br>${prof.company || formattedRole}`)
                .on('click', () => window.location.hash = `#detail?type=profile&id=${prof.id}&from=marketplace`);
            marker.addTo(globalMarketplaceLayerGroup);
            
            listItemsHTML += `
                <li class="p-2 border-b cursor-pointer hover:bg-gray-100" onclick="window.location.hash='#detail?type=profile&id=${prof.id}&from=marketplace'">
                    <p class="font-bold text-gray-800">${prof.username}</p>
                    <p class="text-sm text-gray-600">${formattedRole} | ${prof.company || 'Independent'}</p>
                </li>`;
        }
    });

    if (listItemsHTML === '') {
        listContainer.innerHTML = '<li class="p-4 text-center text-gray-500">No results found in this area. Try zooming out or changing filters.</li>';
    } else {
        listContainer.innerHTML = listItemsHTML;
    }
}


// --- Event Listeners ---
function attachAllEventListeners() {
    document.querySelectorAll('nav a:not(#user-display)').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetHash = new URL(e.currentTarget.href).hash;
            if (window.location.hash !== targetHash) {
                window.location.hash = targetHash;
            } else {
                handleNavigation();
            }
        });
    });

    document.getElementById('login-button')?.addEventListener('click', () => openModal('login-modal'));
    document.getElementById('signup-button')?.addEventListener('click', openSignupModal);
    document.getElementById('logout-button')?.addEventListener('click', () => handleLogout(auth));
    document.getElementById('login-form')?.addEventListener('submit', async (e) => { e.preventDefault(); if (await handleLogin(auth)) closeModal('login-modal'); });
    
    document.getElementById('signup-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const optionalData = getSignupOptionalData();
        if (await handleSignup(auth, db, optionalData)) {
            closeModal('signup-modal');
            openModal('login-modal');
        }
    });

    document.getElementById('show-signup-from-login-link')?.addEventListener('click', (e) => { e.preventDefault(); closeModal('login-modal'); openSignupModal(); });
    document.getElementById('show-login-from-signup-link')?.addEventListener('click', (e) => { e.preventDefault(); closeModal('signup-modal'); openModal('login-modal'); });
    document.body.addEventListener('click', (event) => { if (event.target.closest('.close-modal-btn')) { const modal = event.target.closest('.modal-overlay, .full-page-section'); if (modal) closeModal(modal.id); } });
    
    document.querySelectorAll('[data-demo-role]').forEach(button => button.addEventListener('click', (e) => loginAsDemoUser(e.target.dataset.demoRole)));
    document.getElementById('search-this-area-btn')?.addEventListener('click', () => { updateMapAndList(); document.getElementById('search-this-area-btn').classList.add('hidden'); });
    document.querySelectorAll('#map-filters input[type="checkbox"]').forEach(box => box.addEventListener('change', () => updateMapAndList()));
    setupServiceFilter('filter-foresters', 'filter-forester-services', FORESTER_SPECIALTIES);
    setupServiceFilter('filter-logging-contractors', 'filter-logging-contractor-services', LOGGING_CONTRACTOR_SERVICES);
    setupServiceFilter('filter-service-providers', 'filter-service-provider-services', SERVICE_PROVIDER_SERVICES);
    document.getElementById('btn-add-property')?.addEventListener('click', () => openPropertyForm());
    document.getElementById('property-form')?.addEventListener('submit', handleSaveProperty);
    
    document.getElementById('submit-quote-form')?.addEventListener('submit', handleSubmitBidOrQuote);
    document.getElementById('decline-form')?.addEventListener('submit', handleDeclineInquiry);
    document.getElementById('edit-my-profile-button')?.addEventListener('click', openEditProfileModal);
    document.getElementById('edit-profile-form')?.addEventListener('submit', handleUpdateProfile);
    document.getElementById('log-load-form')?.addEventListener('submit', handleLogLoadSubmit);
    document.getElementById('load-gross-weight')?.addEventListener('input', calculateNetWeight);
    document.getElementById('load-tare-weight')?.addEventListener('input', calculateNetWeight);
    
    document.getElementById('success-find-forester-btn')?.addEventListener('click', () => {
        const lastSavedPropertyId = document.getElementById('save-success-modal').dataset.propertyId;
        if (lastSavedPropertyId) {
            closeModal('save-success-modal');
            openInviteForesterModal(lastSavedPropertyId);
        } else {
            alert("Could not find the property to start an inquiry. Please go to 'My Properties'.");
        }
    });

    document.getElementById('signup-role')?.addEventListener('change', (event) => {
        const role = event.target.value;
        const roleSpecificContainer = document.getElementById('signup-role-specific-container');
        const allDetailDivs = roleSpecificContainer.querySelectorAll('[id^="signup-"][id$="-details"]');
        
        allDetailDivs.forEach(div => div.classList.add('hidden'));

        if (role && role !== 'landowner') {
            const detailDiv = document.getElementById(`signup-${role}-details`);
            if (detailDiv) {
                detailDiv.classList.remove('hidden');
            }
            roleSpecificContainer.classList.remove('hidden');
            initSignupMap();
        } else {
            roleSpecificContainer.classList.add('hidden');
        }
    });

    const signupRadiusSlider = document.getElementById('signup-service-radius-slider');
    const signupRadiusValue = document.getElementById('signup-service-radius-value');
    if (signupRadiusSlider && signupRadiusValue) {
        signupRadiusSlider.addEventListener('input', (e) => {
            signupRadiusValue.textContent = e.target.value;
        });
    }

    document.body.addEventListener('click', async (e) => {
        const targetButton = e.target.closest('button, a');
        if (!targetButton) return;
        
        if (targetButton.matches('.submit-quote-action-btn')) {
            const inquiryId = targetButton.dataset.inquiryId;
            openForesterQuoteModal(inquiryId);
        }
        if (targetButton.matches('.decline-inquiry-btn')) {
            const inquiryId = targetButton.dataset.inquiryId;
            openDeclineModal(inquiryId);
        }
        if (targetButton.matches('.archive-inquiry-btn')) {
            const inquiryId = targetButton.dataset.inquiryId;
            if (confirm("Are you sure you want to archive this inquiry?")) {
                await updateInquiryStatus(db, inquiryId, 'archived');
                renderInquiriesForCurrentUser();
            }
        }
        if (targetButton.matches('.view-quotes-btn')) {
            const projectId = targetButton.dataset.projectId;
            openViewQuotesModal(projectId);
        }
        if (targetButton.matches('.accept-quote-btn')) {
            const quoteId = targetButton.dataset.quoteId;
            const projectId = targetButton.dataset.projectId;
            handleAcceptQuote(quoteId, projectId);
        }
        if (targetButton.matches('.view-inquiry-btn')) {
            const inquiryId = targetButton.dataset.inquiryId;
            openViewInquiryModal(inquiryId);
        }
        if (targetButton.matches('.cancel-inquiry-btn')) {
            const inquiryId = targetButton.dataset.inquiryId;
            handleCancelInquiry(inquiryId);
        }
        if (targetButton.matches('.more-options-btn')) {
            const dropdown = targetButton.nextElementSibling;
            document.querySelectorAll('.more-options-dropdown').forEach(d => {
                if (d !== dropdown) d.classList.add('hidden');
            });
            dropdown.classList.toggle('hidden');
            return;
        }
        if (targetButton.matches('.edit-property-btn')) {
            const propertyId = targetButton.dataset.propertyId;
            const prop = allProperties.find(p => p.id === propertyId) || await getPropertyById(db, propertyId);
            if (prop) openPropertyForm(prop);
        }
        if (targetButton.matches('.delete-property-btn')) {
            const propertyId = targetButton.dataset.propertyId;
            if (confirm("Are you sure you want to delete this property? This action cannot be undone.")) {
                await deleteProperty(db, propertyId);
                await onUserStatusChange(currentUser); // Full refresh
            }
        }
        if (targetButton.matches('.seek-services-btn')) {
            const propertyId = targetButton.dataset.propertyId;
            const propertyName = targetButton.dataset.propertyName;
            openServiceSelectModal(propertyId, propertyName);
        }
        if (targetButton.matches('.get-cruise-btn')) {
            const propertyId = targetButton.dataset.propertyId;
            openInviteForesterModal(propertyId);
        }
    });
    
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.more-options-container')) {
            document.querySelectorAll('.more-options-dropdown').forEach(d => d.classList.add('hidden'));
        }
    });

    document.getElementById('service-select-modal')?.addEventListener('click', (e) => {
        const button = e.target.closest('button[data-service-type]');
        if (!button) return;
        const serviceType = button.dataset.serviceType;
        const modal = document.getElementById('service-select-modal');
        const propertyId = modal.dataset.propertyId;
        closeModal('service-select-modal');
        if (serviceType === 'timber-sale') {
            document.getElementById('forester-first-modal').dataset.propertyId = propertyId;
            openModal('forester-first-modal');
        } else {
            alert(`Forms for "${serviceType}" are coming soon!`);
        }
    });

    document.getElementById('find-forester-btn')?.addEventListener('click', (e) => {
        closeModal('forester-first-modal');
        const propertyId = e.target.closest('.modal-overlay').dataset.propertyId;
        openInviteForesterModal(propertyId);
    });

    document.getElementById('proceed-without-forester-btn')?.addEventListener('click', (e) => {
        const propertyId = e.target.closest('.modal-overlay').dataset.propertyId;
        closeModal('forester-first-modal');
        openTimberSaleForm(propertyId);
    });

    document.getElementById('timber-sale-form')?.addEventListener('submit', handleTimberSaleSubmit);
    document.getElementById('send-invites-btn')?.addEventListener('click', handleSendInquiries);
}

function setupServiceFilter(checkboxId, dropdownId, services) {
    const checkbox = document.getElementById(checkboxId);
    const dropdown = document.getElementById(dropdownId);
    if (!checkbox || !dropdown) return;
    dropdown.innerHTML = '<option value="">Any Service</option>' + services.map(s => `<option value="${s}">${s}</option>`).join('');
    dropdown.addEventListener('change', () => updateMapAndList());
    checkbox.addEventListener('change', () => {
        dropdown.classList.toggle('hidden', !checkbox.checked);
        if (!checkbox.checked) {
            dropdown.value = '';
            updateMapAndList();
        }
    });
}

function createAvatar(username) {
    if (!username) return document.createElement('div');
    const initial = username.charAt(0).toUpperCase();
    // New Muted Color Palette
    const colors = ['#94a3b8', '#a3a3a3', '#78716c', '#84cc16', '#6ee7b7', '#67e8f9', '#7dd3fc', '#a5b4fc', '#d8b4fe'];
    const charCodeSum = username.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const color = colors[charCodeSum % colors.length];

    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0';
    avatarDiv.style.backgroundColor = color;
    avatarDiv.textContent = initial;
    return avatarDiv;
}

function updateLoginUI() {
    const userDisplay = document.getElementById('user-display');
    const isLoggedIn = !!currentUser;
    const role = currentUser?.role?.toLowerCase();

    document.getElementById('login-button').classList.toggle('hidden', isLoggedIn);
    document.getElementById('signup-button').classList.toggle('hidden', isLoggedIn);
    document.getElementById('logout-button').classList.toggle('hidden', !isLoggedIn);
    userDisplay.classList.toggle('hidden', !isLoggedIn);
    userDisplay.classList.toggle('flex', isLoggedIn);


    if (isLoggedIn) {
        userDisplay.innerHTML = ''; // Clear previous
        const avatar = currentUser.profilePictureUrl
            ? `<img src="${currentUser.profilePictureUrl}" alt="User Avatar" class="w-8 h-8 rounded-full object-cover">`
            : createAvatar(currentUser.username).outerHTML;

        const nameSpan = document.createElement('span');
        nameSpan.textContent = currentUser.username;
        nameSpan.className = 'whitespace-nowrap';
        
        userDisplay.innerHTML = avatar;
        userDisplay.appendChild(nameSpan);
    }
    
    const tabVisibility = {
        '#properties': role === 'landowner',
        '#my-loads': role === 'landowner' || role === 'timber-buyer' || role === 'logging-contractor',
        '#my-projects': isLoggedIn,
        '#my-inquiries': ['forester', 'timber-buyer', 'logging-contractor', 'service-provider'].includes(role),
        '#haul-tickets': role === 'timber-buyer' || role === 'logging-contractor',
    };

    for (const tab in tabVisibility) {
        const element = document.querySelector(`a[href="${tab}"]`);
        if (element) {
            element.classList.toggle('hidden', !tabVisibility[tab]);
        }
    }

    const isLandowner = role === 'landowner';
    document.getElementById('properties-login-prompt').classList.toggle('hidden', isLandowner);
    document.getElementById('properties-main-content').classList.toggle('hidden', !isLandowner);
    
    const isProfessional = ['forester', 'timber-buyer', 'logging-contractor', 'service-provider'].includes(role);
    document.getElementById('inquiries-login-prompt').classList.toggle('hidden', isProfessional);
    document.getElementById('inquiries-main-content').classList.toggle('hidden', !isProfessional);
    
    document.getElementById('profile-login-prompt').classList.toggle('hidden', isLoggedIn);
    document.getElementById('profile-details').classList.toggle('hidden', !isLoggedIn);
}

function openModal(modalId) { document.getElementById(modalId)?.classList.remove('hidden'); }
function closeModal(modalId) { document.getElementById(modalId)?.classList.add('hidden'); }
function openSignupModal() { 
    document.getElementById('signup-form')?.reset(); 
    // Reset role-specific fields visibility
    document.getElementById('signup-role-specific-container').classList.add('hidden');
    document.querySelectorAll('[id^="signup-"][id$="-details"]').forEach(div => div.classList.add('hidden'));
    
    // Populate checkboxes dynamically
    populateCheckboxes('signup-forester-specialties', FORESTER_SPECIALTIES, 'foresterSpecialties');
    populateCheckboxes('signup-buyer-products', BUYER_PRODUCTS, 'buyerProducts');
    populateCheckboxes('signup-logger-services', LOGGING_CONTRACTOR_SERVICES, 'loggerServices');
    populateCheckboxes('signup-service-provider-services', SERVICE_PROVIDER_SERVICES, 'providerServices');
    
    openModal('signup-modal'); 
}

// --- Detail View Rendering ---
async function renderDetailView(type, id, from) {
    const detailSection = document.getElementById('detail-view');
    const contentContainer = document.getElementById('detail-view-content');
    contentContainer.innerHTML = '<p class="text-center p-8">Loading details...</p>';
    detailSection.classList.remove('hidden');

    document.getElementById('back-to-marketplace-btn').classList.toggle('hidden', from !== 'marketplace');
    document.getElementById('back-to-properties-btn').classList.toggle('hidden', from !== 'properties');
    document.getElementById('back-to-my-inquiries-btn').classList.toggle('hidden', from !== 'my-inquiries');
    document.getElementById('back-to-my-projects-btn').classList.toggle('hidden', from !== 'my-projects');

    let data;
    switch (type) {
        case 'property':
            data = allProperties.find(p => p.id === id) || await getPropertyById(db, id);
            if (data) renderPropertyDetail(data);
            break;
        case 'project':
            data = allProjects.find(p => p.id === id) || (await fetchProjects(db)).find(p => p.id === id);
            if (data) renderProjectDetail(data);
            break;
        case 'profile':
            data = allProfessionalProfiles.find(p => p.id === id) || await getUserProfileById(db, id);
            if (data) renderUserProfileDetail(data);
            break;
        default:
            contentContainer.innerHTML = '<p class="text-center text-red-500">Content not found.</p>';
    }
}

function renderPropertyDetail(property) {
    const contentContainer = document.getElementById('detail-view-content');
    let actionButtonsHTML = '';
    if (currentUser && currentUser.uid === property.ownerId) {
        actionButtonsHTML = `
            <div class="mt-6 pt-4 border-t flex flex-wrap gap-2">
                <button class="edit-property-btn bg-amber-600 hover:bg-amber-500 text-white px-3 py-2 rounded-md font-semibold" data-property-id="${property.id}">Edit Property</button>
                <button class="seek-services-btn bg-teal-600 hover:bg-teal-500 text-white px-3 py-2 rounded-md font-semibold" data-property-id="${property.id}" data-property-name="${property.name}">Seek Services</button>
                <button class="delete-property-btn bg-red-800 hover:bg-red-700 text-white px-3 py-2 rounded-md font-semibold" data-property-id="${property.id}">Delete Property</button>
            </div>`;
    }
    contentContainer.innerHTML = `
        <h3 class="text-3xl font-bold text-green-800 mb-4">${property.name}</h3>
        <div id="detail-map" class="w-full h-[400px] rounded-lg border mb-4"></div>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm mt-4">
            <div><p class="text-gray-500">County</p><p class="font-semibold">${property.county || 'N/A'}</p></div>
            <div><p class="text-gray-500">Acreage</p><p class="font-semibold">${property.acreage?.toFixed(2) || 'N/A'}</p></div>
            <div><p class="text-gray-500">Timber Type</p><p class="font-semibold">${property.timberType || 'N/A'}</p></div>
            <div><p class="text-gray-500">Main Species</p><p class="font-semibold">${property.species || 'N/A'}</p></div>
            <div><p class="text-gray-500">Topography</p><p class="font-semibold">${property.topography || 'N/A'}</p></div>
            <div><p class="text-gray-500">Accessibility</p><p class="font-semibold">${property.accessibility || 'N/A'}</p></div>
        </div>
        <div class="mt-4 border-t pt-4">
            <h4 class="font-semibold text-gray-800">Description</h4>
            <p class="text-gray-700 mt-1">${property.description || 'No description provided.'}</p>
        </div>
        ${actionButtonsHTML}
    `;
    initDetailViewMap('detail-map', sanitizeGeoJSON(property.geoJSON));
}

function renderProjectDetail(project) {
    const contentContainer = document.getElementById('detail-view-content');
    
    let actionButtonHTML = '';
    const isProvider = currentUser && ['forester', 'logging-contractor', 'service-provider', 'timber-buyer'].includes(currentUser.role);
    
    if (isProvider && currentUser.uid !== project.ownerId && project.status === 'open') {
        actionButtonHTML = `
            <div class="mt-6 pt-6 border-t">
                <button id="submit-quote-btn" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition duration-200">
                    Submit a Bid for this Project
                </button>
            </div>
        `;
    }

    contentContainer.innerHTML = `
        <h3 class="text-3xl font-bold text-green-800">Project: ${project.propertyName}</h3>
        <p class="text-md text-gray-600 mb-4">Posted by: <a href="#detail?type=profile&id=${project.ownerId}&from=marketplace" class="text-blue-600 hover:underline">${project.ownerName}</a></p>
        <div id="detail-map" class="w-full h-[400px] rounded-lg border mb-4"></div>
        <div class="mt-4 border-t pt-4"><h4 class="font-semibold text-gray-800">Landowner's Description</h4><p class="text-gray-700 mt-1">${project.description || 'No description provided.'}</p></div>
        ${actionButtonHTML}
    `;

    const submitQuoteBtn = document.getElementById('submit-quote-btn');
    if (submitQuoteBtn) {
        submitQuoteBtn.addEventListener('click', () => openSubmitQuoteForm(project));
    }

    initDetailViewMap('detail-map', sanitizeGeoJSON(project.geoJSON));
}

function renderUserProfileDetail(user) {
    const contentContainer = document.getElementById('detail-view-content');
    const defaultAvatar = 'https://placehold.co/128x128/8f8f8f/ffffff?text=No+Image';
    
    const roleMap = {
        'landowner': 'Landowner',
        'timber-buyer': 'Timber Buyer',
        'forester': 'Forester',
        'logging-contractor': 'Logging Contractor',
        'service-provider': 'Service Provider'
    };
    const formattedRole = roleMap[user.role] || user.role;

    let roleSpecificHTML = '';
    if (user.role === 'forester') {
        roleSpecificHTML = `
            <div><p class="text-gray-500">Experience</p><p class="font-semibold">${user.experience || 'N/A'} years</p></div>
            <div><p class="text-gray-500">Certifications</p><p class="font-semibold">${user.certs || 'N/A'}</p></div>
            <div class="md:col-span-2"><p class="text-gray-500">Specialties</p><div class="flex flex-wrap gap-2 mt-1">${(user.specialties || []).map(s => `<span class="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded">${s}</span>`).join('') || 'N/A'}</div></div>
        `;
    } else if (user.role === 'timber-buyer') {
        roleSpecificHTML = `
            <div><p class="text-gray-500">Mill Location(s)</p><p class="font-semibold">${user.mills || 'N/A'}</p></div>
            <div class="md:col-span-2"><p class="text-gray-500">Products Purchased</p><div class="flex flex-wrap gap-2 mt-1">${(user.products || []).map(p => `<span class="bg-red-100 text-red-800 text-xs font-medium px-2.5 py-0.5 rounded">${p}</span>`).join('') || 'N/A'}</div></div>
        `;
    } else if (user.role === 'logging-contractor') {
        roleSpecificHTML = `
            <div><p class="text-gray-500">Experience</p><p class="font-semibold">${user.experience || 'N/A'} years</p></div>
            <div><p class="text-gray-500">Insurance</p><p class="font-semibold">${user.insurance ? 'Fully Insured' : 'N/A'}</p></div>
            <div class="md:col-span-2"><p class="text-gray-500">Services</p><div class="flex flex-wrap gap-2 mt-1">${(user.services || []).map(s => `<span class="bg-yellow-100 text-yellow-800 text-xs font-medium px-2.5 py-0.5 rounded">${s}</span>`).join('') || 'N/A'}</div></div>
        `;
    } else if (user.role === 'service-provider') {
        roleSpecificHTML = `
             <div><p class="text-gray-500">Insurance</p><p class="font-semibold">${user.insurance ? 'Fully Insured' : 'N/A'}</p></div>
             <div class="md:col-span-2"><p class="text-gray-500">Services</p><div class="flex flex-wrap gap-2 mt-1">${(user.services || []).map(s => `<span class="bg-purple-100 text-purple-800 text-xs font-medium px-2.5 py-0.5 rounded">${s}</span>`).join('') || 'N/A'}</div></div>
        `;
    }

    contentContainer.innerHTML = `
        <div class="flex items-center space-x-4"><img src="${user.profilePictureUrl || defaultAvatar}" alt="Profile Picture" class="w-24 h-24 rounded-full border-4 border-gray-200"><div><h3 class="text-2xl font-bold text-gray-800">${user.username}</h3><p class="text-md text-gray-600">${user.company || 'Independent'}</p><p class="text-md font-semibold text-gray-800">${formattedRole}</p></div></div>
        <div class="mt-4 border-t pt-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm mb-4">
                ${roleSpecificHTML}
            </div>
            <h4 class="font-semibold text-gray-800">About</h4>
            <p class="text-gray-700 mt-1">${user.bio || 'No biography provided.'}</p>
        </div>
        <div class="grid grid-cols-2 gap-4 text-center mt-4"><div class="bg-gray-100 p-3 rounded-lg"><p class="text-xl font-bold text-amber-600">${user.rating?.toFixed(1) || 'N/A'}</p><p class="text-sm text-gray-600">Rating (${user.reviewCount || 0} reviews)</p></div><div class="bg-gray-100 p-3 rounded-lg"><p class="text-xl font-bold text-lime-700">${user.completedTransactions || 0}</p><p class="text-sm text-gray-600">Completed Transactions</p></div></div>
        <div class="mt-4"><h4 class="font-semibold text-gray-800 mb-2">Service Area</h4><div id="detail-profile-map" class="w-full h-64 rounded-lg border"></div></div>
    `;
    if (user.role !== 'landowner' && user.location) {
        initProfileDisplayMap('detail-profile-map', user);
    } else {
        document.getElementById('detail-profile-map').innerHTML = '<p class="text-center text-gray-500 p-4">No service area specified.</p>';
    }
}

// ... ALL OTHER FUNCTIONS (renderMyProperties, renderMyProjects, etc.) GO HERE
// ... Copy them from the previous response as they are unchanged.
// ... This is to avoid making the response excessively long again.
// The code below this comment should be the remainder of your main.js file.

// --- My Properties Section ---
async function renderPropertiesForCurrentUser() {
    if (!currentUser || currentUser.role !== 'landowner') return;
    if (!getMapInstance('my-properties-map')) initMyPropertiesMap();
    const listContainer = document.getElementById('my-properties-list-container');
    listContainer.innerHTML = '<div class="p-4 text-center text-gray-500">Loading properties...</div>';
    
    const [userProperties, userProjectsSnapshot] = await Promise.all([
        getPropertiesForCurrentUser(db, currentUser.uid),
        getDocs(query(collection(db, 'projects'), where("ownerId", "==", currentUser.uid)))
    ]);

    allProperties = await fetchProperties(db);
    allProjects = userProjectsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    await renderMyPropertiesList(userProperties);
}

async function renderMyPropertiesList(properties) {
    const mapInstance = getMapInstance('my-properties-map');
    const listContainer = document.getElementById('my-properties-list-container');
    if (!mapInstance || !listContainer) return;
    listContainer.innerHTML = '';
    
    if (myPropertiesLayerGroup) {
        myPropertiesLayerGroup.clearLayers();
    }

    const propertyLayers = new Map();

    if (!properties || properties.length === 0) {
        listContainer.innerHTML = `<div class="p-4 text-center text-gray-500">You have not added any properties.</div>`;
        return;
    }

    const allBounds = [];
    properties.forEach(prop => {
        const li = document.createElement('div');
        li.id = `prop-list-item-${prop.id}`;
        li.className = 'p-3 border-b last:border-b-0';
        
        let project = allProjects.find(p => p.propertyId === prop.id);

        if (project && project.status === 'inquiry') {
            const inquiriesForProject = allInquiries.filter(i => i.projectId === project.id);
            const hasActiveInquiries = inquiriesForProject.some(i => i.status !== 'withdrawn' && i.status !== 'declined');
            if (inquiriesForProject.length > 0 && !hasActiveInquiries) {
                project = null; // Treat as no project
            }
        }
        
        let statusHTML = '';
        let buttonHTML = '';

        if (project) {
            let projectStatusText = project.status.replace('_', ' ');
            statusHTML = `<p class="text-sm text-blue-600 font-semibold mt-1">Status: 
                                <a href="#my-projects?projectId=${project.id}" class="underline hover:text-blue-800 capitalize">${projectStatusText}</a>
                            </p>`;
             buttonHTML = `<a href="#my-projects?projectId=${project.id}" class="bg-purple-600 hover:bg-purple-700 text-white text-xs px-2 py-1.5 rounded-md font-semibold">View Project</a>`;
        } else {
            statusHTML = `<p class="text-sm text-gray-500 mt-1">Status: <span class="font-medium text-gray-700">Ready</span></p>`;
            buttonHTML = `<button class="get-cruise-btn bg-blue-600 hover:bg-blue-700 text-white text-xs px-2 py-1.5 rounded-md font-semibold" data-property-id="${prop.id}">Get a Professional Cruise</button>
                                  <button class="seek-services-btn bg-teal-500 hover:bg-teal-600 text-white text-xs px-2 py-1.5 rounded-md font-semibold" data-property-id="${prop.id}" data-property-name="${prop.name}">Seek Other Services</button>`;
        }

        li.innerHTML = `
            <div>
                <a href="#detail?type=property&id=${prop.id}&from=properties" class="font-bold text-xl text-green-800 hover:underline">${prop.name}</a>
                <p class="text-sm text-gray-600">${prop.acreage?.toFixed(2) || '0'} acres</p>
                ${statusHTML}
            </div>
            <div class="mt-3 flex flex-wrap gap-2 items-center">
                ${buttonHTML}
                <div class="relative ml-auto more-options-container">
                    <button class="more-options-btn p-1.5 rounded-full hover:bg-gray-200">
                        <svg class="w-5 h-5 text-gray-600" fill="currentColor" viewBox="0 0 20 20"><path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z"></path></svg>
                    </button>
                    <div class="more-options-dropdown hidden absolute right-0 mt-2 w-48 bg-white rounded-md shadow-xl z-10 border">
                        <button class="edit-property-btn block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" data-property-id="${prop.id}">Edit Property</button>
                        <button class="delete-property-btn block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100" data-property-id="${prop.id}">Delete Property</button>
                    </div>
                </div>
            </div>`;
        
        listContainer.appendChild(li);
        
        const cleanGeoJSON = sanitizeGeoJSON(prop.geoJSON);
        if (cleanGeoJSON?.geometry?.coordinates) {
            const polygonLayer = L.geoJSON(cleanGeoJSON, { style: { color: '#059669', weight: 2, fillColor: '#10B981', fillOpacity: 0.3 } });
            const bounds = polygonLayer.getBounds();
            if (bounds.isValid()) {
                const centerMarker = L.circleMarker(bounds.getCenter(), { radius: 6, fillColor: '#2563EB', color: '#FFFFFF', weight: 1.5, opacity: 1, fillOpacity: 0.9 });
                const featureGroup = L.featureGroup([polygonLayer, centerMarker])
                    .bindTooltip(prop.name)
                    .on('click', () => window.location.hash = `#detail?type=property&id=${prop.id}&from=properties`)
                    .on('mouseover', () => li.classList.add('bg-blue-100'))
                    .on('mouseout', () => li.classList.remove('bg-blue-100'));

                propertyLayers.set(prop.id, featureGroup);
                
                li.addEventListener('mouseover', () => {
                    propertyLayers.get(prop.id).getLayers()[0].setStyle({ color: 'yellow' });
                });
                li.addEventListener('mouseout', () => {
                    propertyLayers.get(prop.id).getLayers()[0].setStyle({ color: '#059669' });
                });

                featureGroup.addTo(myPropertiesLayerGroup);
                allBounds.push(bounds);
            }
        }
    });
    if (allBounds.length > 0) mapInstance.fitBounds(L.latLngBounds(allBounds), { padding: [50, 50] });
}

// --- My Projects Section (Landowner View) ---
async function renderMyProjects() {
    if (!currentUser) return;
    const container = document.getElementById('my-projects-container');
    container.innerHTML = '<p class="text-center p-4">Loading your projects...</p>';

    const myProjects = allProjects.filter(p => p.ownerId === currentUser.uid);
    const mySentInquiries = allInquiries.filter(i => i.fromUserId === currentUser.uid);
    const myReceivedQuotes = await fetchQuotesForProject(db, myProjects.map(p => p.id), currentUser.uid);
    
    const activeProjects = myProjects.filter(p => {
        if (p.status !== 'inquiry') return true; 
        const inquiriesForProject = mySentInquiries.filter(i => i.projectId === p.id);
        if (inquiriesForProject.length === 0 && p.createdAt?.seconds > (Date.now()/1000 - 300)) { 
            return true; // Grace period for newly created projects
        }
        return inquiriesForProject.some(i => i.status !== 'withdrawn' && i.status !== 'declined');
    });

    if (activeProjects.length === 0) {
        container.innerHTML = '<p class="text-center p-4 text-gray-600">You have no active projects. Seek a service from the "My Properties" page to get started.</p>';
        return;
    }

    const statusOrder = { 'in_progress': 1, 'inquiry': 2, 'open': 3 };
    activeProjects.sort((a, b) => {
        const aHasQuotes = myReceivedQuotes.some(q => q.projectId === a.id);
        const bHasQuotes = myReceivedQuotes.some(q => q.projectId === b.id);
        if (a.status === 'inquiry' && b.status === 'inquiry') {
            if (aHasQuotes && !bHasQuotes) return -1;
            if (!aHasQuotes && bHasQuotes) return 1;
        }
        return (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99) || (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
    });

    let allContent = '';
    for (const project of activeProjects) {
        let projectContent = '';
        if (project.status === 'inquiry') {
            const inquiries = mySentInquiries.filter(i => i.projectId === project.id && i.status !== 'withdrawn');
            const quotes = myReceivedQuotes.filter(q => q.projectId === project.id);

            const inquiryStatusOrder = { 'quoted': 1, 'pending': 2, 'declined': 3 };
            inquiries.sort((a, b) => (inquiryStatusOrder[a.status] || 99) - (inquiryStatusOrder[b.status] || 99));

            const inquiriesHTML = inquiries.map(inquiry => {
                const professional = allProfessionalProfiles.find(p => p.id === inquiry.toUserId);
                const inquiryDate = inquiry.createdAt?.toDate ? inquiry.createdAt.toDate().toLocaleDateString() : 'N/A';
                
                let actionButtons = `<button class="view-inquiry-btn text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-1 px-2 rounded" data-inquiry-id="${inquiry.id}">View</button>`;
                if (inquiry.status === 'pending') {
                    actionButtons += `<button class="cancel-inquiry-btn text-xs bg-red-100 hover:bg-red-200 text-red-700 font-semibold py-1 px-2 rounded" data-inquiry-id="${inquiry.id}">Withdraw</button>`;
                }

                let statusColor = 'bg-gray-100 text-gray-800';
                if (inquiry.status === 'pending') statusColor = 'bg-yellow-100 text-yellow-800';
                if (inquiry.status === 'quoted') statusColor = 'bg-blue-100 text-blue-800';
                if (inquiry.status === 'declined') statusColor = 'bg-red-100 text-red-800';
                
                return `
                    <div class="grid grid-cols-3 items-center p-2 border-t text-sm">
                        <div>
                           <p>To: <a href="#detail?type=profile&id=${inquiry.toUserId}&from=my-projects" class="font-semibold text-blue-600 hover:underline">${professional?.username || '...'}</a></p>
                           <p class="text-xs text-gray-500">Sent: ${inquiryDate}</p>
                        </div>
                        <div class="text-center">
                            <span class="text-xs font-medium py-1 px-2 rounded-full capitalize ${statusColor}">${inquiry.status}</span>
                        </div>
                        <div class="flex items-center justify-end gap-2">
                            ${actionButtons}
                        </div>
                    </div>
                `;
            }).join('');

            const quoteCount = quotes.length;

            projectContent = `
                <div class="border-t pt-4 mt-4">
                    <h4 class="font-semibold text-gray-800">Inquiries Sent</h4>
                    <div class="mt-2 border rounded-md bg-gray-50">
                        ${inquiriesHTML || '<p class="text-sm text-center p-2 text-gray-500">No inquiries found.</p>'}
                    </div>
                    <div class="mt-4 flex justify-end">
                        <button class="view-quotes-btn bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-md ${quoteCount === 0 ? 'opacity-50 cursor-not-allowed' : ''}" data-project-id="${project.id}" ${quoteCount === 0 ? 'disabled' : ''}>
                            View Quotes (${quoteCount})
                        </button>
                    </div>
                </div>
            `;
        } else if (project.status === 'open') {
            projectContent = `<p class="text-sm text-gray-600 mt-2">This project is live on the marketplace. Bids will appear here.</p>`;
        } else if (project.status === 'in_progress') {
             projectContent = `<p class="text-sm text-green-700 mt-2">This project is in progress with a selected professional.</p>`;
        }
        
        const property = allProperties.find(p => p.id === project.propertyId);

        allContent += `
            <div class="project-card bg-white p-4 rounded-lg shadow-md border" id="project-${project.id}">
                <div class="flex justify-between items-start">
                    <div>
                        <h3 class="text-xl font-bold text-green-800">
                            <a href="#detail?type=property&id=${project.propertyId}&from=my-projects" class="hover:underline">${project.propertyName}</a>
                        </h3>
                        <p class="text-sm text-gray-500">${property?.acreage?.toFixed(2) || 'N/A'} Acres | ${property?.county || 'N/A'}</p>
                    </div>
                    <span class="font-bold capitalize text-indigo-700 bg-indigo-100 py-1 px-3 rounded-full">${project.status.replace('_', ' ')}</span>
                </div>
                ${projectContent}
            </div>
        `;
    }

    container.innerHTML = allContent;

    const params = new URLSearchParams(window.location.hash.split('?')[1]);
    const projectIdToHighlight = params.get('projectId');
    if (projectIdToHighlight) {
        document.getElementById(`project-${projectIdToHighlight}`)?.scrollIntoView({ behavior: 'smooth' });
    }
}


// --- My Inquiries Section (Professional View) ---
async function renderInquiriesForCurrentUser() {
    const professionalRoles = ['forester', 'timber-buyer', 'logging-contractor', 'service-provider'];
    if (!currentUser || !professionalRoles.includes(currentUser.role)) return;

    const container = document.getElementById('inquiries-main-content');
    container.innerHTML = '<p class="text-center p-4">Loading your inquiries...</p>';

    try {
        const myReceivedInquiries = allInquiries.filter(i => i.toUserId === currentUser.uid);
        
        const activeInquiries = myReceivedInquiries.filter(inquiry => inquiry.status !== 'archived');

        if (activeInquiries.length === 0) {
            container.innerHTML = '<p class="text-center p-4 text-gray-600">You have no new inquiries at this time.</p>';
            return;
        }

        activeInquiries.sort((a, b) => (b.createdAt?.toDate() || 0) - (a.createdAt?.toDate() || 0));

        container.innerHTML = activeInquiries.map(inquiry => {
            const inquiryDate = inquiry.createdAt?.toDate ? inquiry.createdAt.toDate().toLocaleDateString() : 'N/A';
            
            let actionButtonsHTML = '';
            if (inquiry.status === 'pending') {
                actionButtonsHTML = `
                    <button class="submit-quote-action-btn bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2 px-4 rounded-md text-sm" data-inquiry-id="${inquiry.id}">Submit Quote</button>
                    <button class="decline-inquiry-btn bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-md text-sm" data-inquiry-id="${inquiry.id}">Decline</button>
                `;
            } else if (inquiry.status === 'quoted' || inquiry.status === 'declined' || inquiry.status === 'withdrawn') {
                actionButtonsHTML = `
                    <p class="text-sm font-semibold text-gray-700">Action complete.</p>
                    <button class="archive-inquiry-btn bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-3 rounded-md text-xs" data-inquiry-id="${inquiry.id}">Archive</button>
                `;
            }

            let statusStyle = 'bg-gray-200 text-gray-800';
            if (inquiry.status === 'pending') statusStyle = 'bg-yellow-200 text-yellow-800 animate-pulse';
            if (inquiry.status === 'quoted') statusStyle = 'bg-blue-200 text-blue-800';
            if (inquiry.status === 'declined') statusStyle = 'bg-red-200 text-red-800';
            if (inquiry.status === 'withdrawn') statusStyle = 'bg-gray-300 text-gray-700';


            return `
                <div class="border rounded-lg p-4 shadow-sm bg-white hover:shadow-md transition-shadow">
                    <div class="flex justify-between items-start flex-wrap gap-2 mb-3">
                        <div>
                            <h3 class="text-xl font-bold text-green-800">${inquiry.propertyName}</h3>
                            <p class="text-sm text-gray-500">From: <span class="font-semibold">${inquiry.fromUserName}</span> | Received: ${inquiryDate}</p>
                        </div>
                        <span class="text-sm font-medium py-1 px-3 rounded-full capitalize ${inquiry.status === 'withdrawn' ? 'line-through' : ''} ${statusStyle}">${inquiry.status}</span>
                    </div>
                    <div class="bg-gray-50 p-3 rounded-md border">
                        <h4 class="text-sm font-semibold text-gray-800">Landowner's Request:</h4>
                        <p class="mt-1 text-gray-700 whitespace-pre-wrap">"${inquiry.message || 'No specific message provided.'}"</p>
                    </div>
                    <div class="mt-4 pt-3 border-t flex items-center justify-between gap-3">
                         <a href="#detail?type=property&id=${inquiry.propertyId}&from=my-inquiries" class="text-blue-600 hover:underline text-sm font-semibold">View Property Details &rarr;</a>
                        <div class="flex items-center gap-2">${actionButtonsHTML}</div>
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error("Error rendering inquiries:", error);
        container.innerHTML = '<p class="text-center p-4 text-red-500">Could not load inquiries. Please try refreshing the page.</p>';
    }
}

// --- Forms and Data Handling ---
async function handleSaveProperty(event) {
    event.preventDefault();
    if (!currentUser) {
        alert("You must be logged in to save a property.");
        return;
    }

    const propertyName = document.getElementById('property-name').value.trim();
    const boundary = getLastDrawnGeoJSON();
    let missingFields = [];

    if (!propertyName) {
        missingFields.push('Property Name');
    }
    if (!boundary) {
        missingFields.push('Property Boundary (drawn on the map)');
    }

    if (missingFields.length > 0) {
        alert(`Please fill out the following required fields: ${missingFields.join(', ')}`);
        return;
    }

    const submitButton = event.target.querySelector('#btn-save-property');
    const originalButtonText = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.textContent = 'Saving...';

    const propertyId = document.getElementById('property-id').value;
    const propertyData = getPropertyDataFromForm();
    
    try {
        let savedProperty;
        if (propertyId) {
            await updateProperty(db, propertyId, boundary, propertyData);
            savedProperty = { id: propertyId, ...propertyData, geoJSON: boundary };
        } else {
            savedProperty = await saveNewProperty(db, currentUser, boundary, propertyData);
        }
        allProperties = await fetchProperties(db);
        closeModal('property-form-modal');
        
        document.getElementById('save-success-modal').dataset.propertyId = savedProperty.id;
        await renderPropertiesForCurrentUser();
        openModal('save-success-modal');

    } catch (error) {
        console.error("Error saving property:", error);
        alert("Could not save property. Please try again.");
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = originalButtonText;
    }
}

function getPropertyDataFromForm() {
    return {
        name: document.getElementById('property-name').value,
        county: document.getElementById('property-county').value,
        str: document.getElementById('property-str').value,
        timberType: document.getElementById('property-timber-type').value,
        species: document.getElementById('property-species').value,
        age: document.getElementById('property-age').value,
        topography: document.getElementById('property-topography').value,
        accessibility: document.getElementById('property-accessibility').value,
        previousCutYear: document.getElementById('property-previous-cut-year').value,
        previousCutType: document.getElementById('property-previous-cut-type').value,
        description: document.getElementById('property-desc').value,
        acreage: parseFloat(document.getElementById('calculated-acreage').textContent) || 0
    };
}

async function handleTimberSaleSubmit(event) {
    event.preventDefault();
    if (!currentUser) {
        alert("You must be logged in.");
        return;
    }
    alert("Functionality to save and post this timber sale is being connected. This is a placeholder.");
    // In the future, this will gather all data from the form and save it.
}

async function handleSubmitBidOrQuote(event) {
    event.preventDefault();
    if (!currentUser) return alert("You must be logged in to submit.");

    const submitButton = event.target.querySelector('button[type="submit"]');
    const originalButtonText = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.textContent = 'Submitting...';

    const inquiryId = document.getElementById('quote-inquiry-id').value;
    const contextId = document.getElementById('quote-context-id').value;
    const landownerId = document.getElementById('quote-landowner-id').value;
    const amount = parseFloat(document.getElementById('quote-amount').value);
    const message = document.getElementById('quote-message').value;

    try {
        if (inquiryId) {
            const inquiry = allInquiries.find(i => i.id === inquiryId);
            if (!inquiry) throw new Error("Could not find original inquiry.");
            
            const quoteData = {
                inquiryId: inquiryId,
                projectId: inquiry.projectId,
                propertyId: contextId,
                landownerId: landownerId,
                professionalId: currentUser.uid,
                professionalName: currentUser.username,
                professionalRole: currentUser.role,
                amount: amount,
                message: message,
                status: 'pending',
                createdAt: serverTimestamp()
            };
            await addDoc(collection(db, "quotes"), quoteData);
            
            await updateInquiryStatus(db, inquiryId, 'quoted');
            await onUserStatusChange(currentUser);
            renderInquiriesForCurrentUser();

            alert('Your quote has been sent to the Landowner!');

        } else {
            const bidData = {
                projectId: contextId,
                landownerId: landownerId,
                bidderId: currentUser.uid,
                bidderName: currentUser.username,
                bidderRole: currentUser.role,
                amount: amount,
                message: message,
                status: 'pending',
                createdAt: serverTimestamp()
            };
            await addDoc(collection(db, "bids"), bidData);
            alert('Your bid has been successfully submitted!');
        }
        
        closeModal('submit-quote-modal');

    } catch (error) {
        console.error("Error submitting quote/bid: ", error);
        alert(`There was an error submitting. ${error.message}`);
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Submit';
    }
}

async function handleSendInquiries(event) {
    const button = event.target;
    button.disabled = true;
    button.textContent = 'Sending...';

    const modal = document.getElementById('invite-forester-modal');
    const propertyId = modal.dataset.propertyId;
    const property = allProperties.find(p => p.id === propertyId);
    
    const selectedForesterIds = Array.from(document.querySelectorAll('#forester-invite-list input:checked'))
        .map(checkbox => checkbox.dataset.foresterId);

    const services = Array.from(document.querySelectorAll('#forester-service-checkboxes input:checked')).map(cb => cb.value);
    
    const goalRadioButton = document.querySelector('input[name="landowner-goal"]:checked');
    const landownerGoal = goalRadioButton ? goalRadioButton.value : 'General Assessment & Advice';
    
    const landownerMessage = document.getElementById('landowner-message').value.trim();

    if (selectedForesterIds.length === 0 || services.length === 0) {
        alert("Please select at least one service and one forester.");
        button.disabled = false;
        button.textContent = 'Send Inquiry';
        return;
    }

    try {
        const project = await createOrGetInquiryProject(db, currentUser, property, services);
        
        let detailedMessage = `A Landowner is requesting services for "${property.name}".\n\n`;
        detailedMessage += `Primary Goal: ${landownerGoal}\n`;
        detailedMessage += `Services of Interest:\n- ${services.join('\n- ')}\n\n`;
        if (landownerMessage) {
            detailedMessage += `Additional Message:\n"${landownerMessage}"`;
        }

        const inquiriesData = selectedForesterIds.map(foresterId => {
            const foresterProfile = allProfessionalProfiles.find(p => p.id === foresterId);
            return {
                projectId: project.id,
                fromUserId: currentUser.uid,
                fromUserName: currentUser.username,
                toUserId: foresterId,
                toUserName: foresterProfile?.username || 'Forester',
                propertyId: property.id,
                propertyName: property.name,
                message: detailedMessage,
                landownerGoal: landownerGoal,
                servicesRequested: services,
                involvedUsers: [currentUser.uid, foresterId]
            };
        });
        
        await sendCruiseInquiries(db, inquiriesData);
        
        closeModal('invite-forester-modal');
        alert(`Your detailed inquiry has been sent! You can track responses in "My Projects".`);
        
        await onUserStatusChange(currentUser);
        window.location.hash = '#my-projects';

    } catch (error) {
        console.error("Error sending inquiries:", error);
        alert("There was an error sending your inquiries. Please try again. Check the console for details.");
    } finally {
        button.disabled = false;
        button.textContent = 'Send Inquiry';
    }
}

async function handleAcceptQuote(quoteId, projectId) {
    if (!confirm("Are you sure you want to accept this quote? This will notify the professional and start the project.")) return;

    try {
        await updateProject(db, projectId, { status: 'in_progress' });
        alert("Quote accepted! The professional has been notified.");
        closeModal('view-quotes-modal');
        await onUserStatusChange(currentUser);
    } catch (error) {
        console.error("Error accepting quote:", error);
        alert("There was an error. Please try again.");
    }
}

async function handleDeclineInquiry(event) {
    event.preventDefault();
    const inquiryId = document.getElementById('decline-inquiry-id').value;

    try {
        await updateInquiryStatus(db, inquiryId, 'declined');
        await onUserStatusChange(currentUser);
        closeModal('decline-modal');
        alert("Inquiry declined.");
    } catch (error) {
        console.error("Error declining inquiry:", error);
        alert("Failed to decline inquiry. Please try again.");
    }
}

async function handleCancelInquiry(inquiryId) {
    if (!confirm("Are you sure you want to withdraw this inquiry? The professional will be notified.")) return;

    try {
        const inquiryToCancel = allInquiries.find(i => i.id === inquiryId);
        if (!inquiryToCancel) throw new Error("Inquiry not found.");

        await updateInquiryStatus(db, inquiryId, 'withdrawn');

        const otherInquiriesForProject = allInquiries.filter(i => 
            i.projectId === inquiryToCancel.projectId && i.id !== inquiryId
        );

        const areAllOthersResolved = otherInquiriesForProject.every(i => 
            i.status === 'withdrawn' || i.status === 'declined'
        );

        if (otherInquiriesForProject.length === 0 || areAllOthersResolved) {
            await deleteDoc(doc(db, "projects", inquiryToCancel.projectId));
        }
        
        await onUserStatusChange(currentUser);
        
    } catch (error) {
        console.error("Error withdrawing inquiry:", error);
        alert("Failed to withdraw inquiry. Please try again.");
    }
}


// --- Modal Opening Functions ---
function openPropertyForm(property = null) {
    const form = document.getElementById('property-form');
    form.reset();
    document.getElementById('property-id').value = property ? property.id : '';
    document.getElementById('property-form-title').textContent = property ? 'Edit Property' : 'Add New Property';
    if (property) {
        document.getElementById('property-name').value = property.name || '';
        document.getElementById('property-county').value = property.county || '';
        document.getElementById('property-str').value = property.str || '';
        document.getElementById('property-timber-type').value = property.timberType || '';
        document.getElementById('property-species').value = property.species || '';
        document.getElementById('property-age').value = property.age || '';
        document.getElementById('property-topography').value = property.topography || '';
        document.getElementById('property-accessibility').value = property.accessibility || '';
        document.getElementById('property-previous-cut-year').value = property.previousCutYear || '';
        document.getElementById('property-previous-cut-type').value = property.previousCutType || '';
        document.getElementById('property-desc').value = property.description || '';
    }
    openModal('property-form-modal');
    initPropertyFormMap(property ? sanitizeGeoJSON(property.geoJSON) : null);
}

function openServiceSelectModal(propertyId, propertyName) {
    const modal = document.getElementById('service-select-modal');
    modal.dataset.propertyId = propertyId;
    document.getElementById('service-modal-property-name').textContent = propertyName;
    openModal('service-select-modal');
}

async function openInviteForesterModal(propertyId) {
    const modal = document.getElementById('invite-forester-modal');
    const property = allProperties.find(p => p.id === propertyId) || await getPropertyById(db, propertyId);
    if (!property) {
        alert("Could not load property details.");
        return;
    }

    modal.dataset.propertyId = propertyId;
    document.getElementById('invite-modal-property-name').textContent = property.name;
    const listContainer = document.getElementById('forester-invite-list');
    listContainer.innerHTML = `<p>Finding nearby foresters...</p>`;
    openModal('invite-forester-modal');
    
    const geoJSON = sanitizeGeoJSON(property.geoJSON);
    if (!geoJSON) {
        listContainer.innerHTML = `<p class="text-center text-red-500">Property has an invalid boundary.</p>`;
        return;
    }
    
    const propertyCenter = L.geoJSON(geoJSON).getBounds().getCenter();

    const nearbyForesters = allProfessionalProfiles.filter(p => {
        if (p.role?.toLowerCase() !== 'forester') {
            return false;
        }
        if (!p.location || typeof p.location.lat !== 'number' || typeof p.location.lng !== 'number') {
            return false;
        }
        if (typeof p.serviceRadius !== 'number') {
            return false;
        }
        
        const foresterLatLng = L.latLng(p.location.lat, p.location.lng);
        const distanceInMeters = propertyCenter.distanceTo(foresterLatLng);
        const distanceInMiles = distanceInMeters / 1609.34;
        
        return distanceInMiles <= p.serviceRadius;
    });

    if (nearbyForesters.length > 0) {
        listContainer.innerHTML = nearbyForesters.map(f => `
            <div class="flex items-center justify-between p-2 border rounded-md hover:bg-gray-50">
                <div class="flex items-center">
                    <img src="${f.profilePictureUrl || 'https://placehold.co/128x128/8f8f8f/ffffff?text=No+Image'}" alt="${f.username}" class="w-12 h-12 rounded-full mr-3">
                    <div>
                        <p class="font-bold text-gray-800">${f.username}</p>
                        <p class="text-xs text-gray-500">${f.company || 'Independent Forester'}</p>
                    </div>
                </div>
                <input type="checkbox" data-forester-id="${f.id}" class="h-5 w-5" checked>
            </div>`).join('');
    } else {
        listContainer.innerHTML = `<p class="text-center text-gray-500">No foresters found serving this area. Ensure forester profiles in your database have a valid 'location' (with lat/lng) and a 'serviceRadius' number.</p>`;
    }
}

function openDeclineModal(inquiryId) {
    const inquiry = allInquiries.find(i => i.id === inquiryId);
    if (!inquiry) return;
    document.getElementById('decline-inquiry-id').value = inquiryId;
    document.getElementById('decline-property-name').textContent = inquiry.propertyName;
    openModal('decline-modal');
}

async function openViewInquiryModal(inquiryId) {
    const inquiry = allInquiries.find(i => i.id === inquiryId);
    if (!inquiry) {
        alert("Could not find inquiry details.");
        return;
    }

    document.getElementById('view-inquiry-recipient').textContent = inquiry.toUserName || 'N/A';
    document.getElementById('view-inquiry-date').textContent = inquiry.createdAt?.toDate ? inquiry.createdAt.toDate().toLocaleString() : 'N/A';
    document.getElementById('view-inquiry-goal').textContent = inquiry.landownerGoal || 'Not specified';
    
    const servicesList = document.getElementById('view-inquiry-services');
    servicesList.innerHTML = '';
    if (inquiry.servicesRequested && inquiry.servicesRequested.length > 0) {
        inquiry.servicesRequested.forEach(service => {
            const li = document.createElement('li');
            li.textContent = service;
            servicesList.appendChild(li);
        });
    } else {
        servicesList.innerHTML = '<li>No specific services listed.</li>';
    }

    document.getElementById('view-inquiry-message').textContent = inquiry.message || 'No message was sent.';

    openModal('view-inquiry-modal');
}


async function openTimberSaleForm(propertyId) {
    const property = allProperties.find(p => p.id === propertyId);
    if (!property) return;
    
    const form = document.getElementById('timber-sale-form');
    form.reset();
    document.getElementById('timber-sale-property-id').value = propertyId;
    document.getElementById('sale-name').value = property.name || '';
    document.getElementById('sale-county').value = property.county || '';
    document.getElementById('sale-legal-desc').value = property.str || '';
    document.getElementById('sale-acreage').value = property.acreage?.toFixed(2) || '0';

    initTimberSaleMap(sanitizeGeoJSON(property.geoJSON));
    setupInventoryTableManager(); 
    
    openModal('timber-sale-form-modal');
    setTimeout(() => {
        const map = getMapInstance('timber-sale-map');
        if (map) {
            map.invalidateSize();
        }
    }, 10);
}

function setupInventoryTableManager() {
    const container = document.getElementById('timber-inventory-stands-container');
    container.innerHTML = ''; 
    
    document.getElementById('add-inventory-stand-btn').onclick = () => addInventoryStand();

    container.addEventListener('click', e => {
        if (e.target.closest('.add-inventory-row-btn')) {
            const standContainer = e.target.closest('.inventory-stand');
            addInventoryRow(standContainer.querySelector('.inventory-table-container'));
        }
        if (e.target.closest('.remove-inventory-row-btn')) {
            e.target.closest('.inventory-row').remove();
        }
         if (e.target.closest('.remove-inventory-stand-btn')) {
            e.target.closest('.inventory-stand').remove();
        }
    });
}

function addInventoryStand() {
    const template = document.getElementById('inventory-stand-template');
    const clone = template.content.cloneNode(true);
    const standElement = clone.querySelector('.inventory-stand');
    
    document.getElementById('timber-inventory-stands-container').appendChild(clone);
    addInventoryRow(standElement.querySelector('.inventory-table-container'));
}


function addInventoryRow(container) {
    const template = document.getElementById('inventory-row-template');
    container.appendChild(template.content.cloneNode(true));
}

function openSubmitQuoteForm(project) {
    const form = document.getElementById('submit-quote-form');
    form.reset();
    document.getElementById('quote-context-id').value = project.id;
    document.getElementById('quote-landowner-id').value = project.ownerId;
    document.getElementById('quote-inquiry-id').value = '';
    document.getElementById('submit-quote-title').textContent = `Submit Bid for: ${project.propertyName}`;
    openModal('submit-quote-modal');
}

function openForesterQuoteModal(inquiryId) {
    const inquiry = allInquiries.find(i => i.id === inquiryId);
    if (!inquiry) return alert("Could not find inquiry details.");
    
    const form = document.getElementById('submit-quote-form');
    form.reset();
    document.getElementById('quote-context-id').value = inquiry.propertyId;
    document.getElementById('quote-landowner-id').value = inquiry.fromUserId;
    document.getElementById('quote-inquiry-id').value = inquiry.id;
    document.getElementById('submit-quote-title').textContent = `Submit Quote for: ${inquiry.propertyName}`;
    openModal('submit-quote-modal');
}

async function openViewQuotesModal(projectId) {
    const project = allProjects.find(p => p.id === projectId);
    if (!project) return alert("Project not found.");

    const modal = document.getElementById('view-quotes-modal');
    const title = document.getElementById('view-quotes-title');
    const list = document.getElementById('view-quotes-list');

    title.textContent = `Quotes for ${project.propertyName}`;
    list.innerHTML = `<p>Loading quotes...</p>`;
    openModal('view-quotes-modal');

    const quotes = await fetchQuotesForProject(db, project.id, currentUser.uid);

    if (quotes.length === 0) {
        list.innerHTML = `<p class="text-gray-500">No quotes received yet.</p>`;
        return;
    }

    list.innerHTML = quotes.map(quote => `
        <div class="p-4 border rounded-lg bg-gray-50">
            <div class="flex justify-between items-start">
                <div>
                    <h4 class="font-bold text-lg text-blue-700">${quote.professionalName}</h4>
                    <p class="text-sm text-gray-500 capitalize">${quote.professionalRole.replace('-', ' ')}</p>
                </div>
                <p class="text-2xl font-bold text-green-600">$${quote.amount.toLocaleString()}</p>
            </div>
            <p class="mt-3 text-gray-800">${quote.message}</p>
            <div class="mt-4 pt-3 border-t flex justify-end">
                <button class="accept-quote-btn bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2 px-4 rounded-md" data-quote-id="${quote.id}" data-project-id="${project.id}">
                    Accept Quote
                </button>
            </div>
        </div>
    `).join('');
}

// --- Profile Section ---
function renderMyProfile() {
    if (!currentUser) return;
    const defaultAvatar = 'https://placehold.co/128x128/8f8f8f/ffffff?text=No+Image';
    const roleMap = {
        'landowner': 'Landowner',
        'timber-buyer': 'Timber Buyer',
        'forester': 'Forester',
        'logging-contractor': 'Logging Contractor',
        'service-provider': 'Service Provider'
    };
    const formattedRole = roleMap[currentUser.role] || currentUser.role;

    document.getElementById('profile-picture-display').src = currentUser.profilePictureUrl || defaultAvatar;
    document.getElementById('profile-username').textContent = currentUser.username || 'N/A';
    document.getElementById('profile-company').textContent = currentUser.company || 'Independent';
    document.getElementById('profile-bio').textContent = currentUser.bio || 'No biography provided.';
    document.getElementById('profile-role').textContent = formattedRole;
    document.getElementById('profile-email').textContent = currentUser.email || 'N/A';
    document.getElementById('profile-member-since').textContent = currentUser.createdAt?.toDate ? currentUser.createdAt.toDate().toLocaleDateString() : 'N/A';
    document.getElementById('profile-rating').textContent = currentUser.rating?.toFixed(1) || 'N/A';
    document.getElementById('profile-review-count').textContent = currentUser.reviewCount || 0;
    document.getElementById('profile-transactions').textContent = currentUser.completedTransactions || 0;
    const roleSpecificContainer = document.getElementById('profile-role-specific-data');
    roleSpecificContainer.innerHTML = '';
    let detailsHTML = '';
    if (currentUser.role === 'forester' && currentUser.specialties?.length > 0) {
        detailsHTML += `<h4 class="text-xl font-semibold text-green-800 border-b pb-2 mb-2">Specialties</h4><ul class="list-disc list-inside text-gray-700">${currentUser.specialties.map(item => `<li>${item}</li>`).join('')}</ul>`;
    } else if (['logging-contractor', 'service-provider'].includes(currentUser.role) && currentUser.services?.length > 0) {
        detailsHTML += `<h4 class="text-xl font-semibold text-green-800 border-b pb-2 mb-2">Services</h4><ul class="list-disc list-inside text-gray-700">${currentUser.services.map(item => `<li>${item}</li>`).join('')}</ul>`;
    } else if (currentUser.role === 'timber-buyer' && currentUser.products?.length > 0) {
        detailsHTML += `<h4 class="text-xl font-semibold text-green-800 border-b pb-2 mb-2">Products Purchased</h4><ul class="list-disc list-inside text-gray-700">${currentUser.products.map(item => `<li>${item}</li>`).join('')}</ul>`;
    }
    roleSpecificContainer.innerHTML = detailsHTML;
    
    const mapContainer = document.getElementById('profile-map-container');
    if (currentUser.role !== 'landowner') {
        mapContainer.classList.remove('hidden');
        initProfileDisplayMap('profile-map-display', currentUser);
    } else {
        mapContainer.classList.add('hidden');
    }
}

function openEditProfileModal() {
    if (!currentUser) return;
    document.getElementById('edit-username').value = currentUser.username || '';
    document.getElementById('edit-profile-picture-url').value = currentUser.profilePictureUrl || '';
    document.getElementById('edit-company').value = currentUser.company || '';
    document.getElementById('edit-bio').value = currentUser.bio || '';
    
    const role = currentUser.role;
    const roleSpecificContainer = document.getElementById('edit-role-specific-container');
    roleSpecificContainer.querySelectorAll('[id^="edit-"][id$="-details"]').forEach(div => div.classList.add('hidden'));

    if (role !== 'landowner') {
        document.getElementById('edit-profile-map-container').classList.remove('hidden');
        const radiusSlider = document.getElementById('edit-service-radius-slider');
        const radiusValueSpan = document.getElementById('edit-service-radius-value');
        radiusSlider.value = currentUser.serviceRadius || 50;
        radiusValueSpan.textContent = currentUser.serviceRadius || 50;
        radiusSlider.oninput = (e) => {
            radiusValueSpan.textContent = e.target.value;
            updateServiceAreaCircle(e.target.value);
        };
        
        const detailsDiv = document.getElementById(`edit-${role}-details`);
        if (detailsDiv) {
            detailsDiv.classList.remove('hidden');
            
            // Populate based on role
            if (role === 'forester') {
                document.getElementById('edit-forester-experience').value = currentUser.experience || '';
                document.getElementById('edit-forester-certs').value = currentUser.certs || '';
                populateCheckboxes('edit-forester-specialties', FORESTER_SPECIALTIES, 'foresterSpecialties', currentUser.specialties);
            } else if (role === 'timber-buyer') {
                document.getElementById('edit-buyer-mills').value = currentUser.mills || '';
                populateCheckboxes('edit-buyer-products', BUYER_PRODUCTS, 'buyerProducts', currentUser.products);
            } else if (role === 'logging-contractor') {
                document.getElementById('edit-logger-experience').value = currentUser.experience || '';
                document.getElementById('edit-logger-equipment').value = currentUser.equipment || '';
                document.getElementById('edit-logger-insurance').checked = !!currentUser.insurance;
                populateCheckboxes('edit-logger-services', LOGGING_CONTRACTOR_SERVICES, 'loggerServices', currentUser.services);
            } else if (role === 'service-provider') {
                document.getElementById('edit-service-insurance').checked = !!currentUser.insurance;
                populateCheckboxes('edit-service-provider-services', SERVICE_PROVIDER_SERVICES, 'providerServices', currentUser.services);
            }
        }
    }
    openModal('edit-profile-modal');
    if (role !== 'landowner') initEditProfileMap(currentUser);
}

async function handleUpdateProfile(event) {
    event.preventDefault();
    if (!currentUser) return;

    const updatedData = {
        username: document.getElementById('edit-username').value.trim(),
        profilePictureUrl: document.getElementById('edit-profile-picture-url').value.trim(),
        company: document.getElementById('edit-company').value.trim(),
        bio: document.getElementById('edit-bio').value.trim(),
    };
    
    const role = currentUser.role;
    if (role !== 'landowner') {
        const location = getUpdatedLocation();
        if (location) updatedData.location = { lat: location.lat, lng: location.lng };
        updatedData.serviceRadius = parseInt(document.getElementById('edit-service-radius-slider').value, 10);
        
        if (role === 'forester') {
            updatedData.experience = document.getElementById('edit-forester-experience').value;
            updatedData.certs = document.getElementById('edit-forester-certs').value;
            updatedData.specialties = Array.from(document.querySelectorAll('#edit-forester-specialties input:checked')).map(box => box.value);
        } else if (role === 'timber-buyer') {
            updatedData.mills = document.getElementById('edit-buyer-mills').value;
            updatedData.products = Array.from(document.querySelectorAll('#edit-buyer-products input:checked')).map(box => box.value);
        } else if (role === 'logging-contractor') {
            updatedData.experience = document.getElementById('edit-logger-experience').value;
            updatedData.equipment = document.getElementById('edit-logger-equipment').value;
            updatedData.insurance = document.getElementById('edit-logger-insurance').checked;
            updatedData.services = Array.from(document.querySelectorAll('#edit-logger-services input:checked')).map(box => box.value);
        } else if (role === 'service-provider') {
            updatedData.insurance = document.getElementById('edit-service-insurance').checked;
            updatedData.services = Array.from(document.querySelectorAll('#edit-service-provider-services input:checked')).map(box => box.value);
        }
    }

    try {
        await updateUserProfile(db, currentUser.uid, updatedData);
        const userDoc = await getDoc(doc(db, "users", currentUser.uid));
        if (userDoc.exists()) currentUser = { uid: currentUser.uid, ...userDoc.data() };
        renderMyProfile();
        closeModal('edit-profile-modal');
        alert('Profile updated successfully!');
    } catch (error) {
        console.error("Error updating profile:", error);
        alert("Failed to update profile. Please try again.");
    }
}

// --- Demo & Utility Functions ---
async function loginAsDemoUser(role) {
    const demoCredentials = {
        'landowner': { email: 'landowner@demo.timbx.com', password: 'demopassword' },
        'timber-buyer': { email: 'timber-buyer@demo.timbx.com', password: 'demopassword' },
        'forester': { email: 'forester@demo.timbx.com', password: 'demopassword' },
        'logging-contractor': { email: 'logging-contractor@demo.timbx.com', password: 'demopassword' },
        'service-provider': { email: 'service-provider@demo.timbx.com', password: 'demopassword' }
    };
    const credentials = demoCredentials[role];
    if (!credentials) return;

    console.log(`Attempting to log in as role: '${role}', using email: '${credentials.email}'`);

    try {
        await signInWithEmailAndPassword(auth, credentials.email, credentials.password);
    } catch (error) {
        console.error(`Demo login for ${role} failed:`, error);
        alert(`Could not log in as demo ${role}. Please ensure the account exists in your Firebase Authentication console with the correct email and password.`);
    }
}

function initializeLogLoadForm() {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.getElementById('load-date').value = now.toISOString().slice(0, 16);
    document.getElementById('load-job').innerHTML = `<option value="">Select an Active Job</option>`;
}

function calculateNetWeight() {
    const gross = parseFloat(document.getElementById('load-gross-weight').value) || 0;
    const tare = parseFloat(document.getElementById('load-tare-weight').value) || 0;
    const netTons = gross > tare ? ((gross - tare) / 2000).toFixed(2) : '0.00';
    document.getElementById('load-net-weight').textContent = netTons;
}

async function handleLogLoadSubmit(event) {
    event.preventDefault();
    alert("Haul ticket submitted!");
    event.target.reset();
    initializeLogLoadForm();
}

// Helper to populate checkbox grids for signup/edit profile
function populateCheckboxes(containerId, items, name, checkedItems = []) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = items.map(item => `
        <label class="flex items-center p-1 rounded-md hover:bg-gray-100">
            <input type="checkbox" value="${item}" name="${name}" class="mr-2 h-4 w-4 rounded" ${checkedItems.includes(item) ? 'checked' : ''}>
            ${item}
        </label>
    `).join('');
}

function getSignupOptionalData() {
    const role = document.getElementById('signup-role').value;
    const optionalData = {
        company: document.getElementById('signup-company').value.trim(),
        bio: document.getElementById('signup-bio').value.trim(),
        profilePictureUrl: document.getElementById('signup-profile-picture-url').value.trim(),
    };

    if (role !== 'landowner') {
        const location = getUpdatedLocation();
        if (location) optionalData.location = location;
        optionalData.serviceRadius = parseInt(document.getElementById('signup-service-radius-slider').value, 10);

        if (role === 'forester') {
            optionalData.experience = document.getElementById('signup-forester-experience').value;
            optionalData.certs = document.getElementById('signup-forester-certs').value;
            optionalData.specialties = Array.from(document.querySelectorAll('#signup-forester-specialties input:checked')).map(box => box.value);
        } else if (role === 'timber-buyer') {
            optionalData.mills = document.getElementById('signup-buyer-mills').value;
            optionalData.products = Array.from(document.querySelectorAll('#signup-buyer-products input:checked')).map(box => box.value);
        } else if (role === 'logging-contractor') {
            optionalData.experience = document.getElementById('signup-logger-experience').value;
            optionalData.equipment = document.getElementById('signup-logger-equipment').value;
            optionalData.insurance = document.getElementById('signup-logger-insurance').checked;
            optionalData.services = Array.from(document.querySelectorAll('#signup-logger-services input:checked')).map(box => box.value);
        } else if (role === 'service-provider') {
            optionalData.insurance = document.getElementById('signup-service-insurance').checked;
            optionalData.services = Array.from(document.querySelectorAll('#signup-service-provider-services input:checked')).map(box => box.value);
        }
    }
    return optionalData;
}


// --- FINAL DIAGNOSTIC TOOL ---
window.testInquiryQuery = async (userId) => {
    console.log(`--- STARTING DIRECT QUERY TEST FOR USER: ${userId} ---`);
    try {
        const { getFirestore, collection, query, where, getDocs } = await import("https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js");
        const db = getFirestore();
        const inquiriesRef = collection(db, "inquiries");
        const q = query(inquiriesRef, where("involvedUsers", "array-contains", userId));
        console.log("Query created. Fetching from Firestore...");
        const querySnapshot = await getDocs(q);
        console.log(`Query executed. Found ${querySnapshot.size} documents.`);
        if (querySnapshot.empty) {
            console.log("The query returned no documents.");
        } else {
            querySnapshot.forEach(doc => {
                console.log("Document ID:", doc.id, "Data:", doc.data());
            });
        }
        console.log(`--- DIRECT QUERY TEST FINISHED ---`);
    } catch (error) {
        console.error("DIRECT QUERY FAILED:", error);
    }
};