// js/map.js
export const mapInstances = new Map();
let lastDrawnLayer;
export let saleMapFeatures = []; 
export let myPropertiesLayerGroup = null; 
let locationMarker = null; 
let serviceAreaCircle = null; 

// MODIFIED: Replaced green colors with non-green alternatives for better contrast
const DRAW_COLOR_PALETTE = [
    '#E6194B', // Red
    '#4363d8', // Blue
    '#f58231', // Orange
    '#911eb4', // Purple
    '#42d4f4', // Cyan
    '#f032e6', // Magenta
    '#9A6324', // Brown
    '#800000', // Maroon
    '#808000', // Olive
    '#000075'  // Navy
];


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

    map.createPane('boundaries');
    map.getPane('boundaries').style.zIndex = 650; 
    map.getPane('boundaries').style.pointerEvents = 'none';

    addLayerControls(map);
     
    mapInstances.set(containerId, map);
    return map;
}

export function addLayerControls(map) {
    const streets = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    });

    const topo = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community'
    });

    const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri'
    });
 
    const hybrid = L.layerGroup([
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
             attribution: 'Tiles &copy; Esri'
        }),
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Labels & Boundaries &copy; Esri'
        }),
        L.tileLayer('https://tiles.stadiamaps.com/tiles/stamen_toner_lines/{z}/{x}/{y}{r}.png', {
            attribution: 'Map tiles by <a href="http://stamen.com">Stamen Design</a>',
            pane: 'boundaries'
        })
    ]);

    const baseMaps = {
        "Hybrid": hybrid,
        "Satellite": satellite,
        "Topographic": topo,
        "Streets": streets
    };

    hybrid.addTo(map);
    L.control.layers(baseMaps, null, { position: 'topright' }).addTo(map);
}

export function getDrawnHarvestAreas() {
    return saleMapFeatures
        .map(item => ({ 
            label: item.label, 
            acreage: item.acreage,
            color: item.layer.options.color,
            fillColor: item.layer.options.fillColor, // Pass fill color for legend
            type: item.type 
        }));
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
            type: item.type,
            color: item.layer.options.color,
            acreage: item.acreage || 0
        };
        return feature;
    });

    return {
        type: "FeatureCollection",
        features: features
    };
}

export function initTimberSaleMap(propertyGeoJSON, existingAnnotations, isReadOnly = false) {
    const map = createBaseMap('timber-sale-map');
    if (!map) return null;

    saleMapFeatures = []; 
    const drawnItems = new L.FeatureGroup().addTo(map);

    if (propertyGeoJSON?.geometry?.coordinates) {
        const propertyStyle = { color: '#22c55e', weight: 3, fillOpacity: 0.1, dashArray: '5, 5', clickable: false };
        const propertyLayer = L.geoJSON(propertyGeoJSON, {
            style: propertyStyle
        }).addTo(map);
         
        if (propertyLayer.getBounds().isValid()) {
            map.fitBounds(propertyLayer.getBounds(), { padding: [50, 50] });
            const areaInMeters = L.GeometryUtil.geodesicArea(propertyLayer.getLayers()[0].getLatLngs()[0]);
            const acreage = areaInMeters / 4046.86;
            propertyLayer.options.color = propertyStyle.color;
            propertyLayer.options.fillColor = propertyStyle.color;
            saleMapFeatures.push({ layer: propertyLayer, type: 'Property Boundary', label: 'Property Boundary', acreage: acreage });
        }
    }

    if (existingAnnotations) {
        let parsedAnnotations = existingAnnotations;
        if (typeof parsedAnnotations === 'string') {
            try {
                parsedAnnotations = JSON.parse(parsedAnnotations);
            } catch (e) {
                console.error("Failed to parse annotations JSON:", e);
                parsedAnnotations = null;
            }
        }

        if (parsedAnnotations) {
            L.geoJSON(parsedAnnotations, {
                onEachFeature: (feature, layer) => {
                    const { label, type, color, acreage } = feature.properties;
                    const styleColor = color || DRAW_COLOR_PALETTE[saleMapFeatures.length % DRAW_COLOR_PALETTE.length];
                    
                    if (layer instanceof L.Marker) {
                        // MODIFIED: Use new circle-marker-icon class
                        layer.setIcon(L.divIcon({
                            className: 'circle-marker-icon',
                            html: '', // HTML is now empty, style via CSS
                            iconSize: [24, 24], // Adjust size for a circle
                            iconAnchor: [12, 12], // Center the icon
                            className: 'circle-marker-icon'
                        }));
                        // Set background color directly on the icon element for Leaflet markers
                        layer._icon.style.backgroundColor = styleColor;
                        layer.options.color = styleColor; // Store for legend/editing
                    } else if (typeof layer.setStyle === 'function') {
                        layer.setStyle({ color: styleColor, fillColor: styleColor, fillOpacity: 0.5 });
                    }
                    if (label) {
                       layer.bindTooltip(label);
                    }
                    saleMapFeatures.push({ layer, type, label, acreage, color: styleColor, fillColor: styleColor });
                    drawnItems.addLayer(layer);
                }
            }).addTo(map);
        }
    }

    if (!isReadOnly) {
        const drawControl = new L.Control.Draw({
            edit: { featureGroup: drawnItems },
            draw: {
                polygon: { shapeOptions: { color: DRAW_COLOR_PALETTE[0], fillColor: DRAW_COLOR_PALETTE[0], fillOpacity: 0.5 } },
                rectangle: { shapeOptions: { color: DRAW_COLOR_PALETTE[1], fillColor: DRAW_COLOR_PALETTE[1], fillOpacity: 0.5 } },
                polyline: { shapeOptions: { color: DRAW_COLOR_PALETTE[2] } },
                marker: {
                    // MODIFIED: Use new circle-marker-icon class for drawing
                    icon: L.divIcon({
                        className: 'circle-marker-icon',
                        html: '',
                        iconSize: [24, 24],
                        iconAnchor: [12, 12]
                    })
                },
                circle: false,
                circlemarker: false
            }
        }).addTo(map);

        map.on(L.Draw.Event.CREATED, (event) => {
            const layer = event.layer;
            const type = event.layerType;
             
            const color = DRAW_COLOR_PALETTE[saleMapFeatures.length % DRAW_COLOR_PALETTE.length];
             
            if (type === 'marker') {
                layer.options.color = color;
                // MODIFIED: Set background color directly for the drawn marker
                if (layer._icon) {
                    layer._icon.style.backgroundColor = color;
                }
            } else if (typeof layer.setStyle === 'function') {
                layer.setStyle({ color: color, fillColor: color, fillOpacity: 0.5 });
            }

            let featureType = 'Feature';
            if (type === 'polygon') featureType = 'Harvest Area';
            if (type === 'rectangle') featureType = 'SMZ';
            if (type === 'polyline') featureType = 'Road';
            if (type === 'marker') featureType = 'Point of Interest';

            const label = prompt(`Enter a label for this new ${featureType}:`);
             
            if (label) {
                layer.bindTooltip(label);
                drawnItems.addLayer(layer);
                let acreage = 0;
                if ((featureType === 'Harvest Area' || featureType === 'SMZ') && layer.getLatLngs) {
                    const areaInMeters = L.GeometryUtil.geodesicArea(layer.getLatLngs()[0]);
                    acreage = areaInMeters / 4046.86;
                }
                saleMapFeatures.push({ layer, type: featureType, label, acreage, color: color, fillColor: color });
                document.dispatchEvent(new CustomEvent('harvestAreasUpdated'));
            }
        });

        map.on(L.Draw.Event.DELETED, (event) => {
            event.layers.eachLayer(layer => {
                saleMapFeatures = saleMapFeatures.filter(item => item.layer !== layer);
            });
            document.dispatchEvent(new CustomEvent('harvestAreasUpdated'));
        });
    }
    
    setTimeout(() => {
        document.dispatchEvent(new CustomEvent('harvestAreasUpdated'));
    }, 200);

    return map;
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

    locationMarker = null;
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
     
    locationMarker.on('dragend', (event) => serviceAreaCircle.setLatLng(event.target.getLatLng());
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