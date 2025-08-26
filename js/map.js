// js/map.js
let globalMap, propertyMap, signupMap, editProfileMap, drawnItems, lastDrawnLayer, locationMarker, serviceAreaCircle;
let profileMap;

function destroyMap(mapInstance) {
    if (mapInstance) {
        mapInstance.remove();
    }
    return null;
}

// js/map.js

function addLayerControls(map) {
    // Define the individual layers using reliable, token-free providers
    const streets = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { 
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' 
    });
    const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri'
    });
    const hybridLabels = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri',
        // Ensure labels appear on top of other layers
        pane: 'overlayPane' 
    });
    
    // NEW: Layer for roads and transportation network
    const hybridTransportation = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri',
        // Ensure roads appear on top of satellite imagery
        pane: 'overlayPane' 
    });

    // UPDATED: Create a Layer Group for the Hybrid view by combining satellite, transportation, and labels
    const hybridGroup = L.layerGroup([satellite, hybridTransportation, hybridLabels]);

    // Define the base maps object for the control
    const baseMaps = {
        "Hybrid": hybridGroup,
        "Streets": streets,
        "Satellite": satellite
    };

    // Add the Hybrid group to the map first to make it the default
    hybridGroup.addTo(map);

    // Add the layer switcher control to the map
    L.control.layers(baseMaps, null, { position: 'topright' }).addTo(map);
}

export function createGeocoder(map) {
    const geocoderContainer = document.getElementById('geocoder-container');
    geocoderContainer.innerHTML = '';
    
    const geocoder = L.Control.geocoder({
        defaultMarkGeocode: false,
        collapsed: false,
        placeholder: 'Search for a location...',
    }).on('markgeocode', function(e) {
        map.fitBounds(e.geocode.bbox);
        document.getElementById('map-search-modal').classList.add('hidden');
    });
    geocoder.addTo(geocoderContainer);
}

export function initGlobalMap(onMoveEndCallback) {
    globalMap = destroyMap(globalMap);
    globalMap = L.map('global-map').setView([34.7465, -92.2896], 7);
    addLayerControls(globalMap);
    if (onMoveEndCallback) {
        globalMap.on('moveend', onMoveEndCallback);
    }
}

export function initPropertyFormMap(existingGeoJSON) {
    propertyMap = destroyMap(propertyMap);
    
    propertyMap = L.map('property-map').setView([34.7465, -92.2896], 10);
    addLayerControls(propertyMap);

    drawnItems = new L.FeatureGroup();
    propertyMap.addLayer(drawnItems);

    if (existingGeoJSON && existingGeoJSON.geometry && existingGeoJSON.geometry.coordinates) {
        const displayGeoJSON = JSON.parse(JSON.stringify(existingGeoJSON));
        displayGeoJSON.geometry.coordinates = [displayGeoJSON.geometry.coordinates];
        
        const existingLayer = L.geoJSON(displayGeoJSON);
        drawnItems.addLayer(existingLayer);
        lastDrawnLayer = existingLayer.getLayers()[0];
        propertyMap.fitBounds(existingLayer.getBounds());
        calculateAndDisplayAcreage(lastDrawnLayer);
    }

    const drawControl = new L.Control.Draw({
        edit: { featureGroup: drawnItems, remove: true },
        draw: {
            polygon: { allowIntersection: false, showArea: true },
            polyline: false, rectangle: false, circle: false,
            marker: false, circlemarker: false
        }
    });
    propertyMap.addControl(drawControl);

    propertyMap.on(L.Draw.Event.CREATED, function (event) {
        if (lastDrawnLayer) drawnItems.removeLayer(lastDrawnLayer);
        const layer = event.layer;
        lastDrawnLayer = layer;
        drawnItems.addLayer(layer);
        calculateAndDisplayAcreage(layer);
    });

    propertyMap.on(L.Draw.Event.EDITED, function (event) {
        const layers = event.layers;
        layers.eachLayer(function (layer) {
            lastDrawnLayer = layer;
            calculateAndDisplayAcreage(layer);
        });
    });
    
    propertyMap.on(L.Draw.Event.DELETED, function () {
        lastDrawnLayer = null;
        calculateAndDisplayAcreage(null);
    });

    setTimeout(() => {
        if (propertyMap) propertyMap.invalidateSize()
    }, 400);
}

function calculateAndDisplayAcreage(layer) {
    const acreageSpan = document.getElementById('calculated-acreage');
    if (layer && L.GeometryUtil) {
        const latlngs = layer.getLatLngs()[0];
        if (latlngs && latlngs.length > 2) {
            const areaInMeters = L.GeometryUtil.geodesicArea(latlngs);
            const areaInAcres = areaInMeters / 4046.86;
            acreageSpan.textContent = areaInAcres.toFixed(2);
        } else {
             acreageSpan.textContent = '0.00';
        }
    } else {
        acreageSpan.textContent = '0.00';
    }
}

export function getLastDrawnGeoJSON() {
    if (!lastDrawnLayer) return null;
    const geojson = lastDrawnLayer.toGeoJSON();
    geojson.geometry.coordinates = geojson.geometry.coordinates[0];
    return geojson;
}

export function initProfileDisplayMap(user) {
    const mapContainer = document.getElementById('profile-map-display');
    if (!mapContainer) return;

    profileMap = destroyMap(profileMap);

    if (!user || !user.location) {
        mapContainer.innerHTML = `<div class="p-4 text-center text-gray-500">No location set.</div>`;
        return;
    }
    
    mapContainer.innerHTML = "";
    const lat = user.location.lat;
    const lng = user.location.lng;

    profileMap = L.map(mapContainer, {
        center: [lat, lng],
        zoom: 10,
        dragging: false, touchZoom: false, scrollWheelZoom: false,
        doubleClickZoom: false, boxZoom: false, keyboard: false,
        zoomControl: true
    });
    
    addLayerControls(profileMap);

    L.marker([lat, lng]).addTo(profileMap);

    if (user.serviceRadius) {
        const circle = L.circle([lat, lng], {
            radius: user.serviceRadius * 1609.34,
            color: 'blue',
            fillColor: '#3498db',
            fillOpacity: 0.2
        }).addTo(profileMap);
        profileMap.fitBounds(circle.getBounds());
    }
}

export function initSignupMap(role) {
    const mapId = `${role}-signup-map`;
    signupMap = destroyMap(signupMap);
    
    signupMap = L.map(mapId).setView([34.7465, -92.2896], 5);
    addLayerControls(signupMap);

    locationMarker = null;

    signupMap.on('click', function(e) {
        if (locationMarker) {
            locationMarker.setLatLng(e.latlng);
        } else {
            locationMarker = L.marker(e.latlng).addTo(signupMap);
        }
    });
    setTimeout(() => {
        if (signupMap) signupMap.invalidateSize();
    }, 400);
}

export function initEditProfileMap(user) {
    editProfileMap = destroyMap(editProfileMap);

    const lat = user.location?.lat || 34.7465;
    const lng = user.location?.lng || -92.2896;
    const radius = user.serviceRadius || 50;

    editProfileMap = L.map('edit-profile-map').setView([lat, lng], 7);
    addLayerControls(editProfileMap);

    locationMarker = L.marker([lat, lng], { draggable: true }).addTo(editProfileMap);
    serviceAreaCircle = L.circle([lat, lng], {
        radius: radius * 1609.34,
        color: 'blue',
        fillColor: '#3498db',
        fillOpacity: 0.2
    }).addTo(editProfileMap);

    locationMarker.on('dragend', function(event){
        const marker = event.target;
        const position = marker.getLatLng();
        serviceAreaCircle.setLatLng(position);
    });

    setTimeout(() => {
        if (editProfileMap) editProfileMap.invalidateSize();
    }, 400);
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

export function getMapInstance(mapId) {
    switch (mapId) {
        case 'global-map': return globalMap;
        case 'property-map': return propertyMap;
        case 'profile-map-display': return profileMap;
        case 'forester-signup-map':
        case 'buyer-signup-map':
        case 'contractor-signup-map':
            return signupMap;
        case 'edit-profile-map':
            return editProfileMap;
        default: return null;
    }
}

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
            if (prop.geoJSON && prop.geoJSON.geometry && prop.geoJSON.geometry.coordinates) {
                const displayGeoJSON = JSON.parse(JSON.stringify(prop.geoJSON));
                displayGeoJSON.geometry.coordinates = [displayGeoJSON.geometry.coordinates];
                
                const geoJsonLayer = L.geoJSON(displayGeoJSON);
                const layerBounds = geoJsonLayer.getBounds();

                if (bounds.intersects(layerBounds)) {
                    itemsInView++;
                    const marker = L.geoJSON(displayGeoJSON, {
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
        const roleKey = prof.role + 's';
        if (filters[roleKey] && prof.location) {
            const profLatLng = L.latLng(prof.location.lat, prof.location.lng);
            if (bounds.contains(profLatLng)) {
                itemsInView++;
                const color = prof.role === 'forester' ? 'green' : prof.role === 'buyer' ? 'red' : 'yellow';
                const marker = L.circleMarker(profLatLng, {
                    radius: 8, color: 'white', weight: 2,
                    fillColor: color, fillOpacity: 1
                }).bindPopup(`<b>${prof.username}</b><br>Role: ${prof.role.charAt(0).toUpperCase() + prof.role.slice(1)}`).addTo(globalMap);
                profileMarkers.push(marker);
                const li = document.createElement('li');
                li.className = 'p-2 border-b cursor-pointer hover:bg-gray-100';
                li.innerHTML = `<span class="font-bold" style="color: ${color};">${prof.username}</span><br><span class="text-sm">${prof.role.charAt(0).toUpperCase() + prof.role.slice(1)}</span>`;
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