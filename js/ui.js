// js/ui.js
import { getMapInstance, initMyPropertiesMap, myPropertiesLayerGroup, initProfileDisplayMap, initPropertyFormMap, initSignupMap, initEditProfileMap, initTimberSaleMap, updateServiceAreaCircle, getDrawnHarvestAreas } from './map.js';
import { currentUser, allProperties, allProjects, allProfessionalProfiles, allInquiries, globalMarketplaceLayerGroup, db, allTimberSales } from './state.js';
import { FORESTER_SPECIALTIES, BUYER_PRODUCTS, LOGGING_CONTRACTOR_SERVICES, SERVICE_PROVIDER_SERVICES } from './main.js';
import { getPropertyById, fetchQuotesForProject, getUserProfileById, getPropertiesForCurrentUser, fetchActiveProjectsForUser, fetchHaulTicketsForUser } from './firestore.js';

// --- Global Maps for Highlighting ---
const marketplaceFeatureMap = new Map();
const myPropertiesFeatureMap = new Map();

// --- Constants for Cruise Form ---
const PRODUCT_DBH_MAP = {
    "Pine Sawtimber": ['12"', '14"', '16"', '18"', '20"', '22"', '24"'],
    "Pine Chip-n-Saw": ['8"', '10"', '12"'],
    "Pine Pulpwood": ['6"', '8"', '10"'],
    "Pine Topwood": ['4"', '6"'],
    "Oak Sawtimber": ['14"', '16"', '18"', '20"', '22"', '24"'],
    "Gum Sawtimber": ['14"', '16"', '18"', '20"', '22"', '24"'],
    "Ash Sawtimber": ['14"', '16"', '18"', '20"', '22"', '24"'],
    "Hickory Sawtimber": ['14"', '16"', '18"', '20"', '22"', '24"'],
    "Misc. Hardwood Sawtimber": ['14"', '16"', '18"', '20"', '22"', '24"'],
    "Hardwood Pulpwood": ['6"', '8"', '10"', '12"'],
    "Cypress Sawtimber": ['14"', '16"', '18"', '20"', '22"', '24"'],
};


// --- Highlight Functions ---
function createHighlightFunctions(mapInstance, highlightStyle, listHighlightClass) {
    return {
        highlight: function(featureId) {
            if (!mapInstance.has(featureId)) return;
            const { layer, listItemId } = mapInstance.get(featureId);

            const listItem = document.getElementById(listItemId);
            if (listItem) {
                listItem.classList.add(listHighlightClass);
            }

            if (layer && layer.setStyle) {
                if (layer.feature?.geometry?.type === 'Point' || layer instanceof L.CircleMarker) {
                    layer.setRadius(12);
                    layer.setStyle({ fillColor: '#facc15', color: '#facc15' });
                } else {
                    layer.setStyle(highlightStyle);
                }
            }
        },
        unhighlight: function(featureId) {
            if (!mapInstance.has(featureId)) return;
            const { layer, listItemId, originalStyle } = mapInstance.get(featureId);

            const listItem = document.getElementById(listItemId);
            if (listItem) {
                listItem.classList.remove(listHighlightClass);
            }

            if (layer && layer.setStyle && originalStyle) {
                if(layer.feature?.geometry?.type === 'Point' || layer instanceof L.CircleMarker) {
                    layer.setRadius(originalStyle.radius);
                }
                layer.setStyle(originalStyle);
            }
        }
    };
}

const marketplaceHighlighter = createHighlightFunctions(marketplaceFeatureMap, { color: 'yellow', weight: 5, fillOpacity: 0.5 }, 'bg-yellow-100');
window.highlightMarketplaceFeature = marketplaceHighlighter.highlight;
window.unhighlightMarketplaceFeature = marketplaceHighlighter.unhighlight;

const myPropertiesHighlighter = createHighlightFunctions(myPropertiesFeatureMap, { color: '#f59e0b', weight: 4, dashArray: '5, 5' }, 'bg-amber-100');
window.highlightMyProperty = myPropertiesHighlighter.highlight;
window.unhighlightMyProperty = myPropertiesHighlighter.unhighlight;


// --- PRIVATE HELPER FUNCTIONS ---

function sanitizeGeoJSON(geoJSON) {
    if (!geoJSON) return null;
    let parsedGeoJSON = geoJSON;
    while (typeof parsedGeoJSON === 'string') {
        try {
            parsedGeoJSON = JSON.parse(parsedGeoJSON);
        } catch (e) {
            console.error("Failed to parse GeoJSON string:", geoJSON);
            return null;
        }
    }
    return parsedGeoJSON;
}

function createAvatar(username) {
    if (!username) return document.createElement('div');
    const initial = username.charAt(0).toUpperCase();
    const colors = ['#94a3b8', '#a3a3a3', '#78716c', '#84cc16', '#6ee7b7', '#67e8f9', '#7dd3fc', '#a5b4fc', '#d8b4fe'];
    const charCodeSum = username.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const color = colors[charCodeSum % colors.length];
    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0';
    avatarDiv.style.backgroundColor = color;
    avatarDiv.textContent = initial;
    return avatarDiv;
}

function setFormEditable(formElement, isEditable) {
    formElement.querySelectorAll('input, textarea, select').forEach(el => {
        el.readOnly = !isEditable;
        el.disabled = !isEditable;
        el.style.backgroundColor = isEditable ? '' : '#e9ecef';
    });
    formElement.querySelectorAll('#add-inventory-stand-btn, .add-inventory-product-btn, .add-custom-dbh-row-btn, .remove-inventory-stand-btn, .remove-inventory-product-btn').forEach(btn => {
        btn.style.display = isEditable ? 'inline-block' : 'none';
    });
    if (!isEditable) {
        document.getElementById('btn-accept-cruise-report').disabled = false;
        document.getElementById('btn-start-timber-sale').disabled = false;
    }
}

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

async function initializeLogLoadForm() {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.getElementById('load-date').value = now.toISOString().slice(0, 16);
    const jobSelect = document.getElementById('load-job');
    jobSelect.innerHTML = `<option value="">Loading active jobs...</option>`;
    if (!currentUser) return;
    const activeProjects = await fetchActiveProjectsForUser(db, currentUser);
    if (activeProjects.length > 0) {
        jobSelect.innerHTML = `<option value="">Select an Active Job</option>`;
        activeProjects.forEach(project => {
            jobSelect.innerHTML += `<option value="${project.id}">${project.propertyName}</option>`;
        });
    } else {
        jobSelect.innerHTML = `<option value="">No active jobs found</option>`;
    }
}

function displayFilteredLoads(tickets) {
    const container = document.getElementById('my-loads-container');
    const filterValue = document.getElementById('loads-job-filter').value;
    const filteredTickets = filterValue === 'all' ? tickets : tickets.filter(t => t.jobId === filterValue);
    filteredTickets.sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime));
    if (filteredTickets.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500 p-4">No loads found for the selected job.</p>';
        document.getElementById('total-net-tons').textContent = '0.00';
        return;
    }
    let totalTons = 0;
    const showAdminControls = currentUser?.role === 'timber-buyer';
    const loadsHTML = filteredTickets.map(load => {
        totalTons += load.netTons;
        const project = allProjects.find(p => p.id === load.jobId);
        const loadDate = new Date(load.dateTime).toLocaleDateString();
        const loadTime = new Date(load.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const adminButtonsHTML = showAdminControls ? `
            <div class="flex gap-2 justify-end mt-2 md:mt-0">
                <button class="edit-load-btn text-xs bg-amber-100 text-amber-800 font-semibold py-1 px-3 rounded-md hover:bg-amber-200" data-ticket-id="${load.id}">Edit</button>
                <button class="delete-load-btn text-xs bg-red-100 text-red-800 font-semibold py-1 px-3 rounded-md hover:bg-red-200" data-ticket-id="${load.id}">Delete</button>
            </div>` : '';
        return `
            <div class="bg-white p-4 rounded-lg shadow-sm border">
                <div class="grid grid-cols-1 md:grid-cols-5 gap-4 items-start">
                    <div class="md:col-span-2">
                        <p class="font-bold text-gray-800">${load.product}</p>
                        <p class="text-sm text-gray-500">To: ${load.mill}</p>
                        <p class="text-xs text-gray-500 mt-1">Job: ${project?.propertyName || 'N/A'}</p>
                        <p class="text-xs text-gray-500">Submitted By: <span class="font-medium">${load.submitterName}</span></p>
                    </div>
                    <div class="text-left md:text-center"><p class="text-xs text-gray-500">Date & Time</p><p class="font-semibold">${loadDate} ${loadTime}</p></div>
                    <div class="text-left md:text-center"><p class="text-xs text-gray-500">Net Tons</p><p class="font-bold text-lg text-green-700">${load.netTons.toFixed(2)}</p></div>
                    <div class="md:col-span-1 md:text-right">
                        <a href="${load.ticketImageUrl || '#'}" target="_blank" class="text-blue-600 hover:underline text-sm font-semibold ${!load.ticketImageUrl ? 'opacity-50 pointer-events-none' : ''}">View Ticket</a>
                        ${adminButtonsHTML}
                    </div>
                </div>
            </div>`;
    }).join('');
    container.innerHTML = loadsHTML;
    document.getElementById('total-net-tons').textContent = totalTons.toFixed(2);
}

// --- EXPORTED UI & RENDERING FUNCTIONS ---

export function openModal(modalId) { document.getElementById(modalId)?.classList.remove('hidden'); }
export function closeModal(modalId) { document.getElementById(modalId)?.classList.add('hidden'); }

export function updateLoginUI() {
    const userDisplay = document.getElementById('user-display');
    const isLoggedIn = !!currentUser;
    const role = currentUser?.role?.toLowerCase();
    document.getElementById('login-button').classList.toggle('hidden', isLoggedIn);
    document.getElementById('signup-button').classList.toggle('hidden', isLoggedIn);
    document.getElementById('logout-button').classList.toggle('hidden', !isLoggedIn);
    userDisplay.classList.toggle('hidden', !isLoggedIn);
    userDisplay.classList.toggle('flex', isLoggedIn);
    if (isLoggedIn) {
        userDisplay.innerHTML = '';
        const avatar = currentUser.profilePictureUrl ? `<img src="${currentUser.profilePictureUrl}" alt="User Avatar" class="w-8 h-8 rounded-full object-cover">` : createAvatar(currentUser.username).outerHTML;
        const nameSpan = document.createElement('span');
        nameSpan.textContent = currentUser.username;
        nameSpan.className = 'whitespace-nowrap';
        userDisplay.innerHTML = avatar;
        userDisplay.appendChild(nameSpan);
    }
    const professionalRoles = ['forester', 'timber-buyer', 'logging-contractor', 'service-provider'];
    const tabVisibility = {
        '#properties': role === 'landowner',
        '#my-projects': isLoggedIn,
        '#my-inquiries': professionalRoles.includes(role),
        '#logbook': isLoggedIn,
    };
    for (const tab in tabVisibility) {
        const element = document.querySelector(`a[href="${tab}"]`);
        if (element) {
            element.classList.toggle('hidden', !tabVisibility[tab]);
        }
    }
    const isLandowner = role === 'landowner';
    document.getElementById('properties-login-prompt').classList.toggle('hidden', isLoggedIn);
    document.getElementById('properties-main-content').classList.toggle('hidden', !isLandowner);
    const isProfessional = professionalRoles.includes(role);
    document.getElementById('inquiries-login-prompt').classList.toggle('hidden', isLoggedIn);
    document.getElementById('inquiries-main-content').classList.toggle('hidden', !isProfessional);
    document.getElementById('profile-login-prompt').classList.toggle('hidden', isLoggedIn);
    document.getElementById('profile-details').classList.toggle('hidden', !isLoggedIn);
}

export function updateMapAndList() {
    const map = getMapInstance('global-map');
    if (!map || !globalMarketplaceLayerGroup) return;
    marketplaceFeatureMap.clear();
    const bounds = map.getBounds();
    const listContainer = document.getElementById('dynamic-map-list');
    listContainer.className = 'divide-y divide-gray-200';
    listContainer.innerHTML = '';
    globalMarketplaceLayerGroup.clearLayers();
    let listItemsHTML = '';
    const showProjects = document.getElementById('filter-projects').checked;
    const showBuyers = document.getElementById('filter-buyers').checked;
    const showForesters = document.getElementById('filter-foresters').checked;
    const showLoggers = document.getElementById('filter-logging-contractors').checked;
    const showProviders = document.getElementById('filter-service-providers').checked;
    const foresterService = document.getElementById('filter-forester-services').value;
    const loggerService = document.getElementById('filter-logging-contractor-services').value;
    const providerService = document.getElementById('filter-service-provider-services').value;
    const markerStyles = {
        project: { radius: 8, fillColor: "#4f46e5", color: "#fff", weight: 1.5, opacity: 1, fillOpacity: 0.9 },
        'timber-buyer': { radius: 7, fillColor: "#78350f", color: "#fff", weight: 1.5, opacity: 1, fillOpacity: 0.9 },
        forester: { radius: 7, fillColor: "#57534e", color: "#fff", weight: 1.5, opacity: 1, fillOpacity: 0.9 },
        'logging-contractor': { radius: 7, fillColor: "#a16207", color: "#fff", weight: 1.5, opacity: 1, fillOpacity: 0.9 },
        'service-provider': { radius: 7, fillColor: "#4d7c0f", color: "#fff", weight: 1.5, opacity: 1, fillOpacity: 0.9 }
    };
    if (showProjects) {
        allTimberSales.forEach(sale => {
            const geoJSON = sanitizeGeoJSON(sale.geoJSON);
            if (!geoJSON) return;
            const saleLayer = L.geoJSON(geoJSON);
            const saleCenter = saleLayer.getBounds().getCenter();
            if (bounds.contains(saleCenter)) {
                const originalStyle = markerStyles.project;
                const marker = L.circleMarker(saleCenter, originalStyle)
                    .bindTooltip(`<b>For Sale:</b> ${sale.saleName}`)
                    .on('click', () => window.location.href = `details.html?type=sale&id=${sale.id}`);
                marker.addTo(globalMarketplaceLayerGroup);
                const featureId = `sale-${sale.id}`;
                const listItemId = `list-item-${featureId}`;
                marketplaceFeatureMap.set(featureId, { layer: marker, listItemId: listItemId, originalStyle: originalStyle });
                marker.on('mouseover', () => window.highlightMarketplaceFeature(featureId));
                marker.on('mouseout', () => window.unhighlightMarketplaceFeature(featureId));
                listItemsHTML += `
                    <li id="${listItemId}" onmouseover="window.highlightMarketplaceFeature('${featureId}')" onmouseout="window.unhighlightMarketplaceFeature('${featureId}')" 
                        class="p-2 cursor-pointer transition-colors" style="border-left: 4px solid ${originalStyle.fillColor};"
                        onclick="window.location.href='details.html?type=sale&id=${sale.id}'">
                        <p class="font-bold text-gray-800">${sale.saleName}</p>
                        <p class="text-xs text-gray-600 pl-1">${sale.acreage?.toFixed(1) || 'N/A'} acres in ${sale.county || 'N/A'}</p>
                    </li>`;
            }
        });
    }
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
            if (foresterService && !(prof.specialties || []).includes(foresterService)) serviceMatch = false;
        }
        if (showLoggers && role === 'logging-contractor') {
            shouldShow = true;
            if (loggerService && !(prof.services || []).includes(loggerService)) serviceMatch = false;
        }
        if (showProviders && role === 'service-provider') {
            shouldShow = true;
            if (providerService && !(prof.services || []).includes(providerService)) serviceMatch = false;
        }
        if (shouldShow && serviceMatch) {
            const formattedRole = (role.charAt(0).toUpperCase() + role.slice(1)).replace('-', ' ');
            const originalStyle = markerStyles[role];
            const marker = L.circleMarker(profLatLng, originalStyle)
                .bindTooltip(`<b>${prof.username}</b><br>${prof.company || formattedRole}`)
                .on('click', () => window.location.href = `details.html?type=profile&id=${prof.id}`);
            marker.addTo(globalMarketplaceLayerGroup);
            const featureId = `profile-${prof.id}`;
            const listItemId = `list-item-${featureId}`;
            marketplaceFeatureMap.set(featureId, { layer: marker, listItemId: listItemId, originalStyle: originalStyle });
            marker.on('mouseover', () => window.highlightMarketplaceFeature(featureId));
            marker.on('mouseout', () => window.unhighlightMarketplaceFeature(featureId));
            let primaryService = '';
            if (role === 'forester' && prof.specialties?.length > 0) primaryService = prof.specialties[0];
            if ((role === 'logging-contractor' || role === 'service-provider') && prof.services?.length > 0) primaryService = prof.services[0];
            if (role === 'timber-buyer' && prof.products?.length > 0) primaryService = `Buying: ${prof.products[0]}`;
            listItemsHTML += `
                <li id="${listItemId}" onmouseover="window.highlightMarketplaceFeature('${featureId}')" onmouseout="window.unhighlightMarketplaceFeature('${featureId}')" 
                    class="p-2 cursor-pointer transition-colors" style="border-left: 4px solid ${originalStyle.fillColor};"
                    onclick="window.location.href='details.html?type=profile&id=${prof.id}'">
                    <p class="font-bold text-gray-800">${prof.username}</p>
                    <p class="text-xs text-gray-600 pl-1">${formattedRole} | ${prof.company || 'Independent'}</p>
                    ${primaryService ? `<p class="text-xs text-gray-500 italic pl-1">${primaryService}</p>` : ''}
                </li>`;
        }
    });
    if (listItemsHTML === '') {
        listContainer.innerHTML = '<li class="p-4 text-center text-gray-500">No results found in this area. Try zooming out or changing filters.</li>';
    } else {
        listContainer.innerHTML = listItemsHTML;
    }
}

// --- Page-Specific Rendering ---

export async function renderPropertiesForCurrentUser() {
    if (!currentUser || currentUser.role !== 'landowner') return;
    if (!getMapInstance('my-properties-map')) initMyPropertiesMap();
    const listContainer = document.getElementById('my-properties-list-container');
    listContainer.innerHTML = '<div class="p-4 text-center text-gray-500">Loading properties...</div>';
    renderMyPropertiesList(allProperties);
}

function renderMyPropertiesList(properties) {
    const mapInstance = getMapInstance('my-properties-map');
    const listContainer = document.getElementById('my-properties-list-container');
    if (!mapInstance || !listContainer) return;
    myPropertiesFeatureMap.clear();
    listContainer.className = 'space-y-2';
    listContainer.innerHTML = '';
    if (myPropertiesLayerGroup) myPropertiesLayerGroup.clearLayers();
    if (!properties || properties.length === 0) {
        listContainer.innerHTML = `<div class="p-4 text-center text-gray-500">You have not added any properties.</div>`;
        return;
    }
    const allBounds = [];
    let listHTML = '';
    properties.forEach(prop => {
        const featureId = `property-${prop.id}`;
        const listItemId = `list-item-${featureId}`;
        const project = allProjects.find(p => p.propertyId === prop.id && p.status !== 'completed' && p.status !== 'cancelled');
        let statusHTML = '';
        if (project) {
            let projectStatusText = project.status.replace(/_/g, ' ');
            statusHTML = `<div class="text-xs text-blue-600 font-semibold mt-1">Active Project: 
                            <a href="#my-projects?projectId=${project.id}" class="underline hover:text-blue-800 capitalize">${projectStatusText}</a>
                          </div>`;
        } else {
            statusHTML = `<div class="text-xs text-gray-500 mt-1">Status: <span class="font-medium text-gray-700">Ready for new project</span></div>`;
        }
        listHTML += `
            <li id="${listItemId}" onmouseover="window.highlightMyProperty('${featureId}')" onmouseout="window.unhighlightMyProperty('${featureId}')" 
                class="p-2 transition-colors bg-white border" style="border-left: 5px solid #059669;">
                <div class="flex justify-between items-start">
                    <div>
                        <a href="details.html?type=property&id=${prop.id}&from=properties" class="font-bold text-gray-800 hover:underline">${prop.name}</a>
                        <p class="text-xs text-gray-600">${prop.acreage?.toFixed(1) || '0'} acres | ${prop.county || 'N/A'}</p>
                    </div>
                    <div class="relative more-options-container flex-shrink-0">
                        <button class="more-options-btn p-1 rounded-full hover:bg-gray-200">
                            <svg class="w-5 h-5 text-gray-600" fill="currentColor" viewBox="0 0 20 20"><path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z"></path></svg>
                        </button>
                        <div class="more-options-dropdown hidden absolute right-0 mt-2 w-48 bg-white rounded-md shadow-xl z-10 border">
                             <button class="edit-property-btn block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" data-property-id="${prop.id}">Edit Property</button>
                             <button class="delete-property-btn block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100" data-property-id="${prop.id}">Delete Property</button>
                        </div>
                    </div>
                </div>
                <div class="mt-2 pt-2 border-t">
                    ${statusHTML}
                    <div class="mt-2">
                        <button class="seek-services-btn bg-teal-500 hover:bg-teal-600 text-white text-xs px-2 py-1.5 rounded-md font-semibold" data-property-id="${prop.id}" data-property-name="${prop.name}">+ Seek New Service</button>
                    </div>
                </div>
            </li>`;
        const cleanGeoJSON = sanitizeGeoJSON(prop.geoJSON);
        if (cleanGeoJSON?.geometry?.coordinates) {
            const originalStyle = { color: '#059669', weight: 2, fillColor: '#10B981', fillOpacity: 0.3 };
            const polygonLayer = L.geoJSON(cleanGeoJSON, { style: originalStyle });
            const bounds = polygonLayer.getBounds();
            if (bounds.isValid()) {
                const centerMarker = L.circleMarker(bounds.getCenter(), { radius: 6, fillColor: '#2563EB', color: '#FFFFFF', weight: 1.5, opacity: 1, fillOpacity: 0.9, interactive: false });
                const featureGroup = L.featureGroup([polygonLayer, centerMarker])
                    .bindTooltip(prop.name)
                    .on('click', () => window.location.href = `details.html?type=property&id=${prop.id}&from=properties`)
                    .on('mouseover', () => window.highlightMyProperty(featureId))
                    .on('mouseout', () => window.unhighlightMyProperty(featureId));
                myPropertiesFeatureMap.set(featureId, { layer: featureGroup, listItemId: listItemId, originalStyle: originalStyle });
                featureGroup.addTo(myPropertiesLayerGroup);
                allBounds.push(bounds);
            }
        }
    });
    listContainer.innerHTML = listHTML;
    if (allBounds.length > 0) mapInstance.fitBounds(L.latLngBounds(allBounds), { padding: [50, 50] });
}

export async function renderMyProjects() {
    if (!currentUser) return;
    const container = document.getElementById('my-projects-container');
    container.innerHTML = '<p class="text-center p-4">Loading your projects...</p>';
    const relevantProjects = allProjects;
    if (relevantProjects.length === 0) {
        container.innerHTML = '<p class="text-center p-4 text-gray-600">You have no projects.</p>';
        return;
    }
    const groupedProjects = {
        inquiry: [], cruise_in_progress: [], pending_approval: [],
        harvest_in_progress: [], completed: [], other: []
    };
    relevantProjects.forEach(p => { (groupedProjects[p.status] || groupedProjects.other).push(p); });
    let allContent = '';
    const statusOrder = ['inquiry', 'cruise_in_progress', 'pending_approval', 'harvest_in_progress', 'completed', 'other'];
    const statusHeadings = {
        inquiry: 'Awaiting Quotes', cruise_in_progress: 'Cruise in Progress',
        pending_approval: 'Pending Landowner Approval', harvest_in_progress: 'Harvest in Progress',
        completed: 'Completed', other: 'Other'
    };
    for (const status of statusOrder) {
        const projects = groupedProjects[status];
        if (projects.length === 0) continue;
        allContent += `<div class="mb-6"><h3 class="text-xl font-semibold text-gray-700 border-b pb-2 mb-3">${statusHeadings[status]}</h3><div class="space-y-3">`;
        for (const project of projects) {
            allContent += await renderProjectCard(project);
        }
        allContent += `</div></div>`;
    }
    container.innerHTML = allContent.trim() || '<p class="text-center p-4 text-gray-600">You have no projects.</p>';
    const params = new URLSearchParams(window.location.hash.split('?')[1]);
    const projectIdToHighlight = params.get('projectId');
    if (projectIdToHighlight) {
        const element = document.getElementById(`project-${projectIdToHighlight}`);
        if(element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            element.classList.add('ring-2', 'ring-blue-500');
            setTimeout(() => element.classList.remove('ring-2', 'ring-blue-500'), 2500);
        }
    }
}

async function renderProjectCard(project) {
    let projectContent = '';
    const isOwner = project.ownerId === currentUser.uid;
    const isForester = project.foresterId === currentUser.uid;
    const statusText = project.status.replace(/_/g, ' ');
    const property = allProperties.find(p => p.id === project.propertyId);
    const createdDate = project.createdAt?.toDate ? project.createdAt.toDate().toLocaleDateString() : 'N/A';
    const serviceSought = project.servicesSought?.[0] || 'General Inquiry';
    let participantHTML = '';
    if (isOwner) {
        let participant;
        let participantRole = '';
        if (project.foresterId) {
            participant = allProfessionalProfiles.find(p => p.id === project.foresterId);
            participantRole = 'Assigned Forester';
        } else if (project.supplierId) {
            participant = allProfessionalProfiles.find(p => p.id === project.supplierId);
            participantRole = 'Timber Buyer';
        }
        if (participant) {
            participantHTML = `
                <div class="flex justify-between text-sm mt-1">
                    <span class="text-gray-500">${participantRole}:</span>
                    <a href="details.html?type=profile&id=${participant.id}&from=my-projects" class="font-semibold text-blue-600 hover:underline">${participant.username}</a>
                </div>`;
        }
    } else {
        participantHTML = `
            <div class="flex justify-between text-sm mt-1">
                <span class="text-gray-500">Client:</span>
                <span class="font-semibold text-gray-800">${project.ownerName}</span>
            </div>`;
    }
    if (isOwner) {
        if (project.status === 'inquiry') {
            projectContent = await renderLandownerInquiryContent(project);
        } else if (project.status === 'cruise_in_progress') {
            projectContent = `<div class="mt-2 p-2 bg-blue-50 border border-blue-200 rounded-md text-sm"><p class="text-blue-800">Awaiting cruise data submission from forester.</p></div>`;
        } else if (project.status === 'pending_approval') {
            projectContent = `<div class="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded-md text-sm">
                                <p class="text-yellow-800 font-semibold mb-2">The forester has submitted the cruise data. Please review and approve.</p>
                                <div class="flex justify-end">
                                    <button class="approve-cruise-btn bg-green-600 hover:bg-green-700 text-white font-bold py-1 px-3 rounded-md text-sm" data-project-id="${project.id}">Review Cruise Data</button>
                                </div>
                            </div>`;
        }
    } else if (isForester) {
        if (project.status === 'cruise_in_progress') {
            projectContent = `<div class="mt-2 flex justify-end"><button class="submit-cruise-btn bg-blue-600 hover:bg-blue-700 text-white font-bold py-1 px-3 rounded-md text-sm" data-project-id="${project.id}">Submit Cruise Data</button></div>`;
        } else if (project.status === 'pending_approval') {
            projectContent = `<div class="mt-2 p-2 bg-gray-100 border rounded-md text-sm">
                                <p class="text-gray-700">Awaiting landowner review of submitted cruise data.</p>
                                <div class="mt-2 flex justify-end">
                                    <button class="retract-cruise-btn bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-1 px-3 rounded-md text-sm" data-project-id="${project.id}">Retract & Edit</button>
                                </div>
                            </div>`;
        }
    }
    const propertyInfoHTML = property
        ? `<p class="text-sm text-gray-500">${property.acreage?.toFixed(1) || 'N/A'} ac | ${property.county || 'N/A'}</p>`
        : `<p class="text-sm text-red-500">Property data not available.</p>`;
    return `
        <div class="project-card bg-white p-2 rounded-lg shadow-sm border" id="project-${project.id}">
            <div class="flex justify-between items-start">
                <div>
                    <h4 class="text-base font-bold text-green-800 leading-tight">
                        <a href="details.html?type=property&id=${project.propertyId}&from=my-projects" class="hover:underline">${project.propertyName}</a>
                    </h4>
                    ${propertyInfoHTML}
                </div>
                <span class="font-semibold capitalize text-indigo-700 bg-indigo-100 py-0.5 px-2.5 rounded-full text-sm">${statusText}</span>
            </div>
            <div class="mt-1 pt-2 border-t text-sm">
                <div class="flex justify-between text-sm">
                    <span class="text-gray-500">Service:</span>
                    <span class="text-gray-800 font-semibold truncate">${serviceSought}</span>
                </div>
                ${participantHTML}
                <div class="flex justify-between text-sm mt-1">
                    <span class="text-gray-500">Created:</span>
                    <span class="text-gray-700">${createdDate}</span>
                </div>
            </div>
            ${projectContent}
        </div>
    `;
}

async function renderLandownerInquiryContent(project) {
    const mySentInquiries = allInquiries.filter(i => i.fromUserId === currentUser.uid && i.projectId === project.id && i.status !== 'withdrawn');
    const myReceivedQuotes = await fetchQuotesForProject(db, [project.id], currentUser.uid);
    const inquiryStatusOrder = { 'quoted': 1, 'pending': 2, 'declined': 3 };
    mySentInquiries.sort((a, b) => (inquiryStatusOrder[a.status] || 99) - (inquiryStatusOrder[b.status] || 99));
    const inquiriesHTML = mySentInquiries.map(inquiry => {
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
            <div class="grid grid-cols-3 items-center p-2 border-t text-sm first:border-t-0">
                <div>
                   <p>To: <a href="details.html?type=profile&id=${inquiry.toUserId}&from=my-projects" class="font-semibold text-blue-600 hover:underline">${professional?.username || '...'}</a></p>
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
    const quoteCount = myReceivedQuotes.length;
    return `
        <div class="border-t pt-2 mt-2">
            <h4 class="font-semibold text-gray-800 text-sm">Inquiries Sent</h4>
            <div class="mt-1 border rounded-md bg-gray-50 divide-y divide-gray-200">
                ${inquiriesHTML || '<p class="text-sm text-center p-2 text-gray-500">No inquiries found.</p>'}
            </div>
            <div class="mt-3 flex justify-end">
                <button class="view-quotes-btn bg-green-600 hover:bg-green-700 text-white font-bold py-1 px-3 rounded-md text-sm ${quoteCount === 0 ? 'opacity-50 cursor-not-allowed' : ''}" data-project-id="${project.id}" ${quoteCount === 0 ? 'disabled' : ''}>
                    View Quotes (${quoteCount})
                </button>
            </div>
        </div>
    `;
}

export async function renderInquiriesForCurrentUser() {
    const professionalRoles = ['forester', 'timber-buyer', 'logging-contractor', 'service-provider'];
    if (!currentUser || !professionalRoles.includes(currentUser.role)) return;
    const container = document.getElementById('inquiries-main-content');
    container.innerHTML = '<p class="text-center p-4">Loading your inquiries...</p>';
    const showArchivedCheckbox = document.getElementById('show-archived-checkbox');
    showArchivedCheckbox.removeEventListener('change', renderInquiriesForCurrentUser);
    showArchivedCheckbox.addEventListener('change', renderInquiriesForCurrentUser);
    try {
        const myReceivedInquiries = allInquiries.filter(i => i.toUserId === currentUser.uid);
        const showArchived = showArchivedCheckbox.checked;
        const inquiriesToDisplay = myReceivedInquiries.filter(inquiry => {
            if (showArchived) return true;
            return inquiry.status !== 'archived';
        });
        if (inquiriesToDisplay.length === 0) {
            container.innerHTML = `<p class="text-center p-4 text-gray-600">${showArchived ? 'You have no inquiries.' : 'You have no active inquiries.'}</p>`;
            return;
        }
        inquiriesToDisplay.sort((a, b) => (b.createdAt?.toDate() || 0) - (a.createdAt?.toDate() || 0));
        const inquiriesHTML = inquiriesToDisplay.map(inquiry => {
            const inquiryDate = inquiry.createdAt?.toDate ? inquiry.createdAt.toDate().toLocaleDateString() : 'N/A';
            const property = allProperties.find(p => p.id === inquiry.propertyId);
            let actionButtonsHTML = '';
            if (inquiry.status === 'pending') {
                actionButtonsHTML = `
                    <button class="submit-quote-action-btn bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2 px-4 rounded-md text-sm" data-inquiry-id="${inquiry.id}">Submit Quote</button>
                    <button class="decline-inquiry-btn bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-md text-sm" data-inquiry-id="${inquiry.id}">Decline</button>
                `;
            } else if (inquiry.status !== 'archived') {
                 actionButtonsHTML = `
                    <button class="archive-inquiry-btn bg-blue-500 hover:bg-blue-600 text-white font-bold py-1 px-2 rounded-md text-xs" data-inquiry-id="${inquiry.id}">Archive</button>
                `;
            }
            let statusStyle = 'bg-gray-200 text-gray-800';
            if (inquiry.status === 'pending') statusStyle = 'bg-yellow-200 text-yellow-800 animate-pulse';
            if (inquiry.status === 'quoted') statusStyle = 'bg-blue-200 text-blue-800';
            if (inquiry.status === 'declined') statusStyle = 'bg-red-200 text-red-800';
            if (inquiry.status === 'withdrawn') statusStyle = 'bg-gray-300 text-gray-700';
            if (inquiry.status === 'archived') statusStyle = 'bg-gray-400 text-white';
            return `
                <div class="border rounded-lg p-3 bg-white hover:shadow-md transition-shadow">
                    <div class="flex justify-between items-start gap-2 mb-2">
                        <div>
                            <h3 class="text-lg font-bold text-green-800">${inquiry.propertyName}</h3>
                            <p class="text-xs text-gray-500">From: <span class="font-semibold">${inquiry.fromUserName}</span> | Received: ${inquiryDate}</p>
                            <p class="text-xs text-gray-500">${property?.acreage?.toFixed(1) || 'N/A'} ac | ${property?.county || 'N/A'}</p>
                        </div>
                        <span class="text-xs font-medium py-1 px-3 rounded-full capitalize ${inquiry.status === 'withdrawn' ? 'line-through' : ''} ${statusStyle}">${inquiry.status}</span>
                    </div>
                    <div class="bg-gray-50 p-2 rounded-md border text-sm">
                        <p class="mt-1 text-gray-700 whitespace-pre-wrap">"${inquiry.message || 'No specific message provided.'}"</p>
                    </div>
                    <div class="mt-3 pt-3 border-t flex items-center justify-between gap-3">
                        <a href="details.html?type=property&id=${inquiry.propertyId}&from=my-inquiries" class="text-blue-600 hover:underline text-sm font-semibold">View Property Details &rarr;</a>
                        <div class="flex items-center gap-2">${actionButtonsHTML}</div>
                    </div>
                </div>
            `;
        }).join('');
        container.innerHTML = inquiriesHTML;
    } catch (error) {
        console.error("Error rendering inquiries:", error);
        container.innerHTML = '<p class="text-center p-4 text-red-500">Could not load inquiries. Please try refreshing the page.</p>';
    }
}

export function renderMyProfile() {
    if (!currentUser) return;
    const defaultAvatar = 'https://placehold.co/128x128/8f8f8f/ffffff?text=No+Image';
    const roleMap = {
        'landowner': 'Landowner', 'timber-buyer': 'Timber Buyer',
        'forester': 'Forester', 'logging-contractor': 'Logging Contractor',
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

export function initializeLogbook() {
    const viewLoadsBtn = document.getElementById('btn-view-loads');
    const logNewLoadBtn = document.getElementById('btn-log-new-load');
    const viewLoadsSection = document.getElementById('logbook-view-loads');
    const logNewLoadSection = document.getElementById('logbook-log-new');
    if (currentUser && (currentUser.role === 'landowner' || currentUser.role === 'forester')) {
        logNewLoadBtn.classList.add('hidden');
    } else {
        logNewLoadBtn.classList.remove('hidden');
    }
    const showView = (viewToShow) => {
        if (viewToShow === 'log') {
            viewLoadsSection.classList.add('hidden');
            logNewLoadSection.classList.remove('hidden');
            logNewLoadBtn.classList.add('bg-green-700', 'text-white');
            logNewLoadBtn.classList.remove('bg-gray-200', 'text-gray-800');
            viewLoadsBtn.classList.add('bg-gray-200', 'text-gray-800');
            viewLoadsBtn.classList.remove('bg-green-700', 'text-white');
            initializeLogLoadForm();
        } else {
            logNewLoadSection.classList.add('hidden');
            viewLoadsSection.classList.remove('hidden');
            viewLoadsBtn.classList.add('bg-green-700', 'text-white');
            viewLoadsBtn.classList.remove('bg-gray-200', 'text-gray-800');
            logNewLoadBtn.classList.add('bg-gray-200', 'text-gray-800');
            logNewLoadBtn.classList.remove('bg-green-700', 'text-white');
            renderMyLoads();
        }
    };
    viewLoadsBtn.addEventListener('click', () => showView('view'));
    logNewLoadBtn.addEventListener('click', () => showView('log'));
    showView('view');
}

export async function renderMyLoads() {
    if (!currentUser) return;
    const container = document.getElementById('my-loads-container');
    const filter = document.getElementById('loads-job-filter');
    container.innerHTML = '<p class="text-center text-gray-500 p-4">Loading your submitted loads...</p>';
    const allUserTickets = await fetchHaulTicketsForUser(db, currentUser);
    if (!allUserTickets || allUserTickets.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500 p-4">No loads found for your account.</p>';
        document.getElementById('total-net-tons').textContent = '0.00';
        filter.innerHTML = '<option value="all">All Active Jobs</option>';
        return;
    }
    const uniqueJobIds = [...new Set(allUserTickets.map(t => t.jobId))];
    filter.innerHTML = '<option value="all">All Active Jobs</option>';
    uniqueJobIds.forEach(jobId => {
        const project = allProjects.find(p => p.id === jobId);
        if (project) {
            filter.innerHTML += `<option value="${jobId}">${project.propertyName}</option>`;
        }
    });
    filter.onchange = () => displayFilteredLoads(allUserTickets);
    displayFilteredLoads(allUserTickets);
}

// --- MODAL & FORM FUNCTIONS ---
export function openSignupModal() {
    document.getElementById('signup-form')?.reset();
    document.getElementById('signup-role-specific-container').classList.add('hidden');
    document.querySelectorAll('[id^="signup-"][id$="-details"]').forEach(div => div.classList.add('hidden'));
    populateCheckboxes('signup-forester-specialties', FORESTER_SPECIALTIES, 'foresterSpecialties');
    populateCheckboxes('signup-buyer-products', BUYER_PRODUCTS, 'buyerProducts');
    populateCheckboxes('signup-logger-services', LOGGING_CONTRACTOR_SERVICES, 'loggerServices');
    populateCheckboxes('signup-service-provider-services', SERVICE_PROVIDER_SERVICES, 'providerServices');
    openModal('signup-modal');
}

export function populatePropertyForm(property = null) {
    const form = document.getElementById('property-form');
    if (!form) { return; }
    form.reset();
    document.getElementById('property-id').value = property ? property.id : '';
    document.getElementById('property-form-title').textContent = property ? `Edit: ${property.name}` : 'Add New Property';
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
        document.getElementById('property-state').value = property.state || '';
        document.getElementById('property-apn').value = property.apn || '';
        document.getElementById('property-basal-area').value = property.basalArea || '';
        document.getElementById('property-site-index').value = property.siteIndex || '';
    }
    initPropertyFormMap(property ? sanitizeGeoJSON(property.geoJSON) : null);
}

export function openServiceSelectModal(propertyId, propertyName) {
    const modal = document.getElementById('service-select-modal');
    if (!modal) {
        console.error("Fatal: service-select-modal not found in the DOM.");
        alert("Error: Could not open the service selection form. Please refresh the page.");
        return;
    }
    modal.dataset.propertyId = propertyId;
    document.getElementById('service-modal-property-name').textContent = propertyName;

    modal.querySelectorAll('.service-category-btn').forEach(button => {
        button.disabled = false;
        button.classList.remove('opacity-50', 'cursor-not-allowed', 'bg-gray-100');
    });

    const activeProject = allProjects.find(p => 
        p.propertyId === propertyId && 
        p.status !== 'completed' && 
        p.status !== 'cancelled'
    );
    
    if (activeProject) {
        const forestryButton = modal.querySelector('button[data-service-category="Forestry"]');
        if (forestryButton) {
            forestryButton.disabled = true;
            forestryButton.classList.add('opacity-50', 'cursor-not-allowed', 'bg-gray-100');
        }
    }
    
    openModal('service-select-modal');
}


export async function openInviteForesterModal(propertyId) {
    const modal = document.getElementById('invite-forester-modal');
    if (!modal) {
        alert('Error: Invite modal HTML not found.');
        return;
    }
    const property = allProperties.find(p => p.id === propertyId);
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
        if (p.role?.toLowerCase() !== 'forester' || !p.location || typeof p.location.lat !== 'number' || typeof p.location.lng !== 'number' || typeof p.serviceRadius !== 'number') {
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
        listContainer.innerHTML = `<p class="text-center text-gray-500">No foresters found serving this area. Ensure forester profiles have a valid 'location' (with lat/lng) and a 'serviceRadius' number.</p>`;
    }
}

export function openDeclineModal(inquiryId) {
    const inquiry = allInquiries.find(i => i.id === inquiryId);
    if (!inquiry) return;
    document.getElementById('decline-inquiry-id').value = inquiryId;
    document.getElementById('decline-property-name').textContent = inquiry.propertyName;
    openModal('decline-modal');
}

export async function openViewInquiryModal(inquiryId) {
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

export async function populateCruiseFormPage(projectId) {
    const project = allProjects.find(p => p.id === projectId);
    if (!project) {
        alert("Project not found.");
        window.location.hash = '#my-projects';
        return;
    }
    const property = allProperties.find(p => p.id === project.propertyId);
    if (!property) {
        alert("Associated property data could not be loaded. You may not have the required permissions yet.");
        window.location.hash = '#my-projects';
        return;
    }
    const form = document.getElementById('timber-sale-form');
    if (!form) { 
        console.error("Fatal: timber-sale-form not found in the DOM.");
        return;
    }
    form.reset();
    document.getElementById('timber-sale-property-id').value = projectId;
    const cruiseData = project.cruiseData;
    const isLandownerReview = currentUser.role === 'landowner' && project.status === 'pending_approval';
    const title = document.getElementById('timber-sale-form-title');
    const submitBtn = document.getElementById('btn-submit-sale-form');
    const acceptCruiseBtn = document.getElementById('btn-accept-cruise-report');
    const startSaleBtn = document.getElementById('btn-start-timber-sale');
    title.textContent = isLandownerReview ? `Review Cruise for: ${property.name}` : `Enter Cruise Data for: ${property.name}`;
    submitBtn.style.display = isLandownerReview ? 'none' : 'block';
    acceptCruiseBtn.style.display = isLandownerReview ? 'block' : 'none';
    startSaleBtn.style.display = isLandownerReview ? 'block' : 'none';
    const d = cruiseData?.details || {};
    document.getElementById('sale-name').value = d.saleName || property.name || '';
    document.getElementById('sale-county').value = d.county || property.county || '';
    document.getElementById('sale-state').value = d.state || property.state || '';
    document.getElementById('sale-acreage').value = d.acreage || property.acreage?.toFixed(2) || '0';
    document.getElementById('sale-legal-desc').value = d.legalDesc || property.str || '';
    document.getElementById('sale-access-desc').value = d.accessDescription || property.accessibility || '';
    document.getElementById('sale-logging-conditions').value = d.loggingConditions || 'Good / Mostly Dry';
    document.getElementById('sale-type').value = d.bidMethod || 'lump-sum';
    document.getElementById('bid-deadline').value = d.bidDeadline || '';
    document.getElementById('sale-harvest-desc').value = d.harvestDescription || '';
    document.getElementById('sale-boundary-desc').value = d.boundaryDescription || '';
    document.getElementById('sale-smz-rules').value = d.smzRules || '';
    document.getElementById('sale-stump-height').value = d.stumpHeight || '';
    document.getElementById('sale-contract-length').value = d.contractLength || '';
    document.getElementById('sale-performance-bond-amount').value = d.performanceBondAmount || '';
    document.getElementById('sale-insurance-gli').value = d.insuranceGli || '';
    document.getElementById('sale-insurance-wc').value = d.insuranceWc || '';
    document.getElementById('sale-guarantee-tally').checked = d.guaranteeTally || false;
    document.getElementById('sale-more-conditions').value = d.moreConditions || '';
    
    const map = initTimberSaleMap(sanitizeGeoJSON(property.geoJSON), cruiseData?.annotations, isLandownerReview);
    
    setTimeout(() => {
        setupInventoryTableManager(cruiseData?.inventory, isLandownerReview);
        setFormEditable(form, !isLandownerReview);
        map?.invalidateSize();
    }, 100);
}


function setupInventoryTableManager(inventory = [], isReadOnly = false) {
    const container = document.getElementById('timber-inventory-stands-container');
    container.innerHTML = ''; 
    if (inventory && inventory.length > 0) {
        inventory.forEach(stand => addInventoryStand(stand, isReadOnly));
    } else {
        addInventoryStand(null, isReadOnly);
    }
    
    document.getElementById('add-inventory-stand-btn').onclick = () => addInventoryStand(null, isReadOnly);
    
    container.addEventListener('click', e => {
        const standContainer = e.target.closest('.inventory-stand');
        if (e.target.closest('.remove-inventory-stand-btn')) {
           e.target.closest('.inventory-stand').remove();
           updateAllStandDropdowns();
        } else if (e.target.closest('.add-inventory-product-btn')) {
           addInventoryProduct(standContainer.querySelector('.inventory-products-container'));
           updateProductDropdowns(standContainer);
        } else if (e.target.closest('.remove-inventory-product-btn')) {
           const standContainer = e.target.closest('.inventory-stand');
           e.target.closest('.inventory-product-group').remove();
           updateProductDropdowns(standContainer);
        } else if (e.target.closest('.add-custom-dbh-row-btn')) {
           const productContainer = e.target.closest('.inventory-product-group');
           addDbhRow(productContainer.querySelector('.dbh-rows-container'), '', null, true);
        }
        calculateAndDisplayInventoryTotals();
    });

    container.addEventListener('change', e => {
        const target = e.target;
        if (target.classList.contains('inventory-stand-name')) {
            updateAllStandDropdowns();
            calculateAndDisplayInventoryTotals(); 
        }
        if (target.classList.contains('inventory-product')) {
            const standContainer = target.closest('.inventory-stand');
            const productGroup = target.closest('.inventory-product-group');
            const dbhContainer = productGroup.querySelector('.dbh-rows-container');
            const selectedProduct = target.value;
            
            dbhContainer.innerHTML = ''; 
            const dbhClasses = PRODUCT_DBH_MAP[selectedProduct] || [];
            dbhClasses.forEach(dbh => addDbhRow(dbhContainer, dbh));
            
            updateProductDropdowns(standContainer);
        }
    });
    
    container.addEventListener('input', e => {
        if (e.target.classList.contains('dbh-volume') || e.target.classList.contains('dbh-trees') || e.target.classList.contains('stand-net-acres')) {
            calculateAndDisplayInventoryTotals();
        }
    });

    calculateAndDisplayInventoryTotals();
    updateAllStandDropdowns();
}

function addInventoryStand(standData = null, isReadOnly = false) {
    const container = document.getElementById('timber-inventory-stands-container');
    const template = document.getElementById('inventory-stand-template');
    const clone = template.content.cloneNode(true);
    const standElement = clone.querySelector('.inventory-stand');
    const productsContainer = standElement.querySelector('.inventory-products-container');
    const standNameSelect = standElement.querySelector('.inventory-stand-name');
    
    if (standData) {
        // A short timeout allows the dropdown to be populated by the event listener before we set its value
        setTimeout(() => {
            standNameSelect.value = standData.name || '';
            const changeEvent = new Event('change', { bubbles: true });
            standNameSelect.dispatchEvent(changeEvent);
        }, 0);

        if (standData.products && standData.products.length > 0) {
            standData.products.forEach(product => addInventoryProduct(productsContainer, product));
        } else {
             addInventoryProduct(productsContainer);
        }
        standElement.querySelector('.stand-net-acres').value = standData.netAcres || '';
    } else {
        addInventoryProduct(productsContainer);
    }
    container.appendChild(clone);
    updateInventoryStandDropdowns(); 
    updateProductDropdowns(standElement);
}

function addInventoryProduct(container, productData = null) {
    const template = document.getElementById('inventory-product-template');
    const clone = template.content.cloneNode(true);
    const productGroup = clone.querySelector('.inventory-product-group');
    const dbhRowsContainer = productGroup.querySelector('.dbh-rows-container');
    
    const selectedProduct = productData?.product || "";
    productGroup.querySelector('.inventory-product').value = selectedProduct;
    
    const dbhClasses = PRODUCT_DBH_MAP[selectedProduct] || [];
    dbhClasses.forEach(dbh => {
        let dbhValues = null;
        if (productData && productData.breakdown) {
            dbhValues = productData.breakdown.find(b => b.dbh === dbh);
        }
        addDbhRow(dbhRowsContainer, dbh, dbhValues);
    });

    if (productData && productData.breakdown) {
        productData.breakdown.forEach(b => {
            if (!dbhClasses.includes(b.dbh) && b.dbh) { 
                addDbhRow(dbhRowsContainer, b.dbh, b, true);
            }
        });
    }

    container.appendChild(clone);
}

function addDbhRow(container, dbh, dbhData = null, isCustom = false) {
    const row = document.createElement('tr');
    row.className = 'dbh-row';

    const dbhInputHTML = isCustom 
        ? `<input type="text" class="dbh-class w-full p-1 border rounded text-center" value="${dbh}" placeholder="e.g. 26&quot;">`
        : `<input type="text" class="dbh-class w-full p-1 border-0 bg-gray-100 text-center" value="${dbh}" readonly>`;

    row.innerHTML = `
        <td class="p-1">${dbhInputHTML}</td>
        <td class="p-1"><input type="number" class="dbh-trees w-full p-1 border rounded" placeholder="0" value="${dbhData?.trees || ''}"></td>
        <td class="p-1"><input type="number" step="0.01" class="dbh-volume w-full p-1 border rounded" placeholder="0.00" value="${dbhData?.volume || ''}"></td>
        <td class="p-1">
            <select class="dbh-unit w-full p-1 border rounded">
                <option ${ (dbhData?.units === 'Tons' || !dbhData) ? 'selected' : ''}>Tons</option>
                <option ${ dbhData?.units === 'MBF' ? 'selected' : ''}>MBF</option>
            </select>
        </td>
    `;
    container.appendChild(row);
}


export function updateInventoryStandDropdowns() {
    const availableStands = getDrawnHarvestAreas().filter(area => area.type === 'Harvest Area' || area.type === 'SMZ');
    
    const allDropdowns = document.querySelectorAll('.inventory-stand-name');

    allDropdowns.forEach(select => {
        const currentVal = select.value;
        select.innerHTML = '<option value="">Select Harvest Area...</option>';
        availableStands.forEach(area => {
            const option = new Option(`${area.label} (${area.acreage.toFixed(2)} ac)`, area.label);
            option.dataset.acreage = area.acreage;
            select.appendChild(option);
        });
        if (Array.from(select.options).some(opt => opt.value === currentVal)) {
            select.value = currentVal;
        }
    });
    updateAllStandDropdowns();
}

function updateAllStandDropdowns() {
    const selectedStands = new Set();
    document.querySelectorAll('.inventory-stand-name').forEach(select => {
        if (select.value) {
            selectedStands.add(select.value);
        }
    });

    document.querySelectorAll('.inventory-stand-name').forEach(select => {
        const currentVal = select.value;
        for (const option of select.options) {
            if (option.value && option.value !== currentVal) {
                option.disabled = selectedStands.has(option.value);
            } else {
                option.disabled = false;
            }
        }
        const standEl = select.closest('.inventory-stand');
        if(standEl) {
            const selectedOption = select.selectedOptions[0];
            const grossAcresSpan = standEl.querySelector('.stand-gross-acres');
            if (selectedOption && selectedOption.value) {
                grossAcresSpan.textContent = parseFloat(selectedOption.dataset.acreage).toFixed(2);
            } else {
                grossAcresSpan.textContent = '0.00';
            }
        }
    });
}

function updateProductDropdowns(standElement) {
    const selectedProducts = new Set();
    standElement.querySelectorAll('.inventory-product').forEach(select => {
        if (select.value) {
            selectedProducts.add(select.value);
        }
    });
    
    standElement.querySelectorAll('.inventory-product').forEach(select => {
        const currentSelection = select.value;
        select.querySelectorAll('option').forEach(option => {
            if (option.value && option.value !== currentSelection) {
                option.disabled = selectedProducts.has(option.value);
            } else {
                 option.disabled = false;
            }
        });
    });
}


function calculateAndDisplayInventoryTotals() {
    const grandTotals = {
        "Pine Sawtimber": { tons: 0 },
        "Pine Chip-n-Saw": { tons: 0 },
        "Pine Pulpwood": { tons: 0 },
        "Hardwood Sawtimber": { tons: 0 },
        "Hardwood Pulpwood": { tons: 0 },
    };
    
    const productMapping = {
        "Oak Sawtimber": "Hardwood Sawtimber",
        "Gum Sawtimber": "Hardwood Sawtimber",
        "Ash Sawtimber": "Hardwood Sawtimber",
        "Hickory Sawtimber": "Hardwood Sawtimber",
        "Misc. Hardwood Sawtimber": "Hardwood Sawtimber",
        "Cypress Sawtimber": "Hardwood Sawtimber",
        "Pine Topwood": "Pine Pulpwood",
    };

    let totalGrossAcres = 0;
    let totalNetAcres = 0;

    document.querySelectorAll('.inventory-stand').forEach(standEl => {
        const standTotals = { totalTrees: 0, totalVolume: 0 };
        const netAcresInput = standEl.querySelector('.stand-net-acres');
        const grossAcres = parseFloat(standEl.querySelector('.stand-gross-acres').textContent) || 0;
        let netAcres = parseFloat(netAcresInput.value);
        
        if (isNaN(netAcres) || netAcres <= 0) {
            netAcres = grossAcres > 0 ? grossAcres : 0;
        }

        if (standEl.querySelector('.inventory-stand-name').value) {
             totalGrossAcres += grossAcres;
             totalNetAcres += parseFloat(netAcresInput.value) || grossAcres; 
        }
        
        if (grossAcres > 0 && !netAcresInput.value) {
            netAcresInput.placeholder = `e.g. ${grossAcres.toFixed(1)}`;
        }

        standEl.querySelectorAll('.inventory-product-group').forEach(productGroup => {
            const selectedProduct = productGroup.querySelector('.inventory-product').value;
            let summaryCategory = productMapping[selectedProduct] || selectedProduct;

            if (grandTotals.hasOwnProperty(summaryCategory)) {
                productGroup.querySelectorAll('.dbh-row').forEach(row => {
                    const volume = parseFloat(row.querySelector('.dbh-volume').value) || 0;
                    const trees = parseInt(row.querySelector('.dbh-trees').value, 10) || 0;
                    
                    if(row.querySelector('.dbh-unit').value === 'Tons') {
                        grandTotals[summaryCategory].tons += volume;
                        standTotals.totalVolume += volume;
                    }
                    standTotals.totalTrees += trees;
                });
            }
        });

        const treesPerAcre = netAcres > 0 ? (standTotals.totalTrees / netAcres).toFixed(1) : '0.0';
        const volumePerAcre = netAcres > 0 ? (standTotals.totalVolume / netAcres).toFixed(2) : '0.00';
        standEl.querySelector('.stand-total-volume').textContent = standTotals.totalVolume.toFixed(2);
        standEl.querySelector('.stand-trees-per-acre').textContent = treesPerAcre;
        standEl.querySelector('.stand-volume-per-acre').textContent = volumePerAcre;
    });

    document.getElementById('total-gross-acres').textContent = totalGrossAcres.toFixed(2);
    document.getElementById('total-net-acres').textContent = totalNetAcres.toFixed(2);

    let grandTotalVolume = 0;
    document.getElementById('total-pine-sawtimber').textContent = grandTotals["Pine Sawtimber"].tons.toFixed(2);
    document.getElementById('total-pine-cns').textContent = grandTotals["Pine Chip-n-Saw"].tons.toFixed(2);
    document.getElementById('total-pine-pulpwood').textContent = grandTotals["Pine Pulpwood"].tons.toFixed(2);
    document.getElementById('total-hardwood-sawtimber').textContent = grandTotals["Hardwood Sawtimber"].tons.toFixed(2);
    document.getElementById('total-hardwood-pulpwood').textContent = grandTotals["Hardwood Pulpwood"].tons.toFixed(2);
    
    for (const key in grandTotals) {
        grandTotalVolume += grandTotals[key].tons;
    }
    document.getElementById('total-all-products').textContent = grandTotalVolume.toFixed(2);
}

export function updateMapLegend() {
    const legendContainer = document.getElementById('map-legend');
    if (!legendContainer) return;

    const allFeatures = getDrawnHarvestAreas(); 
    if (allFeatures.length === 0) {
        legendContainer.innerHTML = '<p class="text-gray-500 text-center">No areas, roads, or points drawn on the map.</p>';
        return;
    }

    let legendHTML = '<h4 class="font-semibold mb-2">Map Legend</h4><div class="space-y-1">';
    allFeatures.forEach(area => {
        let symbolHTML = '';
        const color = area.color || '#000000';
        const fillColor = area.fillColor || area.color;

        if (area.type === 'Property Boundary') {
             symbolHTML = `<span class="inline-block w-4 h-4 mr-2 border-2 border-dashed" style="border-color: ${color}; background-color: ${fillColor}20;"></span>`;
        }
        else if (area.type === 'Harvest Area' || area.type === 'SMZ') {
            symbolHTML = `<span class="inline-block w-4 h-4 mr-2 border" style="background-color: ${color}; border-color: ${color};"></span>`;
        } else if (area.type === 'Road') {
            symbolHTML = `<span class="inline-block w-4 h-1 mr-2 -translate-y-1 border-t-2 border-b-2" style="border-color: ${color};"></span>`;
        } else if (area.type === 'Point of Interest') {
            // MODIFIED: Use a simple circle for the legend marker
            symbolHTML = `<span class="inline-block w-4 h-4 mr-2 rounded-full border border-black" style="background-color: ${color};"></span>`;
        }
        
        const acreageText = (area.acreage > 0) 
            ? `: ${area.acreage.toFixed(2)} acres`
            : '';
            
        legendHTML += `
            <div class="flex items-center text-xs">
                ${symbolHTML}
                <span><strong>${area.label}</strong> (${area.type})${acreageText}</span>
            </div>
        `;
    });
    legendHTML += '</div>';
    legendContainer.innerHTML = legendHTML;
}


export function openForesterQuoteModal(inquiryId) {
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

export async function openViewQuotesModal(projectId) {
    const project = allProjects.find(p => p.id === projectId);
    if (!project) return alert("Project not found.");
    const modal = document.getElementById('view-quotes-modal');
    const title = document.getElementById('view-quotes-title');
    const list = document.getElementById('view-quotes-list');
    title.textContent = `Quotes for ${project.propertyName}`;
    list.innerHTML = `<p>Loading quotes...</p>`;
    openModal('view-quotes-modal');
    const quotes = await fetchQuotesForProject(db, [project.id], currentUser.uid);
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

export function openEditProfileModal() {
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
    } else {
        document.getElementById('edit-profile-map-container').classList.add('hidden');
    }
    openModal('edit-profile-modal');
    if (role !== 'landowner') initEditProfileMap(currentUser);
}

export function openRateSheetModal(projectId) {
    const project = allProjects.find(p => p.id === projectId);
    if (!project) {
        alert("Could not find project details.");
        return;
    }
    const form = document.getElementById('rate-sheet-form');
    form.reset();
    document.getElementById('rate-sheet-project-id').value = projectId;
    document.getElementById('rate-sheet-title').textContent = `Manage Rates for: ${project.propertyName}`;
    const container = document.getElementById('rate-sets-container');
    container.innerHTML = '';
    renderRateSets(project.rateSets || []);
    document.getElementById('add-rate-set-btn').onclick = () => addRateSet();
    container.addEventListener('click', (e) => {
        if (e.target.matches('.remove-rate-set-btn')) {
            e.target.closest('.rate-set').remove();
        }
        if (e.target.matches('.add-rate-row-btn')) {
            const category = e.target.dataset.category;
            const rowsContainer = e.target.previousElementSibling;
            addRateRow(rowsContainer, { product: '', price: '' }, category);
        }
        if (e.target.matches('.remove-rate-row-btn')) {
            e.target.closest('.rate-row').remove();
        }
    });
    openModal('rate-sheet-modal');
}

function renderRateSets(rateSets = []) {
    const container = document.getElementById('rate-sets-container');
    container.innerHTML = '';
    if (rateSets.length === 0) {
        addRateSet(); 
    } else {
        rateSets.sort((a, b) => new Date(a.effectiveDate) - new Date(b.effectiveDate));
        rateSets.forEach(set => addRateSet(set));
    }
}

function addRateSet(setData = null) {
    const container = document.getElementById('rate-sets-container');
    const template = document.getElementById('rate-set-template');
    const clone = template.content.cloneNode(true);
    const rateSetElement = clone.querySelector('.rate-set');
    if (setData) {
        rateSetElement.querySelector('.rate-set-effective-date').value = setData.effectiveDate || '';
        const categories = ['mill', 'stumpage', 'logging'];
        categories.forEach(category => {
            const rowsContainer = setElement.querySelector(`.add-rate-row-btn[data-category="${category}"]`).previousElementSibling;
            (setData[category] || []).forEach(rate => addRateRow(rowsContainer, rate, category));
        });
    } else {
        rateSetElement.querySelector('.rate-set-effective-date').valueAsDate = new Date();
    }
    container.appendChild(clone);
}

function addRateRow(container, rowData, category) {
    const template = document.getElementById('rate-row-template');
    const clone = template.content.cloneNode(true);
    const rowElement = clone.querySelector('.rate-row');
    rowElement.querySelector('.rate-product').value = rowData.product || '';
    rowElement.querySelector('.rate-price').value = rowData.price || '';
    container.appendChild(clone);
}

export function setupServiceFilter(checkboxId, dropdownId, services) {
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