// js/main.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { firebaseConfig } from './config.js';
import { initializeAuth, handleLogin, handleSignup, handleLogout } from './auth.js';
import { 
    fetchProperties, fetchProfessionalProfiles, saveNewProperty, updateProperty, 
    deleteProperty, getPropertyById, getPropertiesForCurrentUser, 
    updateUserProfile, saveMarketplaceDataToSession, getUserProfileById
} from './firestore.js';
import { 
    initGlobalMap, initPropertyFormMap, getLastDrawnGeoJSON, 
    initProfileDisplayMap, initSignupMap, initEditProfileMap, getUpdatedLocation, 
    updateServiceAreaCircle, createGeocoder, getMapInstance, initPropertyDetailMap,
    addLayerControls, initMyPropertiesMap
} from './map.js';

// --- Global State ---
let currentUser = null;
let allProperties = [];
let allProfessionalProfiles = [];
let db, auth;
let myPropertiesMap, globalMap;
let mapLayers = new Map();

// --- Core App Logic ---

function createInteractiveMapAndList(mapInstance, listContainer, properties) {
    listContainer.innerHTML = '';
    
    for (const [key, value] of mapLayers.entries()) {
        if (value.map === mapInstance && value.type === 'property') {
            mapInstance.removeLayer(value.layer);
            mapLayers.delete(key);
        }
    }

    if (!properties || properties.length === 0) {
        const isMyProperties = listContainer.id === 'my-properties-list-container';
        if (!isMyProperties) {
             listContainer.innerHTML = `<div class="p-2 text-center text-gray-500">No properties in this view.</div>`;
        }
        return;
    }

    const allBounds = [];
    const listFragment = document.createDocumentFragment();
    const isMyPropertiesList = listContainer.id === 'my-properties-list-container';

    properties.forEach(prop => {
        const li = document.createElement('div');
        li.className = 'p-3 border-b last:border-b-0 cursor-pointer hover:bg-gray-100 transition-colors duration-150';
        li.dataset.propertyId = prop.id;

        if (isMyPropertiesList) {
             li.innerHTML = `
                <h4 class="font-bold text-xl text-green-800">${prop.name}</h4>
                <p class="text-sm text-gray-600">Service: <span class="font-medium text-gray-800">${prop.serviceType || 'N/A'}</span></p>
                <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm mt-2">
                    <div><p class="text-gray-500">Acreage</p><p class="font-semibold">${prop.acreage?.toFixed(2) || 'N/A'}</p></div>
                    <div><p class="text-gray-500">Timber Type</p><p class="font-semibold">${prop.timberType || 'N/A'}</p></div>
                </div>
                <div class="mt-3 flex space-x-2">
                    <button class="view-details-btn bg-blue-500 hover:bg-blue-600 text-white text-xs px-2 py-1.5 rounded-md font-semibold" data-property-id="${prop.id}">Details</button>
                    <button class="edit-property-btn bg-yellow-500 hover:bg-yellow-600 text-white text-xs px-2 py-1.5 rounded-md font-semibold" data-property-id="${prop.id}">Edit</button>
                    <button class="delete-property-btn bg-red-600 hover:bg-red-700 text-white text-xs px-2 py-1.5 rounded-md font-semibold" data-property-id="${prop.id}">Delete</button>
                </div>`;
        } else {
            li.innerHTML = `
                <div class="font-bold text-blue-700">${prop.name}</div>
                <div class="text-sm">${prop.serviceType} - ${prop.acreage?.toFixed(2) || 'N/A'} acres</div>
                <button class="view-details-btn text-xs text-blue-600 hover:underline font-semibold" data-property-id="${prop.id}">View Details</button>
            `;
        }
        
        listFragment.appendChild(li);
        
        if (prop.geoJSON?.geometry?.coordinates) {
            try {
                const displayGeoJSON = { ...prop.geoJSON, geometry: { ...prop.geoJSON.geometry, coordinates: [prop.geoJSON.geometry.coordinates] }};
                const polygonLayer = L.geoJSON(displayGeoJSON, {
                    style: { color: '#059669', weight: 2, fillColor: '#10B981', fillOpacity: 0.3 }
                });
                const center = polygonLayer.getBounds().getCenter();
                const centerMarker = L.circleMarker(center, {
                    radius: 6, fillColor: '#2563EB', color: '#FFFFFF',
                    weight: 1.5, opacity: 1, fillOpacity: 0.9
                });
                const featureGroup = L.featureGroup([polygonLayer, centerMarker]).bindPopup(`<b>${prop.name}</b>`);
                
                mapLayers.set(prop.id, { layer: featureGroup, map: mapInstance, type: 'property' });
                featureGroup.addTo(mapInstance);
                allBounds.push(polygonLayer.getBounds());

                li.addEventListener('mouseenter', () => {
                    polygonLayer.setStyle({ color: 'yellow', weight: 4 });
                    centerMarker.setStyle({ fillColor: 'yellow', radius: 8 });
                });
                li.addEventListener('mouseleave', () => {
                    polygonLayer.setStyle({ color: '#059669', weight: 2 });
                    centerMarker.setStyle({ fillColor: '#2563EB', radius: 6 });
                });
                
                featureGroup.on('mouseover', () => li.classList.add('bg-yellow-200', 'rounded-md'));
                featureGroup.on('mouseout', () => li.classList.remove('bg-yellow-200', 'rounded-md'));

                li.addEventListener('click', (e) => {
                    if (!e.target.closest('button')) {
                        mapInstance.fitBounds(featureGroup.getBounds(), { maxZoom: 15, paddingTopLeft: [50, 50] });
                        featureGroup.openPopup();
                    }
                });
            } catch (error) {
                console.error(`Failed to render property with ID: ${prop.id}. It may have corrupted location data.`, error);
            }
        }
    });
    
    listContainer.appendChild(listFragment);

    if (allBounds.length > 0 && !isMyPropertiesList) {
        mapInstance.fitBounds(L.latLngBounds(allBounds), { padding: [50, 50] });
    }
}


document.addEventListener('DOMContentLoaded', async () => {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = initializeAuth(app, db, onUserStatusChange);

  try {
    [allProperties, allProfessionalProfiles] = await Promise.all([
        fetchProperties(db),
        fetchProfessionalProfiles(db)
    ]);
    saveMarketplaceDataToSession(allProperties, allProfessionalProfiles);
  } catch (error) {
    console.error("Failed to fetch initial marketplace data:", error);
  }

  const sectionId = window.location.hash.substring(1) || 'home';
  await navigateToSection(sectionId);
  
  attachAllEventListeners();
});

function onUserStatusChange(user) {
    currentUser = user;
    updateLoginUI();
    const currentSection = document.querySelector('main section:not(.hidden-section)');
    if (currentSection) {
        navigateToSection(currentSection.id);
    }
}

function attachAllEventListeners() {
    document.querySelectorAll('[data-nav-target]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            navigateToSection(e.target.dataset.navTarget);
        });
    });

    document.getElementById('login-button')?.addEventListener('click', () => openModal('login-modal'));
    document.getElementById('signup-button')?.addEventListener('click', openSignupModal);
    document.getElementById('logout-button')?.addEventListener('click', () => handleLogout(auth));

    document.getElementById('close-login-modal')?.addEventListener('click', () => closeModal('login-modal'));
    document.getElementById('close-signup-modal')?.addEventListener('click', () => closeModal('signup-modal'));
    document.getElementById('close-edit-profile-modal')?.addEventListener('click', () => closeModal('edit-profile-modal'));
    document.getElementById('cancel-edit-profile-button')?.addEventListener('click', () => closeModal('edit-profile-modal'));
    document.getElementById('close-property-form-modal')?.addEventListener('click', () => closeModal('property-form-modal'));
    document.getElementById('btn-cancel-property')?.addEventListener('click', () => closeModal('property-form-modal'));
    document.getElementById('close-map-search-modal')?.addEventListener('click', () => closeModal('map-search-modal'));
    document.getElementById('close-property-detail-modal')?.addEventListener('click', () => closeModal('property-detail-modal'));
    document.getElementById('close-user-profile-modal')?.addEventListener('click', () => closeModal('user-profile-modal'));

    document.getElementById('login-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (await handleLogin(auth)) closeModal('login-modal');
    });
    document.getElementById('signup-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (await handleSignup(auth, db)) {
            closeModal('signup-modal');
            openModal('login-modal');
        }
    });
    document.getElementById('show-signup-from-login-link')?.addEventListener('click', (e) => { e.preventDefault(); closeModal('login-modal'); openSignupModal(); });
    document.getElementById('show-login-from-signup-link')?.addEventListener('click', (e) => { e.preventDefault(); closeModal('signup-modal'); openModal('login-modal'); });
    
    document.getElementById('btn-add-property')?.addEventListener('click', () => openPropertyForm());
    document.getElementById('property-form')?.addEventListener('submit', handleSaveProperty);

    document.querySelectorAll('#map-filters input[type="checkbox"]').forEach(box => {
        box.addEventListener('change', () => updateMapAndList(allProperties, allProfessionalProfiles));
    });

    document.getElementById('edit-my-profile-button')?.addEventListener('click', openEditProfileModal);
    document.getElementById('edit-profile-form')?.addEventListener('submit', handleUpdateProfile);

    document.body.addEventListener('click', async (e) => {
        const editBtn = e.target.closest('.edit-property-btn');
        if (editBtn) {
            const propertyId = editBtn.dataset.propertyId;
            const prop = await getPropertyById(db, propertyId);
            if (prop) openPropertyForm(prop);
            return;
        }

        const deleteBtn = e.target.closest('.delete-property-btn');
        if (deleteBtn) {
            const propertyId = deleteBtn.dataset.propertyId;
            if (confirm("Are you sure you want to delete this property?")) {
                await deleteProperty(db, propertyId);
                await renderPropertiesForCurrentUser();
            }
            return;
        }

        const detailsBtn = e.target.closest('.view-details-btn');
        if (detailsBtn) {
            const propertyId = detailsBtn.dataset.propertyId;
            const prop = await getPropertyById(db, propertyId);
            if (prop) openPropertyDetailModal(prop);
            return;
        }
        
        const profileBtn = e.target.closest('.view-profile-btn');
        if (profileBtn) {
            e.preventDefault();
            const userId = profileBtn.dataset.userId;
            const userProfile = await getUserProfileById(db, userId);
            if (userProfile) openUserProfileModal(userProfile);
            return;
        }

        const searchIcon = e.target.closest('.map-search-icon');
        if (searchIcon) {
            const mapId = searchIcon.dataset.mapId;
            const mapInstance = getMapInstance(mapId);
            if (mapInstance) {
                createGeocoder(mapInstance);
                openModal('map-search-modal');
            }
        }
    });
    
    document.getElementById('signup-role')?.addEventListener('change', (event) => {
        const role = event.target.value;
        ['forester-fields', 'buyer-fields', 'contractor-fields'].forEach(id => {
            document.getElementById(id).classList.add('hidden');
        });
        if (role && role !== 'seller') {
            document.getElementById(`${role}-fields`).classList.remove('hidden');
            initSignupMap(role);
        }
    });
    
    document.querySelectorAll('[data-demo-role]').forEach(button => {
        button.addEventListener('click', (e) => loginAsDemoUser(e.target.dataset.demoRole));
    });
}

function showSection(id) {
    window.location.hash = id;
    document.querySelectorAll('main section').forEach(sec => sec.classList.add('hidden-section'));
    const targetSection = document.getElementById(id);
    if (targetSection) {
        targetSection.classList.remove('hidden-section');
    }
}

async function navigateToSection(id) {
    showSection(id);
    switch (id) {
        case 'marketplace':
            if (!globalMap || !document.getElementById('global-map')._leaflet_id) {
                globalMap = initGlobalMap(); 
            }
            updateMapAndList(allProperties, allProfessionalProfiles);
            break;
        case 'properties':
            await renderPropertiesForCurrentUser();
            break;
        case 'my-profile':
            renderMyProfile();
            break;
    }
}

function updateLoginUI() {
    const loginBtn = document.getElementById('login-button');
    const signupBtn = document.getElementById('signup-button');
    const logoutBtn = document.getElementById('logout-button');
    const propertiesLoginPrompt = document.getElementById('properties-login-prompt');
    const propertiesMainContent = document.getElementById('properties-main-content');
    const profileLoginPrompt = document.getElementById('profile-login-prompt');
    const profileDetails = document.getElementById('profile-details');

    if (currentUser) {
        loginBtn.classList.add('hidden');
        signupBtn.classList.add('hidden');
        logoutBtn.classList.remove('hidden');

        const isSeller = currentUser.role === 'seller';
        propertiesLoginPrompt.classList.toggle('hidden', isSeller);
        propertiesMainContent.classList.toggle('hidden', !isSeller);
        
        if (profileLoginPrompt) profileLoginPrompt.classList.add('hidden');
        if (profileDetails) profileDetails.classList.remove('hidden');

    } else { 
        loginBtn.classList.remove('hidden');
        signupBtn.classList.remove('hidden');
        logoutBtn.classList.add('hidden');
        
        propertiesLoginPrompt.classList.remove('hidden');
        propertiesMainContent.classList.add('hidden');

        if (profileLoginPrompt) profileLoginPrompt.classList.remove('hidden');
        if (profileDetails) profileDetails.classList.add('hidden');
    }
}

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('hidden');
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('hidden');
}

function openSignupModal() {
    const modal = document.getElementById('signup-modal');
    if (modal) {
        modal.querySelector('form').reset();
        openModal('signup-modal');
    }
}

function openEditProfileModal() {
    if (!currentUser) return;
    document.getElementById('edit-username').value = currentUser.username || '';
    document.getElementById('edit-profile-picture-url').value = currentUser.profilePictureUrl || '';
    document.getElementById('edit-company').value = currentUser.company || '';
    document.getElementById('edit-bio').value = currentUser.bio || '';
    
    const role = currentUser.role;
    ['edit-forester-fields', 'edit-contractor-fields', 'edit-profile-map-container'].forEach(id => {
        document.getElementById(id).classList.add('hidden');
    });

    if (role === 'forester' || role === 'buyer' || role === 'contractor') {
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
            document.querySelectorAll('#edit-forester-specialties input').forEach(box => {
                box.checked = specialties.includes(box.value);
            });
        } else if (role === 'contractor') {
             document.getElementById('edit-contractor-fields').classList.remove('hidden');
            const services = Array.isArray(currentUser.services) ? currentUser.services : [];
            document.querySelectorAll('#edit-contractor-services input').forEach(box => {
                box.checked = services.includes(box.value);
            });
        }
    }
    
    openModal('edit-profile-modal');
    
    if (role !== 'seller') {
        initEditProfileMap(currentUser);
    }
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
    if (role !== 'seller') {
        updatedData.location = getUpdatedLocation();
        updatedData.serviceRadius = parseInt(document.getElementById('service-radius-slider').value, 10);
        if (role === 'forester') {
            updatedData.experience = document.getElementById('edit-forester-experience').value.trim();
            updatedData.specialties = Array.from(document.querySelectorAll('#edit-forester-specialties input:checked')).map(box => box.value);
        } else if (role === 'contractor') {
            updatedData.services = Array.from(document.querySelectorAll('#edit-contractor-services input:checked')).map(box => box.value);
        }
    }
    try {
        await updateUserProfile(db, currentUser.uid, updatedData);
        const userDoc = await getDoc(doc(db, "users", currentUser.uid));
        if (userDoc.exists()) {
             currentUser = { uid: currentUser.uid, ...userDoc.data() };
        }
        renderMyProfile();
        closeModal('edit-profile-modal');
        alert('Profile updated successfully!');
    } catch (error) {
        console.error("Error updating profile:", error);
    }
}

async function renderPropertiesForCurrentUser() {
    if (!currentUser || currentUser.role !== 'seller') {
        const content = document.getElementById('properties-main-content');
        if(content) content.classList.add('hidden');
        const prompt = document.getElementById('properties-login-prompt');
        if(prompt) prompt.classList.remove('hidden');
        return;
    }

    if (!myPropertiesMap || !document.getElementById('my-properties-map')?._leaflet_id) {
        myPropertiesMap = initMyPropertiesMap();
    }
    
    const listContainer = document.getElementById('my-properties-list-container');
    listContainer.innerHTML = '<div class="p-4 text-center text-gray-500">Loading your properties...</div>';
    
    const userProperties = await getPropertiesForCurrentUser(db, currentUser.uid);
    
    // The createInteractiveMapAndList function is now only for the marketplace
    // We need a dedicated function for the "My Properties" list
    renderMyPropertiesList(myPropertiesMap, listContainer, userProperties);
}

function renderMyPropertiesList(mapInstance, listContainer, properties) {
    listContainer.innerHTML = '';

    for (const [key, value] of mapLayers.entries()) {
        if (value.map === mapInstance) {
            mapInstance.removeLayer(value.layer);
            mapLayers.delete(key);
        }
    }

    if (!properties || properties.length === 0) {
        listContainer.innerHTML = `<div class="p-4 text-center text-gray-500">You have not added any properties yet.</div>`;
        return;
    }

    const allBounds = [];
    const listFragment = document.createDocumentFragment();

    properties.forEach(prop => {
        const li = document.createElement('div');
        li.className = 'p-3 border-b last:border-b-0 cursor-pointer hover:bg-gray-100 transition-colors duration-150';
        li.dataset.propertyId = prop.id;
        li.innerHTML = `
            <h4 class="font-bold text-xl text-green-800">${prop.name}</h4>
            <p class="text-sm text-gray-600">Service: <span class="font-medium text-gray-800">${prop.serviceType || 'N/A'}</span></p>
            <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm mt-2">
                <div><p class="text-gray-500">Acreage</p><p class="font-semibold">${prop.acreage?.toFixed(2) || 'N/A'}</p></div>
                <div><p class="text-gray-500">Timber Type</p><p class="font-semibold">${prop.timberType || 'N/A'}</p></div>
            </div>
            <div class="mt-3 flex space-x-2">
                <button class="view-details-btn bg-blue-500 hover:bg-blue-600 text-white text-xs px-2 py-1.5 rounded-md font-semibold" data-property-id="${prop.id}">Details</button>
                <button class="edit-property-btn bg-yellow-500 hover:bg-yellow-600 text-white text-xs px-2 py-1.5 rounded-md font-semibold" data-property-id="${prop.id}">Edit</button>
                <button class="delete-property-btn bg-red-600 hover:bg-red-700 text-white text-xs px-2 py-1.5 rounded-md font-semibold" data-property-id="${prop.id}">Delete</button>
            </div>`;
        listFragment.appendChild(li);

        if (prop.geoJSON?.geometry?.coordinates) {
            try {
                const displayGeoJSON = { ...prop.geoJSON, geometry: { ...prop.geoJSON.geometry, coordinates: [prop.geoJSON.geometry.coordinates] }};
                const polygonLayer = L.geoJSON(displayGeoJSON, { style: { color: '#059669', weight: 2, fillColor: '#10B981', fillOpacity: 0.3 } });
                const center = polygonLayer.getBounds().getCenter();
                const centerMarker = L.circleMarker(center, { radius: 6, fillColor: '#2563EB', color: '#FFFFFF', weight: 1.5, opacity: 1, fillOpacity: 0.9 });
                const featureGroup = L.featureGroup([polygonLayer, centerMarker]).bindPopup(`<b>${prop.name}</b>`);
                
                mapLayers.set(prop.id, { layer: featureGroup, map: mapInstance, type: 'property' });
                featureGroup.addTo(mapInstance);
                allBounds.push(polygonLayer.getBounds());

                li.addEventListener('mouseenter', () => {
                    polygonLayer.setStyle({ color: 'yellow', weight: 4 });
                    centerMarker.setStyle({ fillColor: 'yellow', radius: 8 });
                });
                li.addEventListener('mouseleave', () => {
                    polygonLayer.setStyle({ color: '#059669', weight: 2 });
                    centerMarker.setStyle({ fillColor: '#2563EB', radius: 6 });
                });
                
                featureGroup.on('mouseover', () => li.classList.add('bg-yellow-200', 'rounded-md'));
                featureGroup.on('mouseout', () => li.classList.remove('bg-yellow-200', 'rounded-md'));

                li.addEventListener('click', (e) => {
                    if (!e.target.closest('button')) {
                        mapInstance.fitBounds(featureGroup.getBounds(), { maxZoom: 15 });
                        featureGroup.openPopup();
                    }
                });
            } catch (error) {
                console.error(`Failed to render property with ID: ${prop.id}.`, error);
            }
        }
    });

    listContainer.appendChild(listFragment);

    if (allBounds.length > 0) {
        mapInstance.fitBounds(L.latLngBounds(allBounds), { padding: [50, 50] });
    }
}

function updateMapAndList(allProperties, allProfessionalProfiles) {
    if (!globalMap) return;
    
    const listContainer = document.getElementById('dynamic-map-list');
    const bounds = globalMap.getBounds();
    
    // Clear all layers before redrawing
    for (const [key, value] of mapLayers.entries()) {
        if (value.map === globalMap) {
            globalMap.removeLayer(value.layer);
            mapLayers.delete(key);
        }
    }
    
    const filters = {
        properties: document.getElementById('filter-properties').checked,
        foresters: document.getElementById('filter-foresters').checked,
        buyers: document.getElementById('filter-buyers').checked,
        contractors: document.getElementById('filter-contractors').checked
    };

    let visibleProperties = [];
    if (filters.properties) {
        visibleProperties = allProperties.filter(prop => {
            if (prop.geoJSON?.geometry?.coordinates) {
                try {
                    const displayGeoJSON = { ...prop.geoJSON, geometry: { ...prop.geoJSON.geometry, coordinates: [prop.geoJSON.geometry.coordinates] }};
                    const layerBounds = L.geoJSON(displayGeoJSON).getBounds();
                    return bounds.intersects(layerBounds);
                } catch (e) { return false; }
            }
            return false;
        });
    }
    
    createInteractiveMapAndList(globalMap, listContainer, visibleProperties);

    let itemsInView = visibleProperties.length;
    allProfessionalProfiles.forEach(prof => {
        const roleKey = prof.role + 's';
        if (filters[roleKey] && prof.location) {
            const profLatLng = L.latLng(prof.location.lat, prof.location.lng);
            if (bounds.contains(profLatLng)) {
                itemsInView++;
                const color = prof.role === 'forester' ? 'green' : prof.role === 'buyer' ? 'red' : 'yellow';
                
                const popupContent = `
                    <div class="font-bold text-base">${prof.username}</div>
                    <div class="text-sm text-gray-600">${prof.company || 'Independent'}</div>
                    <div class="text-sm">Role: ${prof.role.charAt(0).toUpperCase() + prof.role.slice(1)}</div>
                    <div class="text-sm">⭐ ${prof.rating?.toFixed(1) || 'N/A'} (${prof.reviewCount || 0} reviews)</div>
                `;
                
                const marker = L.circleMarker(profLatLng, {
                    radius: 8, color: 'white', weight: 2,
                    fillColor: color, fillOpacity: 1
                }).bindPopup(popupContent);
                
                mapLayers.set(prof.id, { layer: marker, map: globalMap, type: 'profile' });
                marker.addTo(globalMap);

                const li = document.createElement('li');
                li.className = 'p-3 border-b cursor-pointer hover:bg-gray-100 transition-colors';
                li.innerHTML = `
                    <div class="font-bold" style="color: ${color};">${prof.username}</div>
                    <div class="text-sm text-gray-700">${prof.company || 'Independent'}</div>
                    <div class="text-xs text-gray-500">⭐ ${prof.rating?.toFixed(1) || 'N/A'} (${prof.reviewCount || 0} reviews)</div>
                    <button class="view-profile-btn text-xs text-blue-600 hover:underline font-semibold" data-user-id="${prof.id}">View Profile</button>
                `;
                
                li.addEventListener('mouseenter', () => marker.setStyle({ radius: 11, weight: 3, color: 'cyan' }));
                li.addEventListener('mouseleave', () => marker.setStyle({ radius: 8, weight: 2, color: 'white' }));
                marker.on('mouseover', () => li.classList.add('bg-yellow-200'));
                marker.on('mouseout', () => li.classList.remove('bg-yellow-200'));

                li.onclick = (e) => {
                    if (!e.target.classList.contains('view-profile-btn')) {
                        globalMap.setView(marker.getLatLng(), 12);
                        marker.openPopup();
                    }
                };
                listContainer.appendChild(li);
            }
        }
    });

    if (itemsInView === 0) {
        listContainer.innerHTML = '<li class="p-2 text-center text-gray-500">No items in the current map view.</li>';
    }
}

function renderMyProfile() {
    if (!currentUser) return;
    const defaultAvatar = 'https://placehold.co/128x128/8f8f8f/ffffff?text=No+Image';
    document.getElementById('profile-picture-display').src = currentUser.profilePictureUrl || defaultAvatar;
    document.getElementById('profile-username').textContent = currentUser.username || 'N/A';
    document.getElementById('profile-company').textContent = currentUser.company || 'Independent';
    document.getElementById('profile-bio').textContent = currentUser.bio || 'No biography provided.';
    document.getElementById('profile-role').textContent = currentUser.role ? (currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1)) : 'N/A';
    document.getElementById('profile-email').textContent = currentUser.email || 'N/A';
    document.getElementById('profile-member-since').textContent = currentUser.createdAt?.toDate ? currentUser.createdAt.toDate().toLocaleDateString() : 'N/A';
    document.getElementById('profile-rating').textContent = currentUser.rating?.toFixed(1) || 'N/A';
    document.getElementById('profile-review-count').textContent = currentUser.reviewCount || 0;
    document.getElementById('profile-transactions').textContent = currentUser.completedTransactions || 0;
    const roleSpecificContainer = document.getElementById('profile-role-specific-data');
    const mapContainer = document.getElementById('profile-map-container');
    roleSpecificContainer.innerHTML = '';
    if (currentUser.role !== 'seller') {
        mapContainer.classList.remove('hidden');
        initProfileDisplayMap(currentUser);
        if (currentUser.role === 'forester' && currentUser.experience) {
            roleSpecificContainer.innerHTML = `<h4 class="text-xl font-semibold text-green-700 border-b pb-2 mb-2">Forester Details</h4><p><strong>Experience:</strong> ${currentUser.experience} years</p>`;
        }
    } else {
        mapContainer.classList.add('hidden');
    }
}

function openPropertyForm(property = null) {
    const form = document.getElementById('property-form');
    form.reset();
    const title = document.getElementById('property-form-title');

    if (property) {
        title.textContent = 'Edit Property Details';
        document.getElementById('property-id').value = property.id;
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
    } else {
        title.textContent = 'Add New Property';
        document.getElementById('property-id').value = '';
    }
    
    openModal('property-form-modal');
    initPropertyFormMap(property ? property.geoJSON : null);
}

function getPropertyDataFromForm() {
    const acreage = document.getElementById('calculated-acreage').textContent;
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
        acreage: parseFloat(acreage) || 0
    };
}

async function handleSaveProperty(event) {
    event.preventDefault();
    const propertyId = document.getElementById('property-id').value;
    const propertyData = getPropertyDataFromForm();
    const geoJSON = getLastDrawnGeoJSON();
    if (!geoJSON) {
        alert("Please draw the property boundary on the map before saving.");
        return;
    }
    try {
        if (propertyId) {
            await updateProperty(db, propertyId, geoJSON, propertyData);
            alert('Property updated successfully!');
        } else {
            await saveNewProperty(db, currentUser, geoJSON, propertyData);
            alert('Property saved successfully!');
        }
        closeModal('property-form-modal');
        await renderPropertiesForCurrentUser();
    } catch (error) {
        alert(error.message);
    }
}

function openPropertyDetailModal(property) {
    const detailContent = document.getElementById('property-detail-content');
    if (!detailContent) return;

    detailContent.innerHTML = `
        <h3 class="text-2xl font-bold text-green-800">${property.name}</h3>
        <div id="property-detail-map" style="height: 400px; border-radius: 0.5rem; border: 1px solid #ccc;"></div>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4 text-sm">
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
    `;

    openModal('property-detail-modal');
    initPropertyDetailMap(property.geoJSON);
}

function openUserProfileModal(user) {
    const profileContent = document.getElementById('user-profile-content');
    if (!profileContent) return;

    const defaultAvatar = 'https://placehold.co/128x128/8f8f8f/ffffff?text=No+Image';
    const role = user.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : 'N/A';
    
    profileContent.innerHTML = `
        <div class="flex items-center space-x-4">
            <img src="${user.profilePictureUrl || defaultAvatar}" alt="Profile Picture" class="w-24 h-24 rounded-full border-4 border-gray-200">
            <div>
                <h3 class="text-2xl font-bold text-gray-800">${user.username}</h3>
                <p class="text-md text-gray-600">${user.company || 'Independent'}</p>
                <p class="text-md font-semibold text-gray-800">${role}</p>
            </div>
        </div>
        <div class="mt-4 border-t pt-4">
            <h4 class="font-semibold text-gray-800">About</h4>
            <p class="text-gray-700 mt-1">${user.bio || 'No biography provided.'}</p>
        </div>
        <div class="grid grid-cols-2 gap-4 text-center mt-4">
             <div class="bg-gray-100 p-3 rounded-lg"><p class="text-xl font-bold text-yellow-500">${user.rating?.toFixed(1) || 'N/A'}</p><p class="text-sm text-gray-600">Rating (${user.reviewCount || 0} reviews)</p></div>
             <div class="bg-gray-100 p-3 rounded-lg"><p class="text-xl font-bold text-green-600">${user.completedTransactions || 0}</p><p class="text-sm text-gray-600">Completed Transactions</p></div>
        </div>
        <div id="profile-modal-map-container" class="mt-4">
             <h4 class="font-semibold text-gray-800">Service Area</h4>
             <div id="profile-map-display" class="w-full h-64 rounded-lg border"></div>
        </div>
    `;

    openModal('user-profile-modal');
    
    if (user.role !== 'seller' && user.location) {
       initProfileDisplayMap(user);
    } else {
       const mapContainer = profileContent.querySelector('#profile-modal-map-container');
       if(mapContainer) mapContainer.innerHTML = '<p class="text-center text-gray-500 p-4">No service area specified.</p>';
    }
}

async function loginAsDemoUser(role) {
    const uid = `demo-${role}`;
    const username = `Demo ${role.charAt(0).toUpperCase() + role.slice(1)}`;
    const defaultProfileData = {
        username, email: `${role}@demo.com`, role,
        createdAt: new Date(),
        rating: 4.5, reviewCount: 10, completedTransactions: 5,
        company: role === 'seller' ? '' : `${username} Services Inc.`,
        bio: `This is a demo account for a ${role}.`,
        profilePictureUrl: '',
        location: { lat: 34.7465, lng: -92.2896 },
        serviceRadius: 100,
        ...(role === 'forester' && { experience: 15, specialties: ['Timber Cruising', 'Reforestation'] }),
        ...(role === 'contractor' && { services: ['Logging', 'Site Prep'] }),
    };
    if (role === 'seller') {
        delete defaultProfileData.location;
        delete defaultProfileData.serviceRadius;
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
    navigateToSection('my-profile');
}