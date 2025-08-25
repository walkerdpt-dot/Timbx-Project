// js/main.js

// Firebase Imports
// MODIFICATION: Added 'getDoc' to the import list
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

// Local Module Imports
import { firebaseConfig } from './config.js';
import { initializeAuth, handleLogin, handleSignup, handleLogout, handleGoogleSignIn } from './auth.js';
import { fetchProperties, fetchProfessionalProfiles, saveNewProperty, deleteProperty, assignForester, getPropertyById, placeBid, saveCruiseData, getPropertiesForCurrentUser, getProjectsForUser, markProjectComplete, saveMarketplaceDataToSession, updateUserProfile } from './firestore.js';
import { initPropertyFormMap, destroyPropertyFormMap, getLastDrawnGeoJSON, initGlobalMap, updateMapAndList, showPropertyMap as displayPropertyMap, initSignupMap, initEditProfileMap, getUpdatedLocation, updateServiceAreaCircle, initProfileDisplayMap } from './map.js';

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

  console.log("Fetching initial public data for marketplace...");
  try {
    [allProperties, allProfessionalProfiles] = await Promise.all([
        fetchProperties(db),
        fetchProfessionalProfiles(db)
    ]);
    saveMarketplaceDataToSession(allProperties, allProfessionalProfiles);
    console.log(`Data fetched and saved to session: ${allProperties.length} properties, ${allProfessionalProfiles.length} profiles.`);
  } catch (error) {
    console.error("Failed to fetch initial marketplace data:", error);
    alert("Could not load marketplace data. Please try refreshing the page.");
  }

  if (window.location.hash) {
    const sectionId = window.location.hash.substring(1);
    navigateToSection(sectionId);
  } else {
    showSection('home');
  }

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

// --- Navigation & UI ---
function attachAllEventListeners() {
    // Nav Bar
    document.querySelectorAll('[data-nav-target]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const sectionId = e.target.dataset.navTarget;
            window.location.hash = sectionId;
            navigateToSection(sectionId);
        });
    });

    document.getElementById('login-button')?.addEventListener('click', () => openModal('login-modal'));
    document.getElementById('signup-button')?.addEventListener('click', openSignupModal);
    document.getElementById('logout-button')?.addEventListener('click', () => handleLogout(auth));

    // Modals
    document.getElementById('close-login-modal')?.addEventListener('click', () => closeModal('login-modal'));
    document.getElementById('close-signup-modal')?.addEventListener('click', () => closeModal('signup-modal'));
    document.getElementById('close-bid-details-modal')?.addEventListener('click', () => closeModal('bid-details-modal'));
    document.getElementById('close-cruise-details-modal')?.addEventListener('click', () => closeModal('cruise-details-modal'));
    document.getElementById('close-forester-recommendation-modal')?.addEventListener('click', () => closeModal('forester-recommendation-modal'));
    document.getElementById('close-forester-recommendation-btn')?.addEventListener('click', () => closeModal('forester-recommendation-modal'));
    document.getElementById('close-view-map-modal')?.addEventListener('click', () => closeModal('view-map-modal'));
    document.getElementById('close-lease-details-modal')?.addEventListener('click', () => closeModal('lease-details-modal'));
    document.getElementById('close-edit-profile-modal')?.addEventListener('click', () => closeModal('edit-profile-modal'));
    document.getElementById('cancel-edit-profile-button')?.addEventListener('click', () => closeModal('edit-profile-modal'));


    document.getElementById('show-signup-from-login-link')?.addEventListener('click', (e) => { e.preventDefault(); closeModal('login-modal'); openSignupModal(); });
    document.getElementById('show-login-from-signup-link')?.addEventListener('click', (e) => { e.preventDefault(); closeModal('signup-modal'); openModal('login-modal'); });

    // Auth Actions
    document.getElementById('handle-login-button')?.addEventListener('click', async (event) => {
        event.preventDefault(); 
        const success = await handleLogin(auth, db);
        if (success) closeModal('login-modal');
    });
    document.getElementById('handle-signup-button')?.addEventListener('click', async (event) => {
        event.preventDefault(); 
        const success = await handleSignup(auth, db);
        if (success) {
            closeModal('signup-modal');
            alert("Signup successful! Please log in.");
            openModal('login-modal');
        }
    });
    document.getElementById('handle-google-sign-in-button')?.addEventListener('click', handleGoogleSignIn);

    // My Properties Section
    document.getElementById('btn-add-property')?.addEventListener('click', showPropertyForm);
    document.getElementById('btn-cancel-property')?.addEventListener('click', cancelPropertyForm);
    document.getElementById('btn-save-property')?.addEventListener('click', handleSaveProperty);
    
    // Marketplace
    document.querySelectorAll('#map-filters input[type="checkbox"]').forEach(box => {
        box.addEventListener('change', () => updateMapAndList(allProperties, allProfessionalProfiles));
    });

    // Forester Recommendation Modal
    document.getElementById('find-forester-now-button')?.addEventListener('click', () => {
        closeModal('forester-recommendation-modal');
        navigateToSection('marketplace');
    });

    // My Profile Section
    document.getElementById('edit-my-profile-button')?.addEventListener('click', openEditProfileModal);
    document.getElementById('edit-profile-form')?.addEventListener('submit', handleUpdateProfile);


    document.body.addEventListener('click', async (e) => {
        if (e.target.matches('.view-details-btn')) {
            const propertyId = e.target.dataset.propertyId;
            await showBidDetails(propertyId);
        }
        if (e.target.matches('.delete-property-btn')) {
            const propertyId = e.target.dataset.propertyId;
            if (confirm("Are you sure you want to delete this property?")) {
                await deleteProperty(db, propertyId);
                await renderPropertiesForCurrentUser();
            }
        }
        if (e.target.matches('.show-property-map-btn')) {
            const propertyId = e.target.dataset.propertyId;
            const prop = allProperties.find(p => p.id === propertyId);
            if (prop) displayPropertyMap(prop);
        }
        if (e.target.matches('#place-bid-button')) {
            const propertyId = e.target.dataset.propertyId;
            const amount = parseFloat(document.getElementById('bid-amount').value);
            try {
                await placeBid(db, propertyId, amount, currentUser);
                alert("Bid placed successfully!");
                closeModal('bid-details-modal');
                await renderMyProjects();
            } catch (error) {
                alert(error.message);
            }
        }
        if (e.target.matches('#save-cruise-data-button')) {
            const propertyId = e.target.dataset.propertyId;
            try {
                await saveCruiseData(db, propertyId, currentUser);
                alert("Cruise data saved!");
                closeModal('cruise-details-modal');
                await renderMyProjects();
            } catch (error) {
                alert(`Error saving cruise data: ${error.message}`);
            }
        }
        if (e.target.matches('.show-cruise-details-btn')) {
            const propertyId = e.target.dataset.propertyId;
            showCruiseDetails(propertyId);
        }
        if (e.target.matches('.perform-cruise-btn')) {
            const propertyId = e.target.dataset.propertyId;
            await showPerformCruiseModal(propertyId);
        }
        if (e.target.matches('.mark-complete-btn')) {
            const propertyId = e.target.dataset.propertyId;
            await markProjectComplete(db, propertyId);
            await renderMyProjects();
        }
    });

    document.getElementById('signup-role').addEventListener('change', (event) => {
        const role = event.target.value;
        document.getElementById('forester-fields').classList.add('hidden');
        document.getElementById('buyer-fields').classList.add('hidden');
        document.getElementById('contractor-fields').classList.add('hidden');
        if (role) {
            document.getElementById(`${role}-fields`).classList.remove('hidden');
            initSignupMap(role);
        }
    });

    document.querySelectorAll('[data-demo-role]').forEach(button => {
        button.addEventListener('click', (e) => loginAsDemoUser(e.target.dataset.demoRole));
    });
}

function showSection(id) {
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
        case 'hunting-leases':
            console.log("Navigated to Hunting Leases (functionality to be added).");
            break;
        case 'my-projects':
            await renderMyProjects();
            break;
        case 'my-profile':
            renderMyProfile();
            break;
        case 'my-messages':
            renderMessages();
            break;
    }
}

function updateLoginUI() {
    const loginBtn = document.getElementById('login-button');
    const signupBtn = document.getElementById('signup-button');
    const logoutBtn = document.getElementById('logout-button');
    const propertiesLoginPrompt = document.getElementById('properties-login-prompt');
    const propertiesMainContent = document.getElementById('properties-main-content');
    const myProjectsLoginPrompt = document.getElementById('my-projects-login-prompt');
    const myProjectsContent = document.getElementById('my-projects-content');
    const profileLoginPrompt = document.getElementById('profile-login-prompt');
    const profileDetails = document.getElementById('profile-details');
    const messagesLoginPrompt = document.getElementById('messages-login-prompt');
    const messagesContent = document.getElementById('messages-content');

    if (currentUser) {
        loginBtn.classList.add('hidden');
        signupBtn.classList.add('hidden');
        logoutBtn.classList.remove('hidden');

        propertiesLoginPrompt.classList.toggle('hidden', currentUser.role === 'seller');
        propertiesMainContent.classList.toggle('hidden', currentUser.role !== 'seller');
        
        myProjectsLoginPrompt.classList.add('hidden');
        myProjectsContent.classList.remove('hidden');

        profileLoginPrompt.classList.add('hidden');
        profileDetails.classList.remove('hidden');

        messagesLoginPrompt.classList.add('hidden');
        messagesContent.classList.remove('hidden');

    } else { 
        loginBtn.classList.remove('hidden');
        signupBtn.classList.remove('hidden');
        logoutBtn.classList.add('hidden');
        
        propertiesLoginPrompt.classList.remove('hidden');
        propertiesMainContent.classList.add('hidden');
        
        myProjectsLoginPrompt.classList.remove('hidden');
        myProjectsContent.classList.add('hidden');
        
        profileLoginPrompt.classList.remove('hidden');
        profileDetails.classList.add('hidden');

        messagesLoginPrompt.classList.remove('hidden');
        messagesContent.classList.add('hidden');
    }
}

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('hidden');
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
    }
}

function openSignupModal() {
    document.getElementById('signup-username').value = '';
    document.getElementById('signup-email').value = '';
    document.getElementById('signup-password').value = '';
    document.getElementById('signup-role').value = '';
    // NEW: Clear new optional fields
    document.getElementById('signup-profile-picture-url').value = '';
    document.getElementById('signup-company').value = '';
    document.getElementById('signup-bio').value = '';
    
    document.getElementById('forester-fields').classList.add('hidden');
    document.getElementById('buyer-fields').classList.add('hidden');
    document.getElementById('contractor-fields').classList.add('hidden');
    openModal('signup-modal');
}


// --- Rendering Functions ---

async function renderPropertiesForCurrentUser() {
    if (!currentUser || currentUser.role !== 'seller') {
        return;
    }
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
            const bidsHtml = prop.bids && prop.bids.length > 0 ? `Bids: ${prop.bids.length}` : 'No bids yet';
            const li = document.createElement('li');
            li.className = 'p-4 border border-gray-200 rounded-md bg-gray-50 shadow-sm';
            li.innerHTML = `
                <h4 class="font-bold text-lg text-green-800">${prop.name}</h4>
                <p class="text-sm text-gray-700">Service: ${prop.serviceType || 'N/A'}</p>
                <p class="text-sm text-gray-700">${bidsHtml}</p>
                <div class="flex space-x-2 mt-2">
                    <button class="delete-property-btn bg-red-500 hover:bg-red-600 text-white text-sm px-3 py-1 rounded-md" data-property-id="${prop.id}">Delete</button>
                    <button class="show-property-map-btn bg-indigo-500 hover:bg-indigo-600 text-white text-sm px-3 py-1 rounded-md" data-property-id="${prop.id}">View Map</button>
                </div>
            `;
            propertyList.appendChild(li);
        });
    }
}

async function renderMyProjects() {
    const list = document.getElementById('my-projects-list');
    const message = document.getElementById('no-my-projects-message');
    if (!currentUser) return;

    list.innerHTML = '<p class="text-gray-500">Loading projects...</p>';
    const projects = await getProjectsForUser(db, currentUser);
    list.innerHTML = '';

    if (projects.length === 0) {
        message.classList.remove('hidden');
    } else {
        message.classList.add('hidden');
        projects.forEach(prop => {
            const li = document.createElement('li');
            li.className = 'p-4 border border-gray-200 rounded-md bg-gray-50 shadow-sm';
            let contentHtml = '';
            if (currentUser.role === 'forester') {
                contentHtml = `
                    <h4 class="font-bold text-lg text-green-800">${prop.name} (Client: ${prop.ownerUsername})</h4>
                    <p>Status: ${prop.forester.status || 'Assigned'}</p>
                    <button class="perform-cruise-btn bg-purple-600 text-white text-sm px-3 py-1 rounded-md mt-2" data-property-id="${prop.id}">Perform/Edit Cruise</button>
                    <button class="mark-complete-btn bg-green-600 text-white text-sm px-3 py-1 rounded-md mt-2" data-property-id="${prop.id}">Mark Complete</button>
                `;
            } else if (currentUser.role === 'buyer') {
                const myBid = prop.bids.find(b => b.bidderId === currentUser.uid);
                contentHtml = `
                    <h4 class="font-bold text-lg text-green-800">Your Bid on ${prop.name}</h4>
                    <p>Your Bid: $${myBid.amount.toLocaleString()}</p>
                    <button class="view-details-btn bg-green-500 text-white text-sm px-3 py-1 rounded-md mt-2" data-property-id="${prop.id}">View/Update Bid</button>
                `;
            } else { // Seller
                contentHtml = `<h4 class="font-bold text-lg text-green-800">${prop.name} (Your Property)</h4><p>Service: ${prop.serviceType}</p><button class="view-details-btn bg-blue-500 text-white text-sm px-3 py-1 rounded-md mt-2" data-property-id="${prop.id}">View Bids</button>`;
            }
            li.innerHTML = contentHtml;
            list.appendChild(li);
        });
    }
}

function renderMyProfile() {
    if (!currentUser) return;
    
    // MODIFICATION: Using a more reliable placeholder URL
    const defaultAvatar = 'https://placehold.co/128x128/8f8f8f/ffffff?text=No+Image';

    // Populate new profile fields
    document.getElementById('profile-picture-display').src = currentUser.profilePictureUrl || defaultAvatar;
    document.getElementById('profile-username').textContent = currentUser.username || 'N/A';
    document.getElementById('profile-company').textContent = currentUser.company || 'Independent';
    document.getElementById('profile-bio').textContent = currentUser.bio || 'No biography provided.';
    
    // Populate existing fields
    document.getElementById('profile-role').textContent = currentUser.role ? (currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1)) : 'N/A';
    document.getElementById('profile-uid').textContent = currentUser.uid;
    document.getElementById('profile-email').textContent = currentUser.email || 'N/A';
    document.getElementById('profile-member-since').textContent = currentUser.createdAt?.toDate ? currentUser.createdAt.toDate().toLocaleDateString() : 'N/A';
    
    // Stats
    document.getElementById('profile-rating').textContent = currentUser.rating?.toFixed(1) || 'N/A';
    document.getElementById('profile-review-count').textContent = currentUser.reviewCount || 0;
    document.getElementById('profile-transactions').textContent = currentUser.completedTransactions || 0;

    // Handle role-specific data and map visibility
    const roleSpecificContainer = document.getElementById('profile-role-specific-data');
    const mapContainer = document.getElementById('profile-map-container');
    roleSpecificContainer.innerHTML = ''; // Clear previous content

    if (currentUser.role === 'forester' || currentUser.role === 'buyer' || currentUser.role === 'contractor') {
        mapContainer.classList.remove('hidden');
        initProfileDisplayMap(currentUser);
        // You can add more role-specific details to display here
        if (currentUser.role === 'forester' && currentUser.experience) {
            roleSpecificContainer.innerHTML = `<h4 class="text-xl font-semibold text-green-700 border-b pb-2 mb-2">Forester Details</h4><p><strong>Experience:</strong> ${currentUser.experience} years</p>`;
        }
    } else {
        mapContainer.classList.add('hidden');
    }
}

function renderMessages() {
    const messagesContent = document.getElementById('messages-content');
    messagesContent.classList.toggle('hidden', !currentUser);
}

// --- Specific Actions ---

function showPropertyForm() {
    document.getElementById('properties-main-content').classList.add('hidden');
    document.getElementById('property-form').classList.remove('hidden');
    initPropertyFormMap();
}

function cancelPropertyForm() {
    document.getElementById('property-form').classList.add('hidden');
    document.getElementById('properties-main-content').classList.remove('hidden');
    destroyPropertyFormMap();
}

async function handleSaveProperty() {
    document.getElementById('property-form-loading-indicator').classList.remove('hidden');
    try {
        const geoJSON = getLastDrawnGeoJSON();
        const { id, serviceType } = await saveNewProperty(db, currentUser, geoJSON);
        
        alert('Property saved successfully!');
        cancelPropertyForm();
        await renderPropertiesForCurrentUser();

        if (serviceType === 'Timber Harvest' || serviceType === 'Forester Recommendation') {
            await showForesterRecommendationModal(id);
        }
    } catch (error) {
        alert(error.message);
    } finally {
        document.getElementById('property-form-loading-indicator').classList.add('hidden');
    }
}

function openEditProfileModal() {
    if (!currentUser) return;
    console.log("Opening edit modal for user:", currentUser);

    // Reset fields
    document.getElementById('edit-forester-fields').classList.add('hidden');
    document.getElementById('edit-buyer-fields').classList.add('hidden');
    document.getElementById('edit-contractor-fields').classList.add('hidden');
    document.getElementById('edit-profile-map-container').classList.add('hidden');

    // Populate general info
    document.getElementById('edit-username').value = currentUser.username || '';
    document.getElementById('edit-profile-picture-url').value = currentUser.profilePictureUrl || '';
    document.getElementById('edit-company').value = currentUser.company || '';
    document.getElementById('edit-bio').value = currentUser.bio || '';
    
    // Enable the save button
    const saveButton = document.getElementById('save-profile-changes-button');
    saveButton.disabled = false;
    saveButton.title = "";
    saveButton.classList.remove('bg-gray-400', 'cursor-not-allowed');
    saveButton.classList.add('bg-green-600', 'hover:bg-green-700');
    document.getElementById('edit-profile-message').classList.add('hidden');

    const role = currentUser.role;
    if (role === 'forester' || role === 'buyer' || role === 'contractor') {
        document.getElementById('edit-profile-map-container').classList.remove('hidden');

        // Setup slider
        const radiusSlider = document.getElementById('service-radius-slider');
        const radiusValueSpan = document.getElementById('service-radius-value');
        const initialRadius = currentUser.serviceRadius || 50;
        
        radiusSlider.value = initialRadius;
        radiusValueSpan.textContent = initialRadius;
        
        radiusSlider.addEventListener('input', (e) => {
            const newRadius = e.target.value;
            radiusValueSpan.textContent = newRadius;
            updateServiceAreaCircle(newRadius);
        });

        if (role === 'forester') {
            document.getElementById('edit-forester-experience').value = currentUser.experience || '';
            const specialties = Array.isArray(currentUser.specialties) ? currentUser.specialties : [];
            document.querySelectorAll('#edit-forester-specialties input').forEach(box => {
                box.checked = specialties.includes(box.value);
            });
            document.getElementById('edit-forester-fields').classList.remove('hidden');
        } else if (role === 'buyer') {
            document.getElementById('edit-buyer-looking-for').value = currentUser.lookingFor || '';
            document.getElementById('edit-buyer-fields').classList.remove('hidden');
        } else if (role === 'contractor') {
            const services = Array.isArray(currentUser.services) ? currentUser.services : [];
            document.querySelectorAll('#edit-contractor-services input').forEach(box => {
                box.checked = services.includes(box.value);
            });
            document.getElementById('edit-contractor-fields').classList.remove('hidden');
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
    if (role === 'forester' || role === 'buyer' || role === 'contractor') {
        updatedData.location = getUpdatedLocation();
        updatedData.serviceRadius = parseInt(document.getElementById('service-radius-slider').value, 10);
        
        if (role === 'forester') {
            updatedData.experience = document.getElementById('edit-forester-experience').value.trim();
            updatedData.specialties = Array.from(document.querySelectorAll('#edit-forester-specialties input:checked')).map(box => box.value);
        } else if (role === 'buyer') {
            updatedData.lookingFor = document.getElementById('edit-buyer-looking-for').value.trim();
        } else if (role === 'contractor') {
            updatedData.services = Array.from(document.querySelectorAll('#edit-contractor-services input:checked')).map(box => box.value);
        }
    }

    try {
        await updateUserProfile(db, currentUser.uid, updatedData);
        // Fetch the full updated profile from Firestore to ensure local data is accurate
        const userDoc = await getDoc(doc(db, "users", currentUser.uid));
        if (userDoc.exists()) {
             currentUser = { uid: currentUser.uid, ...userDoc.data() };
        }
       
        renderMyProfile();
        closeModal('edit-profile-modal');
        alert('Profile updated successfully!');
    } catch (error) {
        console.error("Error updating profile:", error);
        document.getElementById('edit-profile-message').textContent = 'Failed to update profile. Please try again.';
        document.getElementById('edit-profile-message').classList.remove('hidden');
    }
}

async function showForesterRecommendationModal(propertyId) {
    const modal = document.getElementById('forester-recommendation-modal');
    const optionsContainer = document.getElementById('forester-recommendation-options');
    optionsContainer.innerHTML = '<p>Finding local foresters...</p>';
    openModal('forester-recommendation-modal');

    const foresters = allProfessionalProfiles.filter(p => p.role === 'forester');
    if (foresters.length > 0) {
        optionsContainer.innerHTML = '<h4>Recommended Foresters:</h4>' + foresters.slice(0, 3).map(f => `
            <div class="p-2 border rounded-md my-2">
                <p><b>${f.username}</b> - Rating: ${f.rating}/5.0</p>
                <button onclick="window.assignForesterToProperty('${propertyId}', '${f.uid}', '${f.username}')" class="bg-blue-500 text-white px-2 py-1 rounded text-sm mt-1">Contact ${f.username}</button>
            </div>
        `).join('');
    } else {
        optionsContainer.innerHTML = '<p>No foresters found.</p>';
    }
}

window.assignForesterToProperty = async function(propertyId, foresterUid, foresterUsername) {
    try {
        await assignForester(db, propertyId, foresterUid, foresterUsername);
        alert(`Forester ${foresterUsername} has been notified!`);
        closeModal('forester-recommendation-modal');
        await renderPropertiesForCurrentUser();
    } catch (error) {
        alert('Could not assign forester.');
    }
}

async function showBidDetails(propertyId) {
    const property = await getPropertyById(db, propertyId);
    if (!property) return;

    const content = document.getElementById('bid-details-content');
    const highestBid = property.bids.length > 0 ? Math.max(...property.bids.map(b => b.amount)) : 0;

    let placeBidHtml = '';
    if (currentUser && currentUser.role === 'buyer') {
        placeBidHtml = `
            <div class="mt-4">
                <label for="bid-amount" class="block text-sm font-medium">Your Bid ($):</label>
                <input type="number" id="bid-amount" class="mt-1 block w-full p-2 border rounded-md" min="${highestBid + 1}">
                <button id="place-bid-button" data-property-id="${property.id}" class="mt-2 bg-blue-600 text-white w-full py-2 rounded">Place/Update Bid</button>
            </div>
        `;
    }

    content.innerHTML = `
        <h3 class="text-2xl font-bold mb-4">${property.name}</h3>
        <p>Owner: ${property.ownerUsername}</p>
        <p>Timber Type: ${property.timberType}</p>
        <p class="font-bold mt-2">Current Highest Bid: <span class="text-green-600">$${highestBid.toLocaleString()}</span></p>
        ${property.forester?.cruiseData ? `<button class="show-cruise-details-btn mt-2 bg-purple-500 text-white px-2 py-1 rounded" data-property-id="${property.id}">View Cruise Report</button>` : ''}
        ${placeBidHtml}
    `;
    openModal('bid-details-modal');
}

async function showCruiseDetails(propertyId) {
    const property = await getPropertyById(db, propertyId);
    const cruiseData = property?.forester?.cruiseData;
    if (!cruiseData) {
        alert('No cruise data available.');
        return;
    }
    const content = document.getElementById('cruise-details-content');
    content.innerHTML = `
        <h3 class="text-2xl font-bold mb-4">Cruise Details for ${property.name}</h3>
        <p><strong>Total Acreage:</strong> ${cruiseData.totalAcreage}</p>
        <p><strong>Estimated Value:</strong> <span class="font-bold text-green-600">$${cruiseData.estimatedValue.toLocaleString()}</span></p>
        <p><strong>Recommendation:</strong> ${cruiseData.cuttingRecommendation}</p>
    `;
    openModal('cruise-details-modal');
}

async function showPerformCruiseModal(propertyId) {
    const property = await getPropertyById(db, propertyId);
    const cruiseData = property?.forester?.cruiseData;
    const content = document.getElementById('cruise-details-content');
    content.innerHTML = `
        <h3 class="text-2xl font-bold mb-4">Perform Cruise for ${property.name}</h3>
        <label>Total Acreage:</label>
        <input type="number" id="cruise-total-acreage" class="w-full p-2 border" value="${cruiseData?.totalAcreage || ''}">
        <label>Board Foot per Acre:</label>
        <input type="number" id="cruise-bd-foot-per-acre" class="w-full p-2 border" value="${cruiseData?.bdFootPerAcre || ''}">
        <label>Tonnage per Acre:</label>
        <input type="number" id="cruise-tonnage-per-acre" class="w-full p-2 border" value="${cruiseData?.tonnagePerAcre || ''}">
        <label>Price per Ton ($):</label>
        <input type="number" id="cruise-price-per-ton" class="w-full p-2 border" value="${cruiseData?.pricePerTon || ''}">
        <label>Recommendation:</label>
        <textarea id="cruise-cutting-recommendation" class="w-full p-2 border">${cruiseData?.cuttingRecommendation || ''}</textarea>
        <button id="save-cruise-data-button" data-property-id="${propertyId}" class="mt-4 bg-green-600 text-white w-full py-2 rounded">Save Cruise Data</button>
    `;
    openModal('cruise-details-modal');
}

async function loginAsDemoUser(role) {
    const uid = `demo-${role}`;
    const username = `Demo ${role.charAt(0).toUpperCase() + role.slice(1)}`;

    const demoUser = {
        uid: uid,
        username: username,
        role: role,
        email: `${role}@demo.com`
    };

    const defaultProfileData = {
        username: username,
        email: `${role}@demo.com`,
        role: role,
        rating: 4.5,
        reviewCount: 10,
        completedTransactions: 5,
        company: role === 'seller' ? '' : `${username} Services Inc.`,
        bio: `This is a demo account for a ${role}. Here you can see a short bio describing their experience, services, and commitment to sustainable practices.`,
        profilePictureUrl: '',
        location: { lat: 34.7465, lng: -92.2896 }, // Default to Arkansas
        serviceRadius: 100,
        ...(role === 'forester' && { experience: 15, specialties: ['Timber Cruising', 'Reforestation'] }),
        ...(role === 'buyer' && { lookingFor: 'Pine Sawtimber, Oak Veneer Logs' }),
        ...(role === 'contractor' && { services: ['Logging', 'Site Prep'] }),
    };
    
    // For sellers, remove location info
    if (role === 'seller') {
        delete defaultProfileData.location;
        delete defaultProfileData.serviceRadius;
    }

    try {
        const userDocRef = doc(db, 'users', uid);
        await setDoc(userDocRef, defaultProfileData, { merge: true });
        console.log(`Ensured demo profile for '${uid}' exists in Firestore.`);
        // Set the full profile to currentUser for immediate display
        const userDoc = await getDoc(userDocRef);
        onUserStatusChange({ uid: uid, ...userDoc.data() });
    } catch (error) {
        console.error("Could not create demo user profile in Firestore:", error);
        alert("There was an error setting up the demo profile. Editing might not work.");
        onUserStatusChange(demoUser);
    }
    
    navigateToSection('my-profile');
}