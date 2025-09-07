// js/map.js
export const mapInstances = new Map();
let lastDrawnLayer;
let saleMapFeatures = []; // Stores features {layer, type, label} for the sale map
export let myPropertiesLayerGroup = null; // Layer group for property pins
let locationMarker = null; // Shared marker for signup and edit profile
let serviceAreaCircle = null; // Shared circle for edit profile

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
    mapContainer.innerHTML = '';

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
    hybridGroup.addTo(map); // Set Hybrid as the default
    L.control.layers(baseMaps, null, { position: 'topright' }).addTo(map);
}


export function getMapInstance(mapId) {
    return mapInstances.get(mapId) || null;
}

export function initGlobalMap() {
    const map = createBaseMap('global-map');
    if (map) {
        L.Control.geocoder({
            defaultMarkGeocode: false,
            position: 'topleft',
            placeholder: 'Search for a location...'
        }).on('markgeocode', function(e) {
            map.fitBounds(e.geocode.bbox);
        }).addTo(map);
    }
    return map;
}

export function initMyPropertiesMap() {
    const map = createBaseMap('my-properties-map');
    if (map) {
        myPropertiesLayerGroup = L.featureGroup().addTo(map);
    }
    return map;
}

export function initPropertyFormMap(existingGeoJSON) {
    const map = createBaseMap('property-map', {}, [34.7465, -92.2896, 10]);
    if (!map) return;
    
    const drawnItems = new L.FeatureGroup().addTo(map);

    if (existingGeoJSON?.geometry?.coordinates) {
        const existingLayer = L.geoJSON(existingGeoJSON);
        drawnItems.addLayer(existingLayer.getLayers()[0]);
        lastDrawnLayer = drawnItems.getLayers()[0];
        map.fitBounds(existingLayer.getBounds(), { padding: [50, 50] });
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
    if (saleMapFeatures.length === 0) return null;
    
    const features = saleMapFeatures.map(item => {
        const feature = item.layer.toGeoJSON();
        feature.properties = {
            label: item.label,
            type: item.type
        };
        return feature;
    });

    return {
        type: "FeatureCollection",
        features: features
    };
}

export function initTimberSaleMap(propertyGeoJSON) {
    const map = createBaseMap('timber-sale-map');
    if (!map) return null;

    saleMapFeatures = []; 

    if (propertyGeoJSON?.geometry?.coordinates) {
        const propertyLayer = L.geoJSON(propertyGeoJSON, {
            style: { color: 'green', weight: 3, fillOpacity: 0.1, dashArray: '5, 5', clickable: false }
        }).addTo(map);
        
        if (propertyLayer.getBounds().isValid()) {
            map.fitBounds(propertyLayer.getBounds(), { padding: [50, 50] });
        }
    }

    const drawnItems = new L.FeatureGroup().addTo(map);

    const drawControl = new L.Control.Draw({
        edit: { featureGroup: drawnItems },
        draw: {
            polygon: { shapeOptions: { color: '#007bff' } },      // Harvest Area - Blue
            rectangle: { shapeOptions: { color: '#ffc107' } },    // SMZ - Yellow
            polyline: { shapeOptions: { color: '#6c757d' } },     // Road - Grey
            marker: {},
            circle: false,
            circlemarker: false
        }
    }).addTo(map);

    map.on(L.Draw.Event.CREATED, (event) => {
        const layer = event.layer;
        const type = event.layerType;
        
        let featureType = 'Feature';
        if (type === 'polygon') featureType = 'Harvest Area';
        if (type === 'rectangle') featureType = 'SMZ';
        if (type === 'polyline') featureType = 'Road';
        if (type === 'marker') featureType = 'Point of Interest';

        const label = prompt(`Enter a label for this new ${featureType}:`);
        
        if (label) {
            layer.bindTooltip(label, { permanent: true, direction: 'center', className: 'map-label' }).openTooltip();
            drawnItems.addLayer(layer);
            saleMapFeatures.push({ layer, type: featureType, label });

            if (featureType === 'Harvest Area' || featureType === 'SMZ') {
                updateInventoryStandDropdowns();
            }
        }
    });

    map.on(L.Draw.Event.DELETED, (event) => {
        event.layers.eachLayer(layer => {
            saleMapFeatures = saleMapFeatures.filter(item => item.layer !== layer);
        });
        updateInventoryStandDropdowns();
    });

    return map;
}

function updateInventoryStandDropdowns() {
    const harvestAreas = saleMapFeatures
        .filter(item => item.type === 'Harvest Area' || item.type === 'SMZ')
        .map(item => item.label);
    
    document.querySelectorAll('.inventory-stand-name').forEach(select => {
        const currentVal = select.value;
        select.innerHTML = '<option value="">Select Harvest Area</option>';
        harvestAreas.forEach(areaName => {
            const option = new Option(areaName, areaName);
            select.appendChild(option);
        });
        select.value = currentVal;
    });
}

export function initDetailViewMap(containerId, geoJSON) {
    const map = createBaseMap(containerId);
    if (!map) return;
    let bounds;
    if (geoJSON) {
        const layer = L.geoJSON(geoJSON).addTo(map);
        bounds = layer.getBounds();
    }
    if (bounds && bounds.isValid()) {
         map.fitBounds(bounds, { padding: [50, 50] });
    }
    setTimeout(() => map.invalidateSize(), 0);
}

export function initProfileDisplayMap(containerId, userProfile) {
     const map = createBaseMap(containerId, { dragging: false, scrollWheelZoom: false, doubleClickZoom: false });
     if (userProfile?.location) {
        const latLng = [userProfile.location.lat, userProfile.location.lng];
        map.setView(latLng, 9);
        L.marker(latLng).addTo(map);
        if (userProfile.serviceRadius) {
            L.circle(latLng, { radius: userProfile.serviceRadius * 1609.34, color: '#007bff', fillOpacity: 0.1 }).addTo(map);
        }
        setTimeout(() => map.invalidateSize(), 0);
     }
}

export function initSignupMap() {
    const mapId = `signup-map`;
    const map = createBaseMap(mapId, {}, [34.7465, -92.2896, 5]);
    if (!map) return;

    locationMarker = null; // Reset the marker for a new signup
    map.on('click', (e) => {
        if (locationMarker) {
            locationMarker.setLatLng(e.latlng);
        } else {
            locationMarker = L.marker(e.latlng).addTo(map);
        }
    });
    setTimeout(() => map.invalidateSize(), 400);
}

export function initEditProfileMap(userProfile) {
    const lat = userProfile?.location?.lat || 34.7465;
    const lng = userProfile?.location?.lng || -92.2896;
    const radius = userProfile?.serviceRadius || 50;
    
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