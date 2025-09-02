// js/map.js

// Map instances are stored in a Map object for easier management.
const mapInstances = new Map();
let drawnItems, lastDrawnLayer, locationMarker, serviceAreaCircle;

// This global variable will hold the features drawn on the project map
let projectAnnotationLayers = null;

/**
 * Creates a standard Leaflet map with common controls.
 * @param {string} containerId The ID of the HTML element for the map.
 * @param {object} mapOptions Options to pass to the L.map constructor.
 * @param {Array} view An array of [lat, lng, zoom] for the initial view.
 * @returns {L.Map | null} The created Leaflet map instance or null if container not found.
 */
function createBaseMap(containerId, mapOptions = {}, view = [34.7465, -92.2896, 7]) {
    if (mapInstances.has(containerId)) {
        const oldMap = mapInstances.get(containerId);
        if (oldMap) oldMap.remove();
    }
    
    const mapContainer = document.getElementById(containerId);
    if (!mapContainer) {
        console.error(`Map container with ID "${containerId}" not found.`);
        return null;
    }
    mapContainer.innerHTML = ''; // Clear container to prevent issues

    const map = L.map(containerId, mapOptions).setView(view.slice(0, 2), view[2]);
    addLayerControls(map);
    
    mapInstances.set(containerId, map);
    return map;
}

export function addLayerControls(map) {
    const streets = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { 
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' 
    });
    const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri'
    });
    const hybridGroup = L.layerGroup([
        satellite,
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { pane: 'overlayPane' }),
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', { pane: 'overlayPane' })
    ]);
    
    const baseMaps = { "Hybrid": hybridGroup, "Streets": streets, "Satellite": satellite };
    hybridGroup.addTo(map);
    L.control.layers(baseMaps, null, { position: 'topright' }).addTo(map);
}

export function createGeocoder(map) {
    const geocoderContainer = document.getElementById('geocoder-container');
    geocoderContainer.innerHTML = '';
    
    L.Control.geocoder({
        defaultMarkGeocode: false,
        collapsed: false,
        placeholder: 'Search for a location...',
    }).on('markgeocode', function(e) {
        map.fitBounds(e.geocode.bbox);
        document.getElementById('map-search-modal').classList.add('hidden');
    }).addTo(geocoderContainer);
}

export function initGlobalMap() {
    return createBaseMap('global-map');
}

export function initMyPropertiesMap() {
    return createBaseMap('my-properties-map');
}

export function initPropertyFormMap(existingGeoJSON) {
    const map = createBaseMap('property-map', {}, [34.7465, -92.2896, 10]);
    if (!map) return;
    
    drawnItems = new L.FeatureGroup().addTo(map);

    if (existingGeoJSON?.geometry?.coordinates) {
        const existingLayer = L.geoJSON(existingGeoJSON).addTo(drawnItems);
        lastDrawnLayer = existingLayer.getLayers()[0];
        requestAnimationFrame(() => {
            if (map && existingLayer.getBounds().isValid()) {
                 map.invalidateSize();
                 map.fitBounds(existingLayer.getBounds());
            }
        });
        calculateAndDisplayAcreage(lastDrawnLayer);
    }

    const drawControl = new L.Control.Draw({
        edit: { featureGroup: drawnItems },
        draw: { polygon: { allowIntersection: false, showArea: true }, polyline: false, rectangle: false, circle: false, marker: false, circlemarker: false }
    }).addTo(map);

    map.on(L.Draw.Event.CREATED, (event) => {
        drawnItems.clearLayers();
        lastDrawnLayer = event.layer.addTo(drawnItems);
        calculateAndDisplayAcreage(lastDrawnLayer);
    });
    map.on(L.Draw.Event.EDITED, (event) => {
        lastDrawnLayer = event.layers.getLayers()[0];
        calculateAndDisplayAcreage(lastDrawnLayer);
    });
    map.on(L.Draw.Event.DELETED, () => {
        lastDrawnLayer = null;
        calculateAndDisplayAcreage(null);
    });

    requestAnimationFrame(() => map.invalidateSize());
}

function calculateAndDisplayAcreage(layer) {
    const acreageSpan = document.getElementById('calculated-acreage');
    if (layer?.getLatLngs && L.GeometryUtil) {
        const latlngs = layer.getLatLngs()[0];
        if (latlngs?.length > 2) {
            const areaInMeters = L.GeometryUtil.geodesicArea(latlngs);
            acreageSpan.textContent = (areaInMeters / 4046.86).toFixed(2);
            return;
        }
    }
    acreageSpan.textContent = '0.00';
}

export function getLastDrawnGeoJSON() {
    if (!lastDrawnLayer) return null;
    return lastDrawnLayer.toGeoJSON();
}

export function getProjectAnnotationsAsGeoJSON() {
    if (projectAnnotationLayers) {
        return projectAnnotationLayers.toGeoJSON();
    }
    return null;
}

export function initProjectAnnotationMap(propertyGeoJSON, existingAnnotations) {
    const map = createBaseMap('project-map', {}, [34.7465, -92.2896, 10]);
    if (!map) return;

    if (propertyGeoJSON?.geometry?.coordinates) {
        const propertyLayer = L.geoJSON(propertyGeoJSON, {
            style: { color: '#059669', weight: 3, fillOpacity: 0.1, clickable: false }
        }).addTo(map);
        
        requestAnimationFrame(() => {
            if (map && propertyLayer.getBounds().isValid()) {
                map.invalidateSize();
                map.fitBounds(propertyLayer.getBounds());
            }
        });
    }

    projectAnnotationLayers = new L.FeatureGroup().addTo(map);

    if (existingAnnotations) {
        L.geoJSON(existingAnnotations, {
            onEachFeature: (feature, layer) => {
                projectAnnotationLayers.addLayer(layer);
            }
        });
    }
    updateAnnotationsList();

    const drawControl = new L.Control.Draw({
        edit: { 
            featureGroup: projectAnnotationLayers 
        },
        draw: {
            polygon: false,
            rectangle: false,
            circle: false,
            circlemarker: false,
            polyline: {
                shapeOptions: { color: '#f39c12', weight: 4 }
            },
            marker: {}
        }
    }).addTo(map);

    map.on(L.Draw.Event.CREATED, (event) => {
        projectAnnotationLayers.addLayer(event.layer);
        updateAnnotationsList();
    });

    map.on(L.Draw.Event.EDITED, () => updateAnnotationsList());
    map.on(L.Draw.Event.DELETED, () => updateAnnotationsList());

    function updateAnnotationsList() {
        const listContainer = document.getElementById('map-annotations-list');
        if (!listContainer) return;

        const features = [];
        projectAnnotationLayers.eachLayer(layer => {
            if (layer instanceof L.Polyline) {
                let totalLength = 0;
                const latlngs = layer.getLatLngs();
                for (let i = 0; i < latlngs.length - 1; i++) {
                    totalLength += latlngs[i].distanceTo(latlngs[i + 1]);
                }
                const lengthInFeet = (totalLength * 3.28084).toFixed(0);
                features.push(`<li>- Road/Line: <strong>${lengthInFeet.toLocaleString()} ft</strong></li>`);
            } else if (layer instanceof L.Marker) {
                features.push('<li>- Point of Interest (Gate, Deck, etc.)</li>');
            }
        });

        if (features.length === 0) {
            listContainer.innerHTML = '<p class="text-gray-500">No specific features drawn yet.</p>';
        } else {
            listContainer.innerHTML = `<ul>${features.join('')}</ul>`;
        }
    }
}

export function initTimberSaleMap(propertyGeoJSON, existingAnnotations) {
    const map = createBaseMap('timber-sale-map', {}, [34.7465, -92.2896, 10]);
    if (!map) return null;

    if (propertyGeoJSON?.geometry?.coordinates) {
        L.geoJSON(propertyGeoJSON, {
            style: { color: '#059669', weight: 2, dashArray: '5, 5', fillOpacity: 0.05, clickable: false }
        }).addTo(map);
    }

    projectAnnotationLayers = new L.FeatureGroup().addTo(map);

    if (existingAnnotations) {
        L.geoJSON(existingAnnotations, {
            onEachFeature: (feature, layer) => {
                projectAnnotationLayers.addLayer(layer);
            }
        });
    }

    const drawControl = new L.Control.Draw({
        edit: { 
            featureGroup: projectAnnotationLayers 
        },
        draw: {
            polygon: {
                allowIntersection: false,
                showArea: true,
                shapeOptions: { color: '#e74c3c', weight: 3 }
            },
            rectangle: false,
            circle: false,
            circlemarker: false,
            polyline: {
                shapeOptions: { color: '#f39c12', weight: 4 }
            },
            marker: {}
        }
    }).addTo(map);

    map.on(L.Draw.Event.CREATED, (event) => {
        projectAnnotationLayers.addLayer(event.layer);
    });
    
    return map; 
}

export function initProfileDisplayMap(containerId, user) {
    const mapContainer = document.getElementById(containerId);
    if (!mapContainer) {
        console.error(`Profile display map container with ID "${containerId}" not found.`);
        return;
    };

    if (!user?.location) {
        mapContainer.innerHTML = `<div class="p-4 text-center text-gray-500">No location set.</div>`;
        return;
    }
    
    const { lat, lng } = user.location;
    const mapOptions = { dragging: false, touchZoom: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, zoomControl: true };
    const map = createBaseMap(containerId, mapOptions, [lat, lng, 10]);
    if (!map) return;
    
    L.marker([lat, lng]).addTo(map);

    let boundsToFit;
    if (user.serviceRadius) {
        const circle = L.circle([lat, lng], {
            radius: user.serviceRadius * 1609.34, color: 'blue', fillColor: '#3498db', fillOpacity: 0.2
        }).addTo(map);
        boundsToFit = circle.getBounds();
    } else {
        boundsToFit = L.latLngBounds([L.latLng(lat, lng)]);
    }

    requestAnimationFrame(() => {
        if (map && boundsToFit.isValid()) {
            map.invalidateSize();
            map.fitBounds(boundsToFit);
        }
    });
}

export function initSignupMap(role) {
    const mapId = `${role}-signup-map`;
    const map = createBaseMap(mapId, {}, [34.7465, -92.2896, 5]);
    if (!map) return;

    locationMarker = null;
    map.on('click', (e) => {
        locationMarker ? locationMarker.setLatLng(e.latlng) : locationMarker = L.marker(e.latlng).addTo(map);
    });
    setTimeout(() => map.invalidateSize(), 400);
}

export function initEditProfileMap(user) {
    const lat = user?.location?.lat || 34.7465;
    const lng = user?.location?.lng || -92.2896;
    const radius = user?.serviceRadius || 50;
    
    const map = createBaseMap('edit-profile-map', {}, [lat, lng, 7]);
    if (!map) return;
    
    locationMarker = L.marker([lat, lng], { draggable: true }).addTo(map);
    serviceAreaCircle = L.circle([lat, lng], { radius: radius * 1609.34, color: 'blue', fillColor: '#3498db', fillOpacity: 0.2 }).addTo(map);
    
    locationMarker.on('dragend', (event) => serviceAreaCircle.setLatLng(event.target.getLatLng()));
    setTimeout(() => map.invalidateSize(), 400);
}

export function updateServiceAreaCircle(radiusInMiles) {
    if (serviceAreaCircle) {
        serviceAreaCircle.setRadius(radiusInMiles * 1609.34);
    }
}

export function getUpdatedLocation() {
    if (locationMarker) {
        const { lat, lng } = locationMarker.getLatLng();
        return { lat, lng };
    }
    return null;
}

export function getMapInstance(mapId) {
    return mapInstances.get(mapId) || null;
}

export function initDetailViewMap(containerId, geoJSON, annotations) {
    const map = createBaseMap(containerId);
    if (!map) return;

    let bounds;

    if (geoJSON?.geometry?.coordinates) {
        const propertyLayer = L.geoJSON(geoJSON, { 
            style: { color: '#059669', weight: 3, fillOpacity: 0.1, clickable: false } 
        }).addTo(map);
        bounds = propertyLayer.getBounds();
    }

    if (annotations) {
        const annotationLayer = L.geoJSON(annotations, {
            style: function (feature) {
                if (feature.geometry.type === 'LineString') {
                    return { color: '#f39c12', weight: 4 };
                }
                return { color: '#e74c3c' };
            }
        }).addTo(map);

        if (!bounds || !bounds.isValid()) {
            bounds = annotationLayer.getBounds();
        } else {
            bounds.extend(annotationLayer.getBounds());
        }
    }
    
    requestAnimationFrame(() => {
        if (map && bounds && bounds.isValid()) {
            map.invalidateSize(); 
            map.fitBounds(bounds, { padding: [20, 20] });
        }
    });
}