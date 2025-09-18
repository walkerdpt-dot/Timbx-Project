// js/details.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { firebaseConfig } from './config.js';
import { initDetailViewMap, initProfileDisplayMap } from './map.js';

// --- Initialize Firebase on this page ---
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- DOMContentLoaded Listener ---
document.addEventListener('DOMContentLoaded', () => {
    const contentDiv = document.getElementById('details-content');
    const params = new URLSearchParams(window.location.search);
    const itemId = params.get('id');
    const itemType = params.get('type');
    const from = params.get('from') || 'marketplace';

    const backButton = document.getElementById('details-back-button');
    if (backButton) {
        if (from === 'properties') {
            backButton.href = 'index.html#properties';
            backButton.textContent = '\u2190 Back to My Properties';
        } else if (from === 'my-projects') {
            backButton.href = 'index.html#my-projects';
            backButton.textContent = '\u2190 Back to My Projects';
        } else if (from === 'my-inquiries') {
            backButton.href = 'index.html#my-inquiries';
            backButton.textContent = '\u2190 Back to My Inquiries';
        }
        else {
            backButton.href = 'index.html#marketplace';
            backButton.textContent = '\u2190 Back to Marketplace';
        }
    }

    if (!itemId || !itemType) {
        contentDiv.innerHTML = '<p class="text-red-500">Error: No item ID or type specified in the URL.</p>';
        return;
    }

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            try {
                if (itemType === 'property') {
                    const property = await getPropertyById(db, itemId);
                    // NEW: Fetch the owner's profile as well
                    const owner = property ? await getUserProfileById(db, property.ownerId) : null;
                    renderPropertyDetails(property, owner, contentDiv);
                } else if (itemType === 'profile') {
                    const profile = await getUserProfileById(db, itemId);
                    renderProfileDetails(profile, contentDiv);
                } else if (itemType === 'sale') {
                    const sale = await getTimberSaleById(db, itemId);
                    renderTimberSaleDetails(sale, contentDiv);
                } else {
                    contentDiv.innerHTML = `<p class="text-red-500">Error: Unknown item type "${itemType}".</p>`;
                }
            } catch (error) {
                console.error("Error fetching details:", error);
                contentDiv.innerHTML = `<p class="text-red-500">Error: Could not fetch details. ${error.message}</p>`;
            }
        } else {
            contentDiv.innerHTML = '<p class="text-yellow-700">Please sign in to view details.</p>';
        }
    });
});

// --- Firestore Fetch Functions ---
async function getPropertyById(db, propertyId) {
    const docRef = doc(db, "properties", propertyId);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
}

async function getUserProfileById(db, userId) {
    const userRef = doc(db, "users", userId);
    const docSnap = await getDoc(userRef);
    if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() };
    }
    return null;
}

async function getTimberSaleById(db, saleId) {
    const docRef = doc(db, "timberSales", saleId);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
}


// --- Rendering Functions ---
function renderPropertyDetails(prop, owner, container) {
    if (!prop) {
        container.innerHTML = '<p class="text-red-500">Property not found or you do not have permission to view it.</p>';
        return;
    }
     
    container.innerHTML = `
        <h2 class="text-3xl font-bold text-green-800 mb-2">${prop.name}</h2>
        <p class="text-lg text-gray-600 mb-4">Owned by: <span class="font-semibold">${owner ? owner.username : 'N/A'}</span></p>
        <div id="property-detail-map" style="height: 400px;" class="w-full rounded-lg border mb-6"></div>
         
        <div class="space-y-6">
            <div class="border-t pt-4">
                <h4 class="font-semibold text-lg mb-2">Property Identification</h4>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                    <p><strong>County:</strong> ${prop.county || 'N/A'}</p>
                    <p><strong>State:</strong> ${prop.state || 'N/A'}</p>
                    <p><strong>Parcel Number (APN):</strong> ${prop.apn || 'N/A'}</p>
                    <p><strong>Legal (STR):</strong> ${prop.str || 'N/A'}</p>
                </div>
            </div>
             <div class="border-t pt-4">
                <h4 class="font-semibold text-lg mb-2">Land Characteristics</h4>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                    <p><strong>Acreage:</strong> ${prop.acreage?.toFixed(2) || 'N/A'} acres</p>
                    <p><strong>Topography:</strong> ${prop.topography || 'N/A'}</p>
                    <p><strong>Site Access:</strong> ${prop.accessibility || 'N/A'}</p>
                </div>
            </div>
             <div class="border-t pt-4">
                <h4 class="font-semibold text-lg mb-2">Timber Information</h4>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                    <p><strong>Dominant Timber Type:</strong> ${prop.timberType || 'N/A'}</p>
                    <p><strong>Dominant Species:</strong> ${prop.species || 'N/A'}</p>
                    <p><strong>Approx. Stand Age:</strong> ${prop.age ? prop.age + ' years' : 'N/A'}</p>
                    <p><strong>Avg. Basal Area:</strong> ${prop.basalArea ? prop.basalArea + ' sqft/ac' : 'N/A'}</p>
                    <p><strong>Site Index (base 50):</strong> ${prop.siteIndex || 'N/A'}</p>
                    <p><strong>Last Harvest Year:</strong> ${prop.previousCutYear || 'N/A'}</p>
                    <p><strong>Last Harvest Type:</strong> ${prop.previousCutType || 'N/A'}</p>
                </div>
            </div>
            <div class="border-t pt-4">
                 <h4 class="font-semibold text-lg mb-2">Description & Notes</h4>
                <p class="text-gray-700">${prop.description || 'No description provided.'}</p>
            </div>
        </div>
    `;

    let geoJSONObject = null;
    try {
        if (prop.geoJSON) {
            geoJSONObject = JSON.parse(prop.geoJSON);
        }
    } catch (e) {
        console.error("Failed to parse property GeoJSON:", e);
    }

    initDetailViewMap('property-detail-map', geoJSONObject, null);
}

function renderProfileDetails(prof, container) {
    if (!prof) {
        container.innerHTML = '<p class="text-red-500">Profile not found.</p>';
        return;
    }
    const roleMap = {
        'landowner': 'Landowner', 'timber-buyer': 'Timber Buyer',
        'forester': 'Forester', 'logging-contractor': 'Logging Contractor',
        'service-provider': 'Service Provider'
    };
    const formattedRole = roleMap[prof.role] || prof.role;
    const memberSince = prof.createdAt?.toDate ? prof.createdAt.toDate().toLocaleDateString() : 'N/A';
    const defaultAvatar = 'https://placehold.co/128x128/8f8f8f/ffffff?text=No+Image';

    let roleSpecificHTML = '';
    if (prof.role === 'forester' && prof.specialties?.length) {
        roleSpecificHTML = `
            <h4 class="text-xl font-semibold text-green-800 border-b pb-2 mb-2">Specialties</h4>
            <ul class="list-disc list-inside text-gray-700">
                ${prof.specialties.map(item => `<li>${item}</li>`).join('')}
            </ul>`;
    } else if (prof.role === 'timber-buyer' && prof.products?.length) {
        roleSpecificHTML = `
            <h4 class="text-xl font-semibold text-green-800 border-b pb-2 mb-2">Products Purchased</h4>
            <ul class="list-disc list-inside text-gray-700">
                ${prof.products.map(item => `<li>${item}</li>`).join('')}
            </ul>`;
    } else if (['logging-contractor', 'service-provider'].includes(prof.role) && prof.services?.length) {
        roleSpecificHTML = `
            <h4 class="text-xl font-semibold text-green-800 border-b pb-2 mb-2">Services Offered</h4>
            <ul class="list-disc list-inside text-gray-700">
                ${prof.services.map(item => `<li>${item}</li>`).join('')}
            </ul>`;
    }

    container.innerHTML = `
        <div class="flex flex-col sm:flex-row items-center sm:items-start space-y-4 sm:space-y-0 sm:space-x-6 mb-6">
            <img src="${prof.profilePictureUrl || defaultAvatar}" alt="Profile Picture" class="w-32 h-32 rounded-full object-cover border-4 border-green-200 shadow-md">
            <div class="text-center sm:text-left">
                <h3 class="text-3xl font-bold text-gray-800">${prof.username}</h3>
                <p class="text-lg text-gray-600">${prof.company || 'Independent'}</p>
                <p class="text-lg font-semibold text-gray-800">Role: <span class="font-normal text-gray-700">${formattedRole}</span></p>
            </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 pt-6 border-t">
            <div class="space-y-6">
                <div>
                    <h4 class="text-xl font-semibold text-green-800 border-b pb-2 mb-2">About</h4>
                    <p class="text-gray-700 leading-relaxed">${prof.bio || 'No biography provided.'}</p>
                </div>
                <div id="profile-role-specific-data">${roleSpecificHTML}</div>
            </div>
            <div class="space-y-6">
                <div>
                   <h4 class="text-xl font-semibold text-green-800 border-b pb-2 mb-2">Statistics</h4>
                    <div class="flex flex-wrap gap-4 text-center">
                        <div class="bg-gray-100 p-3 rounded-lg flex-grow"><p class="text-2xl font-bold text-amber-600">${prof.rating?.toFixed(1) || 'N/A'}</p><p class="text-sm text-gray-600">Rating (${prof.reviewCount || 0} reviews)</p></div>
                        <div class="bg-gray-100 p-3 rounded-lg flex-grow"><p class="text-2xl font-bold text-lime-700">${prof.completedTransactions || 0}</p><p class="text-sm text-gray-600">Completed Transactions</p></div>
                    </div>
                </div>
                <div id="profile-map-container">
                    <h4 class="text-xl font-semibold text-green-800 border-b pb-2 mb-2">Service Area</h4>
                    <div id="profile-map-display" class="w-full h-64 rounded-lg border"></div>
                </div>
            </div>
        </div>
    `;

    if (prof.role !== 'landowner' && prof.location) {
        initProfileDisplayMap('profile-map-display', prof);
    } else {
        const mapContainer = document.getElementById('profile-map-container');
        if(mapContainer) mapContainer.innerHTML = '';
    }
}

function renderTimberSaleDetails(sale, container) {
    if (!sale) {
        container.innerHTML = '<p class="text-red-500">Timber Sale not found or has been closed.</p>';
        return;
    }

    const inventoryHTML = sale.cruiseData.inventory.map(stand => `
        <div class="mb-4">
            <h5 class="font-semibold text-md text-gray-800 bg-gray-100 p-2 rounded-t-md">${stand.name}</h5>
            <table class="w-full text-sm text-left">
                <thead class="bg-gray-200">
                    <tr>
                        <th class="p-2">Product</th>
                        <th class="p-2 text-right">Volume</th>
                        <th class="p-2">Units</th>
                        <th class="p-2 text-right">Trees</th>
                    </tr>
                </thead>
                <tbody>
                    ${stand.products.map(p => `
                        <tr class="border-b">
                            <td class="p-2">${p.product}</td>
                            <td class="p-2 text-right">${p.volume.toLocaleString()}</td>
                            <td class="p-2">${p.units}</td>
                            <td class="p-2 text-right">${p.trees || 'N/A'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `).join('');

    container.innerHTML = `
        <div class="flex justify-between items-start">
            <h2 class="text-3xl font-bold text-indigo-800 mb-4">${sale.saleName}</h2>
            <div class="text-right">
                <p class="font-semibold">Bid Method: <span class="bg-indigo-100 text-indigo-800 py-1 px-2 rounded-full text-sm">${sale.bidMethod}</span></p>
                <p class="text-sm text-gray-600 mt-1">Bid Deadline: <span class="font-bold">${new Date(sale.bidDeadline).toLocaleDateString()}</span></p>
            </div>
        </div>
        <div id="sale-detail-map" style="height: 400px;" class="w-full rounded-lg border mb-6"></div>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
                <h3 class="text-xl font-semibold text-gray-800 border-b pb-2 mb-3">Timber Inventory</h3>
                <div class="space-y-4">${inventoryHTML}</div>
            </div>
            <div>
                <h3 class="text-xl font-semibold text-gray-800 border-b pb-2 mb-3">Sale Information</h3>
                <div class="space-y-2 text-sm">
                    <p><strong>Location:</strong> ${sale.county}, ${sale.state}</p>
                    <p><strong>Harvest Acres:</strong> ${sale.acreage?.toFixed(1) || 'N/A'} acres</p>
                    <p><strong>Harvest Type:</strong> ${sale.harvestDescription || 'N/A'}</p>
                    <p><strong>Logging Conditions:</strong> ${sale.loggingConditions || 'N/A'}</p>
                    <p><strong>Access:</strong> ${sale.accessDescription || 'N/A'}</p>
                    <p><strong>Contract Length:</strong> ${sale.contractLength ? sale.contractLength + ' months' : 'N/A'}</p>
                </div>
            </div>
        </div>
    `;
    
    let geoJSONObject = null;
    try {
        if (sale.geoJSON) {
            geoJSONObject = JSON.parse(sale.geoJSON);
        }
    } catch (e) {
        console.error("Failed to parse sale GeoJSON:", e);
    }
    
    initDetailViewMap('sale-detail-map', geoJSONObject, sale.cruiseData.annotations);
}