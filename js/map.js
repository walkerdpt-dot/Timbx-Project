// js/map.js
import { getMarketplaceDataFromSession } from './firestore.js';

let globalMap, propertyMap, signupMap, editProfileMap, drawnItems, lastDrawnLayer, locationMarker, serviceAreaCircle;

// --- Map Initialization Functions ---

export function initGlobalMap(onMoveEndCallback) {
    if (globalMap) {
        globalMap.invalidateSize();
        return;
    }
    globalMap = L.map('global-map').setView([34.7465, -92.2896], 7); // Centered on Arkansas
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(globalMap);

    if (onMoveEndCallback) {
        globalMap.on('moveend', onMoveEndCallback);
    }

    // Add geocoder search control
    L.Control.geocoder({
        defaultMarkGeocode: false
    })
    .on('markgeocode', function(e) {
        var bbox = e.geocode.bbox;
        var poly = L.polygon([
            bbox.getSouthEast(),
            bbox.getNorthEast(),
            bbox.getNorthWest(),
            bbox.getSouthWest()
        ]);
        globalMap.fitBounds(poly.getBounds());
    })
    .addTo(globalMap);
}

// ... (initPropertyFormMap, destroyPropertyFormMap, getLastDrawnGeoJSON remain the same)
export function initPropertyFormMap() {
    if (propertyMap) {
        propertyMap.invalidateSize();
        return;
    }
    propertyMap = L.map('property-map').setView([34.7465, -92.2896], 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(propertyMap);

    drawnItems = new L.FeatureGroup();
    propertyMap.addLayer(drawnItems);

    const drawControl = new L.Control.Draw({
        edit: { featureGroup: drawnItems },
        draw: {
            polygon: true,
            polyline: false,
            rectangle: false,
            circle: false,
            marker: false,
            circlemarker: false
        }
    });
    propertyMap.addControl(drawControl);

    propertyMap.on(L.Draw.Event.CREATED, function (event) {
        if (lastDrawnLayer) {
            drawnItems.removeLayer(lastDrawnLayer);
        }
        const layer = event.layer;
        lastDrawnLayer = layer;
        drawnItems.addLayer(layer);
    });
}

export function destroyPropertyFormMap() {
    if (propertyMap) {
        propertyMap.remove();
        propertyMap = null;
        lastDrawnLayer = null;
    }
}

export function getLastDrawnGeoJSON() {
    if (lastDrawnLayer) {
        return lastDrawnLayer.toGeoJSON();
    }
    return null;
}


// --- NEW FUNCTION ---
// Initializes the static map on the user's profile page.
export function initProfileDisplayMap(user) {
    const mapContainer = document.getElementById('profile-map-display');
    if (!mapContainer) return;

    // Clear previous map instance if any
    if (mapContainer._leaflet_id) {
        mapContainer._leaflet_id = null;
        mapContainer.innerHTML = "";
    }

    if (!user || !user.location) {
        mapContainer.innerHTML = `<div class="p-4 text-center text-gray-500">No location set.</div>`;
        return;
    }

    const lat = user.location.lat;
    const lng = user.location.lng;

    const profileMap = L.map(mapContainer, {
        center: [lat, lng],
        zoom: 10,
        dragging: false,
        touchZoom: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
        zoomControl: false // Hide zoom buttons
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(profileMap);

    L.marker([lat, lng]).addTo(profileMap);

    if (user.serviceRadius) {
        L.circle([lat, lng], {
            radius: user.serviceRadius * 1609.34, // Convert miles to meters
            color: 'blue',
            fillColor: '#3498db',
            fillOpacity: 0.2
        }).addTo(profileMap);
        profileMap.fitBounds(profileMap.getBounds()); // Adjust zoom to fit the circle
    }
}


// ... (The rest of map.js remains the same)

// --- Map Update & Display Functions ---

let propertyMarkers = [];
let profileMarkers = [];
export function updateMapAndList(allProperties, allProfessionalProfiles) {
    if (!globalMap) return;
    
    const bounds = globalMap.getBounds();
    const listContainer = document.getElementById('dynamic-map-list');
    listContainer.innerHTML = '';
    
    propertyMarkers.forEach(m => globalMap.removeLayer(m));
    profileMarkers.forEach(m => globalMap.removeLayer(m));
    propertyMarkers = [];
    profileMarkers = [];
    
    const filters = {
        properties: document.getElementById('filter-properties').checked,
        foresters: document.getElementById('filter-foresters').checked,
        buyers: document.getElementById('filter-buyers').checked,
        contractors: document.getElementById('filter-contractors').checked
    };

    let itemsInView = 0;

    if (filters.properties) {
        allProperties.forEach(prop => {
            if (prop.geoJSON && prop.geoJSON.geometry) {
                const geoJsonLayer = L.geoJSON(prop.geoJSON);
                const layerBounds = geoJsonLayer.getBounds();
                if (bounds.intersects(layerBounds)) {
                    itemsInView++;
                    const marker = L.geoJSON(prop.geoJSON, {
                        style: { color: 'blue', weight: 2 }
                    }).bindPopup(`<b>${prop.name}</b><br>${prop.serviceType}`).addTo(globalMap);
                    propertyMarkers.push(marker);

                    const li = document.createElement('li');
                    li.className = 'p-2 border-b cursor-pointer hover:bg-gray-100';
                    li.innerHTML = `<span class="font-bold text-blue-700">${prop.name}</span><br><span class="text-sm">${prop.serviceType}</span>`;
                    li.onclick = () => {
                        globalMap.fitBounds(marker.getBounds());
                        marker.openPopup();
                    };
                    listContainer.appendChild(li);
                }
            }
        });
    }

    allProfessionalProfiles.forEach(prof => {
        const role = prof.role;
        if (filters[role + 's'] && prof.location) {
            const profLatLng = L.latLng(prof.location.lat, prof.location.lng);
            if (bounds.contains(profLatLng)) {
                itemsInView++;
                const color = role === 'forester' ? 'green' : role === 'buyer' ? 'red' : 'yellow';
                const marker = L.circleMarker(profLatLng, {
                    radius: 8,
                    color: 'white',
                    weight: 2,
                    fillColor: color,
                    fillOpacity: 1
                }).bindPopup(`<b>${prof.username}</b><br>Role: ${role.charAt(0).toUpperCase() + role.slice(1)}`).addTo(globalMap);
                profileMarkers.push(marker);

                const li = document.createElement('li');
                li.className = 'p-2 border-b cursor-pointer hover:bg-gray-100';
                li.innerHTML = `<span class="font-bold" style="color: ${color};">${prof.username}</span><br><span class="text-sm">${role.charAt(0).toUpperCase() + role.slice(1)}</span>`;
                li.onclick = () => {
                    globalMap.setView(marker.getLatLng(), 12);
                    marker.openPopup();
                };
                listContainer.appendChild(li);
            }
        }
    });

    if (itemsInView === 0) {
        listContainer.innerHTML = '<li class="p-2 text-center text-gray-500">No items in the current map view.</li>';
    }
}

export function showPropertyMap(property) {
    if (!property.geoJSON) return;

    // A simple implementation could be to open a new window or a modal with a map.
    // For now, let's just log it to console.
    console.log("Displaying map for property:", property.name, property.geoJSON);
    alert(`Map data for ${property.name} would be displayed here.`);
}

export function initSignupMap(role) {
    const mapId = `${role}-signup-map`;
    if (signupMap) signupMap.remove();
    
    signupMap = L.map(mapId).setView([34.7465, -92.2896], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(signupMap);

    if (locationMarker) locationMarker.remove();

    signupMap.on('click', function(e) {
        if (locationMarker) {
            locationMarker.setLatLng(e.latlng);
        } else {
            locationMarker = L.marker(e.latlng).addTo(signupMap);
        }
    });
}

export function initEditProfileMap(user) {
    if (editProfileMap) {
        editProfileMap.remove();
        editProfileMap = null;
        locationMarker = null;
        serviceAreaCircle = null;
    }

    const lat = user.location?.lat || 34.7465;
    const lng = user.location?.lng || -92.2896;
    const radius = user.serviceRadius || 50;

    editProfileMap = L.map('edit-profile-map').setView([lat, lng], 7);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(editProfileMap);

    locationMarker = L.marker([lat, lng], { draggable: true }).addTo(editProfileMap);
    serviceAreaCircle = L.circle([lat, lng], {
        radius: radius * 1609.34, // Convert miles to meters
        color: 'blue',
        fillColor: '#3498db',
        fillOpacity: 0.2
    }).addTo(editProfileMap);

    locationMarker.on('dragend', function(event){
        const marker = event.target;
        const position = marker.getLatLng();
        serviceAreaCircle.setLatLng(position);
    });

    setTimeout(() => editProfileMap.invalidateSize(), 100);
}

export function updateServiceAreaCircle(radiusInMiles) {
    if (serviceAreaCircle) {
        const radiusInMeters = radiusInMiles * 1609.34;
        serviceAreaCircle.setRadius(radiusInMeters);
    }
}

export function getUpdatedLocation() {
    if (locationMarker) {
        const latLng = locationMarker.getLatLng();
        return { lat: latLng.lat, lng: latLng.lng };
    }
    return null;
}