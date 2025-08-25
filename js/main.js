// js/main.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { firebaseConfig } from './config.js';
import { initializeAuth, handleLogin, handleSignup, handleLogout } from './auth.js';
import { 
    fetchProperties, fetchProfessionalProfiles, saveNewProperty, updateProperty, 
    deleteProperty, getPropertyById, getPropertiesForCurrentUser, 
    updateUserProfile, saveMarketplaceDataToSession
} from './firestore.js';
import { 
    initGlobalMap, updateMapAndList, initPropertyFormMap, getLastDrawnGeoJSON, 
    initProfileDisplayMap, initSignupMap, initEditProfileMap, getUpdatedLocation, 
    updateServiceAreaCircle, createGeocoder, getMapInstance
} from './map.js';

// --- Global State ---
let currentUser = null;
let allProperties = [];
let allProfessionalProfiles = [];
let db, auth; 

// --- Initialize App ---
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

    // Login/Signup
    document.getElementById('login-button')?.addEventListener('click', () => openModal('login-modal'));
    document.getElementById('signup-button')?.addEventListener('click', openSignupModal);
    document.getElementById('logout-button')?.addEventListener('click', () => handleLogout(auth));

    // Modal Controls
    document.getElementById('close-login-modal')?.addEventListener('click', () => closeModal('login-modal'));
    document.getElementById('close-signup-modal')?.addEventListener('click', () => closeModal('signup-modal'));
    document.getElementById('close-edit-profile-modal')?.addEventListener('click', () => closeModal('edit-profile-modal'));
    document.getElementById('cancel-edit-profile-button')?.addEventListener('click', () => closeModal('edit-profile-modal'));
    document.getElementById('close-property-form-modal')?.addEventListener('click', () => closeModal('property-form-modal'));
    document.getElementById('btn-cancel-property')?.addEventListener('click', () => closeModal('property-form-modal'));
    document.getElementById('close-map-search-modal')?.addEventListener('click', () => closeModal('map-search-modal'));

    // Forms
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
    
    // Property Management
    document.getElementById('btn-add-property')?.addEventListener('click', () => openPropertyForm());
    document.getElementById('property-form')?.addEventListener('submit', handleSaveProperty);

    // Marketplace
    document.querySelectorAll('#map-filters input[type="checkbox"]').forEach(box => {
        box.addEventListener('change', () => updateMapAndList(allProperties, allProfessionalProfiles));
    });

    // Profile
    document.getElementById('edit-my-profile-button')?.addEventListener('click', openEditProfileModal);
    document.getElementById('edit-profile-form')?.addEventListener('submit', handleUpdateProfile);

    // Delegated Event Listeners for dynamic content
    document.body.addEventListener('click', async (e) => {
        const editBtn = e.target.closest('.edit-property-btn');
        if (editBtn) {
            const propertyId = editBtn.dataset.propertyId;
            const prop = await getPropertyById(db, propertyId);
            if (prop) openPropertyForm(prop);
        }

        const deleteBtn = e.target.closest('.delete-property-btn');
        if (deleteBtn) {
            const propertyId = deleteBtn.dataset.propertyId;
            if (confirm("Are you sure?")) {
                await deleteProperty(db, propertyId);
                await renderPropertiesForCurrentUser();
            }
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
    
    // Signup Role Change
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

    // Demo Users
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
            initGlobalMap(() => updateMapAndList(allProperties, allProfessionalProfiles));
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
        
        profileLoginPrompt.classList.add('hidden');
        profileDetails.classList.remove('hidden');

    } else { 
        loginBtn.classList.remove('hidden');
        signupBtn.classList.remove('hidden');
        logoutBtn.classList.add('hidden');
        
        propertiesLoginPrompt.classList.remove('hidden');
        propertiesMainContent.classList.add('hidden');

        profileLoginPrompt.classList.remove('hidden');
        profileDetails.classList.add('hidden');
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
    if (!currentUser || currentUser.role !== 'seller') return;
    const propertyList = document.getElementById('property-list');
    const noPropertiesMessage = document.getElementById('no-properties-message');
    propertyList.innerHTML = '<p class="text-gray-500">Loading your properties...</p>';
    const userProperties = await getPropertiesForCurrentUser(db, currentUser.uid);
    allProperties = await fetchProperties(db); 
    propertyList.innerHTML = '';
    if (userProperties.length === 0) {
        noPropertiesMessage.classList.remove('hidden');
    } else {
        noPropertiesMessage.classList.add('hidden');
        userProperties.forEach(prop => {
            const li = document.createElement('li');
            li.className = 'p-4 border border-gray-200 rounded-md bg-gray-50 shadow-sm';
            li.innerHTML = `<div class="flex justify-between items-start"><div><h4 class="font-bold text-lg text-green-800">${prop.name}</h4><p class="text-sm text-gray-700">Service: ${prop.serviceType || 'N/A'}</p><p class="text-sm text-gray-700">Acreage: ${prop.acreage?.toFixed(2) || 'N/A'}</p></div><div class="flex space-x-2 mt-1"><button class="edit-property-btn bg-yellow-500 hover:bg-yellow-600 text-white text-sm px-3 py-1 rounded-md" data-property-id="${prop.id}">Edit</button><button class="delete-property-btn bg-red-500 hover:bg-red-600 text-white text-sm px-3 py-1 rounded-md" data-property-id="${prop.id}">Delete</button></div></div>`;
            propertyList.appendChild(li);
        });
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
        initPropertyFormMap(property.geoJSON);
    } else {
        title.textContent = 'Add New Property';
        document.getElementById('property-id').value = '';
        initPropertyFormMap(null);
    }
    openModal('property-form-modal');
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

async function loginAsDemoUser(role) {
    const uid = `demo-${role}`;
    const username = `Demo ${role.charAt(0).toUpperCase() + role.slice(1)}`;
    const defaultProfileData = {
        username, email: `${role}@demo.com`, role,
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
        console.error("Could not create demo user profile in Firestore:", error);
        onUserStatusChange({ uid, ...defaultProfileData });
    }
    navigateToSection('my-profile');
}