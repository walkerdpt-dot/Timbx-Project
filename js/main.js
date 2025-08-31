// js/main.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, addDoc, serverTimestamp, query, where, getDocs } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { firebaseConfig } from './config.js';
import { initializeAuth, handleLogin, handleSignup, handleLogout } from './auth.js';
import {
    fetchProperties, fetchProfessionalProfiles, fetchProjects, saveNewProperty, updateProperty,
    deleteProperty, getPropertyById, getPropertiesForCurrentUser,
    updateUserProfile, saveMarketplaceDataToSession, getUserProfileById,
    updateProject, deleteProject, saveNewProject
} from './firestore.js';
import {
    initGlobalMap, initPropertyFormMap, getLastDrawnGeoJSON,
    initProfileDisplayMap, initSignupMap, initEditProfileMap, getUpdatedLocation,
    updateServiceAreaCircle, getMapInstance, initDetailViewMap,
    initMyPropertiesMap, initProjectAnnotationMap, getProjectAnnotationsAsGeoJSON, initTimberSaleMap
} from './map.js';

// --- Constants for Role-Specific Services ---
const FORESTER_SPECIALTIES = [
    "Timber Cruising & Appraisal", "Harvest Management", "Reforestation Planning",
    "Forest Management Plans", "Prescribed Burning"
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
let db, auth;
let mapLayers = new Map();

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

    try {
        [allProperties, allProfessionalProfiles, allProjects] = await Promise.all([
            fetchProperties(db),
            fetchProfessionalProfiles(db),
            fetchProjects(db)
        ]);
        saveMarketplaceDataToSession(allProperties, allProfessionalProfiles);
    } catch (error) {
        console.error("Failed to fetch initial marketplace data:", error);
    }

    attachAllEventListeners();
    window.addEventListener('hashchange', handleNavigation);
    await handleNavigation();
});

function onUserStatusChange(user) {
    currentUser = user;
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
        const sectionId = hash.substring(1);
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
            if (!getMapInstance('global-map')) {
                const map = initGlobalMap();
                if (map) {
                    map.on('movestart', () => document.getElementById('search-this-area-btn').classList.remove('hidden'));
                }
            }

            const filter = sessionStorage.getItem('filterMarketplace');
            if (filter === 'foresters') {
                document.querySelectorAll('#map-filters input[type="checkbox"]').forEach(box => box.checked = false);
                const foresterCheckbox = document.getElementById('filter-foresters');
                if(foresterCheckbox) foresterCheckbox.checked = true;
                sessionStorage.removeItem('filterMarketplace');
            }

            updateMapAndList();
            break;
        case 'properties':
            await renderPropertiesForCurrentUser();
            break;
        case 'my-profile':
            renderMyProfile();
            break;
        case 'haul-tickets':
            initializeLogLoadForm();
            break;
    }
}

// --- Event Listeners ---
function attachAllEventListeners() {
    document.querySelectorAll('nav a').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetHash = new URL(e.currentTarget.href).hash;
            if (window.location.hash !== targetHash) {
                window.location.hash = targetHash;
            }
        });
    });

    document.getElementById('login-button')?.addEventListener('click', () => openModal('login-modal'));
    document.getElementById('signup-button')?.addEventListener('click', openSignupModal);
    document.getElementById('logout-button')?.addEventListener('click', () => handleLogout(auth));
    document.getElementById('login-form')?.addEventListener('submit', async (e) => { e.preventDefault(); if (await handleLogin(auth)) closeModal('login-modal'); });
    document.getElementById('signup-form')?.addEventListener('submit', async (e) => { e.preventDefault(); if (await handleSignup(auth, db)) { closeModal('signup-modal'); openModal('login-modal'); } });
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
    document.getElementById('project-form')?.addEventListener('submit', handleProjectFormSubmit);
    document.getElementById('submit-quote-form')?.addEventListener('submit', handleSubmitQuoteForm);
    document.getElementById('edit-my-profile-button')?.addEventListener('click', openEditProfileModal);
    document.getElementById('edit-profile-form')?.addEventListener('submit', handleUpdateProfile);
    document.getElementById('log-load-form')?.addEventListener('submit', handleLogLoadSubmit);
    document.getElementById('load-gross-weight')?.addEventListener('input', calculateNetWeight);
    document.getElementById('load-tare-weight')?.addEventListener('input', calculateNetWeight);

    document.getElementById('signup-role')?.addEventListener('change', (event) => {
        const role = event.target.value;
        ['forester-fields', 'buyer-fields', 'logging-contractor-fields', 'service-provider-fields'].forEach(id => document.getElementById(id).classList.add('hidden'));
        if (role && role !== 'seller') {
            document.getElementById(`${role}-fields`).classList.remove('hidden');
            initSignupMap(role);
        }
    });

    // Main event delegation for dynamically created buttons
    document.body.addEventListener('click', async (e) => {
        const targetButton = e.target.closest('button, a');
        if (!targetButton) return;

        // --- Property Management Buttons ---
        if (targetButton.matches('.edit-property-btn')) {
            const propertyId = targetButton.dataset.propertyId;
            const prop = allProperties.find(p => p.id === propertyId) || await getPropertyById(db, propertyId);
            if (prop) openPropertyForm(prop);
        }

        if (targetButton.matches('.delete-property-btn')) {
            const propertyId = targetButton.dataset.propertyId;
            if (confirm("Are you sure you want to delete this property? This action cannot be undone.")) {
                await deleteProperty(db, propertyId);
                allProperties = allProperties.filter(p => p.id !== propertyId);
                await renderPropertiesForCurrentUser();
            }
        }
        
        // --- "Seek Services" Workflow ---
        if (targetButton.matches('.seek-services-btn')) {
            const propertyId = targetButton.dataset.propertyId;
            const propertyName = targetButton.dataset.propertyName;
            openServiceSelectModal(propertyId, propertyName);
        }

        // --- Project/Listing Management Buttons ---
        if (targetButton.matches('.edit-listing-btn')) {
            const projectId = targetButton.dataset.projectId;
            const project = allProjects.find(p => p.id === projectId);
            if (project) {
                openProjectFormForEdit(project);
            }
        }

        if (targetButton.matches('.remove-listing-btn')) {
            const projectId = targetButton.dataset.projectId;
            const projectName = targetButton.dataset.projectName;
            if (confirm(`Are you sure you want to remove the "${projectName}" project from the marketplace?`)) {
                try {
                    await deleteProject(db, projectId);
                    allProjects = allProjects.filter(p => p.id !== projectId);
                    await renderPropertiesForCurrentUser();
                    alert("Project listing removed successfully.");
                } catch (error) {
                    console.error("Error removing project:", error);
                    alert("Could not remove project listing. Please try again.");
                }
            }
        }
    });

    // --- Service Select Modal Logic ---
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

    // --- Forester First Modal Logic ---
    document.getElementById('find-forester-btn')?.addEventListener('click', () => {
        closeModal('forester-first-modal');
        sessionStorage.setItem('filterMarketplace', 'foresters');
        window.location.hash = '#marketplace';
    });

    document.getElementById('proceed-without-forester-btn')?.addEventListener('click', (e) => {
        const propertyId = e.target.closest('.modal-overlay').dataset.propertyId;
        closeModal('forester-first-modal');
        openTimberSaleForm(propertyId);
    });

    // --- Timber Sale Form Logic ---
    document.getElementById('timber-sale-form')?.addEventListener('submit', handleTimberSaleSubmit);
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

function updateLoginUI() {
    const isLoggedIn = !!currentUser;
    document.getElementById('login-button').classList.toggle('hidden', isLoggedIn);
    document.getElementById('signup-button').classList.toggle('hidden', isLoggedIn);
    document.getElementById('logout-button').classList.toggle('hidden', !isLoggedIn);
    
    const isSeller = isLoggedIn && currentUser.role === 'seller';
    document.getElementById('properties-login-prompt').classList.toggle('hidden', isSeller);
    document.getElementById('properties-main-content').classList.toggle('hidden', !isSeller);
    
    document.getElementById('profile-login-prompt').classList.toggle('hidden', isLoggedIn);
    document.getElementById('profile-details').classList.toggle('hidden', !isLoggedIn);

    document.querySelector('a[href="#properties"]').classList.toggle('hidden', !isSeller);
    
    const professionalRoles = ['buyer', 'logging-contractor'];
    document.querySelector('a[href="#haul-tickets"]').classList.toggle('hidden', !isLoggedIn || !professionalRoles.includes(currentUser?.role));
    
    document.querySelector('a[href="#my-loads"]').classList.toggle('hidden', !isLoggedIn || ['forester', 'service-provider'].includes(currentUser?.role));
    
    document.querySelector('a[href="#my-projects"]').classList.toggle('hidden', !isLoggedIn);
    document.querySelector('a[href="#my-profile"]').classList.toggle('hidden', !isLoggedIn);
}

function openModal(modalId) { document.getElementById(modalId)?.classList.remove('hidden'); }
function closeModal(modalId) { document.getElementById(modalId)?.classList.add('hidden'); }
function openSignupModal() { document.getElementById('signup-form')?.reset(); openModal('signup-modal'); }

// --- Detail View Rendering ---
async function renderDetailView(type, id, from) {
    const detailSection = document.getElementById('detail-view');
    const contentContainer = document.getElementById('detail-view-content');
    contentContainer.innerHTML = '<p class="text-center p-8">Loading details...</p>';
    detailSection.classList.remove('hidden');

    document.getElementById('back-to-marketplace-btn').classList.toggle('hidden', from !== 'marketplace');
    document.getElementById('back-to-properties-btn').classList.toggle('hidden', from !== 'properties');

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
                <button class="edit-property-btn bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-2 rounded-md font-semibold" data-property-id="${property.id}">Edit Property</button>
                <button class="seek-services-btn bg-teal-500 hover:bg-teal-600 text-white px-3 py-2 rounded-md font-semibold" data-property-id="${property.id}" data-property-name="${property.name}">Seek Services</button>
                <button class="delete-property-btn bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-md font-semibold" data-property-id="${property.id}">Delete Property</button>
            </div>`;
    }
    contentContainer.innerHTML = `
        <h3 class="text-3xl font-bold text-green-800 mb-4">${property.name}</h3>
        <div id="detail-map" class="w-full h-[400px] rounded-lg border mb-4"></div>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm mt-4">
            <div><p class="text-gray-500">Service Needed</p><p class="font-semibold">${property.serviceType || 'N/A'}</p></div>
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
    const isProvider = currentUser && ['forester', 'logging-contractor', 'service-provider'].includes(currentUser.role);
    
    if (isProvider && currentUser.uid !== project.ownerId) {
        actionButtonHTML = `
            <div class="mt-6 pt-6 border-t">
                <button id="submit-quote-btn" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition duration-200">
                    Submit a Quote for this Project
                </button>
            </div>
        `;
    }

    let projectDetailsHTML = '';
    if (project.projectType === 'timber-sale') {
        let verificationHTML = '';
        switch(project.cruiseAuthor) {
            case 'timbx-forester':
                verificationHTML = `<div class="p-2 text-sm bg-green-100 text-green-800 rounded-md font-semibold">Forester Verified</div>`;
                break;
            case 'third-party':
                verificationHTML = `<div class="p-2 text-sm bg-blue-100 text-blue-800 rounded-md font-semibold">Third-Party Consultant Data</div>`;
                break;
            case 'landowner':
                verificationHTML = `<div class="p-2 text-sm bg-yellow-100 text-yellow-800 rounded-md font-semibold">Landowner Estimate</div>`;
                break;
        }

        projectDetailsHTML = `
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div class="p-3 bg-gray-50 rounded-md">
                    <p class="text-sm text-gray-500">Sale Type</p>
                    <p class="font-semibold">${project.saleType === 'lump-sum' ? 'Lump Sum Sealed Bid' : 'Pay-as-Cut'}</p>
                </div>
                <div class="p-3 bg-gray-50 rounded-md">
                    <p class="text-sm text-gray-500">Harvest Type</p>
                    <p class="font-semibold">${project.harvestType}</p>
                </div>
                <div class="p-3 bg-gray-50 rounded-md">
                    <p class="text-sm text-gray-500">Bid Deadline</p>
                    <p class="font-semibold">${new Date(project.bidDeadline).toLocaleString()}</p>
                </div>
            </div>
            <h4 class="font-semibold text-gray-800 mt-6">Timber Inventory</h4>
            <div class="flex items-center gap-4 my-2">${verificationHTML}<p class="text-xs text-gray-500">TIMBX does not guarantee volume estimates. Buyers should perform their own due diligence.</p></div>
            <div class="border rounded-md">
                <table class="min-w-full text-sm">
                    <thead class="bg-gray-100">
                        <tr>
                            <th class="p-2 text-left font-semibold">Product</th>
                            <th class="p-2 text-right font-semibold">Estimated Volume</th>
                            <th class="p-2 text-left font-semibold">Unit</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${project.inventory.map(item => `
                            <tr class="border-t">
                                <td class="p-2">${item.product}</td>
                                <td class="p-2 text-right">${item.volume}</td>
                                <td class="p-2">${item.unit}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } else {
        projectDetailsHTML = `
            <div class="mt-4"><p class="text-sm font-medium text-gray-500">Services Needed:</p><ul class="list-disc list-inside font-semibold text-gray-800">${(Array.isArray(project.servicesNeeded) ? project.servicesNeeded : []).map(s => `<li>${s}</li>`).join('')}</ul></div>
        `;
    }

    contentContainer.innerHTML = `
        <h3 class="text-3xl font-bold text-green-800">Project: ${project.propertyName}</h3>
        <p class="text-md text-gray-600 mb-4">Posted by: <a href="#detail?type=profile&id=${project.ownerId}&from=marketplace" class="text-blue-600 hover:underline">${project.ownerName}</a></p>
        <div id="detail-map" class="w-full h-[400px] rounded-lg border mb-4"></div>
        ${projectDetailsHTML}
        <div class="mt-4 border-t pt-4"><h4 class="font-semibold text-gray-800">Owner's Description</h4><p class="text-gray-700 mt-1">${project.description || 'No description provided.'}</p></div>
        ${project.completionDate ? `<p class="text-sm mt-4"><span class="font-semibold">Desired Completion:</span> ${new Date(project.completionDate).toLocaleDateString()}</p>` : ''}
        ${actionButtonHTML}
    `;

    const submitQuoteBtn = document.getElementById('submit-quote-btn');
    if (submitQuoteBtn) {
        submitQuoteBtn.addEventListener('click', () => openSubmitQuoteForm(project));
    }

    initDetailViewMap('detail-map', sanitizeGeoJSON(project.geoJSON), project.annotations);
}

function renderUserProfileDetail(user) {
    const contentContainer = document.getElementById('detail-view-content');
    const defaultAvatar = 'https://placehold.co/128x128/8f8f8f/ffffff?text=No+Image';
    const role = user.role ? user.role.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : 'N/A';
    contentContainer.innerHTML = `
        <div class="flex items-center space-x-4"><img src="${user.profilePictureUrl || defaultAvatar}" alt="Profile Picture" class="w-24 h-24 rounded-full border-4 border-gray-200"><div><h3 class="text-2xl font-bold text-gray-800">${user.username}</h3><p class="text-md text-gray-600">${user.company || 'Independent'}</p><p class="text-md font-semibold text-gray-800">${role}</p></div></div>
        <div class="mt-4 border-t pt-4"><h4 class="font-semibold text-gray-800">About</h4><p class="text-gray-700 mt-1">${user.bio || 'No biography provided.'}</p></div>
        <div class="grid grid-cols-2 gap-4 text-center mt-4"><div class="bg-gray-100 p-3 rounded-lg"><p class="text-xl font-bold text-yellow-500">${user.rating?.toFixed(1) || 'N/A'}</p><p class="text-sm text-gray-600">Rating (${user.reviewCount || 0} reviews)</p></div><div class="bg-gray-100 p-3 rounded-lg"><p class="text-xl font-bold text-green-600">${user.completedTransactions || 0}</p><p class="text-sm text-gray-600">Completed Transactions</p></div></div>
        <div class="mt-4"><h4 class="font-semibold text-gray-800 mb-2">Service Area</h4><div id="detail-profile-map" class="w-full h-64 rounded-lg border"></div></div>
    `;
    if (user.role !== 'seller' && user.location) {
        initProfileDisplayMap('detail-profile-map', user);
    } else {
        document.getElementById('detail-profile-map').innerHTML = '<p class="text-center text-gray-500 p-4">No service area specified.</p>';
    }
}

function openSubmitQuoteForm(project) {
    const form = document.getElementById('submit-quote-form');
    form.reset();
    
    document.getElementById('quote-project-id').value = project.id;
    document.getElementById('quote-landowner-id').value = project.ownerId;
    
    openModal('submit-quote-modal');
}

async function handleSubmitQuoteForm(event) {
    event.preventDefault();
    if (!currentUser) return alert("You must be logged in to submit a quote.");

    const submitButton = event.target.querySelector('button[type="submit"]');
    const originalButtonText = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.textContent = 'Submitting...';

    const bidData = {
        projectId: document.getElementById('quote-project-id').value,
        landownerId: document.getElementById('quote-landowner-id').value,
        bidderId: currentUser.uid,
        bidderName: currentUser.username,
        bidderRole: currentUser.role,
        amount: parseFloat(document.getElementById('quote-amount').value),
        message: document.getElementById('quote-message').value,
        status: 'pending',
        createdAt: serverTimestamp()
    };

    try {
        await addDoc(collection(db, "bids"), bidData);
        closeModal('submit-quote-modal');
        alert('Your quote has been successfully submitted to the landowner!');
    } catch (error) {
        console.error("Error submitting quote: ", error);
        alert("There was an error submitting your quote. Please try again.");
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = originalButtonText;
    }
}

async function fetchBidsForProject(projectId) {
    const bidsCollection = collection(db, 'bids');
    const q = query(bidsCollection, where("projectId", "==", projectId));
    const snapshot = await getDocs(q);
    const bids = [];
    snapshot.forEach(doc => bids.push({ id: doc.id, ...doc.data() }));
    return bids;
}

async function openViewBidsModal(project) {
    openModal('view-bids-modal');
    const modalTitle = document.getElementById('view-bids-title');
    const bidsListContainer = document.getElementById('view-bids-list');
    
    modalTitle.textContent = `Bids for ${project.propertyName}`;
    bidsListContainer.innerHTML = '<p>Loading bids...</p>';

    const bids = await fetchBidsForProject(project.id);

    if (bids.length === 0) {
        bidsListContainer.innerHTML = '<p class="text-gray-500">There are no bids for this project yet.</p>';
        return;
    }

    bidsListContainer.innerHTML = bids.map(bid => {
        const bidDate = bid.createdAt?.toDate ? bid.createdAt.toDate().toLocaleDateString() : 'N/A';
        return `
            <div class="bid-card border rounded-lg p-4 bg-gray-50" data-bid-id="${bid.id}">
                <div class="flex justify-between items-start">
                    <div>
                        <h4 class="font-bold text-lg text-blue-700">
                            <a href="#detail?type=profile&id=${bid.bidderId}&from=properties" class="hover:underline">${bid.bidderName}</a>
                        </h4>
                        <p class="text-sm text-gray-500">${bid.bidderRole.replace('-', ' ')}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-2xl font-bold text-green-600">$${bid.amount.toLocaleString()}</p>
                        <p class="text-xs text-gray-500">Submitted: ${bidDate}</p>
                    </div>
                </div>
                <p class="mt-3 text-gray-800">${bid.message}</p>
                <div class="mt-4 pt-3 border-t flex justify-end space-x-2">
                    <button class="bid-action-btn bg-red-500 hover:bg-red-600 text-white font-bold py-1 px-3 rounded text-sm" data-action="declined">Decline</button>
                    <button class="bid-action-btn bg-green-500 hover:bg-green-600 text-white font-bold py-1 px-3 rounded text-sm" data-action="accepted">Accept</button>
                </div>
            </div>
        `;
    }).join('');

    bidsListContainer.querySelectorAll('.bid-action-btn').forEach(button => {
        button.addEventListener('click', async (e) => {
            const bidCard = e.target.closest('.bid-card');
            const bidId = bidCard.dataset.bidId;
            const action = e.target.dataset.action;
            
            button.textContent = 'Processing...';
            button.disabled = true;
            
            await handleBidAction(bidId, action);
            
            bidCard.style.opacity = '0.5';
            bidCard.querySelectorAll('button').forEach(btn => btn.remove());
        });
    });
}

async function handleBidAction(bidId, newStatus) {
    try {
        const bidRef = doc(db, 'bids', bidId);
        await updateDoc(bidRef, { status: newStatus });
        alert(`Bid has been successfully ${newStatus}.`);
    } catch (error) {
        console.error("Error updating bid status: ", error);
        alert("Could not update the bid status. Please try again.");
    }
}


// --- Marketplace Rendering ---
function updateMapAndList() {
    const globalMap = getMapInstance('global-map');
    if (!globalMap) return;
    const listContainer = document.getElementById('dynamic-map-list');
    const bounds = globalMap.getBounds();

    for (const [key, value] of mapLayers.entries()) {
        if (value.map === globalMap) { globalMap.removeLayer(value.layer); mapLayers.delete(key); }
    }
    listContainer.innerHTML = '';

    const filters = {
        projects: document.getElementById('filter-projects').checked,
        buyers: document.getElementById('filter-buyers').checked,
        foresters: document.getElementById('filter-foresters').checked,
        loggingContractors: document.getElementById('filter-logging-contractors').checked,
        serviceProviders: document.getElementById('filter-service-providers').checked,
        foresterService: document.getElementById('filter-forester-services').value,
        loggingService: document.getElementById('filter-logging-contractor-services').value,
        providerService: document.getElementById('filter-service-provider-services').value,
    };
    const listFragment = document.createDocumentFragment();

    if (filters.projects) {
        allProjects.forEach(proj => {
            const cleanGeoJSON = sanitizeGeoJSON(proj.geoJSON);
            if (proj.status === 'open' && cleanGeoJSON?.geometry?.coordinates) {
                const layerBounds = L.geoJSON(cleanGeoJSON).getBounds();
                if (layerBounds.isValid() && bounds.intersects(layerBounds)) {
                    const center = layerBounds.getCenter();
                    const marker = L.marker(center, { icon: L.divIcon({ className: 'custom-div-icon', html: `<div style="font-size: 24px; color: #8b5cf6;">&#9733;</div>`, iconSize: [30, 42], iconAnchor: [15, 42] }) })
                        .bindTooltip(`Project: ${proj.propertyName}`)
                        .on('click', () => window.location.hash = `#detail?type=project&id=${proj.id}&from=marketplace`);
                    mapLayers.set(proj.id, { layer: marker, map: globalMap });
                    marker.addTo(globalMap);
                    
                    let servicesText = '';
                    if (proj.projectType === 'timber-sale') {
                        servicesText = proj.harvestType; // e.g., "Clearcut"
                    } else {
                        servicesText = (Array.isArray(proj.servicesNeeded) ? proj.servicesNeeded.join(', ') : '');
                    }

                    let badgeHTML = '';
                    if (proj.cruiseAuthor === 'timbx-forester') {
                        badgeHTML = `<span class="text-xs font-bold text-green-800 bg-green-200 px-2 py-1 rounded-full">Forester Verified</span>`;
                    }

                    const li = document.createElement('li');
                    li.className = 'p-3 border-b hover:bg-gray-100 transition-colors';
                    li.innerHTML = `
                        <a href="#detail?type=project&id=${proj.id}&from=marketplace" class="block">
                            <div class="flex justify-between items-center">
                                <span class="font-bold text-purple-600">&#9733; ${proj.propertyName}</span>
                                ${badgeHTML}
                            </div>
                            <div class="text-sm text-gray-700">Seeking: ${servicesText}</div>
                        </a>`;
                    listFragment.appendChild(li);
                }
            }
        });
    }

    allProfessionalProfiles.forEach(prof => {
        let isVisible = false, color = 'gray', serviceFilterPass = true;
        switch(prof.role) {
            case 'forester': isVisible = filters.foresters; color = 'green'; if (filters.foresterService) serviceFilterPass = prof.specialties?.includes(filters.foresterService); break;
            case 'buyer': isVisible = filters.buyers; color = 'red'; break;
            case 'logging-contractor': isVisible = filters.loggingContractors; color = 'yellow'; if (filters.loggingService) serviceFilterPass = prof.services?.includes(filters.loggingService); break;
            case 'service-provider': isVisible = filters.serviceProviders; color = 'purple'; if (filters.providerService) serviceFilterPass = prof.services?.includes(filters.providerService); break;
        }
        if (isVisible && serviceFilterPass && prof.location) {
            const profLatLng = L.latLng(prof.location.lat, prof.location.lng);
            if (bounds.contains(profLatLng)) {
                const marker = L.circleMarker(profLatLng, { radius: 8, color: 'white', weight: 2, fillColor: color, fillOpacity: 1 })
                    .bindTooltip(prof.username).on('click', () => window.location.hash = `#detail?type=profile&id=${prof.id}&from=marketplace`);
                mapLayers.set(prof.id, { layer: marker, map: globalMap });
                marker.addTo(globalMap);
                const li = document.createElement('li');
                li.className = 'p-3 border-b hover:bg-gray-100 transition-colors';
                li.innerHTML = `<a href="#detail?type=profile&id=${prof.id}&from=marketplace" class="block"><div class="font-bold" style="color: ${color};">${prof.username}</div><div class="text-sm text-gray-700">${prof.company || 'Independent'}</div></a>`;
                listFragment.appendChild(li);
            }
        }
    });

    listContainer.appendChild(listFragment);
    if (listContainer.children.length === 0) {
        listContainer.innerHTML = '<li class="p-2 text-center text-gray-500">No items found in this map area.</li>';
    }
}

// --- My Properties Section ---
async function renderPropertiesForCurrentUser() {
    if (!currentUser || currentUser.role !== 'seller') return;
    if (!getMapInstance('my-properties-map')) initMyPropertiesMap();
    const listContainer = document.getElementById('my-properties-list-container');
    listContainer.innerHTML = '<div class="p-4 text-center text-gray-500">Loading properties...</div>';
    const userProperties = await getPropertiesForCurrentUser(db, currentUser.uid);
    await renderMyPropertiesList(userProperties);
}

async function renderMyPropertiesList(properties) {
    const mapInstance = getMapInstance('my-properties-map');
    const listContainer = document.getElementById('my-properties-list-container');
    if (!mapInstance || !listContainer) return;
    listContainer.innerHTML = '';
    for (const [key, value] of mapLayers.entries()) {
        if (value.map === mapInstance) { mapInstance.removeLayer(value.layer); mapLayers.delete(key); }
    }
    if (!properties || properties.length === 0) {
        listContainer.innerHTML = `<div class="p-4 text-center text-gray-500">You have not added any properties.</div>`;
        return;
    }

    const userProjectIds = allProjects.filter(p => p.ownerId === currentUser.uid).map(p => p.id);
    const bidsByProjectId = {};
    if (userProjectIds.length > 0) {
          const bidsQuery = query(collection(db, 'bids'), where('projectId', 'in', userProjectIds));
          const bidsSnapshot = await getDocs(bidsQuery);
          bidsSnapshot.forEach(doc => {
              const bid = doc.data();
              if (!bidsByProjectId[bid.projectId]) {
                  bidsByProjectId[bid.projectId] = [];
              }
              bidsByProjectId[bid.projectId].push(bid);
          });
    }

    const allBounds = [];
    const listFragment = document.createDocumentFragment();
    properties.forEach(prop => {
        const li = document.createElement('div');
        li.className = 'p-3 border-b last:border-b-0';
        const project = allProjects.find(p => p.propertyId === prop.id && p.status === 'open');
        
        let statusHTML = '';
        let buttonHTML = '';

        if (project) {
            const bidsForProject = bidsByProjectId[project.id] || [];
            const bidCount = bidsForProject.length;
            
            let servicesText = project.harvestType;
            if (!servicesText) {
                servicesText = (project && Array.isArray(project.servicesNeeded)) ? project.servicesNeeded.join(', ') : 'a service';
            }
            
            statusHTML = `<p class="text-sm text-blue-600 font-semibold mt-1">Status: <span class="font-bold">Seeking ${servicesText}</span></p>`;
            
            let bidsButton = '';
            if (bidCount > 0) {
                bidsButton = `<button class="view-bids-btn bg-purple-600 hover:bg-purple-700 text-white text-xs px-2 py-1.5 rounded-md font-semibold">View Bids (${bidCount})</button>`;
            }

            buttonHTML = `
                ${bidsButton}
                <button class="edit-listing-btn bg-orange-500 hover:bg-orange-600 text-white text-xs px-2 py-1.5 rounded-md font-semibold" data-project-id="${project.id}">Edit Listing</button>
                <button class="remove-listing-btn bg-red-600 hover:bg-red-700 text-white text-xs px-2 py-1.5 rounded-md font-semibold" data-project-id="${project.id}" data-project-name="${prop.name}">Remove Listing</button>
            `;
        } else {
            statusHTML = `<p class="text-sm text-gray-500 mt-1">Status: <span class="font-medium text-gray-700">${prop.serviceType || 'Not listed'}</span></p>`;
            buttonHTML = `<button class="seek-services-btn bg-teal-500 hover:bg-teal-600 text-white text-xs px-2 py-1.5 rounded-md font-semibold" data-property-id="${prop.id}" data-property-name="${prop.name}">Seek Services</button>`;
        }

        li.innerHTML = `
            <h4 class="font-bold text-xl text-green-800">${prop.name}</h4>
            <p class="text-sm text-gray-600">${prop.acreage?.toFixed(2) || '0'} acres</p>
            ${statusHTML}
            <div class="mt-3 flex flex-wrap gap-2">
                <a href="#detail?type=property&id=${prop.id}&from=properties" class="bg-blue-500 hover:bg-blue-600 text-white text-xs px-2 py-1.5 rounded-md font-semibold">Details</a>
                <button class="edit-property-btn bg-yellow-500 hover:bg-yellow-600 text-white text-xs px-2 py-1.5 rounded-md font-semibold" data-property-id="${prop.id}">Edit</button>
                ${buttonHTML}
            </div>`;
        
        const viewBidsBtn = li.querySelector('.view-bids-btn');
        if (viewBidsBtn) {
            viewBidsBtn.addEventListener('click', () => openViewBidsModal(project));
        }

        listFragment.appendChild(li);
        const cleanGeoJSON = sanitizeGeoJSON(prop.geoJSON);
        if (cleanGeoJSON?.geometry?.coordinates) {
            const polygonLayer = L.geoJSON(cleanGeoJSON, { style: { color: '#059669', weight: 2, fillColor: '#10B981', fillOpacity: 0.3 } });
            const bounds = polygonLayer.getBounds();
            if (bounds.isValid()) {
                const center = bounds.getCenter();
                const centerMarker = L.circleMarker(center, { radius: 6, fillColor: '#2563EB', color: '#FFFFFF', weight: 1.5, opacity: 1, fillOpacity: 0.9 });
                const featureGroup = L.featureGroup([polygonLayer, centerMarker])
                    .bindTooltip(prop.name)
                    .on('click', () => window.location.hash = `#detail?type=property&id=${prop.id}&from=properties`);
                mapLayers.set(prop.id, { layer: featureGroup, map: mapInstance });
                featureGroup.addTo(mapInstance);
                allBounds.push(bounds);
            }
        }
    });
    listContainer.appendChild(listFragment);
    if (allBounds.length > 0) mapInstance.fitBounds(L.latLngBounds(allBounds), { padding: [50, 50] });
}


// --- Forms and Data Handling ---
async function handleSaveProperty(event) {
    event.preventDefault();

    const submitButton = event.target.querySelector('#btn-save-property');
    const originalButtonText = submitButton.textContent;

    submitButton.disabled = true;
    submitButton.textContent = 'Saving...';

    const propertyId = document.getElementById('property-id').value;
    const propertyData = getPropertyDataFromForm();
    const geoJSON = getLastDrawnGeoJSON();
    
    if (!geoJSON) {
        alert("Please draw the property boundary on the map before saving.");
        submitButton.disabled = false;
        submitButton.textContent = originalButtonText;
        return;
    }

    try {
        let savedProperty;
        if (propertyId) {
            await updateProperty(db, propertyId, geoJSON, propertyData);
            savedProperty = { id: propertyId, ...propertyData, geoJSON };
        } else {
            savedProperty = await saveNewProperty(db, currentUser, geoJSON, propertyData);
        }
        allProperties = await fetchProperties(db);
        closeModal('property-form-modal');
        await renderPropertiesForCurrentUser();
        if (['Timber Harvest', 'Forester Recommendation'].includes(savedProperty.serviceType)) {
            openModal('save-success-modal');
        } else {
            alert('Property saved successfully!');
        }
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
        serviceType: document.getElementById('property-service-type').value,
        timberType: document.getElementById('property-timber-type').value,
        species: document.getElementById('property-species').value,
        age: document.getElementById('property-age').value,
        standQuality: document.getElementById('property-stand-quality').value,
        topography: document.getElementById('property-topography').value,
        accessibility: document.getElementById('property-accessibility').value,
        previousCutYear: document.getElementById('property-previous-cut-year').value,
        previousCutType: document.getElementById('property-previous-cut-type').value,
        description: document.getElementById('property-desc').value,
        acreage: parseFloat(document.getElementById('calculated-acreage').textContent) || 0
    };
}

function openPropertyForm(property = null) {
    const form = document.getElementById('property-form');
    form.reset();
    document.getElementById('property-id').value = property ? property.id : '';
    document.getElementById('property-form-title').textContent = property ? 'Edit Property' : 'Add New Property';
    if (property) {
        document.getElementById('property-name').value = property.name || '';
        document.getElementById('property-service-type').value = property.serviceType || '';
        document.getElementById('property-timber-type').value = property.timberType || '';
        document.getElementById('property-species').value = property.species || '';
        document.getElementById('property-age').value = property.age || '';
        document.getElementById('property-stand-quality').value = property.standQuality || '';
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

async function openTimberSaleForm(propertyId) {
    const property = allProperties.find(p => p.id === propertyId);
    if (!property) {
        console.error("Property not found for timber sale form.");
        alert("Could not open the form because the property data is missing.");
        return;
    }
    const form = document.getElementById('timber-sale-form');
    form.reset();
    document.getElementById('timber-sale-property-id').value = propertyId;
    initTimberSaleMap(property.geoJSON, null);
    setupInventoryTable();
    openModal('timber-sale-form-modal');
}

function setupInventoryTable() {
    const tableContainer = document.getElementById('timber-inventory-table');
    const addRowBtn = document.getElementById('add-inventory-row-btn');
    tableContainer.innerHTML = ''; 
    addInventoryRow(); 

    // Use a single event listener on the container for removing rows
    tableContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-inventory-row-btn')) {
            e.target.closest('.inventory-row').remove();
        }
    });
    addRowBtn.onclick = addInventoryRow;
}

function addInventoryRow() {
    const tableContainer = document.getElementById('timber-inventory-table');
    const template = document.getElementById('inventory-row-template');
    const newRow = template.content.cloneNode(true);
    tableContainer.appendChild(newRow);
}

async function handleTimberSaleSubmit(event) {
    event.preventDefault();
    if (!currentUser) return alert("You must be logged in to post a sale.");

    const submitButton = event.target.querySelector('button[type="submit"]');
    const originalButtonText = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.textContent = 'Posting...';

    try {
        const propertyId = document.getElementById('timber-sale-property-id').value;
        const property = allProperties.find(p => p.id === propertyId);
        if (!property) throw new Error("Associated property could not be found.");

        const inventory = [];
        document.querySelectorAll('.inventory-row').forEach(row => {
            const product = row.querySelector('.inventory-product').value;
            const volume = parseFloat(row.querySelector('.inventory-volume').value);
            const unit = row.querySelector('.inventory-unit').value;
            if (product && volume > 0 && unit) {
                inventory.push({ product, volume, unit });
            }
        });

        const annotations = getProjectAnnotationsAsGeoJSON();

        if (inventory.length === 0) {
            throw new Error("Please add at least one product to the timber inventory.");
        }
        if (!annotations || annotations.features.length === 0) {
            throw new Error("Please draw the required features on the map (e.g., Harvest Area).");
        }
        const hasHarvestArea = annotations.features.some(f => f.geometry.type === 'Polygon');
        if (!hasHarvestArea) {
             throw new Error("A harvest area (polygon) is required. Please draw the harvest area on the map.");
        }
        
        const projectData = {
            ownerId: currentUser.uid,
            ownerName: currentUser.username,
            propertyId: propertyId,
            propertyName: property.name,
            status: 'open',
            createdAt: serverTimestamp(),
            geoJSON: property.geoJSON,
            annotations: annotations,
            projectType: 'timber-sale',
            saleType: document.getElementById('timber-sale-type').value,
            harvestType: document.getElementById('timber-harvest-type').value,
            bidDeadline: document.getElementById('timber-bid-deadline').value,
            inventory: inventory,
            cruiseAuthor: document.querySelector('input[name="cruise-author"]:checked').value,
        };

        const newProject = await saveNewProject(db, projectData);
        allProjects.push(newProject);
        alert("Timber Sale Posted Successfully!");
        
        closeModal('timber-sale-form-modal');
        await renderPropertiesForCurrentUser();

    } catch (error) {
        console.error("Error submitting timber sale:", error);
        alert(`Submission Error: ${error.message}`);
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = originalButtonText;
    }
}

async function handleProjectFormSubmit(event) {
    event.preventDefault();
    if (!currentUser) return alert("You must be logged in.");

    const submitButton = event.target.querySelector('button[type="submit"]');
    const originalButtonText = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.textContent = 'Saving...';

    const propertyId = document.getElementById('project-form-property-id').value;
    const projectId = document.getElementById('project-form-project-id').value;
    const servicesNeeded = Array.from(document.querySelectorAll('#project-service-needed input:checked')).map(cb => cb.value);

    if (servicesNeeded.length === 0) {
        alert("Please select at least one service you need.");
        submitButton.disabled = false;
        submitButton.textContent = originalButtonText;
        return;
    }

    const annotations = getProjectAnnotationsAsGeoJSON();

    const projectData = {
        servicesNeeded,
        description: document.getElementById('project-description').value,
        completionDate: document.getElementById('project-completion-date').value || null,
        annotations: annotations
    };

    try {
        if (projectId) {
            await updateProject(db, projectId, projectData);
            allProjects = await fetchProjects(db);
            alert('Your project listing has been updated!');
        } else {
            const property = allProperties.find(p => p.id === propertyId);
            if (!property) throw new Error("Associated property not found.");
            const cleanGeoJSON = sanitizeGeoJSON(property.geoJSON);
            const fullProjectData = {
                ...projectData,
                ownerId: currentUser.uid,
                ownerName: currentUser.username,
                propertyId,
                propertyName: property.name,
                status: 'open',
                createdAt: serverTimestamp(),
                geoJSON: cleanGeoJSON ? JSON.stringify(cleanGeoJSON) : null
            };
            const newProjectRef = await addDoc(collection(db, "projects"), fullProjectData);
            allProjects.push({ id: newProjectRef.id, ...fullProjectData });
            alert(`Your project for "${property.name}" has been successfully listed!`);
        }
        await renderPropertiesForCurrentUser();
        closeModal('project-form-modal');
    } catch (error) {
        console.error("Error saving project: ", error);
        alert("There was an error saving your project.");
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = originalButtonText;
    }
}


async function openProjectForm(propertyId, propertyName, category) {
    console.log("Opening project form for category:", category);
    
    const form = document.getElementById('project-form');
    form.reset();
    document.getElementById('project-form-property-id').value = propertyId;
    document.getElementById('project-form-project-id').value = '';
    document.getElementById('project-form-property-name').textContent = propertyName;
    form.querySelector('button[type="submit"]').textContent = 'List Project on Marketplace';
    populateServiceCheckboxes();
    openModal('project-form-modal');
    
    const property = allProperties.find(p => p.id === propertyId);
    if (property) {
        initProjectAnnotationMap(sanitizeGeoJSON(property.geoJSON), null);
    }
}

async function openProjectFormForEdit(project) {
    const form = document.getElementById('project-form');
    form.reset();
    document.getElementById('project-form-property-id').value = project.propertyId;
    document.getElementById('project-form-project-id').value = project.id;
    document.getElementById('project-form-property-name').textContent = project.propertyName;
    document.getElementById('project-description').value = project.description;
    document.getElementById('project-completion-date').value = project.completionDate || '';
    form.querySelector('button[type="submit"]').textContent = 'Save Changes';
    populateServiceCheckboxes(project.servicesNeeded);
    openModal('project-form-modal');

    const property = allProperties.find(p => p.id === project.propertyId);
    if (property) {
        initProjectAnnotationMap(sanitizeGeoJSON(property.geoJSON), project.annotations);
    }
}

function populateServiceCheckboxes(checkedServices = []) {
    const container = document.getElementById('project-service-needed');
    container.innerHTML = ALL_SERVICES.map(service => {
        const isChecked = Array.isArray(checkedServices) && checkedServices.includes(service);
        return `<label class="flex items-center"><input type="checkbox" name="serviceNeeded" value="${service}" class="mr-2 h-4 w-4" ${isChecked ? 'checked' : ''}>${service}</label>`;
    }).join('');
}

// --- My Profile Section ---
function renderMyProfile() {
    if (!currentUser) return;
    const defaultAvatar = 'https://placehold.co/128x128/8f8f8f/ffffff?text=No+Image';
    const formattedRole = currentUser.role ? currentUser.role.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : 'N/A';
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
    if (currentUser.role === 'forester') {
        detailsHTML += `<h4 class="text-xl font-semibold text-green-700 border-b pb-2 mb-2">Forester Details</h4>`;
        if (currentUser.experience) detailsHTML += `<p><strong>Years of Experience:</strong> ${currentUser.experience}</p>`;
        if (currentUser.specialties?.length > 0) {
            detailsHTML += `<p class="mt-2"><strong>Specialties:</strong></p><ul class="list-disc list-inside text-gray-700">${currentUser.specialties.map(item => `<li>${item}</li>`).join('')}</ul>`;
        }
    } else if (['logging-contractor', 'service-provider'].includes(currentUser.role)) {
        const title = currentUser.role === 'logging-contractor' ? 'Logging Contractor Details' : 'Services Offered';
        detailsHTML += `<h4 class="text-xl font-semibold text-green-700 border-b pb-2 mb-2">${title}</h4>`;
        if (currentUser.services?.length > 0) {
            detailsHTML += `<ul class="list-disc list-inside text-gray-700">${currentUser.services.map(item => `<li>${item}</li>`).join('')}</ul>`;
        } else {
            detailsHTML += `<p class="text-gray-500">No specific services listed.</p>`;
        }
    }
    roleSpecificContainer.innerHTML = detailsHTML;
    const mapContainer = document.getElementById('profile-map-container');
    if (currentUser.role !== 'seller') {
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
    ['edit-forester-fields', 'edit-logging-contractor-fields', 'edit-service-provider-fields', 'edit-profile-map-container'].forEach(id => document.getElementById(id).classList.add('hidden'));
    if (role !== 'seller') {
        document.getElementById('edit-profile-map-container').classList.remove('hidden');
        const radiusSlider = document.getElementById('service-radius-slider');
        const radiusValueSpan = document.getElementById('service-radius-value');
        radiusSlider.value = currentUser.serviceRadius || 50;
        radiusValueSpan.textContent = currentUser.serviceRadius || 50;
        radiusSlider.oninput = (e) => {
            radiusValueSpan.textContent = e.target.value;
            updateServiceAreaCircle(e.target.value);
        };
        if (role === 'forester') {
            document.getElementById('edit-forester-fields').classList.remove('hidden');
            document.getElementById('edit-forester-experience').value = currentUser.experience || '';
            const specialties = Array.isArray(currentUser.specialties) ? currentUser.specialties : [];
            document.querySelectorAll('#edit-forester-specialties input').forEach(box => box.checked = specialties.includes(box.value));
        } else if (role === 'logging-contractor') {
            document.getElementById('edit-logging-contractor-fields').classList.remove('hidden');
            const services = Array.isArray(currentUser.services) ? currentUser.services : [];
            document.querySelectorAll('#edit-logging-contractor-services input').forEach(box => box.checked = services.includes(box.value));
        } else if (role === 'service-provider') {
            document.getElementById('edit-service-provider-fields').classList.remove('hidden');
            const services = Array.isArray(currentUser.services) ? currentUser.services : [];
            document.querySelectorAll('#edit-service-provider-services input').forEach(box => box.checked = services.includes(box.value));
        }
    }
    openModal('edit-profile-modal');
    if (role !== 'seller') initEditProfileMap(currentUser);
}

async function handleUpdateProfile(event) {
    event.preventDefault();
    if (!currentUser) return;

    const submitButton = event.target.querySelector('button[type="submit"]');
    const originalButtonText = submitButton.textContent;

    submitButton.disabled = true;
    submitButton.textContent = 'Saving Changes...';
    
    const updatedData = {
        username: document.getElementById('edit-username').value.trim(),
        profilePictureUrl: document.getElementById('edit-profile-picture-url').value.trim(),
        company: document.getElementById('edit-company').value.trim(),
        bio: document.getElementById('edit-bio').value.trim(),
    };
    const role = currentUser.role;
    if (role !== 'seller') {
        const location = getUpdatedLocation();
        if (location) updatedData.location = { lat: location.lat, lng: location.lng };
        updatedData.serviceRadius = parseInt(document.getElementById('service-radius-slider').value, 10);
        if (role === 'forester') {
            updatedData.experience = document.getElementById('edit-forester-experience').value;
            updatedData.specialties = Array.from(document.querySelectorAll('#edit-forester-specialties input:checked')).map(box => box.value);
        } else if (role === 'logging-contractor') {
            updatedData.services = Array.from(document.querySelectorAll('#edit-logging-contractor-services input:checked')).map(box => box.value);
        } else if (role === 'service-provider') {
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
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = originalButtonText;
    }
}

async function loginAsDemoUser(role) {
    const uid = `demo-${role}`;
    let username = `Demo ${role.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}`;
    const defaultProfileData = {
        username, email: `${role}@demo.com`, role,
        createdAt: new Date(), rating: 4.5, reviewCount: 10, completedTransactions: 5,
        company: `${username} Inc.`, bio: `This is a demo account for a ${role.replace('-', ' ')}.`,
        profilePictureUrl: '', location: { lat: 34.7465, lng: -92.2896 }, serviceRadius: 100
    };
    if (role === 'seller') {
        delete defaultProfileData.location;
        delete defaultProfileData.serviceRadius;
        defaultProfileData.company = '';
    } else if (role === 'forester') {
        defaultProfileData.experience = 15;
        defaultProfileData.specialties = ['Timber Cruising & Appraisal', 'Forest Management Plans'];
    } else if (role === 'logging-contractor') {
        defaultProfileData.services = ['Timber Harvesting', 'Log Hauling'];
    } else if (role === 'service-provider') {
        defaultProfileData.services = ['Mechanical Site Prep', 'Hand Planting'];
    }
    try {
        const userDocRef = doc(db, 'users', uid);
        await setDoc(userDocRef, defaultProfileData, { merge: true });
        const userDoc = await getDoc(userDocRef);
        onUserStatusChange({ uid, ...userDoc.data() });
    } catch (error) {
        console.error("Could not create/login demo user in Firestore:", error);
        onUserStatusChange({ uid, ...defaultProfileData });
    }
    window.location.hash = '#my-profile';
}

// --- Haul Tickets ---
function initializeLogLoadForm() {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.getElementById('load-date').value = now.toISOString().slice(0, 16);
    const jobSelect = document.getElementById('load-job');
    jobSelect.innerHTML = `<option value="">Select an Active Job</option><option value="job-123">Project Alpha - Smith Property</option><option value="job-456">Project Bravo - Jones Tract</option>`;
    calculateNetWeight();
}

function calculateNetWeight() {
    const gross = parseFloat(document.getElementById('load-gross-weight').value) || 0;
    const tare = parseFloat(document.getElementById('load-tare-weight').value) || 0;
    const netLbs = gross - tare;
    const netTons = netLbs > 0 ? (netLbs / 2000).toFixed(2) : '0.00';
    document.getElementById('load-net-weight').textContent = netTons;
}

async function handleLogLoadSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    const loadData = Object.fromEntries(formData.entries());
    loadData.netTons = parseFloat(document.getElementById('load-net-weight').textContent);
    console.log("Submitting Load Data:", loadData);
    alert(`Load submitted successfully!\nNet Weight: ${loadData.netTons} tons`);
    form.reset();
    initializeLogLoadForm();
}